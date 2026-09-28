import * as XLSX from 'xlsx'
import type { ParceiroGeo } from '@/lib/etl/types'

const UF_BRASIL = new Set(
  'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(
    ' ',
  ),
)

function text(value: unknown) {
  const raw = String(value ?? '').trim()
  return raw || null
}

/** Cadastro de Parceiro Comercial.xlsx: UF do endereço principal. */
export function parseParceiros(workbook: XLSX.WorkBook): ParceiroGeo[] {
  const name = workbook.SheetNames.includes('Parceiro Comercial')
    ? 'Parceiro Comercial'
    : workbook.SheetNames[0]
  if (!name) return []

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[name],
    { defval: '' },
  )
  const byCode = new Map<string, ParceiroGeo>()
  for (const row of rows) {
    const codigo = text(row.Codigo)
    if (!codigo) continue
    const rawUf = text(row['UF principal'])?.toUpperCase() ?? ''
    const uf = UF_BRASIL.has(rawUf) ? rawUf : rawUf ? 'EX' : 'SU'
    byCode.set(codigo, {
      codigo,
      uf,
      estado: uf === 'EX' ? 'Exterior' : text(row['Estado principal']),
      municipio: text(row['Municipio principal']),
      regiao: text(row.Regiao),
    })
  }
  return [...byCode.values()]
}
