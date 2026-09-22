import { atualizarDadosCore } from '@/lib/etl/atualizar-dados'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/**
 * Precisa ser literal (Next rejeita ternário/import em segment config).
 * Na Vercel o botão só puxa a carga; localmente o limite não corta o ETL.
 */
export const maxDuration = 60

export async function POST() {
  const result = await atualizarDadosCore()
  return Response.json(result, {
    status: result.ok ? 200 : 500,
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
