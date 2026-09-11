import { CLOUD_WATCHER_HEARTBEAT_BLOB } from '@/lib/cloud/constants'
import { blobEnabled } from '@/lib/cloud/carga'

export const WATCHER_HEARTBEAT_INTERVAL_MS = 30_000
export const WATCHER_ONLINE_TTL_MS = 90_000

export type WatcherHeartbeat = {
  at: string
}

export type WatcherStatus = {
  online: boolean
  lastSeen: string | null
}

export function isWatcherOnline(at: string | null | undefined, now = Date.now()) {
  if (!at) return false
  const then = new Date(at).getTime()
  if (Number.isNaN(then)) return false
  return now - then < WATCHER_ONLINE_TTL_MS
}

export async function writeWatcherHeartbeat(): Promise<boolean> {
  if (!blobEnabled()) return false
  const payload: WatcherHeartbeat = { at: new Date().toISOString() }
  const { put } = await import('@vercel/blob')
  await put(CLOUD_WATCHER_HEARTBEAT_BLOB, JSON.stringify(payload), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  })
  return true
}

export async function readWatcherHeartbeat(): Promise<WatcherHeartbeat | null> {
  if (!blobEnabled()) return null
  try {
    const { get } = await import('@vercel/blob')
    const result = await get(CLOUD_WATCHER_HEARTBEAT_BLOB, {
      access: 'private',
      useCache: false,
    })
    if (!result || result.statusCode !== 200 || !result.stream) return null
    const text = await new Response(result.stream).text()
    const parsed = JSON.parse(text) as Partial<WatcherHeartbeat>
    if (typeof parsed.at !== 'string' || !parsed.at) return null
    return { at: parsed.at }
  } catch {
    return null
  }
}

export async function getWatcherStatus(): Promise<WatcherStatus> {
  const heartbeat = await readWatcherHeartbeat()
  const lastSeen = heartbeat?.at ?? null
  return {
    online: isWatcherOnline(lastSeen),
    lastSeen,
  }
}
