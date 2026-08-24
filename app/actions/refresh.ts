'use server'

import { revalidatePath } from 'next/cache'
import { refreshFromExcel, type RefreshResult } from '@/lib/etl/refresh'

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
