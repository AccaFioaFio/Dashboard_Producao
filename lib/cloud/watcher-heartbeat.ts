export type WatcherStatus = {
  online: boolean
  lastSeen: string | null
}

/** Sem Blob: o vigia só grava SQLite local; status online não se aplica. */
export async function getWatcherStatus(): Promise<WatcherStatus> {
  return { online: false, lastSeen: null }
}
