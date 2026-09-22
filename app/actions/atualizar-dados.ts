'use server'

import { atualizarDadosCore, type AtualizarDadosResult } from '@/lib/etl/atualizar-dados'

export type { AtualizarDadosResult }

/** Mantido por compatibilidade; o botão usa POST /api/atualizar-dados. */
export async function atualizarDados(): Promise<AtualizarDadosResult> {
  return atualizarDadosCore()
}
