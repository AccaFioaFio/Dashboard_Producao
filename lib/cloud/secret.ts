import { timingSafeEqual } from 'node:crypto'

export function updateSecretConfigured() {
  return Boolean(process.env.DASHBOARD_UPDATE_SECRET?.trim())
}

export function updateSecretOk(input: string | null | undefined) {
  const expected = process.env.DASHBOARD_UPDATE_SECRET?.trim()
  if (!expected) return true
  const given = input ?? ''
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
