import { existsSync, statSync } from 'node:fs'
import { getSqlite } from '@/db'
import { persistCloudDb } from '@/lib/cloud/carga'
import { refreshFromExcel, type RefreshResult } from '@/lib/etl/refresh'
import { sourceFilePaths, type SourceFilePaths } from '@/lib/paths'

export type SourceMtimes = {
  corte: string
  oficinas: string
  signus: string
}

export type PersistResult = { ok: true } | { ok: false; error: string }

export function readSourceMtimes(): SourceMtimes {
  const paths = sourceFilePaths()
  for (const [name, filePath] of Object.entries(paths) as [
    keyof SourceFilePaths,
    string,
  ][]) {
    if (!existsSync(filePath)) {
      throw new Error(`Arquivo de origem ausente (${name}): ${filePath}`)
    }
  }
  return {
    corte: statSync(paths.corte).mtime.toISOString(),
    oficinas: statSync(paths.oficinas).mtime.toISOString(),
    signus: statSync(paths.signus).mtime.toISOString(),
  }
}

export function sameMtimes(left: SourceMtimes, right: SourceMtimes) {
  return (
    left.corte === right.corte &&
    left.oficinas === right.oficinas &&
    left.signus === right.signus
  )
}

export function lastOkCargaMtimes(): SourceMtimes | null {
  try {
    const row = getSqlite()
      .prepare(
        `SELECT corte_last_write as corte, oficinas_last_write as oficinas, signus_last_write as signus
         FROM carga WHERE ok = 1 ORDER BY id DESC LIMIT 1`,
      )
      .get() as SourceMtimes | undefined
    if (!row?.corte || !row.oficinas || !row.signus) return null
    return row
  } catch {
    return null
  }
}

export function requireBlobWriteToken(): PersistResult {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return { ok: true }
  return {
    ok: false,
    error:
      'Falta BLOB_READ_WRITE_TOKEN no .env deste PC. Sem o token a nuvem não atualiza. Copie o token do Blob Store da Vercel (Storage).',
  }
}

export function isRetryablePublishError(error: string) {
  return /EBUSY|EPERM|EACCES|EAGAIN|ENOENT|resource busy|being used by another process|locked|Cópia da origem|não gravou no/i.test(
    error,
  )
}

export async function persistPublishedDb(): Promise<PersistResult> {
  const token = requireBlobWriteToken()
  if (!token.ok) return token
  try {
    const persisted = await persistCloudDb()
    if (!persisted) {
      return {
        ok: false,
        error:
          'A carga foi lida neste PC, mas não gravou no Blob Store. Confira BLOB_READ_WRITE_TOKEN e se o store está conectado.',
      }
    }
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: `A carga foi lida neste PC, mas não gravou no site. ${message}`,
    }
  }
}

export async function publishCargaFromExcel(): Promise<RefreshResult> {
  const token = requireBlobWriteToken()
  if (!token.ok) return token
  const result = await refreshFromExcel()
  if (!result.ok) return result
  const persisted = await persistPublishedDb()
  if (!persisted.ok) return persisted
  return result
}

export function formatPublishLog(result: RefreshResult, paths: SourceFilePaths) {
  if (!result.ok) return `[carga] erro ${result.error}`
  return [
    `[carga] ok lidaEm=${result.lidaEm}`,
    `  corte    ${result.corteLastWrite}  ${paths.corte}`,
    `  oficinas ${result.oficinasLastWrite}  ${paths.oficinas}`,
    `  signus   ${result.signusLastWrite}  ${paths.signus}`,
  ].join('\n')
}
