import { utimesSync } from 'node:fs'
import { loadLocalEnv } from '../lib/load-env'
import { projectFilePaths } from '../lib/paths'
import { refreshFromExcel } from '../lib/etl/refresh'

loadLocalEnv()

async function main() {
  const paths = projectFilePaths()
  const t0 = Date.now()
  console.log('1) full/incremental refresh')
  const a = await refreshFromExcel(paths)
  console.log(`   ${Date.now() - t0}ms ok=${a.ok} skipped=${a.ok && a.skipped} changed=${a.ok ? JSON.stringify(a.changed) : a.error}`)

  const t1 = Date.now()
  console.log('2) nothing changed (should skip)')
  const b = await refreshFromExcel(paths)
  console.log(`   ${Date.now() - t1}ms ok=${b.ok} skipped=${b.ok && b.skipped} changed=${b.ok ? JSON.stringify(b.changed) : b.error}`)

  // Touch só oficinas para forçar incremental parcial
  const now = new Date()
  utimesSync(paths.oficinas, now, now)
  const t2 = Date.now()
  console.log('3) only oficinas touched')
  const c = await refreshFromExcel(paths)
  console.log(`   ${Date.now() - t2}ms ok=${c.ok} skipped=${c.ok && c.skipped} changed=${c.ok ? JSON.stringify(c.changed) : c.error}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
