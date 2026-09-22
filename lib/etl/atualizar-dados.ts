import { existsSync, statSync } from 'node:fs'
import { refreshFromSupabaseCarga } from '@/lib/cloud/carga'
import { getSqlite } from '@/db'
import { publishSqliteToSupabase } from '@/lib/etl/publish-supabase'
import { refreshFromExcel } from '@/lib/etl/refresh'
import { IS_CLOUD, projectFilePaths } from '@/lib/paths'
import {
  isSupabaseConfigured,
  isSupabaseWriteConfigured,
} from '@/lib/supabase/admin'

export type AtualizarDadosResult =
  | { ok: true; lidaEm: string; skipped?: boolean; changed?: string[] | 'all' }
  | { ok: false; error: string }

const PUBLISH_TIMEOUT_MS = 45_000
const PULL_TIMEOUT_MS = 30_000

let inFlight: Promise<AtualizarDadosResult> | null = null

export async function atualizarDadosCore(): Promise<AtualizarDadosResult> {
  if (!inFlight) {
    inFlight = runAtualizarDados().finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

function excelFolderReady() {
  const paths = projectFilePaths()
  return (
    existsSync(paths.corte) &&
    existsSync(paths.oficinas) &&
    existsSync(paths.signus) &&
    existsSync(paths.estoque)
  )
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} passou de ${Math.round(ms / 1000)}s.`))
        }, ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function pullFromSupabase(
  mark: (step: string) => void,
): Promise<AtualizarDadosResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error: IS_CLOUD
        ? 'No site online: configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY na Vercel.'
        : 'Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    }
  }
  mark('pull supabase start')
  const pulled = await withTimeout(
    refreshFromSupabaseCarga(),
    PULL_TIMEOUT_MS,
    'Download da carga no Supabase',
  )
  mark(`pull done ok=${pulled.ok}`)
  return pulled
}

/**
 * Igual Orçamentos: se a pasta de Excel existe, o botão processa (incremental)
 * e publica. Sem pasta (leitor puro na nuvem), só puxa a carga.
 */
async function runAtualizarDados(): Promise<AtualizarDadosResult> {
  const t0 = Date.now()
  const mark = (step: string) => {
    console.info(`[atualizar] +${Date.now() - t0}ms ${step}`)
  }

  try {
    // Na Vercel as planilhas podem existir no deploy, mas o site só lê a carga
    // publicada. ETL + upload (~16 MB) no serverless quebra com "fetch failed".
    if (!IS_CLOUD && excelFolderReady()) {
      if (!isSupabaseWriteConfigured()) {
        return {
          ok: false,
          error:
            'Planilhas ok, mas falta SUPABASE_SERVICE_ROLE_KEY (e URL/anon) no .env.local para publicar.',
        }
      }

      mark('etl incremental start')
      const result = await refreshFromExcel(projectFilePaths())
      mark(
        `etl done ok=${result.ok} skipped=${Boolean(result.ok && result.skipped)} changed=${result.ok ? JSON.stringify(result.changed) : '-'}`,
      )
      if (!result.ok) return result

      if (result.skipped) {
        mark('skip publish (nada mudou)')
        return {
          ok: true,
          lidaEm: result.lidaEm,
          skipped: true,
          changed: [],
        }
      }

      mark('publish start')
      const published = await withTimeout(
        publishSqliteToSupabase(),
        PUBLISH_TIMEOUT_MS,
        'Publicação no Supabase',
      )
      mark(`publish done ok=${published.ok}`)
      if (!published.ok) return published
      return {
        ok: true,
        lidaEm: published.lidaEm,
        changed: result.changed,
      }
    }

    if (isSupabaseConfigured()) {
      return await pullFromSupabase(mark)
    }

    return {
      ok: false,
      error: IS_CLOUD
        ? 'No site online a carga vem do Supabase. Publique neste PC (pasta Arquivos do Excel + botão Atualização) e depois atualize no site.'
        : 'Pasta Arquivos do Excel incompleta. Coloque as planilhas na pasta do projeto e tente de novo.',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    mark(`erro ${message}`)
    return {
      ok: false,
      error: `Atualização falhou; a carga anterior foi mantida. ${message}`,
    }
  }
}

/** Só para diagnóstico local. */
export function debugExcelMtimes() {
  const paths = projectFilePaths()
  const out: Record<string, string | null> = {}
  for (const [key, filePath] of Object.entries(paths)) {
    out[key] = existsSync(filePath)
      ? statSync(filePath).mtime.toISOString()
      : null
  }
  return out
}

export function debugLatestCarga() {
  try {
    return getSqlite()
      .prepare(
        `SELECT id, lida_em as lidaEm, corte_last_write as corte, oficinas_last_write as oficinas
         FROM carga WHERE ok = 1 ORDER BY id DESC LIMIT 1`,
      )
      .get()
  } catch {
    return null
  }
}
