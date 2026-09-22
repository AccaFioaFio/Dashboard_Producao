import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

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

export const EXCEL_DIR = path.join(PROJECT_ROOT, 'Arquivos do Excel')

const DEFAULT_CORTE = path.join(EXCEL_DIR, 'PROGRAMAÇÃO CORTE E COSTURA .xlsx')
const DEFAULT_OFICINAS = path.join(EXCEL_DIR, 'Produção Oficinas.xlsx')
const DEFAULT_SIGNUS = path.join(EXCEL_DIR, 'Movimentacao Tecidos.xlsx')
const DEFAULT_ESTOQUE = path.join(EXCEL_DIR, 'Saldo do Estoque Geral.xlsx')
const DEFAULT_PEDIDOS = path.join(EXCEL_DIR, 'Pedidos.xlsx')
const DEFAULT_ITENS = path.join(EXCEL_DIR, 'Itens.xlsx')

export type SourceFilePaths = {
  corte: string
  oficinas: string
  signus: string
  estoque: string
  pedidos: string
  itens: string
}

function resolveSourcePath(configured: string | undefined, fallback: string) {
  const raw = configured?.trim() || fallback
  return path.isAbsolute(raw)
    ? raw
    : path.resolve(/*turbopackIgnore: true*/ PROJECT_ROOT, raw)
}

export function sourceFilePaths(): SourceFilePaths {
  return {
    corte: resolveSourcePath(process.env.CORTE_XLSX, DEFAULT_CORTE),
    oficinas: resolveSourcePath(process.env.OFICINAS_XLSX, DEFAULT_OFICINAS),
    signus: resolveSourcePath(
      process.env.SIGNUS_XLSX ?? process.env.SIGNUS_XLS,
      DEFAULT_SIGNUS,
    ),
    estoque: resolveSourcePath(process.env.ESTOQUE_XLSX, DEFAULT_ESTOQUE),
    pedidos: resolveSourcePath(process.env.PEDIDOS_XLSX, DEFAULT_PEDIDOS),
    itens: resolveSourcePath(process.env.ITENS_XLSX, DEFAULT_ITENS),
  }
}

/** Destino da sinc: sempre a pasta Arquivos do Excel na raiz. */
export function projectFilePaths(): SourceFilePaths {
  return {
    corte: DEFAULT_CORTE,
    oficinas: DEFAULT_OFICINAS,
    signus: DEFAULT_SIGNUS,
    estoque: DEFAULT_ESTOQUE,
    pedidos: DEFAULT_PEDIDOS,
    itens: DEFAULT_ITENS,
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

export function cachePath(filename: string) {
  return path.join(CACHE_DIR, filename)
}
