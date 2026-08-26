import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { GroupedTable } from '@/components/grouped-table'
import { FilterBar } from '@/components/filter-bar'
import { TecidosMetrosButton } from '@/components/tecidos-valores-nav'
import { getFilterOptions, getTecidosValores } from '@/data/dashboard'
import {
  formatInt,
  formatMeters,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatTecido,
  tipoDocumentoLabel,
} from '@/lib/format'
import { parseFilters } from '@/lib/filters'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Valores do tecido' }

function documentosLabel(value: string | null | undefined) {
  if (!value) return '—'
  const parts = [...new Set(value.split(',').map((part) => tipoDocumentoLabel(part.trim())))]
  return parts.join(' · ')
}

export default async function TecidosValoresPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const filters = parseFilters(await searchParams)
  const [valores, options] = await Promise.all([
    getTecidosValores(filters),
    getFilterOptions(),
  ])
  const custoMetro =
    valores.metrosBaixa > 0 ? valores.valorBaixa / valores.metrosBaixa : 0
  const custoPeca = valores.pecasCorte > 0 ? valores.valorBaixa / valores.pecasCorte : 0
  const cobertura =
    valores.valorConsumoEst > 0 ? (valores.valorBaixa / valores.valorConsumoEst) * 100 : 0
  const coberturaM =
    valores.metrosCorte > 0 ? (valores.metrosBaixa / valores.metrosCorte) * 100 : 0

  return (
    <PageShell
      title="Valores do tecido"
      description="Valor unitário do Signus e valor unitário × quantidade baixada. Clique em + para abrir os pedidos daquele tecido."
      actions={<TecidosMetrosButton filters={filters} />}
    >
      <FilterBar
        pathname="/tecidos/valores"
        values={filters}
        options={options}
        fields={['mes', 'canal', 'cliente', 'q']}
      />

      {!valores.hasValores || valores.movimentosComValor === 0 ? (
        <p className="card-surface px-4 py-3 text-xs text-muted-foreground">
          Sem valor unitário na carga. Depois que o publicador reler o Signus
          (custo bruto, valor unitário contábil e tipo de documento), recarregue a página.
        </p>
      ) : null}

      <KpiGrid>
        <KpiCard
          label="Valor da baixa"
          value={formatMoneyCompact(valores.valorBaixa)}
          hint="VU × qtd baixada (produção + SAIDA FF/AC/TC)"
          tone="teal"
        />
        <KpiCard
          label="Valor unitário médio"
          value={formatMoney(valores.valorUnitarioMedio)}
          hint="Média ponderada pela quantidade baixada"
          tone="indigo"
        />
        <KpiCard
          label="VU × consumo do Corte"
          value={formatMoneyCompact(valores.valorConsumoEst)}
          hint={`${formatNumber(cobertura, 1)}% do consumo estimado já baixado em valor`}
          tone="amber"
        />
        <KpiCard
          label="Custo por metro / peça"
          value={formatMoney(custoMetro)}
          hint={`${formatMoney(custoPeca)} por peça cortada no recorte`}
          tone="magenta"
        />
        <KpiCard
          label="Inventário (documento)"
          value={formatMoneyCompact(valores.valorInventario)}
          hint="Tipo de documento = Inventário. Fora do KPI de baixa."
        />
        <KpiCard
          label="Compras (NF entrada)"
          value={formatMoneyCompact(valores.valorCompras)}
          hint="Tipo de documento = Nota fiscal — entrada"
          tone="teal"
        />
        <KpiCard
          label="Pedidos com baixa"
          value={`${formatInt(valores.pedidosComBaixa)} / ${formatInt(valores.pedidosCorte)}`}
          hint={`${formatInt(valores.pedidosSemBaixa)} pedidos do Corte sem baixa Signus`}
          warning={valores.pedidosSemBaixa > 0}
        />
        <KpiCard
          label="Metros baixa × Corte"
          value={`${formatNumber(coberturaM, 1)}%`}
          hint={`${formatMeters(valores.metrosBaixa)} de ${formatMeters(valores.metrosCorte)}`}
          tone="indigo"
        />
      </KpiGrid>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Tecido e pedidos</h2>
        <p className="text-xs text-muted-foreground">
          Cada linha é um tecido. O botão + abre consumo, baixa, valor e tipo de documento
          pedido a pedido. Inventário e NF não entram no KPI de baixa de produção.
        </p>
        <GroupedTable
          columns={[
            { key: 'tecido', label: 'Tecido', wrap: true },
            { key: 'vu', label: 'Valor unitário', numeric: true },
            { key: 'baixa', label: 'Qtd baixada', numeric: true },
            { key: 'valorBaixa', label: 'VU × qtd', numeric: true },
            { key: 'consumo', label: 'Consumo Corte', numeric: true },
            { key: 'valorConsumo', label: 'VU × consumo', numeric: true },
            { key: 'pedidos', label: 'Pedidos', numeric: true },
          ]}
          childColumns={[
            { key: 'pedido', label: 'Pedido' },
            { key: 'cliente', label: 'Cliente', wrap: true },
            { key: 'consumo', label: 'Consumo', numeric: true },
            { key: 'baixa', label: 'Baixa', numeric: true },
            { key: 'delta', label: 'Delta', numeric: true },
            { key: 'vu', label: 'VU médio', numeric: true },
            { key: 'valor', label: 'VU × baixa', numeric: true },
            { key: 'documento', label: 'Tipo de documento' },
          ]}
          groups={valores.porTecido.map((row) => ({
            id: row.cod,
            cells: {
              tecido: formatTecido(row.cod, row.nome),
              vu: row.valorUnitario == null ? '—' : formatMoney(row.valorUnitario),
              baixa: formatMeters(row.baixa, row.baixa >= 10 ? 0 : 1),
              valorBaixa: formatMoney(row.valorBaixa),
              consumo: formatMeters(row.consumo, row.consumo >= 10 ? 0 : 1),
              valorConsumo: formatMoney(row.valorConsumoEst),
              pedidos: formatInt(row.pedidos),
            },
            children: row.pedidoRows.map((pedido) => {
              const alert = pedido.baixa > 0 && pedido.consumo === 0
              const warning = pedido.consumo > 0 && pedido.baixa === 0
              return {
                cells: {
                  pedido: pedido.pedidoNorm,
                  cliente: pedido.cliente,
                  consumo: formatMeters(pedido.consumo, pedido.consumo >= 10 ? 0 : 1),
                  baixa: formatMeters(pedido.baixa, pedido.baixa >= 10 ? 0 : 1),
                  delta: formatMeters(pedido.consumo - pedido.baixa, 0),
                  vu: pedido.valorUnitario == null ? '—' : formatMoney(pedido.valorUnitario),
                  valor: formatMoney(pedido.valorBaixa),
                  documento: documentosLabel(pedido.documentos),
                },
                warning,
                alert,
                hint: alert
                  ? 'Vermelho: há baixa no Signus, mas o Corte não registrou consumo neste pedido. Costuma ser lançamento auxiliar.'
                  : warning
                    ? 'Amarelo: o Corte registrou consumo, mas ainda não há baixa no Signus. Por isso o valor fica zerado.'
                    : undefined,
              }
            }),
          }))}
          empty="Sem tecido com valor na carga"
          childEmpty="Nenhum pedido neste tecido"
        />
      </section>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Por tipo de documento</h2>
        <p className="text-xs text-muted-foreground">
          Coluna Tipo de documento do Signus. Só produção + SAIDA FF/AC/TC soma o valor da
          baixa.
        </p>
        <SimpleTable
          columns={[
            { key: 'tipo', label: 'Tipo de documento' },
            { key: 'valor', label: 'Valor', numeric: true },
            { key: 'metros', label: 'Metros', numeric: true },
            { key: 'movimentos', label: 'Movimentos', numeric: true },
            { key: 'pedidos', label: 'Pedidos', numeric: true },
          ]}
          rows={valores.porDocumento.map((row) => ({
            tipo: tipoDocumentoLabel(row.tipoDocumento),
            valor: formatMoney(row.valor),
            metros: formatMeters(row.metros),
            movimentos: formatInt(row.movimentos),
            pedidos: formatInt(row.pedidos),
          }))}
          empty="Sem tipo de documento na carga"
        />
      </section>
    </PageShell>
  )
}
