import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import path from 'node:path'
import {
  corteBundleNames,
  parquetFolderReady,
  PARQUET_NAMES,
  requiredParquetPaths,
} from '@/lib/etl/parquet-files'
import {
  PARQUET_DIR,
  projectFilePaths,
  type SourceFilePaths,
} from '@/lib/paths'

const COPY_RETRIES = 5
const COPY_RETRY_MS = 1_200

export type SyncResult =
  | { ok: true; copied: Array<{ name: string; from: string; to: string }> }
  | { ok: false; error: string }

function envPath(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return ''
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isParquet(name: string) {
  const base = path.basename(name)
  if (base.startsWith('~$')) return false
  return /\.parquet$/i.test(base)
}

function samePath(left: string, right: string) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
}

function copyLocked(from: string, to: string) {
  mkdirSync(path.dirname(to), { recursive: true })
  const tmp = `${to}.${process.pid}.tmp`
  try {
    copyFileSync(from, tmp)
    renameSync(tmp, to)
  } catch (error) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp)
    } catch {
      // ignore temp cleanup
    }
    throw error
  }
}

async function copyWithRetry(from: string, to: string) {
  let lastError: unknown
  for (let attempt = 0; attempt < COPY_RETRIES; attempt += 1) {
    try {
      copyLocked(from, to)
      return
    } catch (error) {
      lastError = error
      if (attempt < COPY_RETRIES - 1) await sleep(COPY_RETRY_MS)
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(`Não copiou ${path.basename(to)}: ${message}`)
}

/** Origem opcional da automação (pasta com os .parquet). */
export function originParquetDir() {
  return envPath('PARQUET_ORIGIN_DIR', 'PARQUET_DIR_ORIGIN')
}

export function originWatchDirs() {
  const origin = originParquetDir()
  if (origin) return [origin]
  return [PARQUET_DIR]
}

function allRequiredNames() {
  return [
    ...corteBundleNames(),
    PARQUET_NAMES.oficinas,
    PARQUET_NAMES.signus,
    PARQUET_NAMES.estoque,
    PARQUET_NAMES.pedidos,
    PARQUET_NAMES.itens,
    PARQUET_NAMES.parceiros,
  ]
}

export function readOriginMtimes() {
  const origin = originParquetDir() || PARQUET_DIR
  const times: Record<string, string> = {}
  for (const name of allRequiredNames()) {
    const filePath = path.join(origin, name)
    times[name] = existsSync(filePath)
      ? statSync(filePath).mtime.toISOString()
      : ''
  }
  return times
}

/**
 * Garante a pasta Parquet do projeto.
 * Se PARQUET_ORIGIN_DIR estiver definido, copia de lá; senão só valida os arquivos locais.
 */
export async function syncExcelToProject(): Promise<SyncResult> {
  return syncParquetToProject()
}

export async function syncParquetToProject(): Promise<SyncResult> {
  mkdirSync(PARQUET_DIR, { recursive: true })
  const origin = originParquetDir()
  const copied: Array<{ name: string; from: string; to: string }> = []

  try {
    if (origin) {
      if (!existsSync(origin) || !statSync(origin).isDirectory()) {
        return { ok: false, error: `Origem Parquet ausente: ${origin}` }
      }
      const available = new Set(
        readdirSync(origin).filter(isParquet).map((name) => name.toLowerCase()),
      )
      for (const name of allRequiredNames()) {
        const optional =
          name === PARQUET_NAMES.itens ||
          name === PARQUET_NAMES.parceiros ||
          name === PARQUET_NAMES.aproveitamentoOrigem ||
          name === PARQUET_NAMES.aproveitamentoPedidos
        const from = path.join(origin, name)
        const to = path.join(PARQUET_DIR, name)
        if (!available.has(name.toLowerCase()) && !existsSync(from)) {
          if (optional) continue
          throw new Error(`Parquet obrigatório ausente na origem: ${name}`)
        }
        if (!existsSync(from)) {
          if (optional) continue
          throw new Error(`Parquet obrigatório ausente na origem: ${name}`)
        }
        if (!samePath(from, to)) {
          await copyWithRetry(from, to)
        }
        copied.push({ name, from, to })
      }
    } else {
      const required = requiredParquetPaths(PARQUET_DIR)
      const missing = (
        ['corte', 'costura', 'revisao', 'oficinas', 'signus', 'estoque'] as const
      ).filter((key) => !existsSync(required[key]))
      if (missing.length) {
        return {
          ok: false,
          error: `Pasta Parquet incompleta (${missing.join(', ')}).`,
        }
      }
      for (const name of allRequiredNames()) {
        const to = path.join(PARQUET_DIR, name)
        if (existsSync(to)) copied.push({ name, from: to, to })
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `Sinc falhou; carga anterior mantida. ${message}` }
  }

  if (!parquetFolderReady(PARQUET_DIR)) {
    return {
      ok: false,
      error: 'Sinc incompleta (faltam parquet obrigatórios); carga anterior mantida.',
    }
  }

  return { ok: true, copied }
}

/** Compat: paths “de origem” = pasta Parquet do projeto (ou env). */
export function originSyncPaths(): SourceFilePaths {
  return projectFilePaths()
}

export function resolvedOriginFile(name: keyof SourceFilePaths) {
  return projectFilePaths()[name]
}
