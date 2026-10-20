import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { PARQUET_NAMES } from '@/lib/etl/parquet-files'

export { YEAR } from '@/lib/year'

export const PROJECT_ROOT = process.cwd()

export const IS_CLOUD = process.env.VERCEL === '1'

export const DATA_DIR = IS_CLOUD
  ? path.join('/tmp', 'dashboard-data')
  : path.join(PROJECT_ROOT, 'data')
export const CACHE_DIR = path.join(DATA_DIR, 'cache')
export const DB_PATH = path.join(DATA_DIR, 'producao.sqlite')
/** SQLite da carga no repositório — o site na Vercel lê este arquivo, sem Blob. */
export const BUNDLED_DB_PATH = path.join(PROJECT_ROOT, 'data', 'producao.sqlite')
export const MIGRATIONS_DIR = path.join(PROJECT_ROOT, 'drizzle')

/** Pasta legada de Excel (mantida só para referência / migração). */
export const EXCEL_DIR = path.join(PROJECT_ROOT, 'Arquivos do Excel')

/** Fonte atual da carga: 1 aba = 1 parquet. */
export const PARQUET_DIR = path.join(PROJECT_ROOT, 'Parquet')

const DEFAULT_CORTE = path.join(PARQUET_DIR, PARQUET_NAMES.corte)
const DEFAULT_OFICINAS = path.join(PARQUET_DIR, PARQUET_NAMES.oficinas)
const DEFAULT_SIGNUS = path.join(PARQUET_DIR, PARQUET_NAMES.signus)
const DEFAULT_ESTOQUE = path.join(PARQUET_DIR, PARQUET_NAMES.estoque)
const DEFAULT_PEDIDOS = path.join(PARQUET_DIR, PARQUET_NAMES.pedidos)
const DEFAULT_ITENS = path.join(PARQUET_DIR, PARQUET_NAMES.itens)
const DEFAULT_PARCEIROS = path.join(PARQUET_DIR, PARQUET_NAMES.parceiros)

export type SourceFilePaths = {
  corte: string
  oficinas: string
  signus: string
  estoque: string
  pedidos: string
  itens: string
  parceiros: string
}

function resolveSourcePath(configured: string | undefined, fallback: string) {
  const raw = configured?.trim() || fallback
  return path.isAbsolute(raw)
    ? raw
    : path.resolve(/*turbopackIgnore: true*/ PROJECT_ROOT, raw)
}

export function sourceFilePaths(): SourceFilePaths {
  return {
    corte: resolveSourcePath(process.env.CORTE_PARQUET ?? process.env.CORTE_XLSX, DEFAULT_CORTE),
    oficinas: resolveSourcePath(
      process.env.OFICINAS_PARQUET ?? process.env.OFICINAS_XLSX,
      DEFAULT_OFICINAS,
    ),
    signus: resolveSourcePath(
      process.env.SIGNUS_PARQUET ??
        process.env.SIGNUS_XLSX ??
        process.env.SIGNUS_XLS,
      DEFAULT_SIGNUS,
    ),
    estoque: resolveSourcePath(
      process.env.ESTOQUE_PARQUET ?? process.env.ESTOQUE_XLSX,
      DEFAULT_ESTOQUE,
    ),
    pedidos: resolveSourcePath(
      process.env.PEDIDOS_PARQUET ?? process.env.PEDIDOS_XLSX,
      DEFAULT_PEDIDOS,
    ),
    itens: resolveSourcePath(
      process.env.ITENS_PARQUET ?? process.env.ITENS_XLSX,
      DEFAULT_ITENS,
    ),
    parceiros: resolveSourcePath(
      process.env.PARCEIROS_PARQUET ?? process.env.PARCEIROS_XLSX,
      process.env.PEDIDOS_PARQUET || process.env.PEDIDOS_XLSX
        ? path.join(
            path.dirname(
              process.env.PEDIDOS_PARQUET || process.env.PEDIDOS_XLSX || '',
            ),
            PARQUET_NAMES.parceiros,
          )
        : DEFAULT_PARCEIROS,
    ),
  }
}

/** Destino da sinc: pasta Parquet na raiz do projeto. */
export function projectFilePaths(): SourceFilePaths {
  return {
    corte: DEFAULT_CORTE,
    oficinas: DEFAULT_OFICINAS,
    signus: DEFAULT_SIGNUS,
    estoque: DEFAULT_ESTOQUE,
    pedidos: DEFAULT_PEDIDOS,
    itens: DEFAULT_ITENS,
    parceiros: DEFAULT_PARCEIROS,
  }
}

export function ensureDataDirs() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })
}

export function corteXlsxPath() {
  return sourceFilePaths().corte
}

export function oficinasXlsxPath() {
  return sourceFilePaths().oficinas
}

export function signusXlsPath() {
  return sourceFilePaths().signus
}

export function estoqueXlsxPath() {
  return sourceFilePaths().estoque
}

export function pedidosXlsxPath() {
  return sourceFilePaths().pedidos
}

export function itensXlsxPath() {
  return sourceFilePaths().itens
}

export function parceirosXlsxPath() {
  return sourceFilePaths().parceiros
}

export function cachePath(filename: string) {
  return path.join(CACHE_DIR, filename)
}
