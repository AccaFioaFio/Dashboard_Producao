import { getWatcherStatus } from '@/lib/cloud/watcher-heartbeat'

export const dynamic = 'force-dynamic'

export async function GET() {
  const status = await getWatcherStatus()
  return Response.json(status)
}
