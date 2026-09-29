import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { MonthlyAreaChart } from '@/components/monthly-area-chart'
import { FilterBar } from '@/components/filter-bar'
import { getFilterOptions, getOficinas } from '@/data/dashboard'
import { MONTH_LABELS, formatDate, formatDays, formatInt, formatMoney, formatMoneyCompact, formatNumber, formatProduto } from '@/lib/format'
import { parseFilters } from '@/lib/filters'
import { PedidoQueue } from '@/components/pedido-queue'
import { explainOficinaRanking, explainOficinaSemRetorno } from '@/lib/table-explain'
import { AGING_FAIXAS } from '@/lib/pedido'
import { YEAR } from '@/lib/year'

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
      description={`Lotes com Data Envio em ${YEAR} e oficina preenchida. Remessas p/ industrialização do Pedidos.xlsx entram aqui (cruzamento por nº do pedido) — não no Top Clientes.`}
    >
      <FilterBar
        pathname="/oficinas"
        values={filters}
        options={options}
        fields={['mes', 'oficina', 'q']}
      />

      <KpiGrid>
        <KpiCard
          label="Valor total pago às oficinas"
          value={formatMoneyCompact(oficinas.sla.valor)}
          hint="Soma do valor lançado no recorte"
          detail="Planilha de Oficinas · soma do valor pago no período/filtros."
          tone="teal"
        />
        <KpiCard
          label="Peças pendentes de retorno"
          value={formatInt(oficinas.pendentes)}
          hint="Enviadas ainda sem retorno"
          detail="Planilha de Oficinas · peças enviadas sem data/quantidade de retorno."
          warning={oficinas.pendentes > 0}
        />
        <KpiCard
          label="Peças com defeito"
          value={formatInt(oficinas.defeitos)}
          hint="Apontadas com defeito no retorno"
          detail="Planilha de Oficinas · peças retornadas com defeito."
          alert={oficinas.defeitos > 0}
        />
        <KpiCard
          label="Taxa de retorno"
          value={`${formatNumber(retorno, 1)}%`}
          hint={`${formatInt(oficinas.retornadas)} de ${formatInt(oficinas.enviadas)} enviadas`}
          detail="Oficinas · peças retornadas ÷ peças enviadas no recorte."
        />
        {oficinas.comercialLoaded ? (
          <>
            <KpiCard
              label="Remessas para industrialização"
              value={formatInt(oficinas.remessasPedidos)}
              hint={`${formatInt(oficinas.oficinasComRemessa)} oficinas com remessa`}
              detail="Pedidos.xlsx · remessas p/ industrialização cruzadas com a oficina pelo nº do pedido."
              tone="indigo"
            />
            <KpiCard
              label="Valor das remessas"
              value={formatMoneyCompact(oficinas.valorRemessa)}
              hint="Industrialização cruzada por pedido"
              detail="Pedidos.xlsx · valor faturado das remessas p/ industrialização ligadas às oficinas."
              tone="amber"
            />
          </>
        ) : null}
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
            ...(oficinas.comercialLoaded
              ? [
                  { key: 'remessas', label: 'Remessas', numeric: true },
                  { key: 'valorRemessa', label: 'Valor remessa', numeric: true },
                ]
              : []),
          ]}
          rows={oficinas.ranking.map((row) => ({
            nome: row.nome,
            pendentes: formatInt(row.pecas),
            enviadas: formatInt(row.enviadas),
            retornadas: formatInt(row.retornadas),
            defeitos: formatInt(row.defeitos),
            valor: formatMoney(row.valor),
            remessas: formatInt(row.remessas),
            valorRemessa: formatMoney(row.valorRemessa),
            alert: row.defeitos > 0,
            warning: row.pecas > 0 && row.defeitos === 0,
            hint: explainOficinaRanking({
              nome: row.nome,
              pendentes: row.pecas,
              enviadas: row.enviadas,
              retornadas: row.retornadas,
              defeitos: row.defeitos,
              valor: row.valor,
              remessas: row.remessas,
              valorRemessa: row.valorRemessa,
              clienteSignus: row.clienteSignus,
            }),
          }))}
        />
      </section>

      {oficinas.comercialLoaded ? (
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">
            Remessas p/ industrialização × produção
          </h2>
          <p className="text-xs text-muted-foreground">
            Pedidos.xlsx (tipo remessa indust.) cruzados com lotes da planilha de
            oficinas pelo mesmo nº de pedido.
          </p>
          <SimpleTable
            columns={[
              { key: 'oficina', label: 'Oficina' },
              { key: 'pedido', label: 'Pedido', link: true },
              { key: 'cliente', label: 'Cliente Signus' },
              { key: 'canal', label: 'Canal' },
              { key: 'valor', label: 'Valor remessa', numeric: true },
              { key: 'enviadas', label: 'Enviadas', numeric: true },
              { key: 'pendentes', label: 'Pendentes', numeric: true },
              { key: 'data', label: 'Venda' },
            ]}
            rows={oficinas.remessasDetalhe.map((row) => ({
              oficina: row.oficina,
              pedido: row.pedido,
              cliente: row.cliente ?? '—',
              canal: row.canal ?? '—',
              valor: formatMoney(row.valor),
              enviadas: formatInt(row.enviadas),
              pendentes: formatInt(row.pendentes),
              data: formatDate(row.data),
              hint: [
                row.tipo,
                `${formatInt(row.retornadas)} retornadas`,
              ]
                .filter(Boolean)
                .join(' · '),
            }))}
            empty="Nenhuma remessa industrialização cruzada neste recorte"
          />
        </section>
      ) : null}

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
            lines: [
              row.oficina,
              formatProduto(row) === '—' ? null : formatProduto(row),
              `${formatInt(row.pendentes)} pçs`,
              formatDate(row.data),
            ],
            alert: (row.diasParado ?? 0) >= 15,
            warning: (row.diasParado ?? 0) >= 8 && (row.diasParado ?? 0) < 15,
          }))}
        />
        <div className="hidden md:block">
          <SimpleTable
            columns={[
              { key: 'pedido', label: 'Pedido', link: true },
              { key: 'oficina', label: 'Oficina' },
              { key: 'produto', label: 'Produto', wrap: true },
              { key: 'envio', label: 'Envio' },
              { key: 'dias', label: 'Dias', numeric: true },
              { key: 'pendentes', label: 'Pendentes', numeric: true },
              { key: 'prometida', label: 'Prometida' },
            ]}
            rows={oficinas.pendentesAging.map((row) => ({
              pedido: row.pedido,
              oficina: row.oficina,
              produto: formatProduto(row),
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
            { key: 'produto', label: 'Produto', wrap: true },
            { key: 'enviadas', label: 'Enviadas', numeric: true },
            { key: 'data', label: 'Envio' },
          ]}
          rows={oficinas.semRetorno.map((row) => ({
            oficina: row.oficina,
            pedido: row.pedido,
            produto: formatProduto(row),
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
