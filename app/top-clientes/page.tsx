import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { MonthlyAreaChart } from '@/components/monthly-area-chart'
import { FilterBar } from '@/components/filter-bar'
import { getTopClientes } from '@/data/dashboard'
import {
  MONTH_LABELS,
  formatInt,
  formatMeters,
  formatMoney,
  formatNumber,
  formatTecido,
} from '@/lib/format'
import { filtersToSearch, parseFilters } from '@/lib/filters'
import { YEAR } from '@/lib/year'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Top Clientes' }

export default async function TopClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const filters = parseFilters(await searchParams)
  const data = await getTopClientes(filters)
  const clienteAtivo = filters.cliente

  return (
    <PageShell
      title="Top Clientes"
      description={`Pedidos comerciais ${YEAR} — só venda final (exclui remessa p/ industrialização e oficinas). Cruzado com baixas de tecido na movimentação Signus. Clique num cliente para ver o mix de tecidos e a tendência.`}
    >
      <FilterBar
        pathname="/top-clientes"
        values={filters}
        options={data.options}
        fields={['mes', 'canal', 'cliente', 'q']}
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
              label="Clientes ativos"
              value={formatInt(data.clientesAtivos)}
              hint={`${formatInt(data.pedidos)} pedidos no recorte`}
              tone="indigo"
            />
            <KpiCard
              label="Valor faturado"
              value={formatMoney(data.valorFaturado)}
              hint={`Ticket médio ${formatMoney(data.ticketMedio)}`}
              tone="teal"
            />
            <KpiCard
              label="Metros baixados"
              value={formatMeters(data.metrosSignus)}
              hint={`${formatInt(data.pedidosComTecido)} pedidos com baixa · ${formatNumber(data.coberturaTecidoPct, 0)}% cobertura`}
              tone="amber"
            />
            <KpiCard
              label="Concentração top 5"
              value={`${formatNumber(data.concentracaoTop5Pct, 0)}%`}
              hint="Share de pedidos dos 5 maiores clientes"
              tone="magenta"
            />
            <KpiCard
              label="Média mensal"
              value={formatMoney(data.mediaMensalValor)}
              hint={`${formatMeters(data.mediaMensalMetros)} · ${formatInt(data.mesesComVenda)} meses com venda`}
              tone="teal"
            />
            <KpiCard
              label={`Previsão ${YEAR}`}
              value={formatMoney(data.previsaoValorAno)}
              hint={`Run-rate × 12 · tecido ${formatMeters(data.previsaoMetrosAno)}`}
              tone="indigo"
            />
            <KpiCard
              label="Valor total"
              value={formatMoney(data.valorTotal)}
              hint="Soma Pedido - Valor total no recorte"
            />
            <KpiCard
              label="Pedidos"
              value={formatInt(data.pedidos)}
              hint={
                clienteAtivo
                  ? `Filtro: ${clienteAtivo}`
                  : 'Base comercial Signus'
              }
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
            <MonthlyAreaChart
              title="Metros por cliente"
              description="Baixas Signus ligadas aos pedidos do recorte."
              labels={data.porMes.map((row) => MONTH_LABELS[row.mes - 1])}
              series={[
                {
                  key: 'metros',
                  label: 'Metros',
                  color: 'var(--chart-3)',
                  values: data.porMes.map((row) => Math.round(row.metros)),
                },
              ]}
            />
          </div>

          <div className="grid min-w-0 gap-[var(--page-gap)] xl:grid-cols-2">
            <section className="flex min-w-0 flex-col gap-2">
              <h2 className="text-sm font-medium">
                {clienteAtivo ? `Cliente · ${clienteAtivo}` : 'Maiores clientes'}
              </h2>
              <SimpleTable
                columns={[
                  { key: 'cliente', label: 'Cliente' },
                  { key: 'pedidos', label: 'Pedidos', numeric: true },
                  { key: 'valor', label: 'Faturado', numeric: true },
                  { key: 'ticket', label: 'Ticket', numeric: true },
                  { key: 'metros', label: 'Metros', numeric: true },
                  { key: 'topTecido', label: 'Top tecido' },
                ]}
                rows={data.ranking.map((row) => {
                  const next = {
                    ...filters,
                    cliente:
                      filters.cliente === row.cliente ? undefined : row.cliente,
                  }
                  const query = filtersToSearch(next).toString()
                  return {
                    cliente: row.cliente,
                    pedidos: formatInt(row.pedidos),
                    valor: formatMoney(row.valorFaturado),
                    ticket: formatMoney(row.ticketMedio),
                    metros: formatMeters(row.metros),
                    topTecido: row.topTecido
                      ? `${row.topTecido} (${formatMeters(row.topTecidoMetros)})`
                      : '—',
                    selected: filters.cliente === row.cliente,
                    href: query
                      ? `/top-clientes?${query}`
                      : '/top-clientes',
                    hint: `${row.cliente}: ${formatInt(row.pedidos)} pedidos · ${formatInt(row.tecidos)} tecidos · ${formatInt(row.pedidosComTecido)} com baixa Signus`,
                  }
                })}
              />
            </section>

            <section className="flex min-w-0 flex-col gap-2">
              <h2 className="text-sm font-medium">
                {clienteAtivo
                  ? 'Tecidos que este cliente mais compra'
                  : 'Tecidos mais comprados (cruzamento)'}
              </h2>
              <SimpleTable
                columns={[
                  { key: 'tecido', label: 'Tecido' },
                  { key: 'metros', label: 'Metros', numeric: true },
                  { key: 'pedidos', label: 'Pedidos', numeric: true },
                  { key: 'clientes', label: 'Clientes', numeric: true },
                  { key: 'saldo', label: 'Saldo', numeric: true },
                ]}
                rows={data.tecidos.map((row) => ({
                  tecido: formatTecido(row.cod, row.nome),
                  metros: formatMeters(row.metros),
                  pedidos: formatInt(row.pedidos),
                  clientes: formatInt(row.clientes),
                  saldo: formatMeters(row.saldoAtual),
                  hint: `${row.cod}: ${formatInt(row.movimentos)} baixas Signus no recorte`,
                }))}
              />
            </section>
          </div>

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
        </>
      )}
    </PageShell>
  )
}
