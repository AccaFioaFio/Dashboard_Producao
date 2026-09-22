import { createClient } from '@supabase/supabase-js'

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

/** Client com service role — só no servidor / PC publicador. */
export function createAdminClient() {
  if (!isSupabaseWriteConfigured()) return null
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
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
    },
  )
}
