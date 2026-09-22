import { existsSync } from 'node:fs'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import type * as XLSX from 'xlsx'
import { readWorkbook } from '@/lib/etl/parse'

const WORKER_FILE = path.join(
  process.cwd(),
  'lib',
  'etl',
  'read-workbook-worker.mjs',
)

/** Abas realmente usadas no ETL — o resto só atrasa o clone entre threads. */
const SHEETS_BY_KIND: Record<string, string[] | undefined> = {
  corte: [
    'CORTE',
    'RELATORIO COSTURA',
    'RELATORIO REVISAO',
    'APROVEITAMENTO',
  ],
  oficinas: ['TABELA OFICINAS'],
}

function kindFromPath(filePath: string) {
  const base = path.basename(filePath).toLowerCase()
  if (base.includes('corte')) return 'corte'
  if (base.includes('oficina')) return 'oficinas'
  if (base.includes('signus') || base.includes('moviment')) return 'signus'
  if (base.includes('estoque') || base.includes('saldo')) return 'estoque'
  if (base.includes('pedido')) return 'pedidos'
  if (base.includes('iten')) return 'itens'
  return 'other'
}

function readOneInWorker(filePath: string): Promise<XLSX.WorkBook> {
  const kind = kindFromPath(filePath)
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_FILE, {
      workerData: {
        path: filePath,
        sheets: SHEETS_BY_KIND[kind],
      },
    })
    let settled = false
    worker.once('message', (workbook: XLSX.WorkBook) => {
      settled = true
      resolve(workbook)
    })
    worker.once('error', (error) => {
      settled = true
      reject(error)
    })
    worker.once('exit', (code) => {
      if (!settled && code !== 0) {
        reject(new Error(`Worker xlsx saiu com código ${code}`))
      }
    })
  })
}

/**
 * Lê workbooks em paralelo via worker_threads (multi-core).
 * Se workers falharem (ex.: ambiente restrito), cai no read síncrono.
 */
export async function readWorkbooksParallel(
  paths: Array<string | null | undefined>,
): Promise<Array<XLSX.WorkBook | null>> {
  try {
    return await Promise.all(
      paths.map(async (filePath) => {
        if (!filePath || !existsSync(filePath)) return null
        return readOneInWorker(filePath)
      }),
    )
  } catch (error) {
    console.warn(
      '[etl] workers indisponíveis; lendo Excel na thread principal.',
      error instanceof Error ? error.message : error,
    )
    return paths.map((filePath) =>
      filePath && existsSync(filePath) ? readWorkbook(filePath) : null,
    )
  }
}
