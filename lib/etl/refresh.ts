import { corteXlsxPath, oficinasXlsxPath } from '@/lib/paths'
import { checkInvariants, computeHeaderKpis } from '@/lib/etl/kpis'
import { replaceSnapshot } from '@/lib/etl/load'
import { copySources, parseWorkbookFiles } from '@/lib/etl/snapshot'
import type { FunilKpis, HeaderKpis, SerieMensal } from '@/lib/etl/types'
import { computeFunil, computeSerieMensal } from '@/lib/etl/kpis'

export type RefreshResult =
  | {
      ok: true
      header: HeaderKpis
      funil: FunilKpis
      serie: SerieMensal[]
      corteLastWrite: string
      oficinasLastWrite: string
      lidaEm: string
    }
  | {
      ok: false
      error: string
    }

export async function refreshFromExcel(): Promise<RefreshResult> {
  const cortePath = corteXlsxPath()
  const oficinasPath = oficinasXlsxPath()

  let copied: ReturnType<typeof copySources>
  try {
    copied = copySources(cortePath, oficinasPath)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha ao copiar os arquivos Excel'
    return {
      ok: false,
      error: `Cópia do OneDrive falhou; a carga anterior foi mantida. ${message}`,
    }
  }

  try {
    const snapshot = await parseWorkbookFiles(
      copied.corteCache,
      copied.oficinasCache,
    )
    const invariantErrors = checkInvariants(snapshot)
    if (invariantErrors.length) {
      return {
        ok: false,
        error: `Invariantes falharam; carga anterior mantida. ${invariantErrors.join(' | ')}`,
      }
    }

    const header = computeHeaderKpis(snapshot)
    const funil = computeFunil(snapshot)
    const serie = computeSerieMensal(snapshot)

    replaceSnapshot(snapshot, {
      cortePath,
      oficinasPath,
      corteLastWrite: copied.corteLastWrite,
      oficinasLastWrite: copied.oficinasLastWrite,
      header,
    })

    return {
      ok: true,
      header,
      funil,
      serie,
      corteLastWrite: copied.corteLastWrite,
      oficinasLastWrite: copied.oficinasLastWrite,
      lidaEm: new Date().toISOString(),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: `ETL falhou; carga anterior mantida. ${message}`,
    }
  }
}
