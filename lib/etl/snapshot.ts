import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { buildSnapshotFromWorkbooks } from '@/lib/etl/build-snapshot'
import { readWorkbook } from '@/lib/etl/parse'
import type { Snapshot } from '@/lib/etl/types'
import { cachePath, ensureDataDirs } from '@/lib/paths'

export type CopiedSources = {
  corteCache: string
  oficinasCache: string
  signusCache: string
  estoqueCache: string
  pedidosCache: string | null
  itensCache: string | null
  corteLastWrite: string
  oficinasLastWrite: string
  signusLastWrite: string
  estoqueLastWrite: string
  pedidosLastWrite: string | null
  itensLastWrite: string | null
}

export function copySources(
  cortePath: string,
  oficinasPath: string,
  signusPath: string,
  estoquePath: string,
  pedidosPath: string,
  itensPath: string,
): CopiedSources {
  ensureDataDirs()
  mkdirSync(cachePath('.'), { recursive: true })
  const corteCache = cachePath('corte.xlsx')
  const oficinasCache = cachePath('oficinas.xlsx')
  const signusCache = cachePath('signus-tecidos.xlsx')
  const estoqueCache = cachePath('estoque-geral.xlsx')
  const pedidosCache = cachePath('pedidos.xlsx')
  const itensCache = cachePath('itens.xlsx')
  copyFileSync(cortePath, corteCache)
  copyFileSync(oficinasPath, oficinasCache)
  copyFileSync(signusPath, signusCache)
  copyFileSync(estoquePath, estoqueCache)
  let pedidosLastWrite: string | null = null
  let pedidosCacheOut: string | null = null
  if (existsSync(pedidosPath)) {
    copyFileSync(pedidosPath, pedidosCache)
    pedidosLastWrite = statSync(pedidosPath).mtime.toISOString()
    pedidosCacheOut = pedidosCache
  }
  let itensLastWrite: string | null = null
  let itensCacheOut: string | null = null
  if (existsSync(itensPath)) {
    copyFileSync(itensPath, itensCache)
    itensLastWrite = statSync(itensPath).mtime.toISOString()
    itensCacheOut = itensCache
  }
  return {
    corteCache,
    oficinasCache,
    signusCache,
    estoqueCache,
    pedidosCache: pedidosCacheOut,
    itensCache: itensCacheOut,
    corteLastWrite: statSync(cortePath).mtime.toISOString(),
    oficinasLastWrite: statSync(oficinasPath).mtime.toISOString(),
    signusLastWrite: statSync(signusPath).mtime.toISOString(),
    estoqueLastWrite: statSync(estoquePath).mtime.toISOString(),
    pedidosLastWrite,
    itensLastWrite,
  }
}

export async function parseWorkbookFiles(
  corteFile: string,
  oficinasFile: string,
  signusFile: string,
  estoqueFile: string,
  pedidosFile: string | null,
  itensFile: string | null,
): Promise<Snapshot> {
  return buildSnapshotFromWorkbooks(
    readWorkbook(corteFile),
    readWorkbook(oficinasFile),
    readWorkbook(signusFile),
    readWorkbook(estoqueFile),
    pedidosFile ? readWorkbook(pedidosFile) : null,
    itensFile ? readWorkbook(itensFile) : null,
  )
}
