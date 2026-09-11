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
import { filtersToSearch, parseFilters, withCategoriaPadrao } from '@/lib/filters'
import { YEAR } from '@/lib/year'
import { ALMOX_PRINCIPAIS_LABEL } from '@/lib/almox-principais'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Top Clientes' }

function formatTendencia(pct: number | null) {
  if (pct == null || !Number.isFinite(pct)) return '—'
  const rounded = Math.round(pct)
  if (rounded === 0) return 'estável'
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}

export default async function TopClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const filters = withCategoriaPadrao(parseFilters(await searchParams))
  const data = await getTopClientes(filters)
  const clienteAtivo = filters.cliente
  const mesRefLabel =
    data.mesReferencia > 0 ? MONTH_LABELS[data.mesReferencia - 1] : '—'
  const proximoMesLabel =
    data.mesReferencia > 0 && data.mesReferencia < 12
      ? MONTH_LABELS[data.mesReferencia]
      : data.mesReferencia === 12
        ? `Jan/${YEAR + 1}`
        : 'próximo mês'

  return (
    <PageShell
      title="Top Clientes"
      description={`Pedidos comerciais ${YEAR} — só venda final (exclui remessa p/ industrialização e oficinas). Cruzado com baixas de tecido na movimentação Signus (almox ${ALMOX_PRINCIPAIS_LABEL}, categoria MATÉRIA PRIMA por padrão). Clique num cliente para ver o mix de tecidos e a previsão de compra.`}
    >
      <FilterBar
        pathname="/top-clientes"
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
              label={`Previsão tecido · ${proximoMesLabel}`}
              value={formatMeters(data.previsaoProximoMesMetros)}
              hint={`Ref. até ${mesRefLabel} · compra sugerida ${formatMeters(data.previsaoCompraProximoMes)}`}
              detail={`Baixas e saldo só dos almox ${ALMOX_PRINCIPAIS_LABEL}. Por tecido: (metros ÷ pedidos) × média de pedidos dos últimos 3 meses. Compra = previsão − saldo.`}
              tone="amber"
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
            <MonthlyAreaChart
              title="Metros: histórico e previsão"
              description={`Baixas Signus (almox ACCA/FAF/TRU) até ${mesRefLabel}; meses seguintes = média recente (últimos 3 com consumo).`}
              labels={MONTH_LABELS}
              series={[
                {
                  key: 'historico',
                  label: 'Histórico',
                  color: 'var(--chart-3)',
                  values: data.porMesHistorico.map((row) =>
                    Math.round(row.metros),
                  ),
                },
                {
                  key: 'previsao',
                  label: 'Previsão',
                  color: 'var(--chart-1)',
                  values: data.porMesPrevisao.map((v) => Math.round(v)),
                },
              ]}
            />
          </div>

          <section className="flex min-w-0 flex-col gap-2">
            <h2 className="text-sm font-medium">
              {clienteAtivo
                ? `Previsão de compra · ${clienteAtivo}`
                : 'Previsão de compra de tecido'}
            </h2>
            <p className="text-xs text-muted-foreground">
              Estuda as baixas dos meses anteriores a {mesRefLabel}/{YEAR}
              {clienteAtivo ? ` deste cliente` : ''}, só nos almox{' '}
              {ALMOX_PRINCIPAIS_LABEL}. Média mensal = total ÷
              meses do período. Últimos 3 meses = média dos meses com consumo.
              Previsão = (metros ÷ pedidos) × ritmo médio de pedidos dos
              últimos 3 meses. A comprar = previsão − saldo desses almox
              (quando o estoque não cobre).
            </p>
            <SimpleTable
              columns={[
                { key: 'tecido', label: 'Tecido' },
                { key: 'mediaMensal', label: 'Média mensal', numeric: true },
                { key: 'mediaRecente', label: 'Últimos 3 meses', numeric: true },
                {
                  key: 'previsao',
                  label: `Prev. ${proximoMesLabel}`,
                  numeric: true,
                },
                { key: 'saldo', label: 'Saldo', numeric: true },
                { key: 'aComprar', label: 'A comprar', numeric: true },
                { key: 'tendencia', label: 'Tendência', numeric: true },
              ]}
              rows={data.previsaoTecidos.map((row) => ({
                tecido: formatTecido(row.cod, row.nome),
                mediaMensal: formatMeters(row.mediaMensal),
                mediaRecente: formatMeters(row.mediaRecente),
                previsao: formatMeters(row.previsaoProximoMes),
                saldo: formatMeters(row.saldoAtual),
                aComprar:
                  row.aComprar > 0 ? formatMeters(row.aComprar) : '—',
                tendencia: formatTendencia(row.tendenciaPct),
              }))}
            />
          </section>

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

          <section className="flex min-w-0 flex-col gap-2">
            <h2 className="text-sm font-medium">
              {clienteAtivo ? `Cliente · ${clienteAtivo}` : 'Maiores clientes'}
            </h2>
            <SimpleTable
              columns={[
                { key: 'codCliente', label: 'Cód.' },
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
                const tecidoLabel = row.topTecido
                  ? formatTecido(row.topTecido, row.topTecidoNome)
                  : '—'
                return {
                  codCliente: row.codCliente || '—',
                  cliente: row.cliente,
                  pedidos: formatInt(row.pedidos),
                  valor: formatMoney(row.valorFaturado),
                  ticket: formatMoney(row.ticketMedio),
                  metros: formatMeters(row.metros),
                  topTecido:
                    tecidoLabel === '—'
                      ? '—'
                      : `${tecidoLabel} (${formatMeters(row.topTecidoMetros)})`,
                  selected: filters.cliente === row.cliente,
                  href: query ? `/top-clientes?${query}` : '/top-clientes',
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
              }))}
            />
          </section>
        </>
      )}
    </PageShell>
  )
}
