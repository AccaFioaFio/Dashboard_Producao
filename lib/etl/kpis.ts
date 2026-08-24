import { monthOf } from '@/lib/dates'
import { fold, isProducaoOrigem } from '@/lib/keys'
import type {
  FunilKpis,
  HeaderKpis,
  SerieMensal,
  Snapshot,
} from '@/lib/etl/types'

function round1(value: number) {
  return Math.round(value * 1000) / 1000
}

export function computeHeaderKpis(snapshot: Snapshot): HeaderKpis {
  const pecasCortadas = snapshot.cortePedidos.reduce(
    (sum, row) => sum + row.pecas,
    0,
  )
  const wipLinhas = snapshot.corteLinhas.filter(
    (row) => row.status === 'EM PRODUÇÃO',
  )
  const tecidoLinhas = snapshot.corteLinhas.filter(
    (row) => row.status === 'AGUARDANDO TECIDO',
  )
  const costuraProd = snapshot.costura.filter((row) =>
    isProducaoOrigem(row.origem),
  )

  return {
    pecasCortadas: round1(pecasCortadas),
    pedidosCorte: snapshot.cortePedidos.length,
    pecasCosturaProd: round1(
      costuraProd.reduce((sum, row) => sum + row.qtdPecas, 0),
    ),
    pecasRevisao: round1(
      snapshot.revisao.reduce((sum, row) => sum + row.qtdPecas, 0),
    ),
    wipPedidos: snapshot.cortePedidos.filter(
      (row) => row.statusVigente === 'EM PRODUÇÃO',
    ).length,
    wipPecas: round1(wipLinhas.reduce((sum, row) => sum + (row.qtdPecas ?? 0), 0)),
    tecidoPedidos: snapshot.cortePedidos.filter(
      (row) => row.statusVigente === 'AGUARDANDO TECIDO',
    ).length,
    tecidoPecas: round1(
      tecidoLinhas.reduce((sum, row) => sum + (row.qtdPecas ?? 0), 0),
    ),
    oficinasPendentes: round1(
      snapshot.oficinas.reduce((sum, row) => sum + row.qtdPendentes, 0),
    ),
    oficinasDefeitos: round1(
      snapshot.oficinas.reduce((sum, row) => sum + row.qtdDefeitos, 0),
    ),
  }
}

export function computeFunil(snapshot: Snapshot): FunilKpis {
  const corte = new Set(snapshot.cortePedidos.map((row) => row.pedidoNorm))
  const costura = new Set(
    snapshot.costura
      .filter((row) => isProducaoOrigem(row.origem))
      .map((row) => row.pedidoNorm),
  )
  const revisao = new Set(snapshot.revisao.map((row) => row.pedidoNorm))
  const oficinas = new Set(
    snapshot.oficinas
      .map((row) => row.pedidoNorm)
      .filter((value): value is string => Boolean(value)),
  )

  let comCostura = 0
  let comRevisao = 0
  for (const pedido of corte) {
    if (costura.has(pedido)) comCostura += 1
    if (revisao.has(pedido)) comRevisao += 1
  }

  let costuraSemCorte = 0
  for (const pedido of costura) {
    if (!corte.has(pedido)) costuraSemCorte += 1
  }
  let revisaoSemCorte = 0
  for (const pedido of revisao) {
    if (!corte.has(pedido)) revisaoSemCorte += 1
  }
  let oficinasNoCorte = 0
  for (const pedido of oficinas) {
    if (corte.has(pedido)) oficinasNoCorte += 1
  }

  return {
    corte: corte.size,
    comCostura,
    semCostura: corte.size - comCostura,
    comRevisao,
    semRevisao: corte.size - comRevisao,
    costuraSemCorte,
    revisaoSemCorte,
    oficinas: oficinas.size,
    oficinasNoCorte,
    oficinasOrfas: oficinas.size - oficinasNoCorte,
  }
}

export function computeSerieMensal(snapshot: Snapshot): SerieMensal[] {
  const months = Array.from({ length: 12 }, (_, index) => ({
    mes: index + 1,
    cortadas: 0,
    costura: 0,
    revisao: 0,
  }))

  for (const row of snapshot.corteLinhas) {
    const mes = monthOf(row.data)
    if (mes) months[mes - 1].cortadas += row.qtdPecas ?? 0
  }
  for (const row of snapshot.costura) {
    if (!isProducaoOrigem(row.origem)) continue
    const mes = monthOf(row.dataProducao)
    if (mes) months[mes - 1].costura += row.qtdPecas
  }
  for (const row of snapshot.revisao) {
    const mes = monthOf(row.dataProducao)
    if (mes) months[mes - 1].revisao += row.qtdPecas
  }

  return months
    .filter((row) => row.cortadas || row.costura || row.revisao)
    .map((row) => ({
      mes: row.mes,
      cortadas: round1(row.cortadas),
      costura: round1(row.costura),
      revisao: round1(row.revisao),
    }))
}

export function checkInvariants(snapshot: Snapshot) {
  const errors: string[] = []
  const years = new Set<string>()
  for (const row of snapshot.cortePedidos) {
    if (row.data) years.add(row.data.slice(0, 4))
  }
  for (const row of snapshot.costura) years.add(row.dataProducao.slice(0, 4))
  for (const row of snapshot.revisao) years.add(row.dataProducao.slice(0, 4))
  for (const row of snapshot.oficinas) years.add(row.dataEnvio.slice(0, 4))
  if ([...years].some((year) => year !== '2026')) {
    errors.push(`Fatos com ano fora de 2026: ${[...years].join(', ')}`)
  }
  if (snapshot.costura.some((row) => !row.origem)) {
    errors.push('Costura com origem vazia')
  }
  if (snapshot.revisao.some((row) => !row.pedidoNorm)) {
    errors.push('Revisão limpa com pedido vazio')
  }
  if (
    snapshot.revisao.some(
      (row) => Number(row.pedidoNorm) === row.qtdPecas && row.qtdPecas > 1000,
    )
  ) {
    errors.push('Revisão ainda contém Qtd = número do pedido')
  }
  const linhas = snapshot.corteLinhas.length
  const pecas = snapshot.cortePedidos.reduce((sum, row) => sum + row.pecas, 0)
  if (linhas > 0 && pecas === linhas) {
    errors.push('Peças de corte iguais à contagem de linhas (COUNTROWS)')
  }
  return errors
}

export function isLilica(nome: string) {
  return fold(nome) === 'LILICA'
}
