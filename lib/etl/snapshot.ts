import { buildSnapshotFromWorkbooks } from '@/lib/etl/build-snapshot'
import { readWorkbooksParallel } from '@/lib/etl/read-workbooks-parallel'
import type { Snapshot } from '@/lib/etl/types'
import { cachePath, ensureDataDirs } from '@/lib/paths'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  statSync,
  utimesSync,
} from 'node:fs'

/** Copia só se o destino não existe ou a origem mudou (mtime/tamanho). */
function copyIfChanged(src: string, dest: string) {
  if (existsSync(dest)) {
    const srcStat = statSync(src)
    const destStat = statSync(dest)
    if (
      srcStat.mtimeMs === destStat.mtimeMs &&
      srcStat.size === destStat.size
    ) {
      return
    }
  }
  copyFileSync(src, dest)
  const srcStat = statSync(src)
  utimesSync(dest, srcStat.atime, srcStat.mtime)
}

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
  copyIfChanged(cortePath, corteCache)
  copyIfChanged(oficinasPath, oficinasCache)
  copyIfChanged(signusPath, signusCache)
  copyIfChanged(estoquePath, estoqueCache)
  let pedidosLastWrite: string | null = null
  let pedidosCacheOut: string | null = null
  if (existsSync(pedidosPath)) {
    copyIfChanged(pedidosPath, pedidosCache)
    pedidosLastWrite = statSync(pedidosPath).mtime.toISOString()
    pedidosCacheOut = pedidosCache
  }
  let itensLastWrite: string | null = null
  let itensCacheOut: string | null = null
  if (existsSync(itensPath)) {
    copyIfChanged(itensPath, itensCache)
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
  const [corteWb, oficinasWb, signusWb, estoqueWb, pedidosWb, itensWb] =
    await readWorkbooksParallel([
      corteFile,
      oficinasFile,
      signusFile,
      estoqueFile,
      pedidosFile,
      itensFile,
    ])
  if (!corteWb || !oficinasWb || !signusWb || !estoqueWb) {
    throw new Error('Falha ao ler uma ou mais planilhas obrigatórias.')
  }
  return buildSnapshotFromWorkbooks(
    corteWb,
    oficinasWb,
    signusWb,
    estoqueWb,
    pedidosWb,
    itensWb,
  )
}
