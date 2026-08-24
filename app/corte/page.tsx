import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { MonthlyAreaChart } from '@/components/monthly-area-chart'
import { RefreshForm } from '@/components/refresh-form'
import { getCorteBreakdown, getHeaderKpis } from '@/data/dashboard'
import { MONTH_LABELS, formatDate, formatInt } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Corte' }

export default async function CortePage() {
  const [header, corte] = await Promise.all([
    getHeaderKpis(),
    getCorteBreakdown({}),
  ])

  return (
    <PageShell
      title="Corte"
      description="Volume em peça e pedido. Agosto explode linha de tecido: não use contagem de linha. Consumo e baixa de tecido ficam na aba Tecidos."
      actions={<RefreshForm />}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Peças cortadas"
          value={formatInt(header?.pecasCortadas ?? 0)}
        />
        <KpiCard
          label="Pedidos"
          value={formatInt(header?.pedidosCorte ?? 0)}
        />
        <KpiCard
          label="WIP"
          value={`${formatInt(header?.wipPedidos ?? 0)} / ${formatInt(header?.wipPecas ?? 0)}`}
          hint="Pedidos vigentes / peças EM PRODUÇÃO"
        />
      </div>

      <MonthlyAreaChart
        title="Peças por mês"
        description="Volume do Corte em 2026, mês a mês."
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

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
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
          empty="Nenhum pedido em produção"
        />
      </section>
    </PageShell>
  )
}
