'use server'

import { existsSync } from 'node:fs'
import { revalidatePath } from 'next/cache'
import { refreshFromSupabaseCarga } from '@/lib/cloud/carga'
import { publishSqliteToSupabase } from '@/lib/etl/publish-supabase'
import { refreshFromExcel } from '@/lib/etl/refresh'
import { IS_CLOUD, projectFilePaths } from '@/lib/paths'
import { isSupabaseConfigured, isSupabaseWriteConfigured } from '@/lib/supabase/admin'

export type AtualizarDadosResult =
  | { ok: true; lidaEm: string }
  | { ok: false; error: string }

let inFlight: Promise<AtualizarDadosResult> | null = null

export async function atualizarDados(): Promise<AtualizarDadosResult> {
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

async function runAtualizarDados(): Promise<AtualizarDadosResult> {
  try {
    // Igual Orçamentos: se a pasta de bases existe neste processo, lê Excel e publica.
    if (excelFolderReady()) {
      if (!isSupabaseWriteConfigured()) {
        return {
          ok: false,
          error:
            'Planilhas ok, mas falta SUPABASE_SERVICE_ROLE_KEY (e URL/anon) no .env.local para publicar na nuvem.',
        }
      }
      const result = await refreshFromExcel(projectFilePaths())
      if (!result.ok) return result
      const published = await publishSqliteToSupabase()
      if (!published.ok) return published
      // Só marca o cache; o botão faz reload duro. Evita refresh() do Next,
      // que com useTransition deixava o spinner preso após o POST terminar.
      revalidatePath('/', 'layout')
      return { ok: true, lidaEm: published.lidaEm }
    }

    // Sem Excel no disco (ex.: vercel.app): só puxa a última carga já publicada.
    if (isSupabaseConfigured()) {
      const pulled = await refreshFromSupabaseCarga()
      if (!pulled.ok) return pulled
      revalidatePath('/', 'layout')
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
    return {
      ok: false,
      error: `Atualização falhou; a carga anterior foi mantida. ${message}`,
    }
  }
}
