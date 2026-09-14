import type * as XLSX from 'xlsx'
import { toIsoDate, yearOf } from '@/lib/dates'
import { asNumber, headerIndex } from '@/lib/etl/excel'
import { cell, findHeaderRow, sheetRows } from '@/lib/etl/parse'
import { asText, fold } from '@/lib/keys'
import { YEAR } from '@/lib/year'
import { normalizePedidoComercial } from '@/lib/etl/parse-pedidos'
import type { PedidoItem } from '@/lib/etl/types'

function col(map: Map<string, number>, aliases: string[], fallback: number | null = null) {
  return headerIndex(map, aliases) ?? fallback
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

export function parsePedidosItens(workbook: XLSX.WorkBook): PedidoItem[] {
  let rows: unknown[][]
  try {
    rows = sheetRows(workbook, 'Itens')
  } catch {
    const first = workbook.SheetNames[0]
    if (!first) throw new Error('Itens.xlsx sem abas')
    rows = sheetRows(workbook, first)
  }

  const { rowIndex, map } = findHeaderRow(rows, [
    'Nro do Pedido',
    'Produto - Codigo',
    'Produto - Nome',
  ])
  if (rowIndex < 0) {
    throw new Error('Cabeçalho de Itens não encontrado')
  }

  const cPedido = col(map, ['Nro do Pedido', 'Nro Pedido', 'Pedido'], 1)
  const cUnidade = col(map, ['Unidade de negocio', 'Unidade de negócio'])
  const cParceiroCod = col(map, ['Parceiro - Codigo', 'Parceiro - Código'])
  const cCnpj = col(map, ['Parceiro - CNPJ/CPF'])
  const cRazao = col(map, ['Parceiro - Razao Social', 'Parceiro - Razão Social'])
  const cFantasia = col(map, ['Parceiro - Nome Fantasia'])
  const cTipo = col(map, ['Tipo de comercializacao', 'Tipo de comercialização'])
  const cStatus = col(map, ['Status'])
  const cValorTotal = col(map, ['Pedido - Valor total'])
  const cValorFat = col(map, ['Pedido - Valor faturado'])
  const cCodProduto = col(map, ['Produto - Codigo', 'Produto - Código'])
  const cNomeProduto = col(map, ['Produto - Nome'])
  const cCategoria = col(map, ['Produto - Categoria'])
  const cPedidoCliente = col(map, ['Pedido do cliente'])
  const cQtdPedida = col(map, ['Qtd Pedida'])
  const cQtdFat = col(map, ['Qtd Faturada'])
  const cPrecoBruto = col(map, ['Preco Bruto', 'Preço Bruto'])
  const cPrecoLiq = col(map, ['Preco Liquido', 'Preço Líquido', 'Preço Liquido'])
  const cValorBruto = col(map, ['Produto - Total bruto (pedido)'])
  const cValorLiq = col(map, [
    'Produto - Total liquido (pedido)',
    'Produto - Total líquido (pedido)',
  ])
  const cDesconto = col(map, ['Produto - Desconto total'])
  const cVenda = col(map, ['Venda', 'Pedido - Venda'])
  const cEntrega = col(map, ['Pedido - Entrega programada'])
  const cCadastro = col(map, ['Pedido - Cadastro'])

  if (cPedido == null || cCodProduto == null) {
    throw new Error('Colunas Nro do Pedido / Produto - Codigo não encontradas')
  }

  const out: PedidoItem[] = []
  for (let i = rowIndex + 1; i < rows.length; i++) {
    const values = rows[i]
    if (!values?.length) continue
    const pedidoNorm = normalizePedidoComercial(cell(values, cPedido))
    const codProduto = asText(cell(values, cCodProduto))
    if (!pedidoNorm || !codProduto) continue

    const dataVenda = toIsoDate(cell(values, cVenda ?? -1))
    const dataCadastro = toIsoDate(cell(values, cCadastro ?? -1))
    const dataRef = dataVenda ?? dataCadastro
    const ano = yearOf(dataRef)
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
      valorPedidoTotal: asNumber(cell(values, cValorTotal ?? -1)) ?? 0,
      valorPedidoFaturado: asNumber(cell(values, cValorFat ?? -1)) ?? 0,
      codProduto,
      nomeProduto: asText(cell(values, cNomeProduto ?? -1)),
      categoriaProduto: asText(cell(values, cCategoria ?? -1)),
      pedidoCliente: asText(cell(values, cPedidoCliente ?? -1)),
      qtdPedida: asNumber(cell(values, cQtdPedida ?? -1)) ?? 0,
      qtdFaturada: asNumber(cell(values, cQtdFat ?? -1)) ?? 0,
      precoBruto: asNumber(cell(values, cPrecoBruto ?? -1)),
      precoLiquido: asNumber(cell(values, cPrecoLiq ?? -1)),
      valorBruto: asNumber(cell(values, cValorBruto ?? -1)) ?? 0,
      valorLiquido: asNumber(cell(values, cValorLiq ?? -1)) ?? 0,
      descontoTotal: asNumber(cell(values, cDesconto ?? -1)) ?? 0,
      dataVenda,
      dataEntrega: toIsoDate(cell(values, cEntrega ?? -1)),
      dataCadastro,
    })
  }

  return out
}
