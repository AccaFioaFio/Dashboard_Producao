import * as XLSX from 'xlsx'
import { isPlausibleBusinessDate, isSerialDiasDeCorte, isYear, leadTimeDays, toIsoDate } from '@/lib/dates'
import {
  asText,
  asTecidoCode,
  isStarPedido,
  normalizeHeader,
  normalizeOrigem,
  normalizePedido,
  normalizeStatus,
} from '@/lib/keys'
import { YEAR } from '@/lib/year'
import { asNumber, headerIndex, sheetNameFold } from '@/lib/etl/excel'
import type {
  CorteLinha,
  CortePedido,
  CosturaLancamento,
  OficinaLote,
  QualidadeEvento,
  RevisaoLancamento,
} from '@/lib/etl/types'

export function findSheet(workbook: XLSX.WorkBook, expected: string) {
  const target = sheetNameFold(expected)
  const name = workbook.SheetNames.find((sheet) => sheetNameFold(sheet) === target)
  if (!name) {
    throw new Error(
      `Aba não encontrada: ${expected}. Abas: ${workbook.SheetNames.join(', ')}`,
    )
  }
  return workbook.Sheets[name]
}

export function sheetRows(workbook: XLSX.WorkBook, expected: string) {
  const sheet = findSheet(workbook, expected)
  const ref = sheet['!ref']
  if (!ref) return []
  const range = XLSX.utils.decode_range(ref)
  const rows: unknown[][] = []
  for (let r = 0; r <= range.e.r; r += 1) {
    const row: unknown[] = []
    for (let c = 0; c <= range.e.c; c += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })]
      row[c] = cellValue(cell)
    }
    rows[r] = row
  }
  return rows
}

function cellValue(cell: XLSX.CellObject | undefined) {
  if (!cell) return null
  if (cell.t === 'd' && cell.v instanceof Date) return cell.v
  if (cell.t === 'n' && typeof cell.v === 'number') return cell.v
  if (cell.t === 's' || cell.t === 'str') return cell.v
  if (cell.t === 'b') return cell.v
  if (cell.t === 'e') return null
  return cell.v ?? null
}

function buildHeaderMap(row: unknown[]) {
  const map = new Map<string, number>()
  row.forEach((value, index) => {
    const key = normalizeHeader(value)
    if (key && !map.has(key)) map.set(key, index)
  })
  return map
}

export function findHeaderRow(rows: unknown[][], required: string[]) {
  const scanUntil = Math.min(rows.length, 40)
  for (let i = 0; i < scanUntil; i += 1) {
    const map = buildHeaderMap(rows[i] ?? [])
    if (required.every((alias) => headerIndex(map, [alias]) != null)) {
      return { rowIndex: i, map }
    }
  }
  throw new Error(`Cabeçalho não encontrado (${required.join(', ')})`)
}

export function cell(row: unknown[], col: number | null) {
  return col == null ? null : row[col]
}

export function readWorkbook(filePath: string) {
  return XLSX.readFile(filePath, {
    cellDates: true,
    cellNF: false,
    cellText: false,
  })
}

export function parseCorte(workbook: XLSX.WorkBook) {
  const rows = sheetRows(workbook, 'CORTE')
  const { rowIndex, map } = findHeaderRow(rows, ['DATA', 'N PEDIDO'])
  const colPedido = headerIndex(map, ['N PEDIDO', 'NO PEDIDO', 'NUMERO PEDIDO'])
  const colData = headerIndex(map, ['DATA'])
  const colStatus = headerIndex(map, ['STATUS'])
  const colPecas = headerIndex(map, ['QTD PCS CORTADAS'])
  const colTerceiros = headerIndex(map, ['QTD PCS TERCEIROS'])
  const colEstoque = headerIndex(map, ['QTD PCS ESTOQUE'])
  const colCanal = headerIndex(map, ['FATURAMENTO'])
  const colResp = headerIndex(map, ['RESPOSAVEL', 'RESPONSAVEL'])
  const colCliente = headerIndex(map, ['NOME FANTASIA'])
  const colRazao = headerIndex(map, ['RAZAO SOCIAL'])
  const colInicio = headerIndex(map, ['INICIO CORTE'])
  const colFinal = headerIndex(map, ['FINAL CORTE'])
  const colPcp = headerIndex(map, ['PCP PRONTAS', 'PCP PRONTA'])
  const colObsPedido = headerIndex(map, ['OBSERVACOES'])
  const colObsLinha = headerIndex(map, ['OBSERVACAO'])
  const colDias = headerIndex(map, ['DIAS DE CORTE'])
  const colTecido = headerIndex(map, ['TECIDOS'])
  const colCodTecido = headerIndex(map, ['COD TECIDO'])
  const colMetros = headerIndex(map, ['MTS TECIDOS'])
  const colEconomia = headerIndex(map, ['ECONOMIA DE TECIDO'])

  const linhas: CorteLinha[] = []
  const qualidade: QualidadeEvento[] = []

  let headerPedido: string | null = null
  let headerData: string | null = null
  let headerStatus: string | null = null
  let headerCanal: string | null = null
  let headerCliente: string | null = null
  let headerResp: string | null = null
  let headerInicio: string | null = null
  let headerFinal: string | null = null
  let headerPcp: string | null = null
  let headerObs: string | null = null

  for (let i = rowIndex + 1; i < rows.length; i += 1) {
    const values = rows[i] ?? []
    const excelRow = i + 1
    const rawPedido = cell(values, colPedido)
    const star = isStarPedido(rawPedido)
    const pedidoNorm = normalizePedido(rawPedido)

    if (pedidoNorm) {
      headerPedido = pedidoNorm
      headerData = toIsoDate(cell(values, colData)) ?? headerData
      headerStatus = normalizeStatus(cell(values, colStatus)) ?? headerStatus
      headerCanal = asText(cell(values, colCanal)) ?? headerCanal
      headerCliente =
        asText(cell(values, colCliente)) ??
        asText(cell(values, colRazao)) ??
        headerCliente
      headerResp = asText(cell(values, colResp)) ?? headerResp
      headerInicio = toIsoDate(cell(values, colInicio))
      headerFinal = toIsoDate(cell(values, colFinal))
      const pcp = toIsoDate(cell(values, colPcp))
      headerPcp = isPlausibleBusinessDate(pcp) ? pcp : null
      headerObs = asObservacao(cell(values, colObsPedido))
    }

    if (!headerPedido) continue
    const data = headerData
    if (!isYear(data, YEAR)) continue

    const inicio = headerInicio
    const fim = headerFinal
    const diasRaw = asNumber(cell(values, colDias))
    if (isSerialDiasDeCorte(diasRaw, inicio)) {
      qualidade.push({
        tipo: 'dias_corte_serial',
        pedidoNorm: headerPedido,
        detalhe: 'DIAS DE CORTE serial (fórmula com INICIO vazio)',
        excelRow,
        valor: diasRaw,
      })
    }

    linhas.push({
      excelRow,
      pedidoNorm: headerPedido,
      isHeader: Boolean(pedidoNorm),
      isStar: star,
      data,
      status: headerStatus,
      qtdPecas: asNumber(cell(values, colPecas)),
      qtdTerceiros: asNumber(cell(values, colTerceiros)),
      qtdEstoque: asNumber(cell(values, colEstoque)),
      metros: asNumber(cell(values, colMetros)),
      economia: asNumber(cell(values, colEconomia)),
      tecido: asText(cell(values, colTecido)),
      codTecido: asTecidoCode(cell(values, colCodTecido)),
      responsavel: headerResp,
      canal: headerCanal,
      cliente: headerCliente,
      inicioCorte: inicio,
      finalCorte: fim,
      pcpProntas: headerPcp,
      observacao: joinObservacoes([
        headerObs,
        asObservacao(cell(values, colObsLinha)),
      ]),
      diasDeCorteRaw: diasRaw,
    })
  }

  const byPedido = new Map<string, CorteLinha[]>()
  for (const linha of linhas) {
    const list = byPedido.get(linha.pedidoNorm) ?? []
    list.push(linha)
    byPedido.set(linha.pedidoNorm, list)
  }

  const pedidos: CortePedido[] = []
  for (const [pedidoNorm, group] of byPedido) {
    const headers = group.filter((row) => row.isHeader)
    const last = headers.at(-1) ?? group.at(-1)!
    const statuses = new Set(
      headers.map((row) => row.status).filter(Boolean) as string[],
    )
    const statusDuplo = statuses.size > 1
    if (statusDuplo) {
      qualidade.push({
        tipo: 'status_duplo',
        pedidoNorm,
        detalhe: [...statuses].join(' + '),
        excelRow: last.excelRow,
        valor: headers.length,
      })
    }

    pedidos.push({
      pedidoNorm,
      data: last.data,
      statusVigente: last.status,
      pecas: group.reduce((sum, row) => sum + (row.qtdPecas ?? 0), 0),
      terceiros: group.reduce((sum, row) => sum + (row.qtdTerceiros ?? 0), 0),
      estoque: group.reduce((sum, row) => sum + (row.qtdEstoque ?? 0), 0),
      metros: group.reduce((sum, row) => sum + (row.metros ?? 0), 0),
      economia: group.reduce((sum, row) => sum + (row.economia ?? 0), 0),
      responsavel: last.responsavel,
      canal: last.canal,
      cliente: last.cliente,
      inicioCorte: headers.map((row) => row.inicioCorte).find(Boolean) ?? null,
      finalCorte:
        [...headers].reverse().map((row) => row.finalCorte).find(Boolean) ??
        null,
      pcpProntas:
        headers
          .map((row) => row.pcpProntas)
          .filter((value): value is string => Boolean(value))
          .sort()[0] ?? null,
      observacao: joinObservacoes(group.map((row) => row.observacao)),
      leadTimeDias: leadTimeDays(
        headers.map((row) => row.inicioCorte).find(Boolean) ?? null,
        [...headers].reverse().map((row) => row.finalCorte).find(Boolean) ??
          null,
      ),
      statusDuplo,
      headersCount: headers.length,
    })
  }

  return { linhas, pedidos, qualidade }
}

export function parseCostura(workbook: XLSX.WorkBook) {
  const rows = sheetRows(workbook, 'RELATORIO COSTURA')
  const { rowIndex, map } = findHeaderRow(rows, ['PEDIDO', 'ORIGEM'])
  const colPedido = headerIndex(map, ['PEDIDO'])
  const colData = headerIndex(map, ['DATA PRODUCAO'])
  const colOrigem = headerIndex(map, ['ORIGEM'])
  const colQtd = headerIndex(map, ['QTD PECAS'])
  const colResp = headerIndex(map, ['RESPONSAVEL'])
  const colProduto = headerIndex(map, ['PRODUTO'])

  const lancamentos: CosturaLancamento[] = []
  for (let i = rowIndex + 1; i < rows.length; i += 1) {
    const values = rows[i] ?? []
    const pedidoNorm = normalizePedido(cell(values, colPedido))
    const dataProducao = toIsoDate(cell(values, colData))
    const origem = asText(cell(values, colOrigem))
    if (!pedidoNorm || !dataProducao || !isYear(dataProducao, YEAR)) continue
    if (!origem) continue
    lancamentos.push({
      excelRow: i + 1,
      pedidoNorm,
      dataProducao,
      origem,
      origemNorm: normalizeOrigem(origem),
      qtdPecas: asNumber(cell(values, colQtd)) ?? 0,
      responsavel: asText(cell(values, colResp)),
      produto: asText(cell(values, colProduto)),
    })
  }
  return lancamentos
}

export function parseRevisao(workbook: XLSX.WorkBook) {
  const rows = sheetRows(workbook, 'RELATORIO REVISAO')
  const { rowIndex, map } = findHeaderRow(rows, ['PEDIDO', 'QTD'])
  const colPedido = headerIndex(map, ['PEDIDO'])
  const colData = headerIndex(map, ['DATA PRODUCAO'])
  const colQtd = headerIndex(map, ['QTD', 'QTD PECAS'])
  const colResp = headerIndex(map, ['RESPONSAVEL'])
  const colProduto = headerIndex(map, ['PRODUTO'])

  const limpos: RevisaoLancamento[] = []
  const qualidade: QualidadeEvento[] = []

  for (let i = rowIndex + 1; i < rows.length; i += 1) {
    const values = rows[i] ?? []
    const pedidoNorm = normalizePedido(cell(values, colPedido))
    const dataProducao = toIsoDate(cell(values, colData))
    const qtd = asNumber(cell(values, colQtd))
    if (qtd == null) continue

    if (!pedidoNorm) {
      qualidade.push({
        tipo: 'revisao_total',
        pedidoNorm: null,
        detalhe: 'Linha de total da revisão (sem pedido)',
        excelRow: i + 1,
        valor: qtd,
      })
      continue
    }
    if (!dataProducao || !isYear(dataProducao, YEAR)) continue

    const pedidoNum = Number(pedidoNorm)
    if (Number.isFinite(pedidoNum) && qtd === pedidoNum) {
      qualidade.push({
        tipo: 'revisao_qtd_eq_pedido',
        pedidoNorm,
        detalhe: `Qtd igual ao número do pedido (${pedidoNorm})`,
        excelRow: i + 1,
        valor: qtd,
      })
      continue
    }

    limpos.push({
      excelRow: i + 1,
      pedidoNorm,
      dataProducao,
      qtdPecas: qtd,
      responsavel: asText(cell(values, colResp)),
      produto: asText(cell(values, colProduto)),
    })
  }

  return { limpos, qualidade }
}

export function parseOficinas(workbook: XLSX.WorkBook) {
  const rows = sheetRows(workbook, 'TABELA OFICINAS')
  const { rowIndex, map } = findHeaderRow(rows, ['OFICINA', 'DATA ENVIO'])
  const colOficina = headerIndex(map, ['OFICINA'])
  const colPedido = headerIndex(map, ['PEDIDO'])
  const colEnvio = headerIndex(map, ['DATA ENVIO'])
  const colEnviadas = headerIndex(map, ['QTD PCS ENVIADAS'])
  const colRetornadas = headerIndex(map, ['QTD PCS RETORNADAS'])
  const colPendentes = headerIndex(map, [
    'QTD PCS PENDETENTE',
    'QTD PCS PENDENTE',
  ])
  const colDefeitos = headerIndex(map, ['PECAS COM DEFEITOS'])
  const colStatus = headerIndex(map, ['STATUS ENTREGA'])
  const colPrometida = headerIndex(map, ['DATA PROMETIDA ENTREGA'])
  const colRetorno = headerIndex(map, ['DATA RETORNO PRODUCAO'])
  const colProduto = headerIndex(map, ['ITEM', 'PRODUTO'])
  const colValor = headerIndex(map, ['VALOR UNIT'])

  const lotes: OficinaLote[] = []
  const qualidade: QualidadeEvento[] = []

  for (let i = rowIndex + 1; i < rows.length; i += 1) {
    const values = rows[i] ?? []
    const oficinaRaw = asText(cell(values, colOficina))
    const pedidoRaw = asText(cell(values, colPedido))
    if (
      oficinaRaw &&
      (foldSafe(oficinaRaw) === 'OFICINA' || foldSafe(pedidoRaw ?? '') === 'PEDIDO')
    ) {
      continue
    }

    const dataEnvio = toIsoDate(cell(values, colEnvio))
    if (!dataEnvio || !isYear(dataEnvio, YEAR)) continue

    if (!oficinaRaw) {
      qualidade.push({
        tipo: 'oficina_vazia',
        pedidoNorm: normalizePedido(cell(values, colPedido)),
        detalhe: 'Linha 2026 sem oficina',
        excelRow: i + 1,
        valor: asNumber(cell(values, colEnviadas)),
      })
      continue
    }

    const lote: OficinaLote = {
      excelRow: i + 1,
      pedidoNorm: normalizePedido(cell(values, colPedido)),
      oficina: oficinaRaw,
      dataEnvio,
      qtdEnviadas: asNumber(cell(values, colEnviadas)) ?? 0,
      qtdRetornadas: asNumber(cell(values, colRetornadas)) ?? 0,
      qtdPendentes: asNumber(cell(values, colPendentes)) ?? 0,
      qtdDefeitos: asNumber(cell(values, colDefeitos)) ?? 0,
      statusEntrega: asText(cell(values, colStatus)),
      dataPrometida: toIsoDate(cell(values, colPrometida)),
      dataRetorno: toIsoDate(cell(values, colRetorno)),
      produto: asText(cell(values, colProduto)),
      valorTotal: asNumber(cell(values, colValor)),
    }
    lotes.push(lote)

    if (
      foldSafe(oficinaRaw) === 'LILICA' &&
      lote.qtdEnviadas > 0 &&
      lote.qtdRetornadas === 0 &&
      lote.qtdPendentes === 0
    ) {
      qualidade.push({
        tipo: 'lilica',
        pedidoNorm: lote.pedidoNorm,
        detalhe: 'Lilica: enviadas sem retorno e sem pendente',
        excelRow: i + 1,
        valor: lote.qtdEnviadas,
      })
    }
  }

  return { lotes, qualidade }
}

function asObservacao(value: unknown) {
  if (value == null || value === '') return null
  if (value instanceof Date) return null
  if (typeof value === 'number') return null
  const text = asText(value)
  if (!text) return null
  if (/^-?\d+([.,]\d+)?$/.test(text)) return null
  return text.replace(/\s+/g, ' ').trim()
}

function joinObservacoes(values: (string | null | undefined)[]) {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const raw of values) {
    if (!raw) continue
    for (const piece of raw.split(' · ')) {
      const text = piece.replace(/\s+/g, ' ').trim()
      if (!text) continue
      const key = text.toUpperCase()
      if (seen.has(key)) continue
      seen.add(key)
      parts.push(text)
    }
  }
  if (!parts.length) return null
  const joined = parts.join(' · ')
  return joined.length > 500 ? `${joined.slice(0, 497)}...` : joined
}

function foldSafe(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}
