import type * as XLSX from 'xlsx'
import { isPlausibleBusinessDate, toIsoDate } from '@/lib/dates'
import { asNumber, headerIndex } from '@/lib/etl/excel'
import { cell, findSheet, sheetRows } from '@/lib/etl/parse'
import { asText, fold, normalizeHeader, splitCodigoDescricao } from '@/lib/keys'
import type { AproveitamentoMovimento } from '@/lib/etl/types'

function findQtyColumn(row: unknown[], aliases: string[]) {
  const wanted = aliases.map((alias) => normalizeHeader(alias))
  for (let index = 0; index < row.length; index += 1) {
    const key = normalizeHeader(row[index])
    if (wanted.some((alias) => key === alias)) return index
  }
  for (let index = 0; index < row.length; index += 1) {
    const key = normalizeHeader(row[index])
    if (!key) continue
    if (wanted.some((alias) => key.includes(alias))) return index
  }
  return null
}

function aproveitamentoDate(value: unknown) {
  const iso = toIsoDate(value)
  if (!isPlausibleBusinessDate(iso)) return null
  return iso
}

function parseTable(
  rows: unknown[][],
  tipo: AproveitamentoMovimento['tipo'],
  qtyAliases: string[],
) {
  const scanUntil = Math.min(rows.length, 40)
  let headerIndexRow = -1
  let qtyCol: number | null = null
  let pedidoCol: number | null = null
  let clienteCol: number | null = null
  let dataCol: number | null = null
  let tecidoCol: number | null = null
  let modeloCol: number | null = null

  for (let i = 0; i < scanUntil; i += 1) {
    const row = rows[i] ?? []
    const foundQty = findQtyColumn(row, qtyAliases)
    if (foundQty == null) continue
    const start = Math.max(0, foundQty - 8)
    const block = new Map<string, number>()
    for (let c = start; c <= foundQty; c += 1) {
      const key = normalizeHeader(row[c])
      if (key && !block.has(key)) block.set(key, c)
    }
    const foundPedido = headerIndex(block, ['PEDIDOS', 'PEDIDO'])
    if (foundPedido == null) continue
    headerIndexRow = i
    qtyCol = foundQty
    pedidoCol = foundPedido
    clienteCol = headerIndex(block, ['CLIENTES', 'CLIENTE'])
    dataCol = headerIndex(block, ['DATA'])
    tecidoCol = headerIndex(block, ['TECIDO'])
    modeloCol = headerIndex(block, ['MODELO'])
    break
  }

  if (headerIndexRow < 0 || qtyCol == null) {
    throw new Error(
      `Cabeçalho da tabela de ${tipo} não encontrado na aba Aproveitamento (${qtyAliases.join(', ')})`,
    )
  }

  const movimentos: AproveitamentoMovimento[] = []
  let empty = 0
  for (let i = headerIndexRow + 1; i < rows.length; i += 1) {
    const values = rows[i] ?? []
    const pedido = asText(cell(values, pedidoCol))
    if (pedido && fold(pedido) === 'TOTAL') break
    const qtd = asNumber(cell(values, qtyCol))
    const modelo = asText(cell(values, modeloCol))
    const tecidoRaw = cell(values, tecidoCol)
    const { cod, nome } = splitCodigoDescricao(tecidoRaw)
    if (!pedido && qtd == null && !modelo && !cod && !nome) {
      empty += 1
      if (empty >= 8) break
      continue
    }
    empty = 0
    if (qtd == null) continue
    movimentos.push({
      excelRow: i + 1,
      tipo,
      pedido,
      cliente: asText(cell(values, clienteCol)),
      data: aproveitamentoDate(cell(values, dataCol)),
      codProduto: cod,
      tecido: nome,
      modelo,
      qtd,
    })
  }
  return movimentos
}

export function parseAproveitamento(workbook: XLSX.WorkBook) {
  findSheet(workbook, 'APROVEITAMENTO')
  const rows = sheetRows(workbook, 'APROVEITAMENTO')
  return [
    ...parseTable(rows, 'entrada', ['QTD CORTADO', 'QTD CORTADA']),
    ...parseTable(rows, 'saida', ['QTD APROVEITAMENTO', 'QTD APROVEITADO']),
  ]
}
