'use server'

import { canAtualizar } from '@/lib/auth/access'
import { readSession } from '@/lib/auth/cookie'
import { atualizarDadosCore, type AtualizarDadosResult } from '@/lib/etl/atualizar-dados'

export type { AtualizarDadosResult }

/** Mantido por compatibilidade; o botão usa POST /api/atualizar-dados. */
export async function atualizarDados(): Promise<AtualizarDadosResult> {
  const session = await readSession()
  if (!session || !canAtualizar(session.acessos)) {
    return { ok: false, error: 'Sem permissão.' }
  }
  return atualizarDadosCore()
}
