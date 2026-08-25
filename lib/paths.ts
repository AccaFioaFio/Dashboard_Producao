import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

export { YEAR } from '@/lib/year'
export { CLOUD_DB_BLOB, CLOUD_SNAPSHOT_BLOB } from '@/lib/cloud/constants'

export const PROJECT_ROOT = process.cwd()

export const IS_CLOUD = process.env.VERCEL === '1'

export const DATA_DIR = IS_CLOUD
  ? path.join('/tmp', 'dashboard-data')
  : path.join(PROJECT_ROOT, 'data')
export const CACHE_DIR = path.join(DATA_DIR, 'cache')
export const DB_PATH = path.join(DATA_DIR, 'producao.sqlite')
export const MIGRATIONS_DIR = path.join(PROJECT_ROOT, 'drizzle')

export const EXCEL_DIR = path.join(PROJECT_ROOT, 'Arquivos do Excel')

const DEFAULT_CORTE = path.join(EXCEL_DIR, 'PROGRAMAÇÃO CORTE E COSTURA .xlsx')
const DEFAULT_OFICINAS = path.join(EXCEL_DIR, 'Produção Oficinas.xlsx')
const DEFAULT_SIGNUS = path.join(EXCEL_DIR, 'Movimentação Tecidos.xls')

export function ensureDataDirs() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })
}

export function corteXlsxPath() {
  return process.env.CORTE_XLSX?.trim() || DEFAULT_CORTE
}

export function oficinasXlsxPath() {
  return process.env.OFICINAS_XLSX?.trim() || DEFAULT_OFICINAS
}

export function signusXlsPath() {
  return process.env.SIGNUS_XLS?.trim() || DEFAULT_SIGNUS
}

export function cachePath(filename: string) {
  return path.join(CACHE_DIR, filename)
}
