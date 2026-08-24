import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { MonthlyAreaChart } from '@/components/monthly-area-chart'
import { RefreshForm } from '@/components/refresh-form'
import { getHeaderKpis, getOficinas } from '@/data/dashboard'
import { MONTH_LABELS, formatDate, formatInt, formatMoney, formatNumber } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Oficinas' }

export default async function OficinasPage() {
  const [header, oficinas] = await Promise.all([getHeaderKpis(), getOficinas()])
  const retorno =
    oficinas.enviadas > 0 ? (oficinas.retornadas / oficinas.enviadas) * 100 : 0

  return (
    <PageShell
      title="Oficinas"
      description="Somente lotes com Data Envio em 2026 e oficina preenchida."
      actions={<RefreshForm />}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Valor Total Pago"
          value={formatMoney(oficinas.sla.valor)}
          hint="Soma do valor lançado por lote em 2026"
          tone="teal"
        />
        <KpiCard
          label="Peças Pendentes"
          value={formatInt(header?.oficinasPendentes ?? 0)}
          warning={(header?.oficinasPendentes ?? 0) > 0}
        />
        <KpiCard
          label="Peças com Defeitos"
          value={formatInt(header?.oficinasDefeitos ?? 0)}
          alert={(header?.oficinasDefeitos ?? 0) > 0}
        />
        <KpiCard
          label="% de Retorno"
          value={`${formatNumber(retorno, 1)}%`}
          hint={`${formatInt(oficinas.retornadas)} de ${formatInt(oficinas.enviadas)} enviadas`}
        />
      </div>

      <MonthlyAreaChart
        title="Envios por mês"
        description="Peças enviadas e pendentes, mês a mês."
        labels={oficinas.porMes.map((row) => MONTH_LABELS[row.mes - 1])}
        series={[
          {
            key: 'enviadas',
            label: 'Enviadas',
            color: 'var(--chart-1)',
            values: oficinas.porMes.map((row) => row.enviadas),
          },
          {
            key: 'pendentes',
            label: 'Pendentes',
            color: 'var(--chart-4)',
            values: oficinas.porMes.map((row) => row.pendentes),
          },
        ]}
      />

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Pendente por oficina</h2>
        <SimpleTable
          columns={[
            { key: 'nome', label: 'Oficina' },
            { key: 'pendentes', label: 'Pendentes', numeric: true },
            { key: 'enviadas', label: 'Enviadas', numeric: true },
            { key: 'retornadas', label: 'Retornadas', numeric: true },
            { key: 'defeitos', label: 'Defeitos', numeric: true },
            { key: 'valor', label: 'Valor pago', numeric: true },
          ]}
          rows={oficinas.ranking.map((row) => ({
            nome: row.nome,
            pendentes: formatInt(row.pecas),
            enviadas: formatInt(row.enviadas),
            retornadas: formatInt(row.retornadas),
            defeitos: formatInt(row.defeitos),
            valor: formatMoney(row.valor),
            alert: row.defeitos > 0,
            warning: row.pecas > 0 && row.defeitos === 0,
          }))}
        />
      </section>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Enviadas sem retorno e sem pendente</h2>
        <SimpleTable
          columns={[
            { key: 'oficina', label: 'Oficina' },
            { key: 'pedido', label: 'Pedido' },
            { key: 'enviadas', label: 'Enviadas', numeric: true },
            { key: 'data', label: 'Envio' },
          ]}
          rows={oficinas.semRetorno.map((row) => ({
            oficina: row.oficina,
            pedido: row.pedido,
            enviadas: formatInt(row.enviadas),
            data: formatDate(row.data),
          }))}
          empty="Nenhum lote nessa quebra"
        />
      </section>
    </PageShell>
  )
}
