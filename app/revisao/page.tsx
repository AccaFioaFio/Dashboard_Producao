import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { MonthlyAreaChart } from '@/components/monthly-area-chart'
import { RefreshForm } from '@/components/refresh-form'
import { FilterBar } from '@/components/filter-bar'
import {
  getFilterOptions,
  getFunil,
  getRevisao,
  getSerieMensal,
} from '@/data/dashboard'
import { MONTH_LABELS, formatDate, formatInt } from '@/lib/format'
import { parseFilters } from '@/lib/filters'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Revisão' }

export default async function RevisaoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const filters = parseFilters(await searchParams)
  const [revisao, funil, serie, options] = await Promise.all([
    getRevisao(filters),
    getFunil(),
    getSerieMensal(),
    getFilterOptions(),
  ])
  const pecasHoje = revisao.doDia.reduce((sum, row) => sum + row.pecas, 0)

  return (
    <PageShell
      title="Revisão"
      description="Sem linha de total da tabela e sem Qtd igual ao número do pedido."
      actions={<RefreshForm />}
    >
      <FilterBar
        pathname="/revisao"
        values={filters}
        options={options}
        fields={['mes', 'responsavel', 'produto', 'q']}
      />

      <KpiGrid>
        <KpiCard
          label="Revisão limpa"
          value={formatInt(revisao.resumo.pecas)}
          hint="Peças no recorte"
        />
        <KpiCard
          label="Pedidos com Revisão"
          value={formatInt(revisao.resumo.pedidos)}
          hint={`${formatInt(funil?.semRevisao ?? 0)} pedidos de Corte sem Revisão (ano)`}
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
      </KpiGrid>

      <MonthlyAreaChart
        title="Peças por mês"
        description="Revisão limpa, mês a mês (ano 2026)."
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

      <div className="grid min-w-0 gap-[var(--page-gap)] lg:grid-cols-2">
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
          empty="Nenhum lançamento de Revisão hoje neste recorte"
        />
      </section>
    </PageShell>
  )
}
