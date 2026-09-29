import type { Metadata } from 'next'
import { MousePointerClick } from 'lucide-react'
import { PageShell } from '@/components/page-shell'
import { SimpleTable } from '@/components/simple-table'
import { PedidoQueue } from '@/components/pedido-queue'
import { FilterBar } from '@/components/filter-bar'
import { FatiaChips } from '@/components/fatia-chips'
import { getFilterOptions } from '@/data/dashboard'
import { getPedidosLista } from '@/data/pedidos'
import { funilSliceMeta } from '@/lib/funil'
import { parseFilters } from '@/lib/filters'
import { formatDate, formatInt, formatProduto } from '@/lib/format'
import { pedidoHref } from '@/lib/pedido'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Pedidos' }

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const filters = parseFilters(await searchParams)
  const [lista, options] = await Promise.all([
    getPedidosLista(filters),
    getFilterOptions(),
  ])
  const meta = funilSliceMeta(lista.fatia)
  const ocFatia = lista.fatia === 'wip' || lista.fatia === 'aguardandoTecido'

  return (
    <PageShell
      title="Pedidos"
      description={`${meta.label}: ${formatInt(lista.total)} ${ocFatia ? 'ordem(ns) de corte' : `pedido${lista.total === 1 ? '' : 's'}`}. ${meta.hint}`}
    >
      <FilterBar
        pathname="/pedidos"
        values={filters}
        options={options}
        fields={['mes', 'canal', 'cliente', 'responsavel', 'q']}
      />
      <FatiaChips pathname="/pedidos" values={{ ...filters, fatia: lista.fatia }} />

      <p className="card-surface flex items-start gap-2 border-l-[3px] border-l-primary bg-primary/[0.08] px-3 py-2.5 text-sm font-medium text-foreground">
        <MousePointerClick
          className="mt-0.5 size-4 shrink-0 text-primary"
          aria-hidden
        />
        Clique na linha do pedido para abrir a ficha e ver os produtos
        (Itens.xlsx) daquele número.
      </p>

      <PedidoQueue
        empty="Nenhum pedido nesta fatia"
        rows={lista.rows.map((row) => ({
          pedido: row.pedidoNorm,
          title: row.statusVigente ?? undefined,
          lines: [
            row.cliente,
            row.canal,
            formatProduto(row) === '—' ? null : formatProduto(row),
            row.pecas
              ? `${formatInt(row.pecas)} pçs ${ocFatia ? 'OC' : 'corte'}`
              : null,
            formatDate(row.data),
          ],
          warning:
            row.statusVigente === 'AGUARDANDO TECIDO' ||
            Boolean(row.statusVigente?.includes('AGUARDANDO TECIDO')),
          alert:
            row.statusVigente === 'EM PRODUÇÃO' ||
            Boolean(row.statusVigente?.includes('EM PRODUÇÃO')),
        }))}
      />

      <div className="hidden md:block">
        <SimpleTable
          columns={
            ocFatia
              ? [
                  { key: 'pedido', label: 'Pedido', link: true },
                  { key: 'data', label: 'Data' },
                  { key: 'status', label: 'Status OC' },
                  { key: 'cliente', label: 'Cliente' },
                  { key: 'canal', label: 'Canal' },
                  { key: 'produto', label: 'Produto', wrap: true },
                  { key: 'pecas', label: 'Peças OC', numeric: true },
                ]
              : [
                  { key: 'pedido', label: 'Pedido', link: true },
                  { key: 'data', label: 'Data' },
                  { key: 'status', label: 'Status' },
                  { key: 'cliente', label: 'Cliente' },
                  { key: 'canal', label: 'Canal' },
                  { key: 'produto', label: 'Produto', wrap: true },
                  { key: 'pecas', label: 'Corte', numeric: true },
                  { key: 'costura', label: 'Costura Prod.', numeric: true },
                  { key: 'revisao', label: 'Revisão', numeric: true },
                  { key: 'oficina', label: 'Of. pend.', numeric: true },
                  { key: 'passou', label: 'Passou por' },
                ]
          }
          rows={lista.rows.map((row) => {
            const produto = formatProduto(row)
            const warning = ocFatia
              ? row.statusVigente === 'AGUARDANDO TECIDO'
              : Boolean(row.statusVigente?.includes('AGUARDANDO TECIDO'))
            const alert = ocFatia
              ? row.statusVigente === 'EM PRODUÇÃO'
              : Boolean(row.statusVigente?.includes('EM PRODUÇÃO'))
            return {
              pedido: row.pedidoNorm,
              data: formatDate(row.data),
              status: row.statusVigente,
              cliente: row.cliente,
              canal: row.canal,
              produto,
              pecas: row.pecas ? formatInt(row.pecas) : '—',
              costura: row.pecasCosturaProd
                ? formatInt(row.pecasCosturaProd)
                : '—',
              revisao: row.pecasRevisao ? formatInt(row.pecasRevisao) : '—',
              oficina: row.oficinasPendentes
                ? formatInt(row.oficinasPendentes)
                : '—',
              passou: [
                row.noCorte ? 'Corte' : null,
                row.noCosturaProd ? 'Costura' : null,
                row.noRevisao ? 'Revisão' : null,
                row.noOficinas ? 'Oficina' : null,
                row.noSignus ? 'Signus' : null,
              ]
                .filter(Boolean)
                .join(' · '),
              href: pedidoHref(row.pedidoNorm),
              warning,
              alert,
            }
          })}
          empty="Nenhum pedido nesta fatia"
        />
      </div>

      {lista.total > lista.rows.length ? (
        <p className="text-xs text-muted-foreground">
          Mostrando {formatInt(lista.rows.length)} de {formatInt(lista.total)}. Afine o recorte
          para ver o restante.
        </p>
      ) : null}
    </PageShell>
  )
}
