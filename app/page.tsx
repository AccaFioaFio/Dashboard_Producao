import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { FunnelCard } from '@/components/funnel-card'
import { MonthlyAreaChart } from '@/components/monthly-area-chart'
import { AlertsBanner } from '@/components/alerts-banner'
import { SectionPlaceholder } from '@/components/section-placeholder'
import { LayoutDashboard } from 'lucide-react'
import {
  getAlertas,
  getFunil,
  getHeaderKpis,
  getLatestCarga,
  getSerieMensal,
} from '@/data/dashboard'
import { formatDateTime, formatInt, formatMeters, MONTH_LABELS } from '@/lib/format'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Visão Geral' }

export default async function Page() {
  const [header, funil, serie, alertas, carga] = await Promise.all([
    getHeaderKpis(),
    getFunil(),
    getSerieMensal(),
    getAlertas(),
    getLatestCarga(),
  ])

  if (!header || !funil) {
    return (
      <PageShell
        title="Visão Geral"
        description="Dashboard de produção 2026."
      >
        <SectionPlaceholder
          icon={LayoutDashboard}
          title="Nenhuma carga 2026"
          description="O publicador (pnpm carga:watch) lê as planilhas neste PC e grava a carga. Recarregue a página depois da publicação."
        />
      </PageShell>
    )
  }

  return (
    <PageShell
      title="Visão Geral"
      description={`Somente 2026. Última leitura ${formatDateTime(carga?.lidaEm)}.`}
    >
      <AlertsBanner
        wipPedidos={header.wipPedidos}
        wipPecas={header.wipPecas}
        tecidoPedidos={header.tecidoPedidos}
        tecidoPecas={header.tecidoPecas}
        tecidoMetros={header.tecidoMetros}
        oficinasPendentes={header.oficinasPendentes}
        ultimaRevisao={alertas.ultimaRevisao}
        ultimoEnvio={alertas.ultimoEnvio}
      />

      <KpiGrid>
        <KpiCard
          label="Peças cortadas"
          value={formatInt(header.pecasCortadas)}
          hint="SUM da quantidade, não contagem de linha"
          tone="indigo"
          progress={100}
        />
        <KpiCard
          label="Pedidos no Corte"
          value={formatInt(header.pedidosCorte)}
          hint="Nº pedido distinto; * herda o cabeçalho"
          tone="teal"
          progress={Math.min(100, (header.pedidosCorte / Math.max(header.pedidosCorte, 1)) * 72)}
        />
        <KpiCard
          label="Costura Produção"
          value={formatInt(header.pecasCosturaProd)}
          hint="Origem = Produção (funil)"
          tone="amber"
          progress={
            (header.pecasCosturaProd / Math.max(header.pecasCortadas, header.pecasCosturaProd, 1)) *
            100
          }
        />
        <KpiCard
          label="Revisão limpa"
          value={formatInt(header.pecasRevisao)}
          hint="Sem total da tabela e sem Qtd = pedido"
          tone="magenta"
          progress={
            (header.pecasRevisao / Math.max(header.pecasCortadas, header.pecasRevisao, 1)) * 100
          }
        />
        <KpiCard
          label="WIP Corte"
          value={`${formatInt(header.wipPedidos)} / ${formatInt(header.wipPecas)}`}
          hint="Pedidos vigentes / peças no status EM PRODUÇÃO"
          alert={header.wipPedidos > 0}
          tone="indigo"
          progress={header.wipPedidos > 0 ? 55 : 12}
        />
        <KpiCard
          label="Aguardando tecido"
          value={`${formatInt(header.tecidoPedidos)} / ${formatMeters(header.tecidoMetros)}`}
          hint={`${formatInt(header.tecidoPecas)} pçs · detalhes na aba Tecidos`}
          alert={header.tecidoPedidos > 0}
          tone="amber"
          progress={header.tecidoPedidos > 0 ? 48 : 10}
        />
        <KpiCard
          label="Oficinas pendentes"
          value={formatInt(header.oficinasPendentes)}
          hint={`Defeitos ${formatInt(header.oficinasDefeitos)}`}
          alert={header.oficinasPendentes > 0}
          tone="magenta"
          progress={Math.min(100, header.oficinasPendentes > 0 ? 64 : 8)}
        />
        <KpiCard
          label="Hoje"
          value={`${formatInt(alertas.costuraHoje)} / ${formatInt(alertas.revisaoHoje)}`}
          hint="Costura Produção / Revisão do dia"
          tone="teal"
          progress={alertas.costuraHoje + alertas.revisaoHoje > 0 ? 70 : 15}
        />
      </KpiGrid>

      <div className="grid min-w-0 gap-[var(--page-gap)]">
        <MonthlyAreaChart
          title="Corte"
          description="Peças cortadas em 2026, mês a mês."
          labels={serie.map((row) => MONTH_LABELS[row.mes - 1])}
          series={[
            {
              key: 'corte',
              label: 'Corte',
              color: 'var(--chart-1)',
              values: serie.map((row) => row.cortadas),
            },
          ]}
        />
        <MonthlyAreaChart
          title="Costuras"
          description="Origem = Produção. Acompanhamento, não fechamento."
          labels={serie.map((row) => MONTH_LABELS[row.mes - 1])}
          series={[
            {
              key: 'costura',
              label: 'Produção',
              color: 'var(--chart-2)',
              values: serie.map((row) => row.costura),
            },
          ]}
        />
        <MonthlyAreaChart
          title="Revisão"
          description="Revisão limpa, mês a mês."
          labels={serie.map((row) => MONTH_LABELS[row.mes - 1])}
          series={[
            {
              key: 'revisao',
              label: 'Revisão',
              color: 'var(--chart-3)',
              values: serie.map((row) => row.revisao),
            },
          ]}
        />
      </div>

      <FunnelCard funil={funil} />
    </PageShell>
  )
}
