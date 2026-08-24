import { copyFileSync, mkdirSync, statSync } from 'node:fs'
import {
  parseCorte,
  parseCostura,
  parseOficinas,
  parseRevisao,
  readWorkbook,
} from '@/lib/etl/parse'
import { parseSignusTecidos } from '@/lib/etl/parse-signus'
import type { QualidadeEvento, Snapshot } from '@/lib/etl/types'
import { cachePath, ensureDataDirs } from '@/lib/paths'

export type CopiedSources = {
  corteCache: string
  oficinasCache: string
  signusCache: string
  corteLastWrite: string
  oficinasLastWrite: string
  signusLastWrite: string
}

export function copySources(
  cortePath: string,
  oficinasPath: string,
  signusPath: string,
): CopiedSources {
  ensureDataDirs()
  mkdirSync(cachePath('.'), { recursive: true })
  const corteCache = cachePath('corte.xlsx')
  const oficinasCache = cachePath('oficinas.xlsx')
  const signusCache = cachePath('signus-tecidos.xls')
  copyFileSync(cortePath, corteCache)
  copyFileSync(oficinasPath, oficinasCache)
  copyFileSync(signusPath, signusCache)
  return {
    corteCache,
    oficinasCache,
    signusCache,
    corteLastWrite: statSync(cortePath).mtime.toISOString(),
    oficinasLastWrite: statSync(oficinasPath).mtime.toISOString(),
    signusLastWrite: statSync(signusPath).mtime.toISOString(),
  }
}

export async function parseWorkbookFiles(
  corteFile: string,
  oficinasFile: string,
  signusFile: string,
): Promise<Snapshot> {
  const corteWb = readWorkbook(corteFile)
  const oficinasWb = readWorkbook(oficinasFile)
  const signusWb = readWorkbook(signusFile)

  const corte = parseCorte(corteWb)
  const costura = parseCostura(corteWb)
  const revisao = parseRevisao(corteWb)
  const oficinas = parseOficinas(oficinasWb)
  const tecidosSignus = parseSignusTecidos(signusWb)

  const qualidade: QualidadeEvento[] = [
    ...corte.qualidade,
    ...revisao.qualidade,
    ...oficinas.qualidade,
  ]

  const corteSet = new Set(corte.pedidos.map((row) => row.pedidoNorm))
  const costuraProd = new Set(
    costura
      .filter((row) => row.origemNorm === 'Producao')
      .map((row) => row.pedidoNorm),
  )
  const revisaoSet = new Set(revisao.limpos.map((row) => row.pedidoNorm))
  const oficinasSet = new Set(
    oficinas.lotes
      .map((row) => row.pedidoNorm)
      .filter((value): value is string => Boolean(value)),
  )
  const signusPedidos = new Set(
    tecidosSignus
      .filter((row) => row.isBaixa && row.pedidoNorm)
      .map((row) => row.pedidoNorm as string),
  )

  for (const pedido of costuraProd) {
    if (!corteSet.has(pedido)) {
      qualidade.push({
        tipo: 'orfao_costura',
        pedidoNorm: pedido,
        detalhe: 'Costura Produção 2026 sem corte 2026',
        excelRow: null,
        valor: null,
      })
    }
  }
  for (const pedido of revisaoSet) {
    if (!corteSet.has(pedido)) {
      qualidade.push({
        tipo: 'orfao_revisao',
        pedidoNorm: pedido,
        detalhe: 'Revisão 2026 sem corte 2026',
        excelRow: null,
        valor: null,
      })
    }
  }
  for (const pedido of oficinasSet) {
    if (!corteSet.has(pedido)) {
      qualidade.push({
        tipo: 'orfao_oficina',
        pedidoNorm: pedido,
        detalhe: 'Oficina 2026 sem corte 2026',
        excelRow: null,
        valor: null,
      })
    }
  }
  for (const pedido of signusPedidos) {
    if (!corteSet.has(pedido)) {
      const metros = tecidosSignus
        .filter((row) => row.isBaixa && row.pedidoNorm === pedido)
        .reduce((sum, row) => sum + row.metros, 0)
      qualidade.push({
        tipo: 'orfao_signus',
        pedidoNorm: pedido,
        detalhe: 'Baixa Signus 2026 sem corte 2026',
        excelRow: null,
        valor: metros,
      })
    }
  }

  return {
    corteLinhas: corte.linhas,
    cortePedidos: corte.pedidos,
    costura,
    revisao: revisao.limpos,
    oficinas: oficinas.lotes,
    tecidosSignus,
    qualidade,
  }
}
