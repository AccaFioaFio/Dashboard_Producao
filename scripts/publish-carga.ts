import { watch } from 'node:fs'
import path from 'node:path'
import { loadLocalEnv } from '../lib/load-env'
import {
  formatPublishLog,
  isRetryablePublishError,
  lastOkCargaMtimes,
  publishCargaFromExcel,
  readSourceMtimes,
  sameMtimes,
  type SourceMtimes,
} from '../lib/etl/publish'
import { sourceFilePaths } from '../lib/paths'

/** Vários saves do Excel viram uma leitura. */
const DEBOUNCE_MS = 2 * 60_000
const POLL_MS = 30_000
const BACKOFF_MS = [5_000, 15_000, 30_000, 60_000]

function log(message: string) {
  console.log(`${new Date().toISOString()} ${message}`)
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function publishOnce() {
  const result = await publishCargaFromExcel()
  console.log(formatPublishLog(result, sourceFilePaths()))
  return result
}

async function main() {
  loadLocalEnv()
  const watchMode = process.argv.includes('--watch')
  if (!watchMode) {
    const result = await publishOnce()
    if (!result.ok) process.exitCode = 1
    return
  }
  await runWatch()
}

async function runWatch() {
  const paths = sourceFilePaths()
  log('vigia no ar (Excel → SQLite → Supabase). Ctrl+C para parar.')
  log(`debounce ${DEBOUNCE_MS / 60_000} min entre save e leitura.`)
  log(`corte    ${paths.corte}`)
  log(`oficinas ${paths.oficinas}`)
  log(`signus   ${paths.signus}`)
  log(`estoque  ${paths.estoque}`)
  log(`pedidos  ${paths.pedidos}`)
  log(`itens    ${paths.itens}`)

  let lastSuccess: SourceMtimes | null = null
  let lastPermanentFail: SourceMtimes | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let running = false
  let queued = false
  let backoffIndex = 0

  function requestPublish(reason: string) {
    // Poll a cada 30s não pode reiniciar o debounce de 2 min — senão a leitura
    // nunca dispara enquanto lastSuccess ainda é null.
    if (reason === 'poll' || reason === 'poll origem ausente') {
      if (queued || running || debounceTimer) return
    }
    log(`agendado (${reason})`)
    queued = true
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void drain()
    }, DEBOUNCE_MS)
  }

  async function drain() {
    if (running) {
      queued = true
      return
    }
    running = true
    try {
      while (queued) {
        queued = false
        await publishWithRetry()
      }
    } finally {
      running = false
      if (queued) void drain()
    }
  }

  async function publishWithRetry() {
    for (;;) {
      let mtimes: SourceMtimes
      try {
        mtimes = readSourceMtimes()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const wait = nextBackoff()
        log(`${message}; nova tentativa em ${wait / 1000}s`)
        await sleep(wait)
        continue
      }

      if (lastSuccess && sameMtimes(mtimes, lastSuccess)) {
        log('sem mudança de mtime; ignorado')
        backoffIndex = 0
        return
      }
      if (lastPermanentFail && sameMtimes(mtimes, lastPermanentFail)) {
        log('mesma origem da última falha permanente; esperando o próximo save')
        backoffIndex = 0
        return
      }

      const local = lastOkCargaMtimes()
      if (local && sameMtimes(mtimes, local)) {
        log('SQLite local já está nestes mtimes; publicando no Supabase…')
        const { publishSqliteToSupabase } = await import('../lib/etl/publish-supabase')
        const published = await publishSqliteToSupabase()
        if (published.ok) {
          lastSuccess = mtimes
          lastPermanentFail = null
          backoffIndex = 0
          log(`[carga] ok sqlite já local; publicado lidaEm=${published.lidaEm}`)
          return
        }
        if (!isRetryablePublishError(published.error)) {
          lastPermanentFail = mtimes
          backoffIndex = 0
          log(`[carga] erro ${published.error}`)
          return
        }
        const wait = nextBackoff()
        log(`${published.error}; nova tentativa em ${wait / 1000}s`)
        await sleep(wait)
        continue
      }

      log('lendo planilhas e gravando data/producao.sqlite…')
      const result = await publishCargaFromExcel()
      if (result.ok) {
        lastSuccess = {
          corte: result.corteLastWrite,
          oficinas: result.oficinasLastWrite,
          signus: result.signusLastWrite,
          estoque: result.estoqueLastWrite,
          pedidos: result.pedidosLastWrite,
          itens: result.itensLastWrite,
        }
        lastPermanentFail = null
        backoffIndex = 0
        console.log(formatPublishLog(result, paths))
        return
      }

      log(`[carga] erro ${result.error}`)
      if (!isRetryablePublishError(result.error)) {
        lastPermanentFail = mtimes
        backoffIndex = 0
        return
      }
      const wait = nextBackoff()
      log(`origem ocupada; nova tentativa em ${wait / 1000}s`)
      await sleep(wait)
    }
  }

  function nextBackoff() {
    const wait = BACKOFF_MS[Math.min(backoffIndex, BACKOFF_MS.length - 1)]
    backoffIndex += 1
    return wait
  }

  const basenames = new Set(Object.values(paths).map((filePath) => path.basename(filePath)))
  const dirs = [...new Set(Object.values(paths).map((filePath) => path.dirname(filePath)))]
  for (const dir of dirs) {
    try {
      watch(dir, (_event, filename) => {
        if (filename) {
          const base = path.basename(String(filename))
          if (base.startsWith('~$')) return
          if (!basenames.has(base)) return
        }
        requestPublish(filename ? String(filename) : dir)
      })
      log(`observando ${dir}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log(`não deu para observar ${dir} (${message}); só poll`)
    }
  }

  setInterval(() => {
    try {
      const mtimes = readSourceMtimes()
      if (lastSuccess && sameMtimes(mtimes, lastSuccess)) return
      requestPublish('poll')
    } catch {
      requestPublish('poll origem ausente')
    }
  }, POLL_MS)

  requestPublish('início')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
