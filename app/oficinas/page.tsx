import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { RefreshForm } from '@/components/refresh-form'
import { getHeaderKpis, getOficinas } from '@/data/dashboard'
import { formatDate, formatInt, formatNumber } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Oficinas' }

export default async function OficinasPage() {
  const [header, oficinas] = await Promise.all([getHeaderKpis(), getOficinas()])
  const retorno =
    oficinas.enviadas > 0 ? (oficinas.retornadas / oficinas.enviadas) * 100 : 0

  return (
    <PageShell
      title="Oficinas"
      description="Somente lotes com Data Envio em 2026 e oficina preenchida."
      actions={<RefreshForm />}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Pendentes" value={formatInt(header?.oficinasPendentes ?? 0)} />
        <KpiCard
          label="Defeitos"
          value={formatInt(header?.oficinasDefeitos ?? 0)}
        />
        <KpiCard
          label="Retorno"
          value={`${formatNumber(retorno, 1)}%`}
          hint={`${formatInt(oficinas.retornadas)} de ${formatInt(oficinas.enviadas)} enviadas`}
        />
        <KpiCard
          label="SLA (lotes)"
          value={`${formatInt(oficinas.sla.noPrazo)} / ${formatInt(oficinas.sla.atraso)}`}
          hint={`${formatInt(oficinas.sla.abertos)} lotes abertos · ${formatInt(oficinas.sla.lotes)} no ano`}
        />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Pendente por oficina</h2>
        <SimpleTable
          columns={[
            { key: 'nome', label: 'Oficina' },
            { key: 'pendentes', label: 'Pendentes', numeric: true },
            { key: 'enviadas', label: 'Enviadas', numeric: true },
            { key: 'retornadas', label: 'Retornadas', numeric: true },
            { key: 'defeitos', label: 'Defeitos', numeric: true },
          ]}
          rows={oficinas.ranking.map((row) => ({
            nome: row.nome,
            pendentes: formatInt(row.pecas),
            enviadas: formatInt(row.enviadas),
            retornadas: formatInt(row.retornadas),
            defeitos: formatInt(row.defeitos),
          }))}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Enviadas sem retorno e sem pendente</h2>
        <SimpleTable
          columns={[
            { key: 'oficina', label: 'Oficina' },
            { key: 'pedido', label: 'Pedido' },
            { key: 'enviadas', label: 'Enviadas', numeric: true },
            { key: 'data', label: 'Envio' },
          ]}
          rows={oficinas.semRetorno.map((row) => ({
            oficina: row.oficina,
            pedido: row.pedido,
            enviadas: formatInt(row.enviadas),
            data: formatDate(row.data),
          }))}
          empty="Nenhum lote nessa quebra"
        />
      </section>
    </PageShell>
  )
}
