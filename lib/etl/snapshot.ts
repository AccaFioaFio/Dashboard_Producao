import { copyFileSync, mkdirSync, statSync } from 'node:fs'
import { buildSnapshotFromWorkbooks } from '@/lib/etl/build-snapshot'
import { readWorkbook } from '@/lib/etl/parse'
import type { Snapshot } from '@/lib/etl/types'
import { cachePath, ensureDataDirs } from '@/lib/paths'

export type CopiedSources = {
  corteCache: string
  oficinasCache: string
  signusCache: string
  corteLastWrite: string
  oficinasLastWrite: string
  signusLastWrite: string
}

export function copySources(
  cortePath: string,
  oficinasPath: string,
  signusPath: string,
): CopiedSources {
  ensureDataDirs()
  mkdirSync(cachePath('.'), { recursive: true })
  const corteCache = cachePath('corte.xlsx')
  const oficinasCache = cachePath('oficinas.xlsx')
  const signusCache = cachePath('signus-tecidos.xls')
  copyFileSync(cortePath, corteCache)
  copyFileSync(oficinasPath, oficinasCache)
  copyFileSync(signusPath, signusCache)
  return {
    corteCache,
    oficinasCache,
    signusCache,
    corteLastWrite: statSync(cortePath).mtime.toISOString(),
    oficinasLastWrite: statSync(oficinasPath).mtime.toISOString(),
    signusLastWrite: statSync(signusPath).mtime.toISOString(),
  }
}

export async function parseWorkbookFiles(
  corteFile: string,
  oficinasFile: string,
  signusFile: string,
): Promise<Snapshot> {
  return buildSnapshotFromWorkbooks(
    readWorkbook(corteFile),
    readWorkbook(oficinasFile),
    readWorkbook(signusFile),
  )
}
