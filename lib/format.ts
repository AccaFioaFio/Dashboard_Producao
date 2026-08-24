export function formatInt(value: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(
    Math.round(value),
  )
}

export function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

export function formatMeters(value: number, digits = 0) {
  return `${formatNumber(value, digits)} m`
}

export function shortTecido(value: string | null | undefined) {
  if (!value) return '—'
  let text = value.replace(/\s+/g, ' ').trim()
  text = text.replace(/^[0-9A-Za-z]+\s*[-_]\s*/, '')
  text = text.replace(/\s*\/\s*MAT[EÉ]RIA PRIMA.*$/i, '')
  text = text.replace(/_+(FABRICA|GALP[AÃ]O|GONDOLA).*$/i, '')
  return text.trim() || value.replace(/\s+/g, ' ').trim()
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const [year, month, day] = iso.slice(0, 10).split('-')
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

export const MONTH_LABELS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

export const TIPO_TECIDO_LABEL: Record<string, string> = {
  baixa_producao: 'Produção (insumos)',
  baixa_canal: 'Baixa canal (FF/AC/TC)',
  retorno_corte: 'Retorno do corte',
  compra: 'Compra / devolução',
  inventario: 'Inventário',
  ajuste: 'Ajuste auxiliar',
  transferencia: 'Transferência de almox',
  amostra: 'Amostra',
  faturamento: 'Faturamento',
  outras_saidas: 'Outras saídas',
  outras_entradas: 'Outras entradas',
}
