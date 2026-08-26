import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { MonthlyAreaChart } from '@/components/monthly-area-chart'
import { FilterBar } from '@/components/filter-bar'
import { getCorteBreakdown, getFilterOptions } from '@/data/dashboard'
import {
  MONTH_LABELS,
  formatDate,
  formatInt,
  formatMeters,
  formatTecido,
} from '@/lib/format'
import { parseFilters } from '@/lib/filters'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Corte' }

export default async function CortePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const filters = parseFilters(params)
  const [corte, options] = await Promise.all([
    getCorteBreakdown(filters),
    getFilterOptions(),
  ])

  return (
    <PageShell
      title="Corte"
      description="Volume em peça e pedido. Agosto explode linha de tecido: não use contagem de linha. Consumo e baixa de tecido ficam na aba Tecidos."
    >
      <FilterBar
        pathname="/corte"
        values={filters}
        options={options}
        fields={['mes', 'canal', 'cliente', 'responsavel', 'q']}
      />

      <KpiGrid columns={5}>
        <KpiCard
          label="Pedidos"
          value={formatInt(corte.resumo.pedidos)}
          hint="Nº pedido distinto no recorte"
          tone="indigo"
        />
        <KpiCard
          label="Ordens de corte"
          value={formatInt(corte.resumo.ocs)}
          hint={`${formatInt(corte.resumo.pedidos)} pedidos geraram estas OCs`}
          tone="teal"
        />
        <KpiCard
          label="Peças cortadas"
          value={formatInt(corte.resumo.pecas)}
          tone="amber"
        />
        <KpiCard
          label="WIP"
          value={`${formatInt(corte.resumo.wipPedidos)} / ${formatInt(corte.resumo.wipPecas)}`}
          hint="Pedidos vigentes / peças EM PRODUÇÃO"
          alert={corte.resumo.wipPedidos > 0}
        />
        <KpiCard
          label="Aguardando tecido"
          value={`${formatInt(corte.resumo.tecidoPedidos)} / ${formatInt(corte.resumo.tecidoPecas)}`}
          hint={`${formatMeters(corte.resumo.tecidoMetros)} com status AGUARDANDO TECIDO`}
          alert={corte.resumo.tecidoPedidos > 0}
        />
      </KpiGrid>

      <MonthlyAreaChart
        title="Peças por mês"
        description="Volume do Corte no recorte, mês a mês."
        labels={corte.porMes.map((row) => MONTH_LABELS[row.nome - 1])}
        series={[
          {
            key: 'pecas',
            label: 'Peças',
            color: 'var(--chart-1)',
            values: corte.porMes.map((row) => row.pecas),
          },
        ]}
      />

      <div className="grid min-w-0 gap-[var(--page-gap)] lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">EM PRODUÇÃO</h2>
          <SimpleTable
            columns={[
              { key: 'pedido', label: 'Pedido' },
              { key: 'data', label: 'Data' },
              { key: 'cliente', label: 'Cliente' },
              { key: 'pecas', label: 'Peças', numeric: true },
              { key: 'responsavel', label: 'Responsável' },
            ]}
            rows={corte.wip.map((row) => ({
              pedido: row.pedidoNorm,
              data: formatDate(row.data),
              cliente: row.cliente,
              pecas: formatInt(row.pecas),
              responsavel: row.responsavel,
            }))}
            empty="Nenhum pedido em produção neste recorte"
          />
        </section>
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">AGUARDANDO TECIDO</h2>
          <p className="text-xs text-muted-foreground">
            Produção parada no Corte por falta de tecido: pedido, tecido, metros e peças.
          </p>
          <SimpleTable
            columns={[
              { key: 'pedido', label: 'Pedido' },
              { key: 'data', label: 'Data' },
              { key: 'cliente', label: 'Cliente' },
              { key: 'tecido', label: 'Tecido', wrap: true },
              { key: 'metros', label: 'Metros', numeric: true },
              { key: 'pecas', label: 'Peças', numeric: true },
              { key: 'responsavel', label: 'Responsável' },
            ]}
            rows={corte.tecido.map((row) => ({
              pedido: row.pedidoNorm,
              data: formatDate(row.data),
              cliente: row.cliente,
              tecido: formatTecido(row.codTecido, row.tecido),
              metros: formatMeters(row.metros, row.metros >= 10 ? 0 : 1),
              pecas: formatInt(row.pecas),
              responsavel: row.responsavel,
            }))}
            empty="Nenhum pedido aguardando tecido neste recorte"
          />
        </section>
      </div>

      <div className="grid min-w-0 gap-[var(--page-gap)] lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Por mês</h2>
          <SimpleTable
            columns={[
              { key: 'mes', label: 'Mês' },
              { key: 'pecas', label: 'Peças', numeric: true },
              { key: 'pedidos', label: 'Pedidos', numeric: true },
            ]}
            rows={corte.porMes.map((row) => ({
              mes: MONTH_LABELS[row.nome - 1],
              pecas: formatInt(row.pecas),
              pedidos: formatInt(row.pedidos),
            }))}
          />
        </section>
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Canal (FATURAMENTO)</h2>
          <SimpleTable
            columns={[
              { key: 'nome', label: 'Canal' },
              { key: 'pecas', label: 'Peças', numeric: true },
              { key: 'pedidos', label: 'Pedidos', numeric: true },
            ]}
            rows={corte.porCanal.map((row) => ({
              nome: row.nome,
              pecas: formatInt(row.pecas),
              pedidos: formatInt(row.pedidos),
            }))}
          />
        </section>
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Responsável</h2>
          <SimpleTable
            columns={[
              { key: 'nome', label: 'Responsável' },
              { key: 'pecas', label: 'Peças', numeric: true },
              { key: 'pedidos', label: 'Pedidos', numeric: true },
            ]}
            rows={corte.porResponsavel.map((row) => ({
              nome: row.nome,
              pecas: formatInt(row.pecas),
              pedidos: formatInt(row.pedidos),
            }))}
          />
        </section>
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Maiores clientes</h2>
          <SimpleTable
            columns={[
              { key: 'nome', label: 'Cliente' },
              { key: 'pecas', label: 'Peças', numeric: true },
              { key: 'pedidos', label: 'Pedidos', numeric: true },
            ]}
            rows={corte.porCliente.map((row) => ({
              nome: row.nome,
              pecas: formatInt(row.pecas),
              pedidos: formatInt(row.pedidos),
            }))}
          />
        </section>
      </div>
    </PageShell>
  )
}
