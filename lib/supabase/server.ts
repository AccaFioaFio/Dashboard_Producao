import { createAnonClient, isSupabaseConfigured } from '@/lib/supabase/admin'

export { isSupabaseConfigured }

/** Alias de leitura para Server Components / actions. */
export function createClient() {
  return createAnonClient()
}
