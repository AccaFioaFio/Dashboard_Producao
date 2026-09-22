import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
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

async function downloadCargaBytes(
  client: SupabaseClient,
): Promise<{ ok: true; bytes: Buffer } | { ok: false; error: string }> {
  const { data: signed, error: signError } = await client.storage
    .from(CARGA_BUCKET)
    .createSignedUrl(CARGA_OBJECT, 180)

  if (!signError && signed?.signedUrl) {
    try {
      const response = await fetch(signed.signedUrl, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        cache: 'no-store',
      })
      if (!response.ok) {
        return {
          ok: false,
          error: `HTTP ${response.status} ao baixar URL assinada`,
        }
      }
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.length === 0) {
        return { ok: false, error: 'arquivo vazio na URL assinada' }
      }
      return { ok: true, bytes }
    } catch (error) {
      // Cai no fallback .download() abaixo.
      console.warn(
        `[carga] signedUrl falhou: ${formatFetchCause(error)}; tentando .download()`,
      )
    }
  }

  const { data, error } = await client.storage
    .from(CARGA_BUCKET)
    .download(CARGA_OBJECT)

  if (error || !data) {
    return {
      ok: false,
      error:
        error?.message ??
        signError?.message ??
        'arquivo ausente no Storage',
    }
  }

  try {
    const bytes = Buffer.from(await data.arrayBuffer())
    if (bytes.length === 0) {
      return { ok: false, error: 'arquivo vazio no Storage' }
    }
    return { ok: true, bytes }
  } catch (error) {
    return { ok: false, error: formatFetchCause(error) }
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
