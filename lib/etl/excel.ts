export function unwrapCell(value: unknown): unknown {
  if (value == null) return null
  if (value instanceof Date) return value
  if (typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  if ('result' in record) return unwrapCell(record.result)
  if ('richText' in record && Array.isArray(record.richText)) {
    return record.richText
      .map((part) =>
        typeof part === 'object' && part && 'text' in part
          ? String((part as { text: unknown }).text)
          : '',
      )
      .join('')
  }
  if ('text' in record && typeof record.text === 'string') return record.text
  if ('error' in record) return null
  return value
}

export function asNumber(value: unknown): number | null {
  const unwrapped = unwrapCell(value)
  if (unwrapped == null || unwrapped === '') return null
  if (typeof unwrapped === 'boolean') return null
  if (typeof unwrapped === 'number') {
    return Number.isFinite(unwrapped) ? unwrapped : null
  }
  if (unwrapped instanceof Date) return null
  const text = String(unwrapped).trim().replace(',', '.')
  if (!text || !/^-?(0|[1-9]\d*)(\.\d+)?$/.test(text)) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

export function sheetNameFold(name: string) {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

export function headerIndex(headers: Map<string, number>, aliases: string[]) {
  for (const alias of aliases) {
    const index = headers.get(normalizeHeaderName(alias))
    if (index != null) return index
  }
  for (const [key, index] of headers) {
    if (aliases.some((alias) => key.includes(normalizeHeaderName(alias)))) {
      return index
    }
  }
  return null
}

function normalizeHeaderName(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[º°.]/g, '')
    .replace(/[/]+/g, ' ')
    .replace(/[:_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}
