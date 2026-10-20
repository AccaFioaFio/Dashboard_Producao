import { buildSnapshotFromWorkbooks } from '@/lib/etl/build-snapshot'
import { readWorkbooksParallel } from '@/lib/etl/read-workbooks-parallel'
import {
  corteBundleNames,
  maxMtimeIso,
  PARQUET_NAMES,
  resolveParquetBeside,
} from '@/lib/etl/parquet-files'
import type { Snapshot } from '@/lib/etl/types'
import { cachePath, ensureDataDirs } from '@/lib/paths'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  statSync,
  utimesSync,
} from 'node:fs'
import path from 'node:path'

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
  mkdirSync(path.dirname(dest), { recursive: true })
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
  parceirosCache: string | null
  corteLastWrite: string
  oficinasLastWrite: string
  signusLastWrite: string
  estoqueLastWrite: string
  pedidosLastWrite: string | null
  itensLastWrite: string | null
  parceirosLastWrite: string | null
}

function copyCorteBundle(cortePath: string, cacheDir: string) {
  mkdirSync(cacheDir, { recursive: true })
  const sources: string[] = []
  for (const name of corteBundleNames()) {
    const from = resolveParquetBeside(cortePath, name)
    if (!existsSync(from)) {
      if (
        name === PARQUET_NAMES.aproveitamentoOrigem ||
        name === PARQUET_NAMES.aproveitamentoPedidos
      ) {
        continue
      }
      throw new Error(`Parquet de corte ausente: ${from}`)
    }
    const to = path.join(cacheDir, name)
    copyIfChanged(from, to)
    sources.push(from)
  }
  return {
    corteCache: path.join(cacheDir, PARQUET_NAMES.corte),
    corteLastWrite: maxMtimeIso(sources),
  }
}

export function copySources(
  cortePath: string,
  oficinasPath: string,
  signusPath: string,
  estoquePath: string,
  pedidosPath: string,
  itensPath: string,
  parceirosPath: string,
): CopiedSources {
  ensureDataDirs()
  mkdirSync(cachePath('.'), { recursive: true })

  const corte = copyCorteBundle(cortePath, cachePath('corte'))
  const oficinasCache = cachePath(PARQUET_NAMES.oficinas)
  const signusCache = cachePath(PARQUET_NAMES.signus)
  const estoqueCache = cachePath(PARQUET_NAMES.estoque)
  const pedidosCache = cachePath(PARQUET_NAMES.pedidos)
  const itensCache = cachePath(PARQUET_NAMES.itens)
  const parceirosCache = cachePath(PARQUET_NAMES.parceiros)

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

  let parceirosLastWrite: string | null = null
  let parceirosCacheOut: string | null = null
  if (existsSync(parceirosPath)) {
    copyIfChanged(parceirosPath, parceirosCache)
    parceirosLastWrite = statSync(parceirosPath).mtime.toISOString()
    parceirosCacheOut = parceirosCache
  }

  return {
    corteCache: corte.corteCache,
    oficinasCache,
    signusCache,
    estoqueCache,
    pedidosCache: pedidosCacheOut,
    itensCache: itensCacheOut,
    parceirosCache: parceirosCacheOut,
    corteLastWrite: corte.corteLastWrite,
    oficinasLastWrite: statSync(oficinasPath).mtime.toISOString(),
    signusLastWrite: statSync(signusPath).mtime.toISOString(),
    estoqueLastWrite: statSync(estoquePath).mtime.toISOString(),
    pedidosLastWrite,
    itensLastWrite,
    parceirosLastWrite,
  }
}

export async function parseWorkbookFiles(
  corteFile: string,
  oficinasFile: string,
  signusFile: string,
  estoqueFile: string,
  pedidosFile: string | null,
  itensFile: string | null,
  parceirosFile: string | null,
): Promise<Snapshot> {
  const [corteWb, oficinasWb, signusWb, estoqueWb, pedidosWb, itensWb, parceirosWb] =
    await readWorkbooksParallel([
      corteFile,
      oficinasFile,
      signusFile,
      estoqueFile,
      pedidosFile,
      itensFile,
      parceirosFile,
    ])
  if (!corteWb || !oficinasWb || !signusWb || !estoqueWb) {
    throw new Error('Falha ao ler uma ou mais fontes parquet obrigatórias.')
  }
  return buildSnapshotFromWorkbooks(
    corteWb,
    oficinasWb,
    signusWb,
    estoqueWb,
    pedidosWb,
    itensWb,
    parceirosWb,
  )
}
