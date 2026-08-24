import { parseWorkbookFiles } from '../lib/etl/snapshot'
import { computeFunil, computeHeaderKpis, computeSerieMensal, checkInvariants } from '../lib/etl/kpis'
import { diffGolden } from '../lib/etl/golden'
import { corteXlsxPath, oficinasXlsxPath } from '../lib/paths'

async function main() {
  const snapshot = await parseWorkbookFiles(corteXlsxPath(), oficinasXlsxPath())
  const header = computeHeaderKpis(snapshot)
  const funil = computeFunil(snapshot)
  const serie = computeSerieMensal(snapshot)
  const invariants = checkInvariants(snapshot)
  const golden = diffGolden(header, funil, serie)

  console.log(JSON.stringify({ header, funil, serie, invariants, golden }, null, 2))
  console.log('linhas corte', snapshot.corteLinhas.length)
  console.log('costura', snapshot.costura.length)
  console.log('revisao', snapshot.revisao.length)
  console.log('oficinas', snapshot.oficinas.length)
  console.log('qualidade', snapshot.qualidade.length)

    if (invariants.length || golden.length) {
      process.exitCode = 1
    }
    if (golden.length === 0 && invariants.length === 0) {
      console.log('KPIs alinhados ao snapshot dourado.')
    }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
