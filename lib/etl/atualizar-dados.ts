import { existsSync, statSync } from 'node:fs'
import { publishSqliteToSupabase } from '@/lib/etl/publish-supabase'
import { refreshFromExcel } from '@/lib/etl/refresh'
import { refreshFromSupabaseCarga } from '@/lib/cloud/carga'
import { getSqlite } from '@/db'
import { IS_CLOUD, projectFilePaths } from '@/lib/paths'
import { isSupabaseConfigured, isSupabaseWriteConfigured } from '@/lib/supabase/admin'
import type { SourceMtimes } from '@/lib/etl/publish'
import { lastOkCargaMtimes, sameMtimes } from '@/lib/etl/publish'

export type AtualizarDadosResult =
  | { ok: true; lidaEm: string; skipped?: boolean }
  | { ok: false; error: string }

const PUBLISH_TIMEOUT_MS = 45_000

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

function projectMtimes(): SourceMtimes {
  const paths = projectFilePaths()
  return {
    corte: statSync(paths.corte).mtime.toISOString(),
    oficinas: statSync(paths.oficinas).mtime.toISOString(),
    signus: statSync(paths.signus).mtime.toISOString(),
    estoque: statSync(paths.estoque).mtime.toISOString(),
    pedidos: existsSync(paths.pedidos)
      ? statSync(paths.pedidos).mtime.toISOString()
      : null,
    itens: existsSync(paths.itens)
      ? statSync(paths.itens).mtime.toISOString()
      : null,
  }
}

function latestLidaEm(): string | null {
  try {
    const row = getSqlite()
      .prepare(
        `SELECT lida_em as lidaEm FROM carga WHERE ok = 1 ORDER BY id DESC LIMIT 1`,
      )
      .get() as { lidaEm: string } | undefined
    return row?.lidaEm ?? null
  } catch {
    return null
  }
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

async function runAtualizarDados(): Promise<AtualizarDadosResult> {
  const t0 = Date.now()
  const mark = (step: string) => {
    console.info(`[atualizar] +${Date.now() - t0}ms ${step}`)
  }

  try {
    if (excelFolderReady()) {
      if (!isSupabaseWriteConfigured()) {
        return {
          ok: false,
          error:
            'Planilhas ok, mas falta SUPABASE_SERVICE_ROLE_KEY (e URL/anon) no .env.local para publicar na nuvem.',
        }
      }

      // Evita reprocessar ~40s quando o Excel do projeto não mudou.
      try {
        const current = projectMtimes()
        const previous = lastOkCargaMtimes()
        if (previous && sameMtimes(current, previous)) {
          const lidaEm = latestLidaEm()
          if (lidaEm) {
            mark('skip etl (mtimes iguais)')
            return { ok: true, lidaEm, skipped: true }
          }
        }
      } catch (error) {
        mark(
          `mtime check falhou; segue etl (${error instanceof Error ? error.message : error})`,
        )
      }

      mark('etl start')
      const result = await refreshFromExcel(projectFilePaths())
      mark(`etl done ok=${result.ok}`)
      if (!result.ok) return result

      mark('publish start')
      const published = await withTimeout(
        publishSqliteToSupabase(),
        PUBLISH_TIMEOUT_MS,
        'Publicação no Supabase',
      )
      mark(`publish done ok=${published.ok}`)
      if (!published.ok) return published
      return { ok: true, lidaEm: published.lidaEm }
    }

    if (isSupabaseConfigured()) {
      mark('pull supabase start')
      const pulled = await withTimeout(
        refreshFromSupabaseCarga(),
        PUBLISH_TIMEOUT_MS,
        'Download da carga no Supabase',
      )
      mark(`pull done ok=${pulled.ok}`)
      return pulled
    }

    if (IS_CLOUD) {
      return {
        ok: false,
        error:
          'No site online: configure Supabase, ou atualize neste PC (sinc + botão) para publicar a carga.',
      }
    }

    return {
      ok: false,
      error:
        'Pasta Arquivos do Excel incompleta. Deixe a sinc ligada (pnpm carga:sync:watch) e tente de novo.',
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
