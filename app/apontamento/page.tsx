import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { RefreshForm } from '@/components/refresh-form'
import { getApontamento, getHeaderKpis } from '@/data/dashboard'
import { formatDate, formatInt } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Apontamento' }

export default async function ApontamentoPage() {
  const [header, apontamento] = await Promise.all([
    getHeaderKpis(),
    getApontamento(),
  ])

  return (
    <PageShell
      title="Apontamento"
      description="Costura do funil é só Origem = Produção. Etiqueta, festonê e conserto ficam no mix de serviço."
      actions={<RefreshForm />}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Costura Produção"
          value={formatInt(header?.pecasCosturaProd ?? 0)}
        />
        <KpiCard
          label="Revisão limpa"
          value={formatInt(header?.pecasRevisao ?? 0)}
        />
        <KpiCard
          label={`Hoje (${formatDate(apontamento.hoje)})`}
          value={`${formatInt(apontamento.costuraHoje.reduce((s, r) => s + r.pecas, 0))} / ${formatInt(apontamento.revisaoHoje.reduce((s, r) => s + r.pecas, 0))}`}
          hint="Costura Produção / revisão"
        />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Mix de origem da costura</h2>
        <SimpleTable
          columns={[
            { key: 'origem', label: 'Origem' },
            { key: 'lancamentos', label: 'Lançamentos', numeric: true },
            { key: 'pecas', label: 'Peças', numeric: true },
            { key: 'pedidos', label: 'Pedidos', numeric: true },
            { key: 'uso', label: 'Uso' },
          ]}
          rows={apontamento.mix.map((row) => ({
            origem: row.origem,
            lancamentos: formatInt(row.lancamentos),
            pecas: formatInt(row.pecas),
            pedidos: formatInt(row.pedidos),
            uso:
              row.origemNorm === 'Producao'
                ? 'Funil'
                : row.origemNorm === 'Conserto'
                  ? 'Retrabalho'
                  : 'Serviço / acabamento',
          }))}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Costura Produção por responsável</h2>
          <SimpleTable
            columns={[
              { key: 'nome', label: 'Responsável' },
              { key: 'pecas', label: 'Peças', numeric: true },
            ]}
            rows={apontamento.costuraResp.map((row) => ({
              nome: row.nome,
              pecas: formatInt(row.pecas),
            }))}
          />
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Revisão por responsável</h2>
          <SimpleTable
            columns={[
              { key: 'nome', label: 'Responsável' },
              { key: 'pecas', label: 'Peças', numeric: true },
            ]}
            rows={apontamento.revisaoResp.map((row) => ({
              nome: row.nome,
              pecas: formatInt(row.pecas),
            }))}
          />
        </section>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Costura Produção do dia</h2>
        <SimpleTable
          columns={[
            { key: 'pedido', label: 'Pedido' },
            { key: 'pecas', label: 'Peças', numeric: true },
            { key: 'responsavel', label: 'Responsável' },
            { key: 'produto', label: 'Produto' },
          ]}
          rows={apontamento.costuraHoje.map((row) => ({
            pedido: row.pedido,
            pecas: formatInt(row.pecas),
            responsavel: row.responsavel,
            produto: row.produto,
          }))}
          empty="Nenhum lançamento de Produção hoje"
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Revisão do dia</h2>
        <SimpleTable
          columns={[
            { key: 'pedido', label: 'Pedido' },
            { key: 'pecas', label: 'Peças', numeric: true },
            { key: 'responsavel', label: 'Responsável' },
            { key: 'produto', label: 'Produto' },
          ]}
          rows={apontamento.revisaoHoje.map((row) => ({
            pedido: row.pedido,
            pecas: formatInt(row.pecas),
            responsavel: row.responsavel,
            produto: row.produto,
          }))}
          empty="Nenhum lançamento de revisão hoje"
        />
      </section>
    </PageShell>
  )
}
