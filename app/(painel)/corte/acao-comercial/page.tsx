import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { AcaoSaldoLista } from '@/components/acao-saldo-lista'
import { MonthlyAreaChart } from '@/components/monthly-area-chart'
import { DonutChart } from '@/components/donut-chart'
import { FilterBar } from '@/components/filter-bar'
import { CorteVoltarButton } from '@/components/corte-acao-nav'
import { getAcaoComercial, getFilterOptions } from '@/data/dashboard'
import { MONTH_LABELS, formatInt, formatNumber } from '@/lib/format'
import { parseFilters } from '@/lib/filters'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Ação Comercial' }

export default async function AcaoComercialPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const filters = parseFilters(await searchParams)
  const [acao, options] = await Promise.all([
    getAcaoComercial(filters),
    getFilterOptions(),
  ])
  const pct = acao.pctAproveitamento

  return (
    <PageShell
      title="Ação Comercial"
      description="Sobra de corte em TAB_ENTRADA menos peças já aproveitadas em TAB_SAIDA. Saldo = cortadas − aproveitadas."
      actions={<CorteVoltarButton filters={filters} />}
    >
      <div className="grid min-w-0 items-stretch gap-[var(--page-gap)] lg:grid-cols-2">
        <FilterBar
          className="min-w-0"
          pathname="/corte/acao-comercial"
          values={filters}
          options={options}
          fields={['mes', 'q']}
        />
        <div className="min-w-0">
          <DonutChart
            title="Aproveitamento e saldo"
            slices={[
              {
                key: 'aproveitado',
                label: 'Aproveitamento',
                value: acao.pecasAproveitadas,
                color: 'var(--chart-2)',
              },
              {
                key: 'saldo',
                label: 'Saldo',
                value: Math.max(0, acao.saldo),
                color: 'var(--chart-3)',
              },
            ]}
          />
        </div>
      </div>

      {!acao.loaded ? (
        <p className="card-surface px-4 py-3 text-xs text-muted-foreground">
          A aba Aproveitamento ainda não entrou nesta carga. Atualize os dados em
          Configurações.
        </p>
      ) : null}

      <KpiGrid columns={4}>
        <KpiCard
          label="Peças cortadas (entrada)"
          value={formatInt(acao.pecasCortadas)}
          hint="QTD CORTADO em TAB_ENTRADA"
          detail="Ação comercial · soma de QTD CORTADO na TAB_ENTRADA."
          tone="amber"
        />
        <KpiCard
          label="Peças aproveitadas (saída)"
          value={formatInt(acao.pecasAproveitadas)}
          hint="QTD APROVEITAMENTO em TAB_SAIDA"
          detail="Ação comercial · soma de QTD APROVEITAMENTO na TAB_SAIDA."
          tone="teal"
        />
        <KpiCard
          label="Saldo cortado − aproveitado"
          value={formatInt(acao.saldo)}
          hint="Peças cortadas menos aproveitadas"
          detail="Ação comercial · cortadas − aproveitadas no recorte."
          tone="indigo"
          alert={acao.saldo < 0}
        />
        <KpiCard
          label="Percentual de aproveitamento"
          value={`${formatNumber(pct, 1)}%`}
          hint={
            acao.pecasCortadas > 0
              ? `${formatInt(acao.pecasAproveitadas)} de ${formatInt(acao.pecasCortadas)} peças cortadas`
              : 'Sem entrada no recorte'
          }
          detail="Ação comercial · peças aproveitadas ÷ peças cortadas."
          tone="magenta"
          progress={Math.max(0, Math.min(100, pct))}
        />
      </KpiGrid>

      <div className="grid min-w-0 gap-[var(--page-gap)] lg:grid-cols-2">
        <MonthlyAreaChart
          title="Peças cortadas"
          description="QTD CORTADO de TAB_ENTRADA, mês a mês."
          labels={acao.porMes.map((row) => MONTH_LABELS[row.mes - 1])}
          series={[
            {
              key: 'cortadas',
              label: 'Cortadas',
              color: 'var(--chart-3)',
              values: acao.porMes.map((row) => row.cortadas),
            },
          ]}
        />
        <MonthlyAreaChart
          title="Peças já aproveitadas"
          description="QTD APROVEITAMENTO de TAB_SAIDA, mês a mês."
          labels={acao.porMes.map((row) => MONTH_LABELS[row.mes - 1])}
          series={[
            {
              key: 'aproveitadas',
              label: 'Aproveitadas',
              color: 'var(--chart-2)',
              values: acao.porMes.map((row) => row.aproveitadas),
            },
          ]}
        />
      </div>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Saldo por produto</h2>
        <p className="text-xs text-muted-foreground">
          Cada linha junta o mesmo código e a mesma descrição. O botão + abre
          modelo, origem (onde o corte nasce) e aproveitamento (pedido em que a
          peça foi usada). Saldo é o que resta depois da linha, sem ficar
          negativo. Os filtros de modelo e descrição valem só para esta lista.
        </p>
        <AcaoSaldoLista produtos={acao.produtos} />
      </section>
    </PageShell>
  )
}
