import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { SimpleTable } from '@/components/simple-table'
import { PedidoQueue } from '@/components/pedido-queue'
import { FilterBar } from '@/components/filter-bar'
import { FatiaChips } from '@/components/fatia-chips'
import { getFilterOptions } from '@/data/dashboard'
import { getPedidosLista } from '@/data/pedidos'
import { funilSliceMeta } from '@/lib/funil'
import { parseFilters } from '@/lib/filters'
import { formatDate, formatInt } from '@/lib/format'

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

  return (
    <PageShell
      title="Pedidos"
      description={`${meta.label}: ${formatInt(lista.total)} pedido${lista.total === 1 ? '' : 's'}. ${meta.hint} Clique no número para a ficha.`}
    >
      <FilterBar
        pathname="/pedidos"
        values={filters}
        options={options}
        fields={['mes', 'canal', 'cliente', 'responsavel', 'q']}
      />
      <FatiaChips pathname="/pedidos" values={{ ...filters, fatia: lista.fatia }} />

      <PedidoQueue
        empty="Nenhum pedido nesta fatia"
        rows={lista.rows.map((row) => ({
          pedido: row.pedidoNorm,
          title: row.statusVigente ?? undefined,
          lines: [
            row.cliente,
            row.canal,
            row.pecas ? `${formatInt(row.pecas)} pçs corte` : null,
            formatDate(row.data),
          ],
          warning: row.statusVigente === 'AGUARDANDO TECIDO',
          alert: row.statusVigente === 'EM PRODUÇÃO',
        }))}
      />

      <div className="hidden md:block">
        <SimpleTable
          columns={[
            { key: 'pedido', label: 'Pedido', link: true },
            { key: 'data', label: 'Data' },
            { key: 'status', label: 'Status' },
            { key: 'cliente', label: 'Cliente' },
            { key: 'canal', label: 'Canal' },
            { key: 'pecas', label: 'Corte', numeric: true },
            { key: 'costura', label: 'Costura Prod.', numeric: true },
            { key: 'revisao', label: 'Revisão', numeric: true },
            { key: 'oficina', label: 'Of. pend.', numeric: true },
            { key: 'passou', label: 'Passou por' },
          ]}
          rows={lista.rows.map((row) => ({
            pedido: row.pedidoNorm,
            data: formatDate(row.data),
            status: row.statusVigente,
            cliente: row.cliente,
            canal: row.canal,
            pecas: row.pecas ? formatInt(row.pecas) : '—',
            costura: row.pecasCosturaProd ? formatInt(row.pecasCosturaProd) : '—',
            revisao: row.pecasRevisao ? formatInt(row.pecasRevisao) : '—',
            oficina: row.oficinasPendentes ? formatInt(row.oficinasPendentes) : '—',
            passou: [
              row.noCorte ? 'Corte' : null,
              row.noCosturaProd ? 'Costura' : null,
              row.noRevisao ? 'Revisão' : null,
              row.noOficinas ? 'Oficina' : null,
              row.noSignus ? 'Signus' : null,
            ]
              .filter(Boolean)
              .join(' · '),
            warning: row.statusVigente === 'AGUARDANDO TECIDO',
            alert: row.statusVigente === 'EM PRODUÇÃO',
          }))}
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
