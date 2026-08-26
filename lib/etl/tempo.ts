import { isPlausibleBusinessDate, leadTimeDays, monthOf, quantile } from '@/lib/dates'

export const TEMPO_FAIXAS = [
  { key: '0-7', label: '0 a 7 dias', min: 0, max: 7 },
  { key: '8-15', label: '8 a 15 dias', min: 8, max: 15 },
  { key: '16-30', label: '16 a 30 dias', min: 16, max: 30 },
  { key: '31-45', label: '31 a 45 dias', min: 31, max: 45 },
  { key: '46-60', label: '46 a 60 dias', min: 46, max: 60 },
  { key: '61-90', label: '61 a 90 dias', min: 61, max: 90 },
  { key: '90+', label: 'Mais de 90 dias', min: 91, max: Infinity },
] as const

export type TempoPedidoRow = {
  pedidoNorm: string
  pecas: number
  canal: string | null
  cliente: string | null
  responsavel: string | null
  statusVigente: string | null
  data: string | null
  pcpProntas: string | null
  inicioCorte: string | null
  finalCorte: string | null
  dataRevisaoPrimeira: string | null
  dataRevisaoUltima: string | null
  pecasRevisao: number
  observacao: string | null
}

export type TempoMedido = TempoPedidoRow & {
  diasTotal: number
  diasPcpAteFinal: number | null
  diasFinalAteRevisao: number | null
  diasAtePrimeiraRevisao: number | null
}

export type TempoFaixa = {
  key: string
  label: string
  pedidos: number
  pecas: number
}

export type TempoNamed = {
  nome: string
  pedidos: number
  pecas: number
  mediaDias: number
  medianaDias: number
}

export type TempoMensal = {
  mes: number
  pedidos: number
  pecas: number
  mediaDias: number
}

function round1(value: number) {
  return Math.round(value * 10) / 10
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const soma = sorted.reduce((sum, value) => sum + value, 0)
  return {
    n: sorted.length,
    media: sorted.length ? round1(soma / sorted.length) : null,
    mediana: sorted.length ? round1(quantile(sorted, 0.5)!) : null,
    p90: sorted.length ? round1(quantile(sorted, 0.9)!) : null,
    min: sorted.length ? round1(sorted[0]) : null,
    max: sorted.length ? round1(sorted[sorted.length - 1]) : null,
  }
}

function weightedMean(rows: { dias: number; pecas: number }[]) {
  const pecas = rows.reduce((sum, row) => sum + row.pecas, 0)
  if (!pecas) return null
  const soma = rows.reduce((sum, row) => sum + row.dias * row.pecas, 0)
  return round1(soma / pecas)
}

function namedBreakdown(
  rows: TempoMedido[],
  key: 'canal' | 'responsavel' | 'cliente',
  empty: string,
  limit?: number,
): TempoNamed[] {
  const groups = new Map<string, TempoMedido[]>()
  for (const row of rows) {
    const nome = row[key]?.trim() || empty
    const list = groups.get(nome) ?? []
    list.push(row)
    groups.set(nome, list)
  }
  const out = [...groups.entries()]
    .map(([nome, list]) => {
      const s = stats(list.map((row) => row.diasTotal))
      return {
        nome,
        pedidos: list.length,
        pecas: list.reduce((sum, row) => sum + row.pecas, 0),
        mediaDias: s.media ?? 0,
        medianaDias: s.mediana ?? 0,
      }
    })
    .sort((a, b) => b.pedidos - a.pedidos || b.mediaDias - a.mediaDias)
  return limit ? out.slice(0, limit) : out
}

export function analyzeTempoProducao(
  pedidos: TempoPedidoRow[],
  opts: { mes?: number; hoje: string },
) {
  const recorte = opts.mes
    ? pedidos.filter((row) => {
        const ancora = row.dataRevisaoUltima ?? row.pcpProntas ?? row.data
        return monthOf(ancora) === opts.mes
      })
    : pedidos

  const medidos: TempoMedido[] = []
  const inconsistentes: TempoMedido[] = []
  const pcpSemRevisao: (TempoPedidoRow & { diasAberto: number | null })[] = []
  const revisaoSemPcp: TempoPedidoRow[] = []
  const semDatas: TempoPedidoRow[] = []

  for (const row of recorte) {
    const diasTotal = leadTimeDays(row.pcpProntas, row.dataRevisaoUltima)
    const pcpOk = isPlausibleBusinessDate(row.pcpProntas)
    const revisaoOk = isPlausibleBusinessDate(row.dataRevisaoUltima)
    const finalOk = isPlausibleBusinessDate(row.finalCorte)
    if (pcpOk && revisaoOk && diasTotal != null) {
      const item: TempoMedido = {
        ...row,
        diasTotal,
        diasPcpAteFinal: finalOk
          ? leadTimeDays(row.pcpProntas, row.finalCorte)
          : null,
        diasFinalAteRevisao: finalOk
          ? leadTimeDays(row.finalCorte, row.dataRevisaoUltima)
          : null,
        diasAtePrimeiraRevisao: leadTimeDays(
          row.pcpProntas,
          row.dataRevisaoPrimeira,
        ),
      }
      if (diasTotal < 0) inconsistentes.push(item)
      else medidos.push(item)
      continue
    }
    if (pcpOk && !revisaoOk) {
      pcpSemRevisao.push({
        ...row,
        diasAberto: leadTimeDays(row.pcpProntas, opts.hoje),
      })
      continue
    }
    if (!pcpOk && revisaoOk) {
      revisaoSemPcp.push(row)
      continue
    }
    semDatas.push(row)
  }

  medidos.sort((a, b) => b.diasTotal - a.diasTotal)
  inconsistentes.sort((a, b) => a.diasTotal - b.diasTotal)
  pcpSemRevisao.sort(
    (a, b) => (b.diasAberto ?? -1) - (a.diasAberto ?? -1),
  )

  const totalStats = stats(medidos.map((row) => row.diasTotal))
  const etapaCorte = stats(
    medidos
      .map((row) => row.diasPcpAteFinal)
      .filter((value): value is number => value != null && value >= 0 && value <= 730),
  )
  const etapaPosCorte = stats(
    medidos
      .map((row) => row.diasFinalAteRevisao)
      .filter((value): value is number => value != null && value >= 0 && value <= 730),
  )

  const faixas: TempoFaixa[] = TEMPO_FAIXAS.map((faixa) => {
    const rows = medidos.filter(
      (row) => row.diasTotal >= faixa.min && row.diasTotal <= faixa.max,
    )
    return {
      key: faixa.key,
      label: faixa.label,
      pedidos: rows.length,
      pecas: rows.reduce((sum, row) => sum + row.pecas, 0),
    }
  })

  const porMesMap = new Map<number, TempoMedido[]>()
  for (const row of medidos) {
    const mes = monthOf(row.dataRevisaoUltima)
    if (!mes) continue
    const list = porMesMap.get(mes) ?? []
    list.push(row)
    porMesMap.set(mes, list)
  }
  const porMes: TempoMensal[] = [...porMesMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([mes, list]) => ({
      mes,
      pedidos: list.length,
      pecas: list.reduce((sum, row) => sum + row.pecas, 0),
      mediaDias: stats(list.map((row) => row.diasTotal)).media ?? 0,
    }))

  return {
    recorte: recorte.length,
    pecasRecorte: recorte.reduce((sum, row) => sum + row.pecas, 0),
    comPcp: recorte.filter((row) => isPlausibleBusinessDate(row.pcpProntas)).length,
    comRevisao: recorte.filter((row) =>
      isPlausibleBusinessDate(row.dataRevisaoUltima),
    ).length,
    medidos: medidos.length,
    pecasMedidas: medidos.reduce((sum, row) => sum + row.pecas, 0),
    inconsistentes: inconsistentes.length,
    pcpSemRevisao: pcpSemRevisao.length,
    revisaoSemPcp: revisaoSemPcp.length,
    semDatas: semDatas.length,
    mediaDias: totalStats.media,
    medianaDias: totalStats.mediana,
    p90Dias: totalStats.p90,
    minDias: totalStats.min,
    maxDias: totalStats.max,
    mediaPonderadaPecas: weightedMean(
      medidos.map((row) => ({ dias: row.diasTotal, pecas: row.pecas })),
    ),
    etapaCorte,
    etapaPosCorte,
    faixas,
    porMes,
    porCanal: namedBreakdown(medidos, 'canal', '(sem canal)'),
    porResponsavel: namedBreakdown(medidos, 'responsavel', '(sem responsável)'),
    porCliente: namedBreakdown(medidos, 'cliente', '(sem cliente)', 12),
    maisLentos: medidos.slice(0, 25),
    maisRapidos: [...medidos].sort((a, b) => a.diasTotal - b.diasTotal).slice(0, 15),
    abertos: pcpSemRevisao.slice(0, 40),
    semPcp: revisaoSemPcp.slice(0, 25),
    datasInvertidas: inconsistentes.slice(0, 25),
  }
}
