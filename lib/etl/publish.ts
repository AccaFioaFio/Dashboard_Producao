import { existsSync, statSync } from 'node:fs'
import { getSqlite } from '@/db'
import { publishSqliteToSupabase } from '@/lib/etl/publish-supabase'
import { refreshFromExcel, type RefreshResult } from '@/lib/etl/refresh'
import { isSupabaseWriteConfigured } from '@/lib/supabase/admin'
import { sourceFilePaths, type SourceFilePaths } from '@/lib/paths'

export type SourceMtimes = {
  corte: string
  oficinas: string
  signus: string
  estoque: string
  pedidos: string | null
  itens: string | null
}

export function readSourceMtimes(): SourceMtimes {
  const paths = sourceFilePaths()
  for (const name of ['corte', 'oficinas', 'signus', 'estoque'] as const) {
    const filePath = paths[name]
    if (!existsSync(filePath)) {
      throw new Error(`Arquivo de origem ausente (${name}): ${filePath}`)
    }
  }
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

export function sameMtimes(left: SourceMtimes, right: SourceMtimes) {
  return (
    left.corte === right.corte &&
    left.oficinas === right.oficinas &&
    left.signus === right.signus &&
    left.estoque === right.estoque &&
    left.pedidos === right.pedidos &&
    left.itens === right.itens
  )
}

export function lastOkCargaMtimes(): SourceMtimes | null {
  try {
    const row = getSqlite()
      .prepare(
        `SELECT corte_last_write as corte, oficinas_last_write as oficinas,
                signus_last_write as signus, estoque_last_write as estoque,
                pedidos_last_write as pedidos, itens_last_write as itens
         FROM carga WHERE ok = 1 ORDER BY id DESC LIMIT 1`,
      )
      .get() as SourceMtimes | undefined
    if (!row?.corte || !row.oficinas || !row.signus || !row.estoque) return null
    return {
      ...row,
      pedidos: row.pedidos ?? null,
      itens: row.itens ?? null,
    }
  } catch {
    return null
  }
}

export function isRetryablePublishError(error: string) {
  return /EBUSY|EPERM|EACCES|EAGAIN|ENOENT|resource busy|being used by another process|locked|Cópia da origem|Storage|fetch failed|network/i.test(
    error,
  )
}

/** Relê planilhas, grava SQLite local e publica no Supabase (como Orçamentos → banco na nuvem). */
export async function publishCargaFromExcel(): Promise<RefreshResult> {
  const result = await refreshFromExcel()
  if (!result.ok) return result
  if (!isSupabaseWriteConfigured()) {
    return {
      ok: false,
      error:
        'Carga local ok, mas falta SUPABASE_SERVICE_ROLE_KEY / URL no .env.local para publicar na nuvem.',
    }
  }
  const published = await publishSqliteToSupabase()
  if (!published.ok) return published
  return result
}

export function formatPublishLog(result: RefreshResult, paths: SourceFilePaths) {
  if (!result.ok) return `[carga] erro ${result.error}`
  return [
    `[carga] ok lidaEm=${result.lidaEm} (SQLite local + Supabase)`,
    `  corte    ${result.corteLastWrite}  ${paths.corte}`,
    `  oficinas ${result.oficinasLastWrite}  ${paths.oficinas}`,
    `  signus   ${result.signusLastWrite}  ${paths.signus}`,
    `  estoque  ${result.estoqueLastWrite}  ${paths.estoque}`,
    `  pedidos  ${result.pedidosLastWrite ?? '—'}  ${paths.pedidos}`,
    `  itens    ${result.itensLastWrite ?? '—'}  ${paths.itens}`,
  ].join('\n')
}
