import { existsSync, statSync } from 'node:fs'
import {
  attachOrfaosQualidade,
  buildSnapshotFromWorkbooks,
} from '@/lib/etl/build-snapshot'
import { loadSnapshotFromSqlite } from '@/lib/etl/load-snapshot'
import {
  parseCorte,
  parseCostura,
  parseOficinas,
  parseRevisao,
  readWorkbook,
} from '@/lib/etl/parse'
import { parseAproveitamento } from '@/lib/etl/parse-aproveitamento'
import { parseEstoqueTecidos } from '@/lib/etl/parse-estoque'
import { parsePedidosComerciais } from '@/lib/etl/parse-pedidos'
import { parsePedidosItens } from '@/lib/etl/parse-itens'
import { parseSignusTecidos } from '@/lib/etl/parse-signus'
import { lastOkCargaMtimes, type SourceMtimes } from '@/lib/etl/publish'
import { readWorkbooksParallel } from '@/lib/etl/read-workbooks-parallel'
import type { QualidadeEvento, Snapshot } from '@/lib/etl/types'
import type { CopiedSources } from '@/lib/etl/snapshot'

export type SourceKey =
  | 'corte'
  | 'oficinas'
  | 'signus'
  | 'estoque'
  | 'pedidos'
  | 'itens'

const CORTE_QUALIDADE = new Set(['dias_corte_serial', 'status_duplo'])
const REVISAO_QUALIDADE = new Set(['revisao_total', 'revisao_qtd_eq_pedido'])
const OFICINAS_QUALIDADE = new Set(['oficina_vazia', 'lilica'])

export function currentSourceMtimes(copied: CopiedSources): SourceMtimes {
  return {
    corte: copied.corteLastWrite,
    oficinas: copied.oficinasLastWrite,
    signus: copied.signusLastWrite,
    estoque: copied.estoqueLastWrite,
    pedidos: copied.pedidosLastWrite,
    itens: copied.itensLastWrite,
  }
}

export function changedSourceKeys(
  current: SourceMtimes,
  previous: SourceMtimes | null,
): SourceKey[] | 'all' {
  if (!previous) return 'all'
  const keys: SourceKey[] = []
  if (current.corte !== previous.corte) keys.push('corte')
  if (current.oficinas !== previous.oficinas) keys.push('oficinas')
  if (current.signus !== previous.signus) keys.push('signus')
  if (current.estoque !== previous.estoque) keys.push('estoque')
  if ((current.pedidos ?? null) !== (previous.pedidos ?? null)) {
    keys.push('pedidos')
  }
  if ((current.itens ?? null) !== (previous.itens ?? null)) keys.push('itens')
  return keys
}

/**
 * Monta o snapshot: reusa SQLite no que não mudou; só lê/parseia os Excel novos.
 */
export async function buildSnapshotIncremental(
  copied: CopiedSources,
): Promise<{ snapshot: Snapshot; changed: SourceKey[] | 'all' }> {
  const current = currentSourceMtimes(copied)
  const previous = lastOkCargaMtimes()
  const changed = changedSourceKeys(current, previous)
  const baseline = changed === 'all' ? null : loadSnapshotFromSqlite()

  if (changed === 'all' || !baseline) {
    const [corteWb, oficinasWb, signusWb, estoqueWb, pedidosWb, itensWb] =
      await readWorkbooksParallel([
        copied.corteCache,
        copied.oficinasCache,
        copied.signusCache,
        copied.estoqueCache,
        copied.pedidosCache,
        copied.itensCache,
      ])
    if (!corteWb || !oficinasWb || !signusWb || !estoqueWb) {
      throw new Error('Falha ao ler planilhas obrigatórias.')
    }
    return {
      snapshot: buildSnapshotFromWorkbooks(
        corteWb,
        oficinasWb,
        signusWb,
        estoqueWb,
        pedidosWb,
        itensWb,
      ),
      changed: 'all',
    }
  }

  if (changed.length === 0) {
    return { snapshot: baseline, changed: [] }
  }

  const need = new Set(changed)
  const [corteWb, oficinasWb, signusWb, estoqueWb, pedidosWb, itensWb] =
    await readWorkbooksParallel([
      need.has('corte') ? copied.corteCache : null,
      need.has('oficinas') ? copied.oficinasCache : null,
      need.has('signus') ? copied.signusCache : null,
      need.has('estoque') ? copied.estoqueCache : null,
      need.has('pedidos') ? copied.pedidosCache : null,
      need.has('itens') ? copied.itensCache : null,
    ])

  let snapshot: Snapshot = { ...baseline }
  let qualidade: QualidadeEvento[] = baseline.qualidade.filter(
    (row) => !row.tipo.startsWith('orfao_'),
  )

  if (need.has('corte')) {
    const wb = corteWb ?? readWorkbook(copied.corteCache)
    const corte = parseCorte(wb)
    const costura = parseCostura(wb)
    const revisao = parseRevisao(wb)
    const aproveitamento = parseAproveitamento(wb)
    snapshot = {
      ...snapshot,
      corteLinhas: corte.linhas,
      cortePedidos: corte.pedidos,
      costura,
      revisao: revisao.limpos,
      aproveitamento,
    }
    qualidade = [
      ...qualidade.filter(
        (row) =>
          !CORTE_QUALIDADE.has(row.tipo) && !REVISAO_QUALIDADE.has(row.tipo),
      ),
      ...corte.qualidade,
      ...revisao.qualidade,
    ]
  }

  if (need.has('oficinas')) {
    const wb = oficinasWb ?? readWorkbook(copied.oficinasCache)
    const oficinas = parseOficinas(wb)
    snapshot = { ...snapshot, oficinas: oficinas.lotes }
    qualidade = [
      ...qualidade.filter((row) => !OFICINAS_QUALIDADE.has(row.tipo)),
      ...oficinas.qualidade,
    ]
  }

  if (need.has('signus')) {
    const wb = signusWb ?? readWorkbook(copied.signusCache)
    snapshot = { ...snapshot, tecidosSignus: parseSignusTecidos(wb) }
  }

  if (need.has('estoque')) {
    const wb = estoqueWb ?? readWorkbook(copied.estoqueCache)
    snapshot = { ...snapshot, tecidosEstoque: parseEstoqueTecidos(wb) }
  }

  if (need.has('pedidos')) {
    if (copied.pedidosCache && existsSync(copied.pedidosCache)) {
      const wb = pedidosWb ?? readWorkbook(copied.pedidosCache)
      snapshot = { ...snapshot, pedidosComerciais: parsePedidosComerciais(wb) }
    } else {
      snapshot = { ...snapshot, pedidosComerciais: [] }
    }
  }

  if (need.has('itens')) {
    if (copied.itensCache && existsSync(copied.itensCache)) {
      const wb = itensWb ?? readWorkbook(copied.itensCache)
      snapshot = { ...snapshot, pedidosItens: parsePedidosItens(wb) }
    } else {
      snapshot = { ...snapshot, pedidosItens: [] }
    }
  }

  return {
    snapshot: attachOrfaosQualidade({ ...snapshot, qualidade }),
    changed,
  }
}

export function fileMtimeIso(filePath: string): string | null {
  if (!existsSync(filePath)) return null
  return statSync(filePath).mtime.toISOString()
}
