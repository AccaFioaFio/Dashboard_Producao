import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { MonthlyAreaChart } from '@/components/monthly-area-chart'
import { RefreshForm } from '@/components/refresh-form'
import { getCorteBreakdown, getHeaderKpis } from '@/data/dashboard'
import {
  MONTH_LABELS,
  formatDate,
  formatInt,
  formatMeters,
  formatNumber,
  shortTecido,
} from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Corte' }

export default async function CortePage() {
  const [header, corte] = await Promise.all([
    getHeaderKpis(),
    getCorteBreakdown({}),
  ])

  const metrosConsumo = header?.metrosConsumo ?? 0
  const metrosEconomia = header?.metrosEconomia ?? 0
  const economiaPct =
    metrosConsumo > 0 ? (metrosEconomia / metrosConsumo) * 100 : 0

  return (
    <PageShell
      title="Corte"
      description="Volume em peça e pedido, consumo de tecido e blocos parados. Agosto explode linha de tecido: não use contagem de linha."
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
        <KpiCard
          label="Consumo de tecido"
          value={formatMeters(metrosConsumo)}
          hint="SUM de MTS / TECIDOS em 2026"
          tone="teal"
        />
        <KpiCard
          label="Economia de tecido"
          value={formatMeters(metrosEconomia)}
          hint={`${formatNumber(economiaPct, 1)}% do consumo (aproveitamento)`}
          tone="amber"
          progress={Math.min(100, Math.max(12, economiaPct * 12))}
        />
        <KpiCard
          label="Aguardando tecido"
          value={`${formatInt(header?.tecidoPedidos ?? 0)} / ${formatMeters(header?.tecidoMetros ?? 0)}`}
          hint={`${formatInt(header?.tecidoPecas ?? 0)} pçs com status AGUARDANDO TECIDO`}
          alert={(header?.tecidoPedidos ?? 0) > 0}
        />
      </div>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Aguardando tecido para produção</h2>
        <p className="text-xs text-muted-foreground">
          Só linhas com status AGUARDANDO TECIDO: pedido, tecido e metros parados.
        </p>
        <SimpleTable
          columns={[
            { key: 'pedido', label: 'Pedido' },
            { key: 'cliente', label: 'Cliente' },
            { key: 'tecido', label: 'Tecido' },
            { key: 'metros', label: 'Metros', numeric: true },
            { key: 'pecas', label: 'Peças', numeric: true },
            { key: 'status', label: 'Status' },
          ]}
          rows={corte.tecido.map((row) => ({
            pedido: row.pedidoNorm,
            cliente: row.cliente,
            tecido: `${row.codTecido ? `${row.codTecido} · ` : ''}${shortTecido(row.tecido)}`,
            metros: formatNumber(row.metros, row.metros >= 100 ? 0 : 1),
            pecas: formatInt(row.pecas),
            status: row.statusVigente ?? 'AGUARDANDO TECIDO',
          }))}
          empty="Nenhum pedido aguardando tecido"
        />
      </section>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Tecidos mais usados</h2>
        <p className="text-xs text-muted-foreground">
          Consumo 2026 agrupado pelo código do tecido. Economia vem da coluna ECONOMIA DE
          TECIDO.
        </p>
        <SimpleTable
          columns={[
            { key: 'tecido', label: 'Tecido' },
            { key: 'metros', label: 'Consumo', numeric: true },
            { key: 'share', label: '%', numeric: true },
            { key: 'economia', label: 'Economia', numeric: true },
            { key: 'pedidos', label: 'Pedidos', numeric: true },
          ]}
          rows={corte.porTecido.map((row) => ({
            tecido: `${row.cod !== '(sem código)' ? `${row.cod} · ` : ''}${shortTecido(row.nome)}`,
            metros: formatMeters(row.metros),
            share:
              metrosConsumo > 0
                ? `${formatNumber((row.metros / metrosConsumo) * 100, 1)}%`
                : '—',
            economia: formatMeters(row.economia, row.economia >= 10 ? 0 : 1),
            pedidos: formatInt(row.pedidos),
          }))}
          empty="Sem consumo de tecido na carga"
        />
      </section>

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
