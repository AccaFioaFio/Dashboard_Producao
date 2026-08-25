import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { MonthlyAreaChart } from '@/components/monthly-area-chart'
import { RefreshForm } from '@/components/refresh-form'
import { FilterBar } from '@/components/filter-bar'
import { TecidosValoresButton } from '@/components/tecidos-valores-nav'
import { getFilterOptions, getTecidos } from '@/data/dashboard'
import {
  MONTH_LABELS,
  TIPO_TECIDO_LABEL,
  formatInt,
  formatMeters,
  formatNumber,
  formatTecido,
} from '@/lib/format'
import { parseFilters } from '@/lib/filters'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Tecidos' }

export default async function TecidosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const filters = parseFilters(await searchParams)
  const [tecidos, options] = await Promise.all([
    getTecidos(filters),
    getFilterOptions(),
  ])
  const metrosCorte = tecidos.metrosCorte
  const metrosSignus = tecidos.metrosSignus
  const metrosEconomia = tecidos.metrosEconomia
  const economiaPct = metrosCorte > 0 ? (metrosEconomia / metrosCorte) * 100 : 0
  const delta = metrosCorte - metrosSignus
  const cobertura = metrosCorte > 0 ? (metrosSignus / metrosCorte) * 100 : 0

  return (
    <PageShell
      title="Tecidos"
      description="Consumo apontado no Corte versus baixa real no Signus. Só Linha = TECIDO entra no fato Signus; a baixa oficial é Produção (insumos) + SAIDA FF/AC/TC."
      actions={
        <>
          <TecidosValoresButton filters={filters} />
          <RefreshForm />
        </>
      }
    >
      <FilterBar
        pathname="/tecidos"
        values={filters}
        options={options}
        fields={['mes', 'canal', 'cliente', 'q']}
      />

      <KpiGrid columns={3}>
        <KpiCard
          label="Consumo no Corte"
          value={formatMeters(metrosCorte)}
          hint="SUM de MTS / TECIDOS no recorte"
          tone="teal"
        />
        <KpiCard
          label="Baixa Signus"
          value={formatMeters(metrosSignus)}
          hint={`${formatInt(tecidos.movimentosBaixa)} movimentos · ${formatInt(tecidos.pedidosComBaixa)} pedidos`}
          tone="indigo"
        />
        <KpiCard
          label="Corte − Signus"
          value={formatMeters(delta)}
          hint={`${formatNumber(cobertura, 1)}% da programação baixada no Signus`}
          tone="amber"
        />
        <KpiCard
          label="Economia de tecido"
          value={formatMeters(metrosEconomia)}
          hint={`${formatNumber(economiaPct, 1)}% do consumo do Corte`}
          tone="teal"
          progress={Math.min(100, Math.max(12, economiaPct * 12))}
        />
        <KpiCard
          label="Aguardando tecido"
          value={`${formatInt(tecidos.tecidoPedidos)} / ${formatMeters(tecidos.tecidoMetros)}`}
          hint={`${formatInt(tecidos.tecidoPecas)} pçs com status AGUARDANDO TECIDO`}
          alert={tecidos.tecidoPedidos > 0}
        />
        <KpiCard
          label="Retorno do corte"
          value={formatMeters(tecidos.retornoCorte)}
          hint={`${formatInt(tecidos.baixasSemPedido)} baixas Signus sem nº de pedido em Orig. Mov.`}
          tone="magenta"
        />
      </KpiGrid>

      <div className="grid min-w-0 gap-[var(--page-gap)]">
        <MonthlyAreaChart
          title="Corte"
          description="Metros apontados no Corte, mês a mês."
          labels={tecidos.porMes.map((row) => MONTH_LABELS[row.mes - 1])}
          series={[
            {
              key: 'corte',
              label: 'Corte',
              color: 'var(--chart-1)',
              values: tecidos.porMes.map((row) => row.corte),
            },
          ]}
        />
        <MonthlyAreaChart
          title="Baixa Signus"
          description="Metros baixados no Signus (produção + canal), mês a mês."
          labels={tecidos.porMes.map((row) => MONTH_LABELS[row.mes - 1])}
          series={[
            {
              key: 'signus',
              label: 'Baixa Signus',
              color: 'var(--chart-2)',
              values: tecidos.porMes.map((row) => row.signus),
            },
          ]}
        />
      </div>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Tecidos mais usados</h2>
        <p className="text-xs text-muted-foreground">
          Ranking do Corte 2026. A coluna Signus é a baixa real do mesmo código de produto.
        </p>
        <SimpleTable
          columns={[
            { key: 'tecido', label: 'Tecido', wrap: true },
            { key: 'corte', label: 'Corte', numeric: true },
            { key: 'share', label: '% Corte', numeric: true },
            { key: 'signus', label: 'Signus', numeric: true },
            { key: 'economia', label: 'Economia', numeric: true },
            { key: 'pedidos', label: 'Pedidos', numeric: true },
          ]}
          rows={tecidos.porTecido.map((row) => ({
            tecido: formatTecido(row.cod, row.nome),
            corte: formatMeters(row.metros),
            share:
              metrosCorte > 0
                ? `${formatNumber((row.metros / metrosCorte) * 100, 1)}%`
                : '—',
            signus: formatMeters(row.signusMetros),
            economia: formatMeters(row.economia, row.economia >= 10 ? 0 : 1),
            pedidos: formatInt(row.pedidos),
          }))}
          empty="Sem consumo de tecido na carga"
        />
      </section>

      <div className="grid min-w-0 gap-[var(--page-gap)] lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Por mês</h2>
          <SimpleTable
            columns={[
              { key: 'mes', label: 'Mês' },
              { key: 'corte', label: 'Corte', numeric: true },
              { key: 'signus', label: 'Signus', numeric: true },
            ]}
            rows={tecidos.porMes.map((row) => ({
              mes: MONTH_LABELS[row.mes - 1],
              corte: formatMeters(row.corte),
              signus: formatMeters(row.signus),
            }))}
          />
        </section>
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Baixa Signus por tipo</h2>
          <SimpleTable
            columns={[
              { key: 'tipo', label: 'Tipo' },
              { key: 'metros', label: 'Metros', numeric: true },
              { key: 'movimentos', label: 'Movimentos', numeric: true },
              { key: 'pedidos', label: 'Pedidos', numeric: true },
            ]}
            rows={tecidos.porTipo.map((row) => ({
              tipo: TIPO_TECIDO_LABEL[row.tipoNorm] ?? row.tipoNorm,
              metros: formatMeters(row.metros),
              movimentos: formatInt(row.movimentos),
              pedidos: formatInt(row.pedidos),
            }))}
            empty="Sem movimentação Signus. Atualize os dados."
          />
        </section>
      </div>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Corte × baixa Signus</h2>
        <p className="text-xs text-muted-foreground">
          Cruza COD TECIDO da programação com Código produto do Signus. Orig. Mov. no
          formato PED 23456 liga o movimento ao pedido.
        </p>
        <SimpleTable
          columns={[
            { key: 'tecido', label: 'Tecido', wrap: true },
            { key: 'corte', label: 'Corte', numeric: true },
            { key: 'signus', label: 'Signus', numeric: true },
            { key: 'delta', label: 'Delta', numeric: true },
          ]}
          rows={tecidos.cruzados.map((row) => ({
            tecido: formatTecido(row.cod, row.nome),
            corte: formatMeters(row.corteMetros),
            signus: formatMeters(row.signusMetros),
            delta: formatMeters(row.corteMetros - row.signusMetros),
          }))}
        />
      </section>

      <div className="grid min-w-0 gap-[var(--page-gap)] lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Baixa Signus por canal</h2>
          <SimpleTable
            columns={[
              { key: 'nome', label: 'Canal' },
              { key: 'metros', label: 'Metros', numeric: true },
              { key: 'movimentos', label: 'Movimentos', numeric: true },
            ]}
            rows={tecidos.porCanalSignus.map((row) => ({
              nome: row.nome === '(sem canal)' ? 'Produção (insumos)' : row.nome,
              metros: formatMeters(row.metros),
              movimentos: formatInt(row.movimentos),
            }))}
          />
        </section>
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Signus sem código no Corte</h2>
          <SimpleTable
            columns={[
              { key: 'tecido', label: 'Tecido', wrap: true },
              { key: 'signus', label: 'Signus', numeric: true },
              { key: 'pedidos', label: 'Pedidos', numeric: true },
            ]}
            rows={tecidos.signusSemCorte.map((row) => ({
              tecido: formatTecido(row.cod, row.nome),
              signus: formatMeters(row.signusMetros),
              pedidos: formatInt(row.signusPedidos),
            }))}
            empty="Toda baixa Signus tem código no Corte"
          />
        </section>
      </div>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Aguardando tecido para produção</h2>
        <p className="text-xs text-muted-foreground">
          Status AGUARDANDO TECIDO na programação de Corte: pedido, tecido e metros parados.
        </p>
        <SimpleTable
          columns={[
            { key: 'pedido', label: 'Pedido' },
            { key: 'cliente', label: 'Cliente' },
            { key: 'tecido', label: 'Tecido', wrap: true },
            { key: 'metros', label: 'Metros', numeric: true },
            { key: 'pecas', label: 'Peças', numeric: true },
            { key: 'status', label: 'Status' },
          ]}
          rows={tecidos.tecido.map((row) => ({
            pedido: row.pedidoNorm,
            cliente: row.cliente,
            tecido: formatTecido(row.codTecido, row.tecido),
            metros: formatNumber(row.metros, row.metros >= 100 ? 0 : 1),
            pecas: formatInt(row.pecas),
            status: row.statusVigente ?? 'AGUARDANDO TECIDO',
          }))}
          empty="Nenhum pedido aguardando tecido"
        />
      </section>
    </PageShell>
  )
}
