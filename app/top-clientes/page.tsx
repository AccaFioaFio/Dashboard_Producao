import type { Metadata } from 'next'
import { MousePointerClick } from 'lucide-react'
import { PageShell } from '@/components/page-shell'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { FilterBar } from '@/components/filter-bar'
import { TopClientesSubNav } from '@/components/top-clientes-nav'
import { getTopClientes } from '@/data/dashboard'
import {
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

export default async function TopClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const filters = withCategoriaPadrao(parseFilters(await searchParams))
  const data = await getTopClientes(filters)
  const clienteAtivo = filters.cliente
  const resumoCliente = clienteAtivo
    ? data.ranking.find((row) => row.cliente === clienteAtivo)
    : undefined

  return (
    <PageShell
      title="Top Clientes"
      description={`Ranking comercial ${YEAR} — só venda final (exclui remessa p/ industrialização e oficinas). Metros = baixas Signus por data do movimento (almox ${ALMOX_PRINCIPAIS_LABEL}, categoria MATÉRIA PRIMA por padrão), cruzadas 1× por pedido. Clique num cliente para ver o resumo e os produtos já comprados (Itens.xlsx).`}
      actions={<TopClientesSubNav filters={filters} current="ranking" />}
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
          {resumoCliente ? (
            <>
              <section className="flex min-w-0 flex-col gap-2">
                <h2 className="text-sm font-medium">
                  Resumo · {resumoCliente.cliente}
                </h2>
                <KpiGrid columns={4}>
                  <KpiCard
                    label="Cód. cliente"
                    value={resumoCliente.codCliente || '—'}
                    hint="Parceiro · Código"
                    detail="Código do parceiro no Pedidos.xlsx / Itens.xlsx."
                    tone="indigo"
                  />
                  <KpiCard
                    label="Pedidos"
                    value={formatInt(resumoCliente.pedidos)}
                    hint={`Ticket ${formatMoney(resumoCliente.ticketMedio)}`}
                    detail="Pedidos comerciais de venda final deste cliente no recorte."
                    tone="teal"
                  />
                  <KpiCard
                    label="Faturado"
                    value={formatMoney(resumoCliente.valorFaturado)}
                    hint={`Total ${formatMoney(resumoCliente.valorTotal)}`}
                    detail="Soma do valor faturado nos pedidos deste cliente."
                    tone="amber"
                  />
                  <KpiCard
                    label="Metros / top tecido"
                    value={formatMeters(resumoCliente.metros)}
                    hint={
                      resumoCliente.topTecido
                        ? formatTecido(
                            resumoCliente.topTecido,
                            resumoCliente.topTecidoNome,
                          )
                        : 'Sem baixa Signus'
                    }
                    detail="Metros baixados no Signus cruzados com os pedidos deste cliente."
                    tone="magenta"
                  />
                </KpiGrid>
              </section>

              <section className="flex min-w-0 flex-col gap-2">
                <h2 className="text-sm font-medium">
                  Produtos já comprados
                </h2>
                <p className="text-xs text-muted-foreground">
                  Itens.xlsx · produtos acabados em venda final, cruzados por
                  pedido e código do cliente. Qtd = faturada (ou pedida). Valor =
                  total líquido do item.
                </p>
                <SimpleTable
                  columns={[
                    { key: 'cod', label: 'Cód.' },
                    { key: 'produto', label: 'Produto', wrap: true },
                    { key: 'qtd', label: 'Qtd', numeric: true },
                    { key: 'valor', label: 'Valor', numeric: true },
                    { key: 'pedidos', label: 'Pedidos', numeric: true },
                  ]}
                  rows={data.produtos.map((row) => ({
                    cod: row.cod,
                    produto: row.nome
                      ? `${row.nome}${row.categoria ? ` · ${row.categoria}` : ''}`
                      : row.categoria || '—',
                    qtd: formatNumber(row.qtd, row.qtd % 1 ? 2 : 0),
                    valor: formatMoney(row.valor),
                    pedidos: formatInt(row.pedidos),
                  }))}
                  empty="Nenhum produto acabado neste recorte. Confira se a carga leu Itens.xlsx (ITENS_XLSX)."
                />
              </section>
            </>
          ) : null}

          <section className="flex min-w-0 flex-col gap-2">
            <h2 className="text-sm font-medium">
              {clienteAtivo ? `Cliente · ${clienteAtivo}` : 'Maiores clientes'}
            </h2>
            <p className="card-surface flex items-start gap-2 border-l-[3px] border-l-primary bg-primary/[0.08] px-3 py-2.5 text-sm font-medium text-foreground">
              <MousePointerClick
                className="mt-0.5 size-4 shrink-0 text-primary"
                aria-hidden
              />
              Clique na linha do cliente para ver o resumo e os produtos já
              comprados.
            </p>
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
        </>
      )}
    </PageShell>
  )
}
