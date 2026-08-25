import type * as XLSX from 'xlsx'
import { isYear, toIsoDate } from '@/lib/dates'
import { asNumber, headerIndex } from '@/lib/etl/excel'
import { cell, findHeaderRow, sheetRows } from '@/lib/etl/parse'
import {
  asText,
  asTecidoCode,
  foldSignus,
  parsePedidoOrigemSignus,
} from '@/lib/keys'
import { YEAR } from '@/lib/paths'
import type { SignusTecidoMovimento, TipoTecidoNorm } from '@/lib/etl/types'

const FALLBACK_COLS = {
  almox: 3,
  movimentoId: 4,
  produtoId: 5,
  codProduto: 6,
  nomeProduto: 7,
  categoria: 12,
  data: 15,
  es: 17,
  qtd: 18,
  custoBruto: 22,
  valorTotalBruto: 26,
  tipo: 29,
  origemMov: 30,
  linha: 36,
  valorTotalContabil: 40,
  valorUnitario: 41,
  valorTotalLiq: 42,
  valorUnitarioLiq: 43,
  tipoDocSigla: 47,
  tipoDocumento: 48,
  unidade: 51,
}

function pickMoney(...values: unknown[]) {
  for (const value of values) {
    const parsed = asNumber(value)
    if (parsed != null) return parsed
  }
  return null
}

function resolveTotal(total: number | null, unitario: number | null, qtd: number) {
  if (total != null && total !== 0) return total
  if (unitario != null && qtd) return unitario * qtd
  return total
}

function col(map: Map<string, number>, aliases: string[], fallback: number) {
  return headerIndex(map, aliases) ?? fallback
}

function classifyTipo(tipoFold: string, esFold: string): TipoTecidoNorm {
  if (tipoFold.includes('RETORNO DO CORTE')) return 'retorno_corte'
  if (tipoFold.includes('INSUMO') && (esFold === 'S' || esFold === 'ZS')) {
    return 'baixa_producao'
  }
  if (
    tipoFold === 'SAIDA FF' ||
    tipoFold === 'SAIDA AC' ||
    tipoFold === 'SAIDA TC'
  ) {
    return 'baixa_canal'
  }
  if (tipoFold.includes('TRANSFERENCIA')) return 'transferencia'
  if (tipoFold.includes('INVENT')) return 'inventario'
  if (tipoFold.includes('AJUSTE')) return 'ajuste'
  if (tipoFold.includes('AMOSTRA')) return 'amostra'
  if (tipoFold.includes('COMPRA')) return 'compra'
  if (tipoFold.includes('FATURAMENTO')) return 'faturamento'
  if (esFold === 'S' || esFold === 'ZS') return 'outras_saidas'
  return 'outras_entradas'
}

function canalFromTipo(tipoFold: string): string | null {
  if (tipoFold.endsWith(' FF') || tipoFold === 'SAIDA FF' || tipoFold === 'ENTRADA FF') {
    return 'FAF'
  }
  if (tipoFold.endsWith(' AC') || tipoFold === 'SAIDA AC' || tipoFold === 'ENTRADA AC') {
    return 'ACCA'
  }
  if (tipoFold.endsWith(' TC') || tipoFold === 'SAIDA TC' || tipoFold === 'ENTRADA TC') {
    return 'TC'
  }
  return null
}

function isMetros(unidade: string | null) {
  const folded = foldSignus(unidade ?? '')
  return folded === 'MT' || folded === 'M' || folded === 'MTS' || folded === 'METRO'
}

function isTecidoLinha(linha: string | null, nome: string | null, categoria: string | null) {
  const linhaFold = foldSignus(linha ?? '')
  if (linhaFold === 'TECIDO') return true
  const catFold = foldSignus(categoria ?? '')
  if (catFold.includes('PRIMA') && foldSignus(nome ?? '').includes('TECIDO')) return true
  return false
}

export function parseSignusTecidos(workbook: XLSX.WorkBook) {
  let rows: unknown[][]
  try {
    rows = sheetRows(workbook, 'MOVIMENTACAO TECIDOS')
  } catch {
    const first = workbook.SheetNames[0]
    if (!first) throw new Error('Signus sem abas')
    rows = sheetRows(workbook, first)
  }
  let rowIndex: number
  let map: Map<string, number>
  try {
    const found = findHeaderRow(rows, ['E S', 'QTD'])
    rowIndex = found.rowIndex
    map = found.map
  } catch {
    rowIndex = 0
    map = new Map()
  }
  const colAlmox = col(map, ['NOME DO ALMOXARIFADO', 'ALMOX'], FALLBACK_COLS.almox)
  const colMovId = col(map, ['ID DO MOVIMENTO'], FALLBACK_COLS.movimentoId)
  const colCod = col(
    map,
    ['CODIGO PRODUTO', 'CDIGO PRODUTO'],
    FALLBACK_COLS.codProduto,
  )
  const colNome = col(map, ['NOME DO PRODUTO'], FALLBACK_COLS.nomeProduto)
  const colCat = col(map, ['CATEGORIA'], FALLBACK_COLS.categoria)
  const colData = col(map, ['DATA DE MOVIMENT', 'DATA DE MOVIMENTACAO'], FALLBACK_COLS.data)
  const colEs = col(map, ['E S'], FALLBACK_COLS.es)
  const colQtd = col(map, ['QTD MOVIMENTADA', 'QTD'], FALLBACK_COLS.qtd)
  const colTipo = col(map, ['TIPO DE MOVIMENTADO', 'TIPO DE MOVIMENTO'], FALLBACK_COLS.tipo)
  const colOrig = col(map, ['ORIG MOV'], FALLBACK_COLS.origemMov)
  const colLinha = col(map, ['LINHA'], FALLBACK_COLS.linha)
  const colUm = col(map, ['UNIDADE DE MEDIDA'], FALLBACK_COLS.unidade)
  const colVu = col(
    map,
    ['VALOR UNITARIO CONTABIL BRUTO', 'CUSTO BRUTO'],
    FALLBACK_COLS.valorUnitario,
  )
  const colVuLiq = col(
    map,
    ['VALOR UNITARIO CONTABIL LIQUIDO', 'CUSTO LIQUIDO'],
    FALLBACK_COLS.valorUnitarioLiq,
  )
  const colVt = col(
    map,
    [
      'VALOR TOTAL BRUTO DA MOVIMENT',
      'VALOR TOTAL CONTABIL BRUTO',
    ],
    FALLBACK_COLS.valorTotalBruto,
  )
  const colVtLiq = col(
    map,
    [
      'VALOR TOTAL LIQUIDO DA MOVIMENT',
      'VALOR TOTAL CONTABIL LIQUIDO',
    ],
    FALLBACK_COLS.valorTotalLiq,
  )
  const colDoc = col(map, ['TIPO DE DOCUMENTO'], FALLBACK_COLS.tipoDocumento)
  const colDocSigla = col(
    map,
    ['TIPO DE DOCUMENTO - SIGLA', 'TIPO DE DOCUMENTO SIGLA'],
    FALLBACK_COLS.tipoDocSigla,
  )

  const movimentos: SignusTecidoMovimento[] = []

  for (let i = rowIndex + 1; i < rows.length; i += 1) {
    const values = rows[i] ?? []
    const movimentoId = asText(cell(values, colMovId))
    const codProduto = asTecidoCode(cell(values, colCod))
    const tipoMovimento = asText(cell(values, colTipo))
    if (!movimentoId || !codProduto || !tipoMovimento) continue
    if (foldSignus(codProduto).includes('CODIGO PRODUTO')) continue

    const nomeProduto = asText(cell(values, colNome))
    const linha = asText(cell(values, colLinha))
    const categoria = asText(cell(values, colCat))
    if (!isTecidoLinha(linha, nomeProduto, categoria)) continue

    const data = toIsoDate(cell(values, colData))
    if (!data || !isYear(data, YEAR)) continue

    const esRaw = asText(cell(values, colEs)) ?? ''
    const esFold = foldSignus(esRaw)
    const tipoFold = foldSignus(tipoMovimento)
    const tipoNorm = classifyTipo(tipoFold, esFold)
    const unidade = asText(cell(values, colUm))
    const qtd = asNumber(cell(values, colQtd)) ?? 0
    const isBaixa = tipoNorm === 'baixa_producao' || tipoNorm === 'baixa_canal'
    const valorUnitario = pickMoney(cell(values, colVu), cell(values, FALLBACK_COLS.custoBruto))
    const valorUnitarioLiq = pickMoney(cell(values, colVuLiq))
    const valorTotal = resolveTotal(
      pickMoney(cell(values, colVt), cell(values, FALLBACK_COLS.valorTotalContabil)),
      valorUnitario,
      qtd,
    )
    const valorTotalLiq = resolveTotal(
      pickMoney(cell(values, colVtLiq)),
      valorUnitarioLiq,
      qtd,
    )

    movimentos.push({
      excelRow: i + 1,
      movimentoId,
      data,
      es: esFold || esRaw,
      qtd,
      metros: isMetros(unidade) ? qtd : 0,
      codProduto,
      nomeProduto,
      almox: asText(cell(values, colAlmox)),
      categoria,
      linha,
      unidade,
      tipoMovimento,
      tipoNorm,
      canalNorm: canalFromTipo(tipoFold),
      pedidoNorm: parsePedidoOrigemSignus(cell(values, colOrig)),
      origemMov: asText(cell(values, colOrig)),
      isBaixa,
      valorUnitario,
      valorTotal,
      valorUnitarioLiq,
      valorTotalLiq,
      tipoDocumento: asText(cell(values, colDoc)),
      tipoDocumentoSigla: asText(cell(values, colDocSigla)),
    })
  }

  return movimentos
}
