import { YEAR } from '@/lib/year'

export function toIsoDate(value: unknown): string | null {
  if (value == null || value === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const utcMidnight =
      value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0
    const y = utcMidnight ? value.getUTCFullYear() : value.getFullYear()
    const m = (utcMidnight ? value.getUTCMonth() : value.getMonth()) + 1
    const d = utcMidnight ? value.getUTCDate() : value.getDate()
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 20000) {
    const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000)
    return toIsoDate(utc)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
    const br = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (br) {
      return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
    }
  }
  return null
}

export function yearOf(iso: string | null) {
  if (!iso) return null
  return Number(iso.slice(0, 4))
}

export function isYear(iso: string | null, year = YEAR) {
  return yearOf(iso) === year
}

export function isPlausibleBusinessDate(iso: string | null, year = YEAR) {
  const y = yearOf(iso)
  if (y == null) return false
  return y >= year - 2 && y <= year + 1
}

export function monthOf(iso: string | null) {
  if (!iso) return null
  return Number(iso.slice(5, 7))
}

export function leadTimeDays(inicio: string | null, fim: string | null) {
  if (!inicio || !fim) return null
  const start = Date.parse(`${inicio}T00:00:00Z`)
  const end = Date.parse(`${fim}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  return (end - start) / 86400000
}

export function quantile(sorted: number[], q: number) {
  if (!sorted.length) return null
  const clamped = Math.min(1, Math.max(0, q))
  const pos = (sorted.length - 1) * clamped
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] * (hi - pos) + sorted[hi] * (pos - lo)
}

export function isSerialDiasDeCorte(value: number | null, inicio: string | null) {
  if (value == null || !Number.isFinite(value)) return false
  if (!inicio && value > 100) return true
  return value > 365
}
