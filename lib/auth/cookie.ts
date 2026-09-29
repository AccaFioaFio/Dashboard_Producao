import 'server-only'
import { cookies } from 'next/headers'
import {
  openSession,
  sealSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '@/lib/auth/token'
import type { SessionUser } from '@/lib/auth/types'

export async function readSession() {
  const jar = await cookies()
  return openSession(jar.get(SESSION_COOKIE)?.value)
}

export async function writeSession(user: SessionUser) {
  const token = await sealSession(user)
  if (!token) {
    throw new Error('SESSION_SECRET ausente.')
  }
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, sessionCookieOptions())
}

export async function clearSession() {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
}
