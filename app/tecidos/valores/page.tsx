import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { RefreshForm } from '@/components/refresh-form'
import { FilterBar } from '@/components/filter-bar'
import { TecidosMetrosButton } from '@/components/tecidos-valores-nav'
import { getFilterOptions, getTecidosValores } from '@/data/dashboard'
import {
  formatDate,
  formatInt,
  formatMeters,
  formatMoney,
  formatNumber,
  shortTecido,
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
      description="Valor unitário do Signus e valor unitário × quantidade baixada. Inventário, NF e lançamento auxiliar aparecem na coluna tipo de documento e não entram no KPI de baixa de produção."
      actions={
        <>
          <TecidosMetrosButton filters={filters} />
          <RefreshForm />
        </>
      }
    >
      <FilterBar
        pathname="/tecidos/valores"
        values={filters}
        options={options}
        fields={['mes', 'canal', 'cliente', 'q']}
      />

      {!valores.hasValores || valores.movimentosComValor === 0 ? (
        <p className="card-surface px-4 py-3 text-sm text-muted-foreground">
          Sem valor unitário na carga. Clique em Atualizar dados para reler o Signus
          (custo bruto, valor unitário contábil e tipo de documento).
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Valor da baixa"
          value={formatMoney(valores.valorBaixa)}
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
          value={formatMoney(valores.valorConsumoEst)}
          hint={`${formatNumber(cobertura, 1)}% do consumo estimado já baixado em valor`}
          tone="amber"
        />
        <KpiCard
          label="Custo por metro / peça"
          value={`${formatMoney(custoMetro)}`}
          hint={`${formatMoney(custoPeca)} por peça cortada no recorte`}
          tone="magenta"
        />
        <KpiCard
          label="Inventário (documento)"
          value={formatMoney(valores.valorInventario)}
          hint="Tipo de documento = Inventário. Fora do KPI de baixa."
        />
        <KpiCard
          label="Compras (NF entrada)"
          value={formatMoney(valores.valorCompras)}
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
      </div>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Valores por tecido</h2>
        <p className="text-xs text-muted-foreground">
          Valor unitário médio do código e valor unitário × quantidade baixada no Signus.
          O consumo é o apontamento do Corte no mesmo código.
        </p>
        <SimpleTable
          columns={[
            { key: 'tecido', label: 'Tecido' },
            { key: 'vu', label: 'Valor unitário', numeric: true },
            { key: 'baixa', label: 'Qtd baixada', numeric: true },
            { key: 'valorBaixa', label: 'VU × qtd baixada', numeric: true },
            { key: 'consumo', label: 'Consumo Corte', numeric: true },
            { key: 'valorConsumo', label: 'VU × consumo', numeric: true },
            { key: 'pedidos', label: 'Pedidos', numeric: true },
          ]}
          rows={valores.porTecido.map((row) => ({
            tecido: `${row.cod !== '(sem código)' ? `${row.cod} · ` : ''}${shortTecido(row.nome)}`,
            vu: row.valorUnitario == null ? '—' : formatMoney(row.valorUnitario),
            baixa: formatMeters(row.baixa, row.baixa >= 10 ? 0 : 1),
            valorBaixa: formatMoney(row.valorBaixa),
            consumo: formatMeters(row.consumo, row.consumo >= 10 ? 0 : 1),
            valorConsumo: formatMoney(row.valorConsumoEst),
            pedidos: formatInt(row.pedidos),
          }))}
          empty="Sem tecido com valor na carga"
        />
      </section>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Pedido a pedido</h2>
        <p className="text-xs text-muted-foreground">
          Consumo apontado no Corte versus baixa Signus do mesmo pedido (Orig. Mov. = PED).
          Tipo de documento diz se a movimentação foi inventário, NF, lançamento auxiliar ou
          transferência.
        </p>
        <SimpleTable
          columns={[
            { key: 'pedido', label: 'Pedido' },
            { key: 'cliente', label: 'Cliente' },
            { key: 'consumo', label: 'Consumo', numeric: true },
            { key: 'baixa', label: 'Baixa', numeric: true },
            { key: 'delta', label: 'Delta', numeric: true },
            { key: 'vu', label: 'VU médio', numeric: true },
            { key: 'valor', label: 'VU × baixa', numeric: true },
            { key: 'documento', label: 'Tipo de documento' },
          ]}
          rows={valores.porPedido.map((row) => ({
            pedido: row.pedidoNorm,
            cliente: row.cliente,
            consumo: formatMeters(row.consumo, row.consumo >= 10 ? 0 : 1),
            baixa: formatMeters(row.baixa, row.baixa >= 10 ? 0 : 1),
            delta: formatMeters(row.consumo - row.baixa, 0),
            vu: row.valorUnitario == null ? '—' : formatMoney(row.valorUnitario),
            valor: formatMoney(row.valorBaixa),
            documento: documentosLabel(row.documentos),
            warning: row.consumo > 0 && row.baixa === 0,
            alert: row.baixa > 0 && row.consumo === 0,
          }))}
          empty="Sem pedido com consumo ou baixa no recorte"
        />
      </section>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Por tipo de documento</h2>
        <p className="text-xs text-muted-foreground">
          Coluna Tipo de documento do Signus: inventário, nota fiscal, lançamento auxiliar
          e transferência. Só produção + SAIDA FF/AC/TC soma o valor da baixa.
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

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Maiores movimentações</h2>
        <p className="text-xs text-muted-foreground">
          Até 150 lançamentos, ordenados pelo valor (unitário × quantidade).
        </p>
        <SimpleTable
          columns={[
            { key: 'data', label: 'Data' },
            { key: 'pedido', label: 'Pedido' },
            { key: 'tecido', label: 'Tecido' },
            { key: 'documento', label: 'Tipo de documento' },
            { key: 'qtd', label: 'Qtd', numeric: true },
            { key: 'vu', label: 'Valor unitário', numeric: true },
            { key: 'total', label: 'VU × qtd', numeric: true },
          ]}
          rows={valores.movimentos.map((row) => ({
            data: formatDate(row.data),
            pedido: row.pedidoNorm ?? row.origemMov ?? '—',
            tecido: `${row.cod} · ${shortTecido(row.nome)}`,
            documento: tipoDocumentoLabel(row.tipoDocumento),
            qtd: formatNumber(row.qtd, row.qtd >= 10 ? 0 : 2),
            vu: row.valorUnitario == null ? '—' : formatMoney(row.valorUnitario),
            total: row.valorTotal == null ? '—' : formatMoney(row.valorTotal),
            warning: tipoDocumentoLabel(row.tipoDocumento) === 'Inventário',
          }))}
          empty="Sem movimentação Signus com valor"
        />
      </section>
    </PageShell>
  )
}
