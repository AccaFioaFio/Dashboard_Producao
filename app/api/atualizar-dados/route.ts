import { atualizarDadosCore } from '@/lib/etl/atualizar-dados'
import { IS_CLOUD } from '@/lib/paths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** Local: ETL longo. Vercel: só download da carga (plano Hobby limita ~10s). */
export const maxDuration = IS_CLOUD ? 60 : 300

export async function POST() {
  const result = await atualizarDadosCore()
  return Response.json(result, {
    status: result.ok ? 200 : 500,
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
