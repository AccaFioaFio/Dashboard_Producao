import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { MonthlyAreaChart } from '@/components/monthly-area-chart'
import { FilterBar } from '@/components/filter-bar'
import { TopClientesSubNav } from '@/components/top-clientes-nav'
import { getTopClientes } from '@/data/dashboard'
import {
  MONTH_LABELS,
  formatInt,
  formatMeters,
  formatMoney,
  formatNumber,
} from '@/lib/format'
import { parseFilters, withCategoriaPadrao } from '@/lib/filters'
import { YEAR } from '@/lib/year'
import { ALMOX_PRINCIPAIS_LABEL } from '@/lib/almox-principais'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Mix e resumo' }

export default async function TopClientesResumoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const filters = withCategoriaPadrao(parseFilters(await searchParams))
  const data = await getTopClientes(filters)

  return (
    <PageShell
      title="Mix e resumo"
      description={`KPIs, evolução mensal e mix por canal dos pedidos comerciais ${YEAR} (só venda final). Metros = baixas Signus (almox ${ALMOX_PRINCIPAIS_LABEL}), cruzadas 1× por pedido.`}
      actions={<TopClientesSubNav filters={filters} current="resumo" />}
    >
      <FilterBar
        pathname="/top-clientes/resumo"
        values={filters}
        options={data.options}
        fields={['mes', 'canal', 'cliente', 'categoria', 'q']}
      />

      {!data.loaded ? (
        <p className="text-sm text-muted-foreground">
          Carregue o Excel de Pedidos (PEDIDOS_XLSX) e rode a carga para liberar
          esta aba.
        </p>
      ) : (
        <>
          <KpiGrid columns={4}>
            <KpiCard
              label="Clientes com pedido"
              value={formatInt(data.clientesAtivos)}
              hint={`${formatInt(data.pedidos)} pedidos no recorte`}
              detail="Pedidos.xlsx · clientes distintos com venda final, no período/filtros atuais."
              tone="indigo"
            />
            <KpiCard
              label="Valor faturado"
              value={formatMoney(data.valorFaturado)}
              hint={`Ticket médio ${formatMoney(data.ticketMedio)}`}
              detail="Pedidos.xlsx · coluna Pedido - Valor faturado (só venda final)."
              tone="teal"
            />
            <KpiCard
              label="Metros baixados"
              value={formatMeters(data.metrosSignus)}
              hint={`${formatInt(data.pedidosComTecido)} pedidos com baixa · ${formatNumber(data.coberturaTecidoPct, 0)}% cobertura`}
              detail="Movimentação Signus · metros de baixa cruzados com o nº do pedido comercial."
              tone="amber"
            />
            <KpiCard
              label="Concentração dos 5 maiores"
              value={`${formatNumber(data.concentracaoTop5Pct, 0)}%`}
              hint="Participação dos 5 maiores no total de pedidos"
              detail="Soma dos pedidos dos 5 clientes com maior faturamento ÷ total de pedidos do recorte."
              tone="magenta"
            />
            <KpiCard
              label="Média mensal de faturamento"
              value={formatMoney(data.mediaMensalValor)}
              hint={`${formatMeters(data.mediaMensalMetros)} · ${formatInt(data.mesesComVenda)} meses com venda`}
              detail="Valor faturado ÷ meses com pelo menos uma venda no recorte."
              tone="teal"
            />
            <KpiCard
              label={`Previsão de faturamento ${YEAR}`}
              value={formatMoney(data.previsaoValorAno)}
              hint={`Projeção linear · tecido ${formatMeters(data.previsaoMetrosAno)}`}
              detail="Média mensal de faturamento × 12 (run-rate). Não é meta — é ritmo atual anualizado."
              tone="indigo"
            />
            <KpiCard
              label="Valor total do pedido"
              value={formatMoney(data.valorTotal)}
              hint="Soma do valor total no recorte"
              detail="Pedidos.xlsx · coluna Pedido - Valor total (venda final)."
            />
          </KpiGrid>

          <div className="grid min-w-0 gap-[var(--page-gap)] lg:grid-cols-2">
            <MonthlyAreaChart
              title="Pedidos e valor"
              description="Volume comercial mês a mês (data de venda)."
              labels={data.porMes.map((row) => MONTH_LABELS[row.mes - 1])}
              series={[
                {
                  key: 'pedidos',
                  label: 'Pedidos',
                  color: 'var(--chart-1)',
                  values: data.porMes.map((row) => row.pedidos),
                },
                {
                  key: 'valor',
                  label: 'Valor (mil)',
                  color: 'var(--chart-2)',
                  values: data.porMes.map((row) =>
                    Math.round(row.valor / 1000),
                  ),
                },
              ]}
            />
            <section className="flex min-w-0 flex-col gap-2">
              <h2 className="text-sm font-medium">Mix por canal</h2>
              <SimpleTable
                columns={[
                  { key: 'nome', label: 'Canal' },
                  { key: 'pedidos', label: 'Pedidos', numeric: true },
                  { key: 'valor', label: 'Faturado', numeric: true },
                  { key: 'metros', label: 'Metros', numeric: true },
                ]}
                rows={data.porCanal.map((row) => ({
                  nome: row.nome,
                  pedidos: formatInt(row.pedidos),
                  valor: formatMoney(row.valor),
                  metros: formatMeters(row.metros),
                }))}
              />
            </section>
          </div>
        </>
      )}
    </PageShell>
  )
}
