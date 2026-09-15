import { getWatcherStatus } from '@/lib/cloud/watcher-heartbeat'

export const dynamic = 'force-dynamic'

export async function GET() {
  const status = await getWatcherStatus()
  return Response.json(status, {
    headers: {
      // Evita hammering de Simple Operations com várias abas abertas.
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
