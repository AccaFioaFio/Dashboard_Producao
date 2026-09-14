import { existsSync } from 'node:fs'
import { parseWorkbookFiles } from '../lib/etl/snapshot'
import { computeFunil, computeHeaderKpis, computeSerieMensal, checkInvariants } from '../lib/etl/kpis'
import { diffGolden } from '../lib/etl/golden'
import {
  corteXlsxPath,
  estoqueXlsxPath,
  itensXlsxPath,
  oficinasXlsxPath,
  pedidosXlsxPath,
  signusXlsPath,
} from '../lib/paths'

async function main() {
  const pedidos = pedidosXlsxPath()
  const itens = itensXlsxPath()
  const snapshot = await parseWorkbookFiles(
    corteXlsxPath(),
    oficinasXlsxPath(),
    signusXlsPath(),
    estoqueXlsxPath(),
    existsSync(pedidos) ? pedidos : null,
    existsSync(itens) ? itens : null,
  )
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
  console.log('signus tecidos', snapshot.tecidosSignus.length)
  console.log('estoque tecidos', snapshot.tecidosEstoque.length)
  console.log('pedidos comerciais', snapshot.pedidosComerciais.length)
  console.log('itens pedido', snapshot.pedidosItens.length)
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
