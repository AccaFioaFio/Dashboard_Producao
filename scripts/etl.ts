import { existsSync } from 'node:fs'
import { loadLocalEnv } from '../lib/load-env'
import { refreshFromExcel } from '../lib/etl/refresh'
import {
  corteXlsxPath,
  estoqueXlsxPath,
  itensXlsxPath,
  oficinasXlsxPath,
  pedidosXlsxPath,
  signusXlsPath,
} from '../lib/paths'
import { computeFunil, computeHeaderKpis, computeSerieMensal, checkInvariants } from '../lib/etl/kpis'
import { diffGolden } from '../lib/etl/golden'
import { parseWorkbookFiles } from '../lib/etl/snapshot'

async function main() {
  loadLocalEnv()
  const mode = process.argv[2] ?? 'refresh'
  if (mode === 'golden') {
    const corte = corteXlsxPath()
    const oficinas = oficinasXlsxPath()
    const signus = signusXlsPath()
    const estoque = estoqueXlsxPath()
    const pedidos = pedidosXlsxPath()
    const itens = itensXlsxPath()
    if (
      !existsSync(corte) ||
      !existsSync(oficinas) ||
      !existsSync(signus) ||
      !existsSync(estoque)
    ) {
      throw new Error('Arquivos Excel não encontrados')
    }
    const snapshot = await parseWorkbookFiles(
      corte,
      oficinas,
      signus,
      estoque,
      existsSync(pedidos) ? pedidos : null,
      existsSync(itens) ? itens : null,
    )
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
  if (!result.ok) {
    console.log(JSON.stringify(result, null, 2))
    process.exitCode = 1
    return
  }
  const { publishSqliteToSupabase } = await import('../lib/etl/publish-supabase')
  const { isSupabaseWriteConfigured } = await import('../lib/supabase/admin')
  if (isSupabaseWriteConfigured()) {
    const published = await publishSqliteToSupabase()
    console.log(JSON.stringify({ ...result, supabase: published }, null, 2))
    if (!published.ok) process.exitCode = 1
    return
  }
  console.log(JSON.stringify({ ...result, supabase: { ok: false, skipped: true } }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
