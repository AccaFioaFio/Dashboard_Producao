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

export function formatMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatMoneyCompact(value: number) {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) {
    const sign = value < 0 ? '-' : ''
    return `${sign}R$ ${formatNumber(abs / 1_000_000, 2)} mi`
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: abs >= 10_000 ? 0 : 2,
    maximumFractionDigits: abs >= 10_000 ? 0 : 2,
  }).format(value)
}

export function shortTecido(value: string | null | undefined) {
  if (!value) return '—'
  return value.replace(/\s+/g, ' ').trim()
}

export function formatTecido(
  cod: string | null | undefined,
  nome: string | null | undefined,
) {
  const code = (cod ?? '').replace(/\s+/g, ' ').trim()
  const name = shortTecido(nome)
  if (code && code !== '(sem código)' && name !== '—') return `${code} · ${name}`
  if (name !== '—') return name
  return code || '—'
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const [year, month, day] = iso.slice(0, 10).split('-')
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

export function formatDays(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${formatNumber(value, digits)} d`
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

export function tipoDocumentoLabel(value: string | null | undefined) {
  const raw = (value ?? '').replace(/\s+/g, ' ').trim()
  if (!raw) return 'Sem tipo de documento'
  const folded = raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
  if (folded.includes('INVENT')) return 'Inventário'
  if (folded.includes('NOTA FISCAL') && folded.includes('ENTRADA')) {
    return 'Nota fiscal — entrada'
  }
  if (folded.includes('NOTA FISCAL') && folded.includes('SAIDA')) {
    return 'Nota fiscal — saída'
  }
  if (folded.includes('TRANSFER')) return 'Transferência de estoque'
  if (folded.includes('LANCTO') || folded.includes('LANCAMENTO')) {
    return 'Lançamento auxiliar'
  }
  return raw
}
