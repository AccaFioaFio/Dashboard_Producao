import { formatDate, formatDays, formatInt } from '@/lib/format'
import { hintLines } from '@/lib/obs'
import type { TempoMedido, TempoPedidoRow } from '@/lib/etl/tempo'

function cabeçalho(row: TempoPedidoRow) {
  return [
    `Pedido ${row.pedidoNorm}`,
    row.cliente,
    row.canal,
    row.statusVigente,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function explainTempoCiclo(row: TempoMedido) {
  return hintLines(
    [
      cabeçalho(row),
      `PCP prontas ${formatDate(row.pcpProntas)} → final do corte ${formatDate(row.finalCorte)} (${formatDays(row.diasPcpAteFinal, 0)}) → Data produção ${formatDate(row.dataRevisaoUltima)} (${formatDays(row.diasFinalAteRevisao, 0)}).`,
      `Ciclo ${formatDays(row.diasTotal, 0)} · ${formatInt(row.pecas)} peças cortadas${row.pecasRevisao ? ` · ${formatInt(row.pecasRevisao)} revisadas` : ''}.`,
    ],
    row.observacao,
  )
}

export function explainTempoAberto(
  row: TempoPedidoRow & { diasAberto: number | null },
) {
  return hintLines(
    [
      cabeçalho(row),
      `PCP prontas em ${formatDate(row.pcpProntas)}. Ainda não cruzou com Data Produção na Revisão.`,
      `Aberto há ${formatDays(row.diasAberto, 0)} · ${formatInt(row.pecas)} peças · final do corte ${formatDate(row.finalCorte)}.`,
    ],
    row.observacao,
  )
}

export function explainTempoSemPcp(row: TempoPedidoRow) {
  return hintLines(
    [
      cabeçalho(row),
      `Tem Data Produção ${formatDate(row.dataRevisaoUltima)}, mas PCP prontas está vazia no Corte — o ciclo não entra na média.`,
      `${formatInt(row.pecas)} peças · final do corte ${formatDate(row.finalCorte)}.`,
    ],
    row.observacao,
  )
}

export function explainTempoInvertido(row: TempoMedido) {
  return hintLines(
    [
      cabeçalho(row),
      `Data Produção ${formatDate(row.dataRevisaoUltima)} é anterior a PCP prontas ${formatDate(row.pcpProntas)} (${formatDays(row.diasTotal, 0)}). Fica fora da média.`,
    ],
    row.observacao,
  )
}

export function explainFaixa(label: string, pedidos: number, pecas: number, share: string) {
  if (!pedidos) return `Nenhum pedido fechou em ${label.toLowerCase()} neste recorte.`
  return `${formatInt(pedidos)} pedido${pedidos === 1 ? '' : 's'} (${share}) fecharam em ${label.toLowerCase()}. ${formatInt(pecas)} peças neste prazo.`
}

export function explainGrupo(
  titulo: string,
  nome: string,
  pedidos: number,
  pecas: number,
  mediaDias: number,
  medianaDias: number,
) {
  return `${titulo} ${nome}: ${formatInt(pedidos)} pedidos, ${formatInt(pecas)} peças. Média ${formatDays(mediaDias)} · mediana ${formatDays(medianaDias)} de PCP prontas até a Revisão.`
}

export function explainMes(mes: string, pedidos: number, pecas: number, mediaDias: number) {
  return `${mes}: ${formatInt(pedidos)} pedidos fechados na Revisão, ${formatInt(pecas)} peças. Média ${formatDays(mediaDias)} de PCP prontas até a Data Produção.`
}
