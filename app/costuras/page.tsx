import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { MonthlyAreaChart } from '@/components/monthly-area-chart'
import { FilterBar } from '@/components/filter-bar'
import {
  getCosturas,
  getFilterOptions,
  getFunil,
  getSerieMensal,
} from '@/data/dashboard'
import { MONTH_LABELS, formatDate, formatInt } from '@/lib/format'
import { parseFilters } from '@/lib/filters'
import {
  explainCosturaOrigem,
  explainLancamentoDia,
  explainMesVolume,
  explainNamedVolume,
} from '@/lib/table-explain'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Costuras' }

export default async function CosturasPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const filters = parseFilters(await searchParams)
  const [costuras, funil, serie, options] = await Promise.all([
    getCosturas(filters),
    getFunil(),
    getSerieMensal(),
    getFilterOptions(),
  ])
  const pecasServico = costuras.mix
    .filter((row) => row.origemNorm !== 'Producao')
    .reduce((sum, row) => sum + row.pecas, 0)
  const pecasHoje = costuras.doDia.reduce((sum, row) => sum + row.pecas, 0)

  return (
    <PageShell
      title="Costuras"
      description="Funil usa só Origem = Produção. Etiqueta, festonê e conserto ficam no mix de serviço."
    >
      <FilterBar
        pathname="/costuras"
        values={filters}
        options={options}
        fields={['mes', 'responsavel', 'produto', 'q']}
      />

      <KpiGrid>
        <KpiCard
          label="Produção"
          value={formatInt(costuras.producao.pecas)}
          hint="Origem = Produção no recorte"
        />
        <KpiCard
          label="Serviço"
          value={formatInt(pecasServico)}
          hint="Etiqueta, festonê, conserto e demais origens"
        />
        <KpiCard
          label="Pedidos com Costura"
          value={formatInt(funil?.comCostura ?? 0)}
          hint={`${formatInt(funil?.semCostura ?? 0)} pedidos de Corte sem Costura Produção (ano)`}
        />
        <KpiCard
          label={`Hoje (${formatDate(costuras.hoje)})`}
          value={formatInt(pecasHoje)}
          hint="Lançamentos Origem = Produção"
        />
      </KpiGrid>

      <MonthlyAreaChart
        title="Peças por mês"
        description="Costura Produção, mês a mês (ano 2026)."
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

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Mix de origem</h2>
        <SimpleTable
          columns={[
            { key: 'origem', label: 'Origem' },
            { key: 'lancamentos', label: 'Lançamentos', numeric: true },
            { key: 'pecas', label: 'Peças', numeric: true },
            { key: 'pedidos', label: 'Pedidos', numeric: true },
            { key: 'uso', label: 'Uso' },
          ]}
          rows={costuras.mix.map((row) => {
            const uso =
              row.origemNorm === 'Producao'
                ? 'Funil'
                : row.origemNorm === 'Conserto'
                  ? 'Retrabalho'
                  : 'Serviço / acabamento'
            return {
              origem: row.origem,
              lancamentos: formatInt(row.lancamentos),
              pecas: formatInt(row.pecas),
              pedidos: formatInt(row.pedidos),
              uso,
              hint: explainCosturaOrigem({
                origem: row.origem,
                lancamentos: row.lancamentos,
                pecas: row.pecas,
                pedidos: row.pedidos,
                uso,
                extra:
                  row.origemNorm === 'Producao'
                    ? 'Só Origem = Produção entra no funil. Etiqueta, festonê e conserto ficam de fora.'
                    : 'Não entra no KPI de Costura Produção do funil.',
              }),
            }
          })}
        />
      </section>

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
              pecas: formatInt(row.costura),
              hint: explainMesVolume({
                mes: MONTH_LABELS[row.mes - 1],
                pecas: row.costura,
                extra: 'Só Origem = Produção. Acompanhamento, não fechamento contra o Corte.',
              }),
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
            rows={costuras.porResponsavel.map((row) => ({
              nome: row.nome,
              pecas: formatInt(row.pecas),
              pedidos: formatInt(row.pedidos),
              hint: explainNamedVolume({
                titulo: 'Responsável',
                nome: row.nome,
                pecas: row.pecas,
                pedidos: row.pedidos,
                totalPecas: costuras.producao.pecas,
                extra: 'Somente Origem = Produção.',
              }),
            }))}
          />
        </section>
      </div>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Produção do dia</h2>
        <SimpleTable
          columns={[
            { key: 'pedido', label: 'Pedido' },
            { key: 'pecas', label: 'Peças', numeric: true },
            { key: 'responsavel', label: 'Responsável' },
            { key: 'produto', label: 'Produto' },
          ]}
          rows={costuras.doDia.map((row) => ({
            pedido: row.pedido,
            pecas: formatInt(row.pecas),
            responsavel: row.responsavel,
            produto: row.produto,
            hint: explainLancamentoDia({
              ...row,
              etapa: 'Costura Produção',
            }),
          }))}
          empty="Nenhum lançamento de Produção hoje neste recorte"
        />
      </section>
    </PageShell>
  )
}
