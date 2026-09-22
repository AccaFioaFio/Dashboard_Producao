import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import dns from 'node:dns'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSqlite, resetSqlite } from '@/db'
import {
  createAdminClient,
  createAnonClient,
  isSupabaseConfigured,
} from '@/lib/supabase/admin'
import { CARGA_BUCKET, CARGA_OBJECT } from '@/lib/supabase/constants'
import {
  BUNDLED_DB_PATH,
  DB_PATH,
  IS_CLOUD,
  ensureDataDirs,
} from '@/lib/paths'

// Undici na Vercel às vezes falha em IPv6 para *.supabase.co ("fetch failed").
try {
  dns.setDefaultResultOrder('ipv4first')
} catch {
  // Node antigo sem a API — ignora.
}

let localEtag = ''
let inFlight: Promise<void> | null = null

/** Download grande (~17 MB): URL assinada + fetch nativo (mais estável na Vercel). */
const DOWNLOAD_TIMEOUT_MS = 120_000

/**
 * Na Vercel (e quando Supabase está configurado): baixa o SQLite publicado
 * no Storage. Sem Supabase: usa o SQLite do deploy.
 */
export async function ensureCloudDatabase(options?: { force?: boolean }) {
  if (!IS_CLOUD && !options?.force) return
  if (!inFlight) {
    inFlight = restoreDatabase(Boolean(options?.force)).finally(() => {
      inFlight = null
    })
  }
  await inFlight
}

async function restoreDatabase(force: boolean) {
  ensureDataDirs()
  seedBundledDb()

  if (!isSupabaseConfigured()) {
    getSqlite()
    return
  }

  try {
    const client = createAdminClient() ?? createAnonClient()
    if (!client) {
      getSqlite()
      return
    }

    const { data: meta, error: listError } = await client.storage
      .from(CARGA_BUCKET)
      .list('', { search: CARGA_OBJECT, limit: 10 })

    if (listError) {
      getSqlite()
      return
    }

    const object = meta?.find((item) => item.name === CARGA_OBJECT)
    const etag =
      (object as { metadata?: { eTag?: string; etag?: string } } | undefined)
        ?.metadata?.eTag ||
      (object as { metadata?: { etag?: string } } | undefined)?.metadata?.etag ||
      object?.updated_at ||
      object?.id ||
      ''

    if (!force && etag && etag === localEtag && existsSync(DB_PATH)) {
      getSqlite()
      return
    }

    const downloaded = await downloadCargaBytes(client)
    if (!downloaded.ok) {
      getSqlite()
      return
    }

    resetSqlite()
    writeFileSync(DB_PATH, downloaded.bytes)
    getSqlite()
    localEtag = etag || String(downloaded.bytes.length)
  } catch {
    getSqlite()
  }
}

function seedBundledDb() {
  if (!existsSync(DB_PATH) && existsSync(BUNDLED_DB_PATH) && BUNDLED_DB_PATH !== DB_PATH) {
    try {
      copyFileSync(BUNDLED_DB_PATH, DB_PATH)
    } catch {
      // Mantém o que já existir.
    }
  }
}

function formatFetchCause(error: unknown) {
  if (!(error instanceof Error)) return String(error)
  const cause =
    'cause' in error && error.cause != null ? ` (${String(error.cause)})` : ''
  return `${error.message}${cause}`
}

function supabaseUrlHost() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').host || 'sem-host'
  } catch {
    return 'url-invalida'
  }
}

/**
 * Assina e baixa sem depender do fetch custom do supabase-js (mais confiável na Vercel).
 */
async function downloadCargaBytes(
  _client: SupabaseClient,
): Promise<{ ok: true; bytes: Buffer } | { ok: false; error: string }> {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    ''

  if (!base || !key) {
    return {
      ok: false,
      error: `faltam URL/key (host=${supabaseUrlHost()})`,
    }
  }

  const headers = {
    Authorization: `Bearer ${key}`,
    apikey: key,
  }

  let signedUrl = ''
  try {
    const signRes = await fetch(
      `${base}/storage/v1/object/sign/${CARGA_BUCKET}/${CARGA_OBJECT}`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: 180 }),
        signal: AbortSignal.timeout(30_000),
        cache: 'no-store',
      },
    )
    if (!signRes.ok) {
      const body = await signRes.text().catch(() => '')
      return {
        ok: false,
        error: `assinatura HTTP ${signRes.status} host=${supabaseUrlHost()} ${body.slice(0, 120)}`,
      }
    }
    const payload = (await signRes.json()) as {
      signedURL?: string
      signedUrl?: string
    }
    const path = payload.signedURL || payload.signedUrl
    if (!path) {
      return { ok: false, error: `assinatura sem URL (host=${supabaseUrlHost()})` }
    }
    signedUrl = path.startsWith('http') ? path : `${base}/storage/v1${path}`
  } catch (error) {
    return {
      ok: false,
      error: `assinatura: ${formatFetchCause(error)} host=${supabaseUrlHost()}`,
    }
  }

  try {
    const response = await fetch(signedUrl, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      cache: 'no-store',
      headers: { apikey: key },
    })
    if (!response.ok) {
      return {
        ok: false,
        error: `download HTTP ${response.status} host=${supabaseUrlHost()}`,
      }
    }
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length === 0) {
      return { ok: false, error: 'arquivo vazio na URL assinada' }
    }
    return { ok: true, bytes }
  } catch (error) {
    return {
      ok: false,
      error: `download: ${formatFetchCause(error)} host=${supabaseUrlHost()}`,
    }
  }
}

export async function refreshFromSupabaseCarga(): Promise<
  { ok: true; lidaEm: string } | { ok: false; error: string }
> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error:
        'Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    }
  }

  ensureDataDirs()
  const client = createAdminClient() ?? createAnonClient()
  if (!client) {
    return {
      ok: false,
      error: 'Não foi possível criar o client Supabase para baixar a carga.',
    }
  }

  const downloaded = await downloadCargaBytes(client)
  if (!downloaded.ok) {
    return {
      ok: false,
      error: `Falha ao baixar a carga do Storage (${CARGA_BUCKET}/${CARGA_OBJECT}): ${downloaded.error}. Confirme publicação neste PC (vigia) e as vars NEXT_PUBLIC_SUPABASE_* na Vercel.`,
    }
  }

  try {
    resetSqlite()
    writeFileSync(DB_PATH, downloaded.bytes)
    localEtag = String(downloaded.bytes.length)
    getSqlite()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `Baixou o Storage, mas falhou gravar o SQLite. ${message}` }
  }

  try {
    const row = getSqlite()
      .prepare(
        `SELECT lida_em as lidaEm FROM carga WHERE ok = 1 ORDER BY id DESC LIMIT 1`,
      )
      .get() as { lidaEm: string } | undefined
    if (!row?.lidaEm) {
      return {
        ok: false,
        error:
          'Baixou o Storage, mas não há carga ok. Publique neste PC com o vigia.',
      }
    }
    return { ok: true, lidaEm: row.lidaEm }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `Falha ao ler a carga baixada. ${message}` }
  }
}
