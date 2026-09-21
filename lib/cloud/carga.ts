import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { checkpointSqlite, getSqlite, resetSqlite } from '@/db'
import {
  BUNDLED_DB_PATH,
  CLOUD_DB_BLOB,
  DB_PATH,
  IS_CLOUD,
  ensureDataDirs,
} from '@/lib/paths'

let localEtag = ''
let inFlight: Promise<void> | null = null

export function blobEnabled() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN?.trim() ||
      (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID),
  )
}

export function markCloudDbReady(etag?: string) {
  if (etag) localEtag = etag
}

export async function ensureCloudDatabase() {
  if (!IS_CLOUD) return
  if (!inFlight) {
    inFlight = restoreCloudDatabase().finally(() => {
      inFlight = null
    })
  }
  await inFlight
}

async function restoreCloudDatabase() {
  ensureDataDirs()
  if (existsSync(BUNDLED_DB_PATH) && BUNDLED_DB_PATH !== DB_PATH) {
    try {
      resetSqlite()
      copyFileSync(BUNDLED_DB_PATH, DB_PATH)
    } catch {
      // Mantém o SQLite já em /tmp, se houver.
    }
  }
  getSqlite()
}

export async function persistCloudDb() {
  if (!blobEnabled()) return false
  ensureDataDirs()
  checkpointSqlite()
  if (!existsSync(DB_PATH)) return false
  const { put } = await import('@vercel/blob')
  const bytes = readFileSync(DB_PATH)
  const stored = await put(CLOUD_DB_BLOB, bytes, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/vnd.sqlite3',
    multipart: bytes.length > 4_500_000,
  })
  markCloudDbReady(stored.etag)
  return true
}
