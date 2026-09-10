import type * as XLSX from 'xlsx'
import { toIsoDate, yearOf } from '@/lib/dates'
import { asNumber, headerIndex } from '@/lib/etl/excel'
import { cell, findHeaderRow, sheetRows } from '@/lib/etl/parse'
import { asText, fold } from '@/lib/keys'
import { YEAR } from '@/lib/year'
import type { PedidoComercial } from '@/lib/etl/types'

function col(map: Map<string, number>, aliases: string[], fallback: number | null = null) {
  return headerIndex(map, aliases) ?? fallback
}

/** Alinha ao pedido_norm do Signus/Corte (sem zeros à esquerda). */
export function normalizePedidoComercial(value: unknown): string | null {
  const text = asText(value)
  if (!text) return null
  const digits = text.replace(/\D/g, '')
  if (!digits) return null
  const stripped = digits.replace(/^0+/, '')
  return stripped || '0'
}

function canalFromPedido(
  unidade: string | null,
  tipo: string | null,
): string | null {
  const u = fold(unidade ?? '')
  const t = fold(tipo ?? '')
  if (u.includes('ACCA') || t.includes('[AC]')) return 'ACCA'
  if (u.includes('FAF') || t.includes('[FA]')) return 'FAF'
  if (u.includes('TRU') || t.includes('[TC]')) return 'TC'
  if (u.includes('TERCEIRO')) return 'TERCEIROS'
  if (u.includes('AMOSTRA')) return 'AMOSTRAS'
  return null
}

export function parsePedidosComerciais(workbook: XLSX.WorkBook): PedidoComercial[] {
  let rows: unknown[][]
  try {
    rows = sheetRows(workbook, 'Pedidos')
  } catch {
    const first = workbook.SheetNames[0]
    if (!first) throw new Error('Pedidos.xlsx sem abas')
    rows = sheetRows(workbook, first)
  }

  const { rowIndex, map } = findHeaderRow(rows, [
    'Nro do Pedido',
    'Parceiro - Nome Fantasia',
    'Pedido - Valor total',
  ])
  if (rowIndex < 0) {
    throw new Error('Cabeçalho de Pedidos não encontrado')
  }

  const cPedido = col(map, ['Nro do Pedido', 'Nro Pedido', 'Pedido'], 1)
  const cUnidade = col(map, ['Unidade de negocio', 'Unidade de negócio'], 3)
  const cParceiroCod = col(map, ['Parceiro - Codigo', 'Parceiro - Código'], 4)
  const cCnpj = col(map, ['Parceiro - CNPJ/CPF'], 5)
  const cRazao = col(map, ['Parceiro - Razao Social', 'Parceiro - Razão Social'], 6)
  const cFantasia = col(map, ['Parceiro - Nome Fantasia'], 7)
  const cTipo = col(map, ['Tipo de comercializacao', 'Tipo de comercialização'], 8)
  const cStatus = col(map, ['Status'], 9)
  const cValorTotal = col(map, ['Pedido - Valor total'], 10)
  const cValorFat = col(map, ['Pedido - Valor faturado'], 11)
  const cCadastro = col(map, ['Pedido - Cadastro'], 12)
  const cVenda = col(map, ['Pedido - Venda'], 13)
  const cFaturamento = col(map, ['Pedido - Faturamento'], 14)
  const cCancelamento = col(map, ['Pedido - Cancelamento'], 15)
  const cVendedor = col(map, ['Vendedor'], 16)

  if (cPedido == null) {
    throw new Error('Coluna Nro do Pedido não encontrada')
  }

  const out: PedidoComercial[] = []
  for (let i = rowIndex + 1; i < rows.length; i++) {
    const values = rows[i]
    if (!values?.length) continue
    const pedidoNorm = normalizePedidoComercial(cell(values, cPedido))
    if (!pedidoNorm) continue

    const dataVenda = toIsoDate(cell(values, cVenda ?? -1))
    const dataCadastro = toIsoDate(cell(values, cCadastro ?? -1))
    const dataRef = dataVenda ?? dataCadastro
    const ano = yearOf(dataRef)
    // Histórico recente ajuda previsão; o dashboard filtra YEAR na query.
    if (ano == null || ano < YEAR - 2 || ano > YEAR) continue

    const unidade = asText(cell(values, cUnidade ?? -1))
    const tipo = asText(cell(values, cTipo ?? -1))
    const fantasia = asText(cell(values, cFantasia ?? -1))
    const razao = asText(cell(values, cRazao ?? -1))

    out.push({
      excelRow: i + 1,
      pedidoNorm,
      pedidoRaw: asText(cell(values, cPedido)) ?? pedidoNorm,
      unidadeNegocio: unidade,
      canal: canalFromPedido(unidade, tipo),
      parceiroCodigo: asText(cell(values, cParceiroCod ?? -1))?.trim() ?? null,
      parceiroCnpj: asText(cell(values, cCnpj ?? -1)),
      cliente: fantasia ?? razao,
      razaoSocial: razao,
      tipoComercializacao: tipo,
      status: asText(cell(values, cStatus ?? -1)),
      valorTotal: asNumber(cell(values, cValorTotal ?? -1)) ?? 0,
      valorFaturado: asNumber(cell(values, cValorFat ?? -1)) ?? 0,
      dataCadastro,
      dataVenda,
      dataFaturamento: toIsoDate(cell(values, cFaturamento ?? -1)),
      dataCancelamento: toIsoDate(cell(values, cCancelamento ?? -1)),
      vendedor: asText(cell(values, cVendedor ?? -1)),
    })
  }

  return out
}
