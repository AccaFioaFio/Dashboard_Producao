import { existsSync } from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet'
import {
  PARQUET_NAMES,
  resolveParquetBeside,
} from '@/lib/etl/parquet-files'

type ParquetRow = Record<string, unknown>

function cellValue(value: unknown): unknown {
  if (value == null) return null
  if (typeof value === 'bigint') {
    const asNumber = Number(value)
    return Number.isSafeInteger(asNumber) ? asNumber : String(value)
  }
  // ISO string evita serial Excel quebrado ao passar pelo xlsx.
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }
  return value
}

/** Converte linhas tipadas em aba Excel (1ª linha = cabeçalho). */
export function rowsToSheet(
  rows: ParquetRow[],
  columns?: string[],
): XLSX.WorkSheet {
  if (!rows.length) {
    const header = columns?.length ? [columns] : [['']]
    return XLSX.utils.aoa_to_sheet(header)
  }
  const cols =
    columns?.length && columns.every((name) => name in rows[0]!)
      ? columns
      : Object.keys(rows[0]!)
  const aoa: unknown[][] = [cols]
  for (const row of rows) {
    aoa.push(cols.map((col) => cellValue(row[col])))
  }
  return XLSX.utils.aoa_to_sheet(aoa)
}

export function sheetToWorkbook(
  sheetName: string,
  sheet: XLSX.WorkSheet,
): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName)
  return workbook
}

export async function readParquetRows(filePath: string): Promise<ParquetRow[]> {
  if (!existsSync(filePath)) {
    throw new Error(`Parquet ausente: ${filePath}`)
  }
  const file = await asyncBufferFromFile(filePath)
  const rows = await parquetReadObjects({ file })
  return rows as ParquetRow[]
}

export async function readParquetAsWorkbook(
  filePath: string,
  sheetName: string,
): Promise<XLSX.WorkBook> {
  const rows = await readParquetRows(filePath)
  return sheetToWorkbook(sheetName, rowsToSheet(rows))
}

/**
 * Junta Origem + Pedidos numa aba sintética APROVEITAMENTO
 * (duas tabelas empilhadas — o parser acha cada bloco pelo cabeçalho de QTD).
 */
export function buildAproveitamentoSheet(
  origemRows: ParquetRow[],
  pedidosRows: ParquetRow[],
): XLSX.WorkSheet {
  const origemCols = [
    'ORIGEM',
    'CLIENTES',
    'DATA',
    'TECIDO',
    'MODELO',
    'QTD CORTADO',
  ]
  const pedidosCols = [
    'PEDIDOS',
    'CLIENTES',
    'DATA',
    'TECIDO',
    'MODELO',
    'QTD APROVEITAMENTO',
  ]
  const aoa: unknown[][] = []
  aoa.push(origemCols)
  for (const row of origemRows) {
    aoa.push(origemCols.map((col) => cellValue(row[col])))
  }
  aoa.push([])
  aoa.push([])
  aoa.push(pedidosCols)
  for (const row of pedidosRows) {
    aoa.push(pedidosCols.map((col) => cellValue(row[col])))
  }
  return XLSX.utils.aoa_to_sheet(aoa)
}

/** Monta o workbook de programação (CORTE + costura + revisão + aproveitamento). */
export async function readCorteWorkbookFromParquet(
  cortePrimaryPath: string,
): Promise<XLSX.WorkBook> {
  const dir = path.dirname(cortePrimaryPath)
  const paths = {
    corte: resolveParquetBeside(cortePrimaryPath, PARQUET_NAMES.corte),
    costura: resolveParquetBeside(cortePrimaryPath, PARQUET_NAMES.costura),
    revisao: resolveParquetBeside(cortePrimaryPath, PARQUET_NAMES.revisao),
    origem: resolveParquetBeside(
      cortePrimaryPath,
      PARQUET_NAMES.aproveitamentoOrigem,
    ),
    pedidos: resolveParquetBeside(
      cortePrimaryPath,
      PARQUET_NAMES.aproveitamentoPedidos,
    ),
  }

  const [corteRows, costuraRows, revisaoRows, origemRows, pedidosRows] =
    await Promise.all([
      readParquetRows(paths.corte),
      readParquetRows(paths.costura),
      readParquetRows(paths.revisao),
      existsSync(paths.origem) ? readParquetRows(paths.origem) : Promise.resolve([]),
      existsSync(paths.pedidos)
        ? readParquetRows(paths.pedidos)
        : Promise.resolve([]),
    ])

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    rowsToSheet(corteRows),
    'CORTE',
  )
  XLSX.utils.book_append_sheet(
    workbook,
    rowsToSheet(costuraRows),
    'RELATORIO COSTURA',
  )
  XLSX.utils.book_append_sheet(
    workbook,
    rowsToSheet(revisaoRows),
    'RELATORIO REVISÃO',
  )
  XLSX.utils.book_append_sheet(
    workbook,
    buildAproveitamentoSheet(origemRows, pedidosRows),
    'APROVEITAMENTO',
  )
  return workbook
}

export async function readSourceWorkbook(
  filePath: string,
  kind: string,
): Promise<XLSX.WorkBook> {
  if (!filePath.endsWith('.parquet') && !filePath.endsWith('.PARQUET')) {
    const { readWorkbook } = await import('@/lib/etl/parse')
    return readWorkbook(filePath)
  }

  switch (kind) {
    case 'corte':
      return readCorteWorkbookFromParquet(filePath)
    case 'oficinas':
      return readParquetAsWorkbook(filePath, 'TABELA OFICINAS')
    case 'signus':
      return readParquetAsWorkbook(filePath, 'Movimentacao Tecidos')
    case 'estoque':
      return readParquetAsWorkbook(filePath, 'Saldo do Estoque Geral')
    case 'pedidos':
      return readParquetAsWorkbook(filePath, 'Pedidos')
    case 'itens':
      return readParquetAsWorkbook(filePath, 'Itens')
    case 'parceiros':
      return readParquetAsWorkbook(filePath, 'Parceiro Comercial')
    default:
      return readParquetAsWorkbook(filePath, path.parse(filePath).name)
  }
}
