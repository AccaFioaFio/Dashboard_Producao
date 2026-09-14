import { persistCloudDb } from '@/lib/cloud/carga'
import { checkInvariants, computeFunil, computeHeaderKpis, computeSerieMensal } from '@/lib/etl/kpis'
import { replaceSnapshot } from '@/lib/etl/load'
import { copySources, parseWorkbookFiles } from '@/lib/etl/snapshot'
import type {
  FunilKpis,
  HeaderKpis,
  SerieMensal,
  SnapshotPayload,
} from '@/lib/etl/types'
import {
  IS_CLOUD,
  corteXlsxPath,
  estoqueXlsxPath,
  itensXlsxPath,
  oficinasXlsxPath,
  pedidosXlsxPath,
  signusXlsPath,
} from '@/lib/paths'

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
    }
  | {
      ok: false
      error: string
    }

export async function applySnapshotPayload(
  payload: SnapshotPayload,
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

  try {
    const persisted = await persistCloudDb()
    if (IS_CLOUD && !persisted) {
      return {
        ok: false,
        error:
          'Crie um Blob Store na Vercel (Storage) e conecte ao projeto para gravar a carga.',
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (IS_CLOUD) {
      return {
        ok: false,
        error: `A carga foi lida, mas não gravou no site. ${message}`,
      }
    }
    console.error('Falha ao publicar carga na Vercel Blob', error)
  }

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
  }
}

export async function refreshFromExcel(): Promise<RefreshResult> {
  const cortePath = corteXlsxPath()
  const oficinasPath = oficinasXlsxPath()
  const signusPath = signusXlsPath()
  const estoquePath = estoqueXlsxPath()
  const pedidosPath = pedidosXlsxPath()
  const itensPath = itensXlsxPath()

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
    const snapshot = await parseWorkbookFiles(
      copied.corteCache,
      copied.oficinasCache,
      copied.signusCache,
      copied.estoqueCache,
      copied.pedidosCache,
      copied.itensCache,
    )
    return await applySnapshotPayload({
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
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: `ETL falhou; carga anterior mantida. ${message}`,
    }
  }
}
