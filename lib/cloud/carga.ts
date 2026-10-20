import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import dns from 'node:dns'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cache } from 'react'
import { getSqlite, resetSqlite } from '@/db'
import {
  captureApontamentoOperacao,
  mergeApontamentoOperacao,
} from '@/lib/apontamento-operacao-local'
import {
  apontamentoNuvemSyncOk,
  ensureApontamentosNuvemNoSqlite,
  publicarApontamentosLocaisNaNuvem,
} from '@/lib/apontamento-sync'
import { captureCorteOperacao, mergeCorteOperacao } from '@/lib/corte-operacao-local'
import {
  captureProgramacaoHistorico,
  mergeProgramacaoHistorico,
} from '@/lib/programacao-historico-local'
import { ensureProgramacaoHistoricoNuvemNoSqlite } from '@/lib/programacao-historico-sync'
import {
  captureProgramacaoOperacao,
  mergeProgramacaoOperacao,
} from '@/lib/programacao-operacao-local'
import { ensureProgramacaoNuvemNoSqlite } from '@/lib/programacao-sync'
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
import {
  clearDataHealthWarning,
  setDataHealthWarning,
} from '@/lib/cloud/data-health'

// Undici na Vercel às vezes falha em IPv6 para *.supabase.co ("fetch failed").
try {
  dns.setDefaultResultOrder('ipv4first')
} catch {
  // Node antigo sem a API — ignora.
}

let localEtag = ''
let restoreInFlight: Promise<void> | null = null
/** Dedupa o corpo inteiro de ensure entre callers concorrentes (mesmo processo). */
const ensureInFlight = new Map<string, Promise<void>>()
/** Na Vercel, a 1ª request da instância publica todos os lançamentos do /tmp de uma vez. */
let cloudApontamentoRecoveryDone = false
/** No desktop, a 1ª abertura do processo força puxar tudo da nuvem (após o mobile publicar). */
let desktopApontamentoPullDone = false

/** Download grande (~17 MB): URL assinada + fetch nativo (mais estável na Vercel). */
const DOWNLOAD_TIMEOUT_MS = 120_000

/** ETag da carga já restaurada neste processo (vazio se ainda não baixou). */
export function getLocalCargaEtag() {
  return localEtag
}

/**
 * Na Vercel (e quando Supabase está configurado): baixa o SQLite publicado
 * no Storage. Sem Supabase: usa o SQLite do deploy.
 * Em seguida sincroniza lançamentos da tela (costura/revisão) da nuvem
 * para o SQLite — os KPIs somam planilha + esses lançamentos.
 *
 * No mobile (Vercel): antes de trocar o SQLite, publica TODOS os lançamentos
 * locais (todos os pedidos) no Storage — não precisa pesquisar pedido a pedido.
 *
 * `light: true` — usado em gravações: garante a carga local, mas pula o sync
 * global de apontamento/programação quando a instância já aqueci. O produto
 * gravado continua sincronizando na action (mesclar na nuvem).
 *
 * Deduplicado 1× por request (React `cache`) e entre awaits concorrentes no processo.
 */
export async function ensureCloudDatabase(options?: {
  force?: boolean
  light?: boolean
}) {
  const force = Boolean(options?.force)
  const light = Boolean(options?.light) && !force
  return ensureCloudDatabaseCached(force, light)
}

const ensureCloudDatabaseCached = cache(async (force: boolean, light: boolean) => {
  const key = `${force ? 'f' : 'n'}:${light ? 'l' : 'f'}`
  let pending = ensureInFlight.get(key)
  if (!pending) {
    pending = runEnsureCloudDatabase(force, light).finally(() => {
      ensureInFlight.delete(key)
    })
    ensureInFlight.set(key, pending)
  }
  await pending
})

async function runEnsureCloudDatabase(force: boolean, light: boolean) {
  const recuperarApontamentoCloud = IS_CLOUD && !cloudApontamentoRecoveryDone
  const recuperarDesktop = !IS_CLOUD && !desktopApontamentoPullDone

  // Salva o que ainda está no /tmp da instância ANTES do download da carga.
  if (recuperarApontamentoCloud && existsSync(DB_PATH)) {
    try {
      ensureDataDirs()
      getSqlite()
      await publicarApontamentosLocaisNaNuvem({ force: true })
    } catch (error) {
      console.error('publicação pré-restore dos lançamentos falhou', error)
    }
  }

  if (IS_CLOUD || force) {
    if (!restoreInFlight) {
      restoreInFlight = restoreDatabase(force).finally(() => {
        restoreInFlight = null
      })
    }
    await restoreInFlight
  }

  // Gravação com DB já quente: não repuxa todos os pedidos / programação.
  if (light && !recuperarApontamentoCloud && !recuperarDesktop) {
    ensureDataDirs()
    getSqlite()
    return
  }

  const forceApontamento = force || recuperarApontamentoCloud || recuperarDesktop
  // Push ANTES do pull: evita limpar órfãos locais que ainda não chegaram à nuvem.
  const push = await publicarApontamentosLocaisNaNuvem({ force: forceApontamento })
  await ensureApontamentosNuvemNoSqlite({
    force: forceApontamento,
    limparOrfaos: push.falhas === 0,
  })
  // Só marca “já recuperou” se o pull global concluiu — senão a próxima abertura força de novo.
  if (recuperarApontamentoCloud && apontamentoNuvemSyncOk()) {
    cloudApontamentoRecoveryDone = true
  }
  if (recuperarDesktop && apontamentoNuvemSyncOk()) {
    desktopApontamentoPullDone = true
  }

  await ensureProgramacaoNuvemNoSqlite({ force })
  await ensureProgramacaoHistoricoNuvemNoSqlite({ force })
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
      setDataHealthWarning(
        'Não foi possível consultar a carga na nuvem. Os números podem estar desatualizados.',
      )
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
      clearDataHealthWarning()
      getSqlite()
      return
    }

    const downloaded = await downloadCargaBytes(client)
    if (!downloaded.ok) {
      setDataHealthWarning(
        'Não foi possível baixar a carga da nuvem. Os números podem estar desatualizados.',
      )
      getSqlite()
      return
    }

    const backup = captureCorteOperacao()
    const backupApontamento = captureApontamentoOperacao()
    const backupProgramacao = captureProgramacaoOperacao()
    const backupHistorico = captureProgramacaoHistorico()
    resetSqlite()
    writeFileSync(DB_PATH, downloaded.bytes)
    getSqlite()
    mergeCorteOperacao(backup)
    mergeApontamentoOperacao(backupApontamento)
    mergeProgramacaoOperacao(backupProgramacao)
    mergeProgramacaoHistorico(backupHistorico)
    localEtag = etag || String(downloaded.bytes.length)
    clearDataHealthWarning()
  } catch {
    setDataHealthWarning(
      'Falha ao restaurar a carga da nuvem. Os números podem estar desatualizados.',
    )
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
    const backup = captureCorteOperacao()
    const backupApontamento = captureApontamentoOperacao()
    const backupProgramacao = captureProgramacaoOperacao()
    const backupHistorico = captureProgramacaoHistorico()
    resetSqlite()
    writeFileSync(DB_PATH, downloaded.bytes)
    localEtag = String(downloaded.bytes.length)
    getSqlite()
    mergeCorteOperacao(backup)
    mergeApontamentoOperacao(backupApontamento)
    mergeProgramacaoOperacao(backupProgramacao)
    mergeProgramacaoHistorico(backupHistorico)
    const pushAposRestore = await publicarApontamentosLocaisNaNuvem({ force: true })
    await ensureApontamentosNuvemNoSqlite({
      force: true,
      limparOrfaos: pushAposRestore.falhas === 0,
    })
    await ensureProgramacaoNuvemNoSqlite({ force: true })
    await ensureProgramacaoHistoricoNuvemNoSqlite({ force: true })
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
