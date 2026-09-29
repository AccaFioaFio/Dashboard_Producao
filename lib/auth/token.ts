import type { SessionUser } from '@/lib/auth/types'

export const SESSION_COOKIE = 'dash_session'
export const SESSION_TTL_SEC = 60 * 60 * 24 * 7

type TokenPayload = SessionUser & { exp: number }

const encoder = new TextEncoder()

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_SEC,
  }
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function base64UrlToBytes(value: string) {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4))
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + pad)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

async function sign(data: string) {
  const secret = process.env.SESSION_SECRET
  if (!secret) return null
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return new Uint8Array(signature)
}

export async function sealSession(user: SessionUser) {
  const payload: TokenPayload = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
  }
  const body = bytesToBase64Url(encoder.encode(JSON.stringify(payload)))
  const signature = await sign(body)
  if (!signature) return null
  return `${body}.${bytesToBase64Url(signature)}`
}

export async function openSession(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  const expected = await sign(body)
  if (!expected) return null
  let given: Uint8Array
  try {
    given = base64UrlToBytes(signature)
  } catch {
    return null
  }
  if (!timingSafeEqual(expected, given)) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body))) as TokenPayload
    if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) {
      return null
    }
    if (typeof payload.login !== 'string' || !Array.isArray(payload.acessos)) return null
    return { id: payload.id, login: payload.login, acessos: payload.acessos }
  } catch {
    return null
  }
}
