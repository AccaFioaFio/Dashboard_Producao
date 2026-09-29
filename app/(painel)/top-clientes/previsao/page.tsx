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
  formatTecido,
} from '@/lib/format'
import { parseFilters, withCategoriaPadrao } from '@/lib/filters'
import { YEAR } from '@/lib/year'
import { ALMOX_PRINCIPAIS_LABEL } from '@/lib/almox-principais'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Previsão de compra' }

function formatTendencia(pct: number | null) {
  if (pct == null || !Number.isFinite(pct)) return '—'
  const rounded = Math.round(pct)
  if (rounded === 0) return 'estável'
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}

export default async function TopClientesPrevisaoPage({
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
      title="Previsão de compra"
      description={`Baixas Signus (produção + SAIDA FF/AC/TC) dos meses anteriores a ${mesRefLabel}/${YEAR}${clienteAtivo ? ` · ${clienteAtivo}` : ''}, almox ${ALMOX_PRINCIPAIS_LABEL}. Previsão = (metros ÷ pedidos) × ritmo médio de pedidos dos últimos 3 meses. A comprar = previsão − saldo.`}
      actions={<TopClientesSubNav filters={filters} current="previsao" />}
    >
      <FilterBar
        pathname="/top-clientes/previsao"
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
          <KpiGrid columns={3}>
            <KpiCard
              label={`Previsão tecido · ${proximoMesLabel}`}
              value={formatMeters(data.previsaoProximoMesMetros)}
              hint={`Ref. até ${mesRefLabel} · compra sugerida ${formatMeters(data.previsaoCompraProximoMes)}`}
              detail={`Baixas Signus por data do movimento, só almox ${ALMOX_PRINCIPAIS_LABEL}, cruzadas com venda final (sem duplicar pedido). Por tecido: (metros ÷ pedidos) × média de pedidos dos últimos 3 meses. Compra = previsão − saldo.`}
              tone="amber"
            />
            <KpiCard
              label="Metros baixados"
              value={formatMeters(data.metrosSignus)}
              hint={`${formatInt(data.pedidosComTecido)} pedidos com baixa`}
              detail="Movimentação Signus · metros de baixa cruzados com o nº do pedido comercial."
              tone="indigo"
            />
            <KpiCard
              label={`Previsão tecido ${YEAR}`}
              value={formatMeters(data.previsaoMetrosAno)}
              hint={`Média mensal ${formatMeters(data.mediaMensalMetros)}`}
              detail="Média mensal de metros × 12 (run-rate)."
              tone="teal"
            />
          </KpiGrid>

          <MonthlyAreaChart
            title="Metros: histórico e previsão"
            description={`Histórico = baixas Signus (almox ACCA/FAF/TRU) por data do movimento até ${mesRefLabel}. Previsão = ritmo recente (até 3 meses com consumo) só de ${mesRefLabel} em diante.`}
            labels={MONTH_LABELS}
            series={[
              {
                key: 'historico',
                label: 'Histórico',
                color: 'var(--chart-3)',
                values: data.porMesHistorico.map((row) =>
                  row.mes > data.mesReferencia
                    ? null
                    : Math.round(row.metros),
                ),
              },
              {
                key: 'previsao',
                label: 'Previsão',
                color: 'var(--chart-1)',
                values: data.porMesPrevisao.map((v) =>
                  v == null ? null : Math.round(v),
                ),
              },
            ]}
          />

          <section className="flex min-w-0 flex-col gap-2">
            <h2 className="text-sm font-medium">
              {clienteAtivo
                ? `Previsão de compra · ${clienteAtivo}`
                : 'Previsão de compra de tecido'}
            </h2>
            <p className="text-xs text-muted-foreground">
              Estuda baixas Signus dos meses anteriores a {mesRefLabel}/{YEAR}
              {clienteAtivo ? ` deste cliente` : ''}. Mês = data do movimento
              (como em Tecidos), não a data de venda do pedido. Média mensal =
              total ÷ meses do período. Ritmo recente = média dos até 3 meses
              com consumo. Não usa metros do Corte.
            </p>
            <SimpleTable
              columns={[
                { key: 'tecido', label: 'Tecido' },
                { key: 'mediaMensal', label: 'Média mensal', numeric: true },
                { key: 'mediaRecente', label: 'Ritmo recente', numeric: true },
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
