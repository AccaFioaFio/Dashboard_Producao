import { loadLocalEnv } from '../lib/load-env'

loadLocalEnv()

async function main() {
  const { isSupabaseConfigured, isSupabaseWriteConfigured, createAdminClient, createAnonClient } =
    await import('../lib/supabase/admin')
  const { CARGA_BUCKET } = await import('../lib/supabase/constants')
  const { ETAPAS_APONTAMENTO } = await import('../lib/apontamento')

  const report = {
    configured: isSupabaseConfigured(),
    write: isSupabaseWriteConfigured(),
    costura: '' as string,
    revisao: '' as string,
  }

  const client = createAdminClient() ?? createAnonClient()
  if (!client) {
    console.log(JSON.stringify({ ...report, client: false }, null, 2))
    process.exit(1)
  }

  for (const etapa of ['costura', 'revisao'] as const) {
    const prefix = ETAPAS_APONTAMENTO[etapa].nuvem
    const { data, error } = await client.storage.from(CARGA_BUCKET).list(prefix, { limit: 20 })
    report[etapa] = error
      ? `ERR: ${error.message}`
      : `OK pastas=${data?.filter((d) => d.name && !d.name.endsWith('.json')).length ?? 0}`
  }

  console.log(JSON.stringify({ ...report, client: true }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
