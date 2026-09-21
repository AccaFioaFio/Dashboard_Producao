import { watch } from 'node:fs'
import { loadLocalEnv } from '../lib/load-env'
import {
  originWatchDirs,
  readOriginMtimes,
  syncExcelToProject,
  type SyncResult,
} from '../lib/etl/sync-sources'

const DEBOUNCE_MS = 4_000
const POLL_MS = 20_000

function log(message: string) {
  console.log(`${new Date().toISOString()} ${message}`)
}

function formatSync(result: SyncResult) {
  if (!result.ok) return `[sinc] erro ${result.error}`
  return [
    '[sinc] ok',
    ...result.copied.map(
      (item) => `  ${item.name.padEnd(8)} ${item.from} → ${item.to}`,
    ),
  ].join('\n')
}

async function syncOnce() {
  const result = await syncExcelToProject()
  console.log(formatSync(result))
  return result
}

async function main() {
  loadLocalEnv()
  const watchMode = process.argv.includes('--watch')
  if (!watchMode) {
    const result = await syncOnce()
    if (!result.ok) process.exitCode = 1
    return
  }
  await runWatch()
}

async function runWatch() {
  log('sinc no ar. Copia a origem para Arquivos do Excel. Ctrl+C para parar.')
  const dirs = originWatchDirs()
  for (const dir of dirs) {
    log(`origem  ${dir}`)
  }

  let lastMtimes = ''
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let running = false
  let queued = false

  function requestSync(reason: string) {
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
        const stamp = JSON.stringify(readOriginMtimes())
        if (stamp === lastMtimes) {
          log('sem mudança na origem; ignorado')
          continue
        }
        const result = await syncOnce()
        if (result.ok) lastMtimes = stamp
      }
    } finally {
      running = false
      if (queued) void drain()
    }
  }

  for (const dir of dirs) {
    try {
      watch(dir, (_event, filename) => {
        const name = filename ? String(filename) : ''
        if (name.startsWith('~$')) return
        requestSync(name || dir)
      })
      log(`observando ${dir}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log(`não deu para observar ${dir} (${message}); só poll`)
    }
  }

  setInterval(() => {
    requestSync('poll')
  }, POLL_MS)

  requestSync('início')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
