import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

export const YEAR = 2026

export const PROJECT_ROOT = process.cwd()

export const DATA_DIR = path.join(PROJECT_ROOT, 'data')
export const CACHE_DIR = path.join(DATA_DIR, 'cache')
export const DB_PATH = path.join(DATA_DIR, 'producao.sqlite')
export const MIGRATIONS_DIR = path.join(PROJECT_ROOT, 'drizzle')

const DEFAULT_CORTE =
  'C:\\Users\\opera\\OneDrive\\FIO A FIO\\RELATORIO\\PRODUÇÃO CORTE E COSTURA\\PROGRAMAÇÃO CORTE E COSTURA .xlsx'
const DEFAULT_OFICINAS =
  'C:\\Users\\opera\\OneDrive\\Produção Q\\00 - OFICINAS 2026\\Produção Oficinas.xlsx'

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

export function cachePath(filename: string) {
  return path.join(CACHE_DIR, filename)
}
