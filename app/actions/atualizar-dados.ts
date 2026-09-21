'use server'

import { refresh, revalidatePath } from 'next/cache'
import { refreshFromExcel } from '@/lib/etl/refresh'
import { projectFilePaths } from '@/lib/paths'

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

async function runAtualizarDados(): Promise<AtualizarDadosResult> {
  const result = await refreshFromExcel(projectFilePaths())
  if (!result.ok) return result

  revalidatePath('/', 'layout')
  refresh()
  return { ok: true, lidaEm: result.lidaEm }
}
