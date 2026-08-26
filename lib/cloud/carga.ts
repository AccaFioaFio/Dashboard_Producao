import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { checkpointSqlite, getSqlite, resetSqlite } from '@/db'
import {
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
  if (!blobEnabled()) {
    getSqlite()
    return
  }

  try {
    const { get, head } = await import('@vercel/blob')
    const meta = await head(CLOUD_DB_BLOB)
    if (meta.etag && meta.etag === localEtag && existsSync(DB_PATH)) {
      getSqlite()
      return
    }
    const result = await get(CLOUD_DB_BLOB, {
      access: 'private',
      useCache: false,
    })
    if (!result || result.statusCode !== 200 || !result.stream) {
      getSqlite()
      return
    }
    const bytes = Buffer.from(await new Response(result.stream).arrayBuffer())
    resetSqlite()
    writeFileSync(DB_PATH, bytes)
    getSqlite()
    localEtag = meta.etag
  } catch {
    getSqlite()
  }
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
