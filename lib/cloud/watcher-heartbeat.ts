import { CLOUD_DB_BLOB } from '@/lib/cloud/constants'
import { blobEnabled } from '@/lib/cloud/carga'

/**
 * Sem put de heartbeat: no Hobby cada put = Advanced Operation.
 * Status = último upload do SQLite (head = Simple Operation, barato).
 * "Recente" = publicação nas últimas 24 h (proxy do observador ligado).
 */
export const WATCHER_ONLINE_TTL_MS = 24 * 60 * 60_000

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

export async function getWatcherStatus(): Promise<WatcherStatus> {
  if (!blobEnabled()) {
    return { online: false, lastSeen: null }
  }
  try {
    const { head } = await import('@vercel/blob')
    const meta = await head(CLOUD_DB_BLOB)
    const lastSeen = meta.uploadedAt.toISOString()
    return {
      online: isWatcherOnline(lastSeen),
      lastSeen,
    }
  } catch {
    return { online: false, lastSeen: null }
  }
}
