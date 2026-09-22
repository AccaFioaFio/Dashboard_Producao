import dns from 'node:dns'
import { createClient } from '@supabase/supabase-js'

try {
  dns.setDefaultResultOrder('ipv4first')
} catch {
  // ignore
}

export function isSupabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? ''
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? ''
  return Boolean(url && anon && !url.includes('placeholder'))
}

export function isSupabaseWriteConfigured() {
  return (
    isSupabaseConfigured() &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
  )
}

/** List/sign são leves; o download grande usa fetch nativo em lib/cloud/carga.ts. */
const FETCH_TIMEOUT_MS = 60_000

function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const parent = init?.signal
  if (parent) {
    if (parent.aborted) controller.abort()
    else parent.addEventListener('abort', () => controller.abort(), { once: true })
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer)
  })
}

/** Client com service role — só no servidor / PC publicador. */
export function createAdminClient() {
  if (!isSupabaseWriteConfigured()) return null
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: fetchWithTimeout },
    },
  )
}

/** Client anon — leitura no site. */
export function createAnonClient() {
  if (!isSupabaseConfigured()) return null
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: fetchWithTimeout },
    },
  )
}
