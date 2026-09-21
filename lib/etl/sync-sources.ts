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
  EXCEL_DIR,
  projectFilePaths,
  type SourceFilePaths,
} from '@/lib/paths'

const SIGNUS_DIR =
  'C:/Users/INTEL/OneDrive/Área de Trabalho/1 - TABELA BASE PARA ATUALIZAÇÃO/TABELAS  2 SEMESTRES 2026/Relatorio Signus'

const DEFAULT_ORIGINS: SourceFilePaths = {
  corte:
    'C:/Users/INTEL/OneDrive/FIO A FIO/RELATORIO/PRODUÇÃO CORTE E COSTURA/PROGRAMAÇÃO CORTE E COSTURA .xlsx',
  oficinas: 'Q:/00 - OFICINAS 2026/Produção Oficinas.xlsx',
  signus: path.join(SIGNUS_DIR, 'Movimentacao Tecidos.xlsx'),
  estoque: path.join(SIGNUS_DIR, 'Saldo do Estoque Geral.xlsx'),
  pedidos: path.join(SIGNUS_DIR, 'Pedidos.xlsx'),
  itens: path.join(SIGNUS_DIR, 'Itens.xlsx'),
}

const COPY_RETRIES = 5
const COPY_RETRY_MS = 1_200

export type SyncResult =
  | { ok: true; copied: Array<{ name: keyof SourceFilePaths; from: string; to: string }> }
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

function isWorkbook(name: string) {
  const base = path.basename(name)
  if (base.startsWith('~$')) return false
  return /\.(xlsx|xls)$/i.test(base)
}

function samePath(left: string, right: string) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
}

function pickInDir(dir: string, preferredName: string) {
  const exact = path.join(dir, preferredName)
  if (existsSync(exact) && statSync(exact).isFile()) return exact
  const wanted = preferredName.toLowerCase()
  const files = readdirSync(dir).filter(isWorkbook)
  const match = files.find((file) => file.toLowerCase() === wanted)
  if (match) return path.join(dir, match)
  const stem = path.parse(preferredName).name.toLowerCase()
  const byStem = files.find((file) => path.parse(file).name.toLowerCase() === stem)
  if (byStem) return path.join(dir, byStem)
  return null
}

function resolveOrigin(origin: string, destFile: string) {
  if (!existsSync(origin)) {
    throw new Error(`Origem ausente: ${origin}`)
  }
  if (statSync(origin).isFile()) return origin
  const picked = pickInDir(origin, path.basename(destFile))
  if (!picked) {
    throw new Error(`Nenhum Excel encontrado em ${origin}`)
  }
  return picked
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

export function originSyncPaths(): SourceFilePaths {
  return {
    corte: envPath('CORTE_XLSX') || DEFAULT_ORIGINS.corte,
    oficinas: envPath('OFICINAS_XLSX') || DEFAULT_ORIGINS.oficinas,
    signus: envPath('SIGNUS_XLSX', 'SIGNUS_XLS') || DEFAULT_ORIGINS.signus,
    estoque: envPath('ESTOQUE_XLSX') || DEFAULT_ORIGINS.estoque,
    pedidos: envPath('PEDIDOS_XLSX') || DEFAULT_ORIGINS.pedidos,
    itens: envPath('ITENS_XLSX') || DEFAULT_ORIGINS.itens,
  }
}

export function resolvedOriginFile(name: keyof SourceFilePaths) {
  const origin = originSyncPaths()
  const dest = projectFilePaths()
  return resolveOrigin(origin[name], dest[name])
}

export function originWatchDirs() {
  const origin = originSyncPaths()
  const dirs = new Set<string>()
  for (const raw of Object.values(origin)) {
    if (!raw) continue
    dirs.add(existsSync(raw) && statSync(raw).isFile() ? path.dirname(raw) : raw)
  }
  return [...dirs]
}

export function readOriginMtimes() {
  const dest = projectFilePaths()
  const times: Partial<Record<keyof SourceFilePaths, string>> = {}
  for (const name of Object.keys(dest) as Array<keyof SourceFilePaths>) {
    try {
      const from = resolvedOriginFile(name)
      times[name] = statSync(from).mtime.toISOString()
    } catch {
      times[name] = ''
    }
  }
  return times
}

export async function syncExcelToProject(): Promise<SyncResult> {
  const origin = originSyncPaths()
  const dest = projectFilePaths()
  mkdirSync(EXCEL_DIR, { recursive: true })

  const copied: Array<{ name: keyof SourceFilePaths; from: string; to: string }> = []
  const required: Array<keyof SourceFilePaths> = [
    'corte',
    'oficinas',
    'signus',
    'pedidos',
    'estoque',
  ]

  try {
    for (const name of Object.keys(dest) as Array<keyof SourceFilePaths>) {
      const optional = name === 'itens'
      try {
        const from = resolveOrigin(origin[name], dest[name])
        const to = dest[name]
        if (!samePath(from, to)) {
          await copyWithRetry(from, to)
        }
        copied.push({ name, from, to })
      } catch (error) {
        if (optional) continue
        if (required.includes(name)) throw error
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `Sinc falhou; carga anterior mantida. ${message}` }
  }

  const missingRequired = required.filter(
    (name) => !copied.some((item) => item.name === name),
  )
  if (missingRequired.length) {
    return {
      ok: false,
      error: `Sinc incompleta (${missingRequired.join(', ')}); carga anterior mantida.`,
    }
  }

  return { ok: true, copied }
}
