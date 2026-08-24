const STAR = '*'

export function fold(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

export function asText(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value)
  }
  const text = String(value).replace(/\u00a0/g, ' ').trim()
  return text ? text : null
}

export function isStarPedido(value: unknown) {
  const text = asText(value)
  return text === STAR
}

export function normalizePedido(value: unknown): string | null {
  if (isStarPedido(value)) return null
  const text = asText(value)
  if (!text) return null
  if (/^\d+\.0+$/.test(text)) return text.slice(0, text.indexOf('.'))
  return text
}

export function normalizeStatus(value: unknown): string | null {
  const text = asText(value)
  if (!text) return null
  const folded = fold(text)
  if (folded === 'CORTADO') return 'CORTADO'
  if (folded === 'EM PRODUCAO') return 'EM PRODUÇÃO'
  if (folded.includes('AGUARDANDO') && folded.includes('TECIDO')) {
    return 'AGUARDANDO TECIDO'
  }
  return text.trim()
}

export function isProducaoOrigem(value: unknown) {
  const text = asText(value)
  if (!text) return false
  return fold(text) === 'PRODUCAO'
}

export function normalizeOrigem(value: unknown): string {
  const text = asText(value) ?? ''
  const folded = fold(text)
  if (folded === 'PRODUCAO') return 'Producao'
  if (folded.includes('ETIQUETA')) return 'Troca de Etiqueta'
  if (folded.includes('FESTONE')) return 'Aplicacao de Festone'
  if (folded.includes('CONSERTO')) return 'Conserto'
  return text || 'Sem origem'
}

export function normalizeHeader(value: unknown) {
  return fold(asText(value) ?? '')
    .replace(/[º°.]/g, '')
    .replace(/[/]+/g, ' ')
    .replace(/[:_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
