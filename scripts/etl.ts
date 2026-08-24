import { copyFileSync, existsSync } from 'node:fs'
import { refreshFromExcel } from '../lib/etl/refresh'
import { corteXlsxPath, oficinasXlsxPath } from '../lib/paths'
import { computeFunil, computeHeaderKpis, computeSerieMensal, checkInvariants } from '../lib/etl/kpis'
import { diffGolden } from '../lib/etl/golden'
import { parseWorkbookFiles } from '../lib/etl/snapshot'

async function main() {
  const mode = process.argv[2] ?? 'refresh'
  if (mode === 'golden') {
    const corte = corteXlsxPath()
    const oficinas = oficinasXlsxPath()
    if (!existsSync(corte) || !existsSync(oficinas)) {
      throw new Error('Arquivos Excel não encontrados')
    }
    copyFileSync(corte, corte)
    const snapshot = await parseWorkbookFiles(corte, oficinas)
    const header = computeHeaderKpis(snapshot)
    const funil = computeFunil(snapshot)
    const serie = computeSerieMensal(snapshot)
    const invariants = checkInvariants(snapshot)
    const golden = diffGolden(header, funil, serie)
    console.log(JSON.stringify({ header, funil, serie, invariants, golden }, null, 2))
    if (invariants.length) process.exitCode = 1
    return
  }

  const result = await refreshFromExcel()
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
