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
import { getSerieDiaria } from '@/data/pedidos'
import { formatDate, formatDateTime, formatInt, formatMeters, MONTH_LABELS } from '@/lib/format'
import { pedidosFatiaHref } from '@/lib/funil'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Visão Geral' }

export default async function Page() {
  const [header, funil, serie, diaria, alertas, carga] = await Promise.all([
    getHeaderKpis(),
    getFunil(),
    getSerieMensal(),
    getSerieDiaria(30),
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
          description="Neste PC: sinc + botão Atualização de dados (publica no Supabase). No site online a carga vem da última publicação."
        />
      </PageShell>
    )
  }

  const costuraShare =
    (header.pecasCosturaProd / Math.max(header.pecasCortadas, header.pecasCosturaProd, 1)) * 100

  return (
    <PageShell
      title="Visão Geral"
      description={`Somente 2026. Última leitura ${formatDateTime(carga?.lidaEm)}. Clique nos alertas, no funil ou nos cartões parados para a lista de pedidos.`}
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
          label="Peças cortadas no ano"
          value={formatInt(header.pecasCortadas)}
          hint="Soma das quantidades no Corte"
          detail="Planilha de Corte · SUM da quantidade (não é contagem de linha)."
          tone="indigo"
          href="/corte"
        />
        <KpiCard
          label="Total de Pedidos"
          value={formatInt(header.pedidosCorte)}
          hint="Números de pedido distintos"
          detail="Corte 2026 · nº pedido distinto (* herda o cabeçalho da OC)."
          tone="teal"
          href={pedidosFatiaHref('corte')}
        />
        <KpiCard
          label="Peças na Costura Produção"
          value={formatInt(header.pecasCosturaProd)}
          hint="Origem = Produção"
          detail="Relatório de Costura · só lançamentos com Origem = Produção (funil)."
          tone="amber"
          progress={costuraShare}
          href="/costuras"
        />
        <KpiCard
          label="Peças na Revisão limpa"
          value={formatInt(header.pecasRevisao)}
          hint="Sem total da tabela e sem Qtd = pedido"
          detail="Relatório de Revisão · peças limpas. Não fecha contra o corte do mês."
          tone="magenta"
          href="/revisao"
        />
        <KpiCard
          label="Em produção no Corte"
          value={`${formatInt(header.wipPedidos)} / ${formatInt(header.wipPecas)}`}
          hint="Ordens / peças no status EM PRODUÇÃO"
          detail="Cabeçalhos de OC com status EM PRODUÇÃO. O mesmo pedido pode ter mais de uma OC."
          alert={header.wipPedidos > 0}
          tone="indigo"
          href={pedidosFatiaHref('wip')}
        />
        <KpiCard
          label="Aguardando tecido"
          value={`${formatInt(header.tecidoPedidos)} / ${formatMeters(header.tecidoMetros)}`}
          hint={`${formatInt(header.tecidoPecas)} peças · detalhes em Tecidos`}
          detail="Ordens de corte com status AGUARDANDO TECIDO (pedidos / metros)."
          alert={header.tecidoPedidos > 0}
          tone="amber"
          href={pedidosFatiaHref('aguardandoTecido')}
        />
        <KpiCard
          label="Peças pendentes em oficina"
          value={formatInt(header.oficinasPendentes)}
          hint={`Defeitos ${formatInt(header.oficinasDefeitos)}`}
          detail="Planilha de Oficinas · peças enviadas ainda sem retorno."
          alert={header.oficinasPendentes > 0}
          tone="magenta"
          href="/oficinas"
        />
        <KpiCard
          label="Produção de hoje"
          value={`${formatInt(alertas.costuraHoje)} / ${formatInt(alertas.revisaoHoje)}`}
          hint="Costura Produção / Revisão do dia"
          detail="Lançamentos do dia corrente em Costura (Produção) e Revisão."
          tone="teal"
          href="/costuras"
        />
      </KpiGrid>

      <div className="grid min-w-0 gap-[var(--page-gap)] xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.9fr)]">
        <div className="grid min-w-0 gap-[var(--page-gap)]">
          <MonthlyAreaChart
            title="Últimos 30 dias"
            description="Peças por dia. Acompanhamento, não fechamento do funil."
            labels={diaria.map((row) => formatDate(row.data).slice(0, 5))}
            series={[
              {
                key: 'corte',
                label: 'Corte',
                color: 'var(--chart-1)',
                values: diaria.map((row) => row.cortadas),
              },
              {
                key: 'costura',
                label: 'Costura Prod.',
                color: 'var(--chart-2)',
                values: diaria.map((row) => row.costura),
              },
              {
                key: 'revisao',
                label: 'Revisão',
                color: 'var(--chart-3)',
                values: diaria.map((row) => row.revisao),
              },
            ]}
          />
          <MonthlyAreaChart
            title="2026 mês a mês"
            description="As três etapas no mesmo gráfico. Revisão pode incluir pedido cortado em 2025."
            labels={serie.map((row) => MONTH_LABELS[row.mes - 1])}
            series={[
              {
                key: 'corte',
                label: 'Corte',
                color: 'var(--chart-1)',
                values: serie.map((row) => row.cortadas),
              },
              {
                key: 'costura',
                label: 'Costura Prod.',
                color: 'var(--chart-2)',
                values: serie.map((row) => row.costura),
              },
              {
                key: 'revisao',
                label: 'Revisão',
                color: 'var(--chart-3)',
                values: serie.map((row) => row.revisao),
              },
            ]}
          />
        </div>
        <FunnelCard
          funil={funil}
          wipPedidos={header.wipPedidos}
          tecidoPedidos={header.tecidoPedidos}
        />
      </div>
    </PageShell>
  )
}
