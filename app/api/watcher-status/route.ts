import { readSession } from '@/lib/auth/cookie'
import { getWatcherStatus } from '@/lib/cloud/watcher-heartbeat'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await readSession()
  if (!session) {
    return Response.json(
      { error: 'Sem permissão.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  const status = await getWatcherStatus()
  return Response.json(status, {
    headers: {
      // Evita hammering de Simple Operations com várias abas abertas.
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
