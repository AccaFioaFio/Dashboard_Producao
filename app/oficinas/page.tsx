import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { MonthlyAreaChart } from '@/components/monthly-area-chart'
import { FilterBar } from '@/components/filter-bar'
import { getFilterOptions, getOficinas } from '@/data/dashboard'
import { MONTH_LABELS, formatDate, formatDays, formatInt, formatMoney, formatMoneyCompact, formatNumber } from '@/lib/format'
import { parseFilters } from '@/lib/filters'
import { PedidoQueue } from '@/components/pedido-queue'
import { explainOficinaRanking, explainOficinaSemRetorno } from '@/lib/table-explain'
import { AGING_FAIXAS } from '@/lib/pedido'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Oficinas' }

export default async function OficinasPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const filters = parseFilters(await searchParams)
  const [oficinas, options] = await Promise.all([
    getOficinas(filters),
    getFilterOptions(),
  ])
  const retorno =
    oficinas.enviadas > 0 ? (oficinas.retornadas / oficinas.enviadas) * 100 : 0

  return (
    <PageShell
      title="Oficinas"
      description="Somente lotes com Data Envio em 2026 e oficina preenchida."
    >
      <FilterBar
        pathname="/oficinas"
        values={filters}
        options={options}
        fields={['mes', 'oficina', 'q']}
      />

      <KpiGrid>
        <KpiCard
          label="Valor Total Pago"
          value={formatMoneyCompact(oficinas.sla.valor)}
          hint="Soma do valor lançado no recorte"
          tone="teal"
        />
        <KpiCard
          label="Peças Pendentes"
          value={formatInt(oficinas.pendentes)}
          warning={oficinas.pendentes > 0}
        />
        <KpiCard
          label="Peças com Defeitos"
          value={formatInt(oficinas.defeitos)}
          alert={oficinas.defeitos > 0}
        />
        <KpiCard
          label="% de Retorno"
          value={`${formatNumber(retorno, 1)}%`}
          hint={`${formatInt(oficinas.retornadas)} de ${formatInt(oficinas.enviadas)} enviadas`}
        />
      </KpiGrid>

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
            hint: explainOficinaRanking({
              nome: row.nome,
              pendentes: row.pecas,
              enviadas: row.enviadas,
              retornadas: row.retornadas,
              defeitos: row.defeitos,
              valor: row.valor,
            }),
          }))}
        />
      </section>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Pendentes por envelhecimento</h2>
        <p className="text-xs text-muted-foreground">
          Dias desde a Data Envio. Destaque a partir de 15 dias.
        </p>
        <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
          {AGING_FAIXAS.map((faixa) => {
            const n = oficinas.pendentesAging.filter((row) => {
              const dias = row.diasParado
              return dias != null && dias >= faixa.min && dias <= faixa.max
            }).length
            return (
              <span key={faixa.key} className="rounded-full border border-border/80 px-2 py-0.5">
                {faixa.label}: {formatInt(n)}
              </span>
            )
          })}
        </div>
        <PedidoQueue
          empty="Nenhum lote pendente neste recorte"
          rows={oficinas.pendentesAging.map((row) => ({
            pedido: row.pedido,
            title: formatDays(row.diasParado, 0),
            lines: [row.oficina, `${formatInt(row.pendentes)} pçs`, formatDate(row.data)],
            alert: (row.diasParado ?? 0) >= 15,
            warning: (row.diasParado ?? 0) >= 8 && (row.diasParado ?? 0) < 15,
          }))}
        />
        <div className="hidden md:block">
          <SimpleTable
            columns={[
              { key: 'pedido', label: 'Pedido', link: true },
              { key: 'oficina', label: 'Oficina' },
              { key: 'envio', label: 'Envio' },
              { key: 'dias', label: 'Dias', numeric: true },
              { key: 'pendentes', label: 'Pendentes', numeric: true },
              { key: 'prometida', label: 'Prometida' },
            ]}
            rows={oficinas.pendentesAging.map((row) => ({
              pedido: row.pedido,
              oficina: row.oficina,
              envio: formatDate(row.data),
              dias: formatDays(row.diasParado, 0),
              pendentes: formatInt(row.pendentes),
              prometida: formatDate(row.prometida),
              alert: (row.diasParado ?? 0) >= 15,
              warning: (row.diasParado ?? 0) >= 8 && (row.diasParado ?? 0) < 15,
            }))}
            empty="Nenhum lote pendente neste recorte"
          />
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Enviadas sem retorno e sem pendente</h2>
        <SimpleTable
          columns={[
            { key: 'oficina', label: 'Oficina' },
            { key: 'pedido', label: 'Pedido', link: true },
            { key: 'enviadas', label: 'Enviadas', numeric: true },
            { key: 'data', label: 'Envio' },
          ]}
          rows={oficinas.semRetorno.map((row) => ({
            oficina: row.oficina,
            pedido: row.pedido,
            enviadas: formatInt(row.enviadas),
            data: formatDate(row.data),
            hint: explainOficinaSemRetorno(row),
          }))}
          empty="Nenhum lote nessa quebra"
        />
      </section>
    </PageShell>
  )
}
