import {
  checkInvariants,
  computeFunil,
  computeHeaderKpis,
  computeSerieMensal,
} from '@/lib/etl/kpis'
import { buildSnapshotIncremental } from '@/lib/etl/incremental'
import { replaceSnapshot } from '@/lib/etl/load'
import { copySources } from '@/lib/etl/snapshot'
import type {
  FunilKpis,
  HeaderKpis,
  SerieMensal,
  SnapshotPayload,
} from '@/lib/etl/types'
import { sourceFilePaths, type SourceFilePaths } from '@/lib/paths'

export type RefreshResult =
  | {
      ok: true
      header: HeaderKpis
      funil: FunilKpis
      serie: SerieMensal[]
      corteLastWrite: string
      oficinasLastWrite: string
      signusLastWrite: string
      estoqueLastWrite: string
      pedidosLastWrite: string | null
      itensLastWrite: string | null
      lidaEm: string
      skipped?: boolean
      changed?: string[] | 'all'
    }
  | {
      ok: false
      error: string
    }

export async function applySnapshotPayload(
  payload: SnapshotPayload,
  options?: { changed?: string[] | 'all'; skipped?: boolean },
): Promise<RefreshResult> {
  const invariantErrors = checkInvariants(payload.snapshot)
  if (invariantErrors.length) {
    return {
      ok: false,
      error: `Invariantes falharam; carga anterior mantida. ${invariantErrors.join(' | ')}`,
    }
  }

  const header = computeHeaderKpis(payload.snapshot)
  const funil = computeFunil(payload.snapshot)
  const serie = computeSerieMensal(payload.snapshot)

  replaceSnapshot(payload.snapshot, {
    cortePath: payload.cortePath,
    oficinasPath: payload.oficinasPath,
    signusPath: payload.signusPath,
    estoquePath: payload.estoquePath,
    pedidosPath: payload.pedidosPath,
    itensPath: payload.itensPath,
    corteLastWrite: payload.corteLastWrite,
    oficinasLastWrite: payload.oficinasLastWrite,
    signusLastWrite: payload.signusLastWrite,
    estoqueLastWrite: payload.estoqueLastWrite,
    pedidosLastWrite: payload.pedidosLastWrite,
    itensLastWrite: payload.itensLastWrite,
    header,
  })

  return {
    ok: true,
    header,
    funil,
    serie,
    corteLastWrite: payload.corteLastWrite,
    oficinasLastWrite: payload.oficinasLastWrite,
    signusLastWrite: payload.signusLastWrite,
    estoqueLastWrite: payload.estoqueLastWrite,
    pedidosLastWrite: payload.pedidosLastWrite,
    itensLastWrite: payload.itensLastWrite,
    lidaEm: new Date().toISOString(),
    skipped: options?.skipped,
    changed: options?.changed,
  }
}

export async function refreshFromExcel(
  paths: SourceFilePaths = sourceFilePaths(),
): Promise<RefreshResult> {
  const cortePath = paths.corte
  const oficinasPath = paths.oficinas
  const signusPath = paths.signus
  const estoquePath = paths.estoque
  const pedidosPath = paths.pedidos
  const itensPath = paths.itens

  let copied: ReturnType<typeof copySources>
  try {
    copied = copySources(
      cortePath,
      oficinasPath,
      signusPath,
      estoquePath,
      pedidosPath,
      itensPath,
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha ao copiar os arquivos Excel'
    return {
      ok: false,
      error: `Cópia da origem dos Excel falhou; a carga anterior foi mantida. ${message}`,
    }
  }

  try {
    const { snapshot, changed } = await buildSnapshotIncremental(copied)

    // Nada mudou: não regrava SQLite nem republica.
    if (Array.isArray(changed) && changed.length === 0) {
      const header = computeHeaderKpis(snapshot)
      const funil = computeFunil(snapshot)
      const serie = computeSerieMensal(snapshot)
      const { getSqlite } = await import('@/db')
      const row = getSqlite()
        .prepare(
          `SELECT lida_em as lidaEm FROM carga WHERE ok = 1 ORDER BY id DESC LIMIT 1`,
        )
        .get() as { lidaEm: string } | undefined
      return {
        ok: true,
        header,
        funil,
        serie,
        corteLastWrite: copied.corteLastWrite,
        oficinasLastWrite: copied.oficinasLastWrite,
        signusLastWrite: copied.signusLastWrite,
        estoqueLastWrite: copied.estoqueLastWrite,
        pedidosLastWrite: copied.pedidosLastWrite,
        itensLastWrite: copied.itensLastWrite,
        lidaEm: row?.lidaEm ?? copied.corteLastWrite,
        skipped: true,
        changed: [],
      }
    }

    return await applySnapshotPayload(
      {
        snapshot,
        cortePath,
        oficinasPath,
        signusPath,
        estoquePath,
        pedidosPath,
        itensPath,
        corteLastWrite: copied.corteLastWrite,
        oficinasLastWrite: copied.oficinasLastWrite,
        signusLastWrite: copied.signusLastWrite,
        estoqueLastWrite: copied.estoqueLastWrite,
        pedidosLastWrite: copied.pedidosLastWrite,
        itensLastWrite: copied.itensLastWrite,
      },
      { changed },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: `ETL falhou; carga anterior mantida. ${message}`,
    }
  }
}
