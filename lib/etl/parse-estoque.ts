import type * as XLSX from 'xlsx'
import { asNumber, headerIndex } from '@/lib/etl/excel'
import { cell, findHeaderRow, sheetRows } from '@/lib/etl/parse'
import { asText, asTecidoCode, foldSignus } from '@/lib/keys'
import type { EstoqueTecidoSaldo } from '@/lib/etl/types'

function col(map: Map<string, number>, aliases: string[], fallback: number) {
  return headerIndex(map, aliases) ?? fallback
}

function isMetros(unidade: string | null, nomeUnidade: string | null) {
  const folded = foldSignus(`${unidade ?? ''} ${nomeUnidade ?? ''}`)
  return (
    folded === 'MT' ||
    folded === 'M' ||
    folded === 'MTS' ||
    folded === 'METRO' ||
    folded.startsWith('MT ') ||
    folded.endsWith(' MT') ||
    folded.includes('METRO')
  )
}

function isTecidoEstoque(
  categoria: string | null,
  nome: string | null,
  unidade: string | null,
  nomeUnidade: string | null,
) {
  if (isMetros(unidade, nomeUnidade)) return true
  const catFold = foldSignus(categoria ?? '')
  if (catFold === 'TECIDO') return true
  if (catFold.includes('PRIMA') && foldSignus(nome ?? '').includes('TECIDO')) {
    return true
  }
  return false
}

/** Prefer MT when the same code appears with mixed units across almox. */
function preferUnidade(
  current: string | null,
  next: string | null,
  nextIsMetros: boolean,
) {
  if (nextIsMetros) return next
  if (current && isMetros(current, null)) return current
  return current ?? next
}

export function parseEstoqueTecidos(workbook: XLSX.WorkBook) {
  let rows: unknown[][]
  try {
    rows = sheetRows(workbook, 'SALDO DO ESTOQUE GERAL')
  } catch {
    const first = workbook.SheetNames[0]
    if (!first) throw new Error('Estoque geral sem abas')
    rows = sheetRows(workbook, first)
  }

  const { rowIndex, map } = findHeaderRow(rows, [
    'CODIGO PRODUTO',
    'SALDO ATUAL',
  ])

  const colCod = col(map, ['CODIGO PRODUTO', 'CÓDIGO PRODUTO'], 3)
  const colNome = col(map, ['NOME DO PRODUTO'], 4)
  const colCat = col(map, ['CATEGORIA'], 5)
  const colUm = col(map, ['UNIDADE'], 6)
  const colUmNome = col(map, ['NOME UNIDADE', 'NOME DA UNIDADE'], 7)
  const colAtual = col(map, ['SALDO ATUAL'], 10)
  const colReservado = col(map, ['SALDO RESERVADO'], 11)

  const byCode = new Map<string, EstoqueTecidoSaldo>()

  for (let i = rowIndex + 1; i < rows.length; i += 1) {
    const values = rows[i] ?? []
    const codProduto = asTecidoCode(cell(values, colCod))
    if (!codProduto) continue
    if (foldSignus(codProduto).includes('CODIGO PRODUTO')) continue

    const nomeProduto = asText(cell(values, colNome))
    const categoria = asText(cell(values, colCat))
    const unidade = asText(cell(values, colUm))
    const nomeUnidade = asText(cell(values, colUmNome))
    if (!isTecidoEstoque(categoria, nomeProduto, unidade, nomeUnidade)) continue

    const saldoAtual = asNumber(cell(values, colAtual)) ?? 0
    const saldoReservado = asNumber(cell(values, colReservado)) ?? 0
    const metros = isMetros(unidade, nomeUnidade)
    const existing = byCode.get(codProduto)
    if (!existing) {
      byCode.set(codProduto, {
        excelRow: i + 1,
        codProduto,
        nomeProduto,
        categoria,
        unidade: unidade ?? nomeUnidade,
        saldoAtual,
        saldoReservado,
        emMetros: metros,
      })
      continue
    }

    existing.saldoAtual += saldoAtual
    existing.saldoReservado += saldoReservado
    existing.nomeProduto = existing.nomeProduto ?? nomeProduto
    existing.categoria = existing.categoria ?? categoria
    existing.unidade = preferUnidade(existing.unidade, unidade ?? nomeUnidade, metros)
    existing.emMetros = existing.emMetros || metros
  }

  return [...byCode.values()]
}
