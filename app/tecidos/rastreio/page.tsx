import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { FilterBar } from '@/components/filter-bar'
import { TecidosSubNav } from '@/components/tecidos-valores-nav'
import { getFilterOptions, getTecidosRastreio } from '@/data/dashboard'
import {
  TIPO_TECIDO_LABEL,
  formatDate,
  formatInt,
  formatMeters,
  formatTecido,
} from '@/lib/format'
import { filtersToSearch, parseFilters, type DashFilters } from '@/lib/filters'
import {
  explainTecidoProdutoAgg,
  explainTecidoRastreio,
  explainTecidoTipo,
  tipoTecidoHint,
} from '@/lib/table-explain'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Rastrear baixa Signus' }

function tipoHref(filters: DashFilters, tipoNorm: string) {
  const next: DashFilters = {
    ...filters,
    tipo: filters.tipo === tipoNorm ? undefined : tipoNorm,
  }
  const query = filtersToSearch(next).toString()
  return query ? `/tecidos/rastreio?${query}` : '/tecidos/rastreio'
}

export default async function TecidosRastreioPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const filters = parseFilters(await searchParams)
  const [rastreio, options] = await Promise.all([
    getTecidosRastreio(filters),
    getFilterOptions(),
  ])
  const tipoLabel = filters.tipo
    ? (TIPO_TECIDO_LABEL[filters.tipo] ?? filters.tipo)
    : null

  return (
    <PageShell
      title="Rastrear baixa Signus"
      description="Movimentos Signus linha a linha: produção, canal, inventário, ajuste e demais tipos. Pedido só aparece quando Orig. Mov. traz PED."
      actions={<TecidosSubNav filters={filters} current="rastreio" />}
    >
      <FilterBar
        pathname="/tecidos/rastreio"
        values={filters}
        options={options}
        fields={['mes', 'canal', 'cliente', 'tipo', 'q']}
      />

      <KpiGrid columns={3}>
        <KpiCard
          label="Metros movimentados no recorte"
          value={formatMeters(rastreio.metrosTotal)}
          hint={`${formatInt(rastreio.movimentos)} movimentos Signus`}
          detail="Movimentação Signus · soma de metros no período/filtros."
          tone="teal"
        />
        <KpiCard
          label="Baixa oficial de produção"
          value={formatMeters(rastreio.metrosBaixaOficial)}
          hint="Produção (insumos) + SAIDA FF/AC/TC"
          detail="Signus · tipos de baixa oficiais: Produção (insumos) e SAIDA FF/AC/TC."
          tone="indigo"
        />
        <KpiCard
          label="Metros com nº de pedido"
          value={formatMeters(rastreio.comPedido)}
          hint="Orig. Mov. com pedido"
          detail="Signus · movimentos cujo Orig. Mov. traz nº de pedido."
          tone="teal"
        />
        <KpiCard
          label="Metros sem nº de pedido"
          value={formatMeters(rastreio.semPedido)}
          hint="Inventário, ajuste, texto livre, etc."
          detail="Signus · movimentos sem nº de pedido em Orig. Mov. (inventário, ajuste, texto livre)."
          tone="amber"
          alert={rastreio.semPedido > 0}
        />
      </KpiGrid>

      <div className="grid min-w-0 gap-[var(--page-gap)] lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Por tipo de movimento</h2>
          <p className="text-xs text-muted-foreground">
            Clique em um tipo para ver os tecidos. Só produção e canal entram no KPI
            Baixa Signus da aba principal.
          </p>
          <SimpleTable
            columns={[
              { key: 'tipo', label: 'Tipo' },
              { key: 'metros', label: 'Metros', numeric: true },
              { key: 'movimentos', label: 'Movimentos', numeric: true },
              { key: 'pedidos', label: 'Pedidos', numeric: true },
            ]}
            rows={rastreio.porTipo.map((row) => {
              const selected = filters.tipo === row.tipoNorm
              return {
                tipo: TIPO_TECIDO_LABEL[row.tipoNorm] ?? row.tipoNorm,
                metros: formatMeters(row.metros),
                movimentos: formatInt(row.movimentos),
                pedidos: formatInt(row.pedidos),
                selected,
                href: tipoHref(filters, row.tipoNorm),
                hint: explainTecidoTipo({
                  tipo: TIPO_TECIDO_LABEL[row.tipoNorm] ?? row.tipoNorm,
                  metros: row.metros,
                  movimentos: row.movimentos,
                  pedidos: row.pedidos,
                  extra: tipoTecidoHint(row.tipoNorm),
                  selected,
                }),
              }
            })}
            empty="Sem movimentos Signus no recorte"
          />
        </section>
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">
            {tipoLabel ? `Tecidos em ${tipoLabel}` : 'Por tecido'}
          </h2>
          <p className="text-xs text-muted-foreground">
            {tipoLabel
              ? 'Códigos de produto neste tipo de movimento, no recorte atual.'
              : 'Clique em um tipo à esquerda para isolar. Aqui estão todos os tecidos do recorte.'}
          </p>
          <SimpleTable
            columns={[
              { key: 'tecido', label: 'Tecido', wrap: true },
              { key: 'metros', label: 'Metros', numeric: true },
              { key: 'movimentos', label: 'Movimentos', numeric: true },
              { key: 'pedidos', label: 'Pedidos', numeric: true },
            ]}
            rows={rastreio.porTecido.map((row) => ({
              tecido: formatTecido(row.cod, row.nome),
              metros: formatMeters(row.metros),
              movimentos: formatInt(row.movimentos),
              pedidos: formatInt(row.pedidos),
              hint: explainTecidoProdutoAgg({
                tecido: formatTecido(row.cod, row.nome),
                metros: row.metros,
                movimentos: row.movimentos,
                pedidos: row.pedidos,
              }),
            }))}
            empty={
              tipoLabel
                ? `Sem tecidos em ${tipoLabel} no recorte`
                : 'Sem tecidos no recorte'
            }
          />
        </section>
      </div>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Movimentos</h2>
        <p className="text-xs text-muted-foreground">
          Mais recentes primeiro.
          {rastreio.truncated
            ? ` Mostrando ${formatInt(rastreio.rows.length)} de ${formatInt(rastreio.movimentos)} — refine o recorte.`
            : null}
        </p>
        <SimpleTable
          columns={[
            { key: 'data', label: 'Data' },
            { key: 'tecido', label: 'Tecido', wrap: true },
            { key: 'tipo', label: 'Tipo' },
            { key: 'metros', label: 'Metros', numeric: true },
            { key: 'pedido', label: 'Pedido', link: true },
            { key: 'origem', label: 'Orig. Mov.', wrap: true },
            { key: 'almox', label: 'Almox', wrap: true },
            { key: 'id', label: 'Id mov.' },
          ]}
          rows={rastreio.rows.map((row) => ({
            data: formatDate(row.data),
            tecido: formatTecido(row.cod, row.nome),
            tipo: TIPO_TECIDO_LABEL[row.tipoNorm] ?? row.tipoNorm,
            metros: formatMeters(row.metros, row.metros >= 100 ? 0 : 1),
            pedido: row.pedidoNorm,
            origem: row.origemMov ?? '—',
            almox: row.almox ?? '—',
            id: row.movimentoId ?? '—',
            hint: explainTecidoRastreio({
              data: row.data,
              tecido: formatTecido(row.cod, row.nome),
              tipo: TIPO_TECIDO_LABEL[row.tipoNorm] ?? row.tipoNorm,
              metros: row.metros,
              pedidoNorm: row.pedidoNorm,
              origemMov: row.origemMov,
              almox: row.almox,
              isBaixa: row.isBaixa,
              tipoMovimento: row.tipoMovimento,
            }),
          }))}
          empty="Sem movimentos no recorte. Ajuste filtros ou atualize a carga."
        />
      </section>
    </PageShell>
  )
}
