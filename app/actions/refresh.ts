'use server'

import { revalidatePath } from 'next/cache'
import { readCloudSnapshot } from '@/lib/cloud/carga'
import { updateSecretOk } from '@/lib/cloud/secret'
import { applySnapshotPayload, refreshFromExcel, type RefreshResult } from '@/lib/etl/refresh'

export const maxDuration = 300

export async function atualizarDados(
  _prev: RefreshResult | null = null,
  _formData?: FormData,
): Promise<RefreshResult> {
  const result = await refreshFromExcel()
  if (result.ok) {
    revalidatePath('/', 'layout')
  }
  return result
}

export async function aplicarCargaRemota(secret?: string): Promise<RefreshResult> {
  if (!updateSecretOk(secret)) {
    return { ok: false, error: 'Senha inválida.' }
  }
  const payload = await readCloudSnapshot()
  if (!payload) {
    return {
      ok: false,
      error: 'Não achei a carga enviada. Crie um Blob Store na Vercel e tente de novo.',
    }
  }
  const result = await applySnapshotPayload(payload)
  if (result.ok) {
    revalidatePath('/', 'layout')
  }
  return result
}
