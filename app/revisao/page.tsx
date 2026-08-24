import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { MonthlyAreaChart } from '@/components/monthly-area-chart'
import { RefreshForm } from '@/components/refresh-form'
import {
  getFunil,
  getHeaderKpis,
  getRevisao,
  getSerieMensal,
} from '@/data/dashboard'
import { MONTH_LABELS, formatDate, formatInt } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Revisão' }

export default async function RevisaoPage() {
  const [header, revisao, funil, serie] = await Promise.all([
    getHeaderKpis(),
    getRevisao(),
    getFunil(),
    getSerieMensal(),
  ])
  const pecasHoje = revisao.doDia.reduce((sum, row) => sum + row.pecas, 0)

  return (
    <PageShell
      title="Revisão"
      description="Sem linha de total da tabela e sem Qtd igual ao número do pedido."
      actions={<RefreshForm />}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Revisão limpa"
          value={formatInt(header?.pecasRevisao ?? 0)}
        />
        <KpiCard
          label="Pedidos com Revisão"
          value={formatInt(funil?.comRevisao ?? 0)}
          hint={`${formatInt(funil?.semRevisao ?? 0)} pedidos de Corte sem Revisão`}
        />
        <KpiCard
          label="Revisão sem Corte"
          value={formatInt(funil?.revisaoSemCorte ?? 0)}
          hint="Pedidos apontados na Revisão e ausentes no Corte 2026"
        />
        <KpiCard
          label={`Hoje (${formatDate(revisao.hoje)})`}
          value={formatInt(pecasHoje)}
        />
      </div>

      <MonthlyAreaChart
        title="Peças por mês"
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

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Por mês</h2>
          <SimpleTable
            columns={[
              { key: 'mes', label: 'Mês' },
              { key: 'pecas', label: 'Peças', numeric: true },
            ]}
            rows={serie.map((row) => ({
              mes: MONTH_LABELS[row.mes - 1],
              pecas: formatInt(row.revisao),
            }))}
          />
        </section>
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Por responsável</h2>
          <SimpleTable
            columns={[
              { key: 'nome', label: 'Responsável' },
              { key: 'pecas', label: 'Peças', numeric: true },
              { key: 'pedidos', label: 'Pedidos', numeric: true },
            ]}
            rows={revisao.porResponsavel.map((row) => ({
              nome: row.nome,
              pecas: formatInt(row.pecas),
              pedidos: formatInt(row.pedidos),
            }))}
          />
        </section>
      </div>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Lançamentos do dia</h2>
        <SimpleTable
          columns={[
            { key: 'pedido', label: 'Pedido' },
            { key: 'pecas', label: 'Peças', numeric: true },
            { key: 'responsavel', label: 'Responsável' },
            { key: 'produto', label: 'Produto' },
          ]}
          rows={revisao.doDia.map((row) => ({
            pedido: row.pedido,
            pecas: formatInt(row.pecas),
            responsavel: row.responsavel,
            produto: row.produto,
          }))}
          empty="Nenhum lançamento de Revisão hoje"
        />
      </section>
    </PageShell>
  )
}
