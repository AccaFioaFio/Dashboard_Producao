import { existsSync } from 'node:fs'
import path from 'node:path'
import type * as XLSX from 'xlsx'
import { readSourceWorkbook } from '@/lib/etl/parquet-workbook'

function kindFromPath(filePath: string) {
  const base = path.basename(filePath).toLowerCase()
  if (base.includes('corte') && !base.includes('aproveitamento')) return 'corte'
  // Bundle de corte: cache/corte/PROGRAMAÇÃO...-CORTE.parquet
  if (filePath.replace(/\\/g, '/').includes('/cache/corte/')) return 'corte'
  if (base.includes('oficina')) return 'oficinas'
  if (base.includes('signus') || base.includes('moviment')) return 'signus'
  if (base.includes('estoque') || base.includes('saldo')) return 'estoque'
  if (base.includes('pedido') && !base.includes('itens')) return 'pedidos'
  if (base.includes('iten')) return 'itens'
  if (base.includes('parceiro')) return 'parceiros'
  return 'other'
}

/**
 * Lê fontes em paralelo (parquet → workbook em memória; Excel ainda suportado).
 */
export async function readWorkbooksParallel(
  paths: Array<string | null | undefined>,
): Promise<Array<XLSX.WorkBook | null>> {
  return Promise.all(
    paths.map(async (filePath) => {
      if (!filePath || !existsSync(filePath)) return null
      const kind = kindFromPath(filePath)
      return readSourceWorkbook(filePath, kind)
    }),
  )
}
