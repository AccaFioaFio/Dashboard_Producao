import { atualizarDadosCore } from '@/lib/etl/atualizar-dados'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST() {
  const result = await atualizarDadosCore()
  return Response.json(result, {
    status: result.ok ? 200 : 500,
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
