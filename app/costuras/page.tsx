import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { RefreshForm } from '@/components/refresh-form'
import {
  getCosturas,
  getFunil,
  getHeaderKpis,
  getSerieMensal,
} from '@/data/dashboard'
import { MONTH_LABELS, formatDate, formatInt } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Costuras' }

export default async function CosturasPage() {
  const [header, costuras, funil, serie] = await Promise.all([
    getHeaderKpis(),
    getCosturas(),
    getFunil(),
    getSerieMensal(),
  ])
  const pecasServico = costuras.mix
    .filter((row) => row.origemNorm !== 'Producao')
    .reduce((sum, row) => sum + row.pecas, 0)
  const pecasHoje = costuras.doDia.reduce((sum, row) => sum + row.pecas, 0)

  return (
    <PageShell
      title="Costuras"
      description="Funil usa só Origem = Produção. Etiqueta, festonê e conserto ficam no mix de serviço."
      actions={<RefreshForm />}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Produção"
          value={formatInt(header?.pecasCosturaProd ?? 0)}
          hint="Origem = Produção"
        />
        <KpiCard
          label="Serviço"
          value={formatInt(pecasServico)}
          hint="Etiqueta, festonê, conserto e demais origens"
        />
        <KpiCard
          label="Pedidos com Costura"
          value={formatInt(funil?.comCostura ?? 0)}
          hint={`${formatInt(funil?.semCostura ?? 0)} pedidos de Corte sem Costura Produção`}
        />
        <KpiCard
          label={`Hoje (${formatDate(costuras.hoje)})`}
          value={formatInt(pecasHoje)}
          hint="Lançamentos Origem = Produção"
        />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Mix de origem</h2>
        <SimpleTable
          columns={[
            { key: 'origem', label: 'Origem' },
            { key: 'lancamentos', label: 'Lançamentos', numeric: true },
            { key: 'pecas', label: 'Peças', numeric: true },
            { key: 'pedidos', label: 'Pedidos', numeric: true },
            { key: 'uso', label: 'Uso' },
          ]}
          rows={costuras.mix.map((row) => ({
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
          <h2 className="text-sm font-medium">Por mês</h2>
          <SimpleTable
            columns={[
              { key: 'mes', label: 'Mês' },
              { key: 'pecas', label: 'Peças', numeric: true },
            ]}
            rows={serie.map((row) => ({
              mes: MONTH_LABELS[row.mes - 1],
              pecas: formatInt(row.costura),
            }))}
          />
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Por responsável</h2>
          <SimpleTable
            columns={[
              { key: 'nome', label: 'Responsável' },
              { key: 'pecas', label: 'Peças', numeric: true },
              { key: 'pedidos', label: 'Pedidos', numeric: true },
            ]}
            rows={costuras.porResponsavel.map((row) => ({
              nome: row.nome,
              pecas: formatInt(row.pecas),
              pedidos: formatInt(row.pedidos),
            }))}
          />
        </section>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Produção do dia</h2>
        <SimpleTable
          columns={[
            { key: 'pedido', label: 'Pedido' },
            { key: 'pecas', label: 'Peças', numeric: true },
            { key: 'responsavel', label: 'Responsável' },
            { key: 'produto', label: 'Produto' },
          ]}
          rows={costuras.doDia.map((row) => ({
            pedido: row.pedido,
            pecas: formatInt(row.pecas),
            responsavel: row.responsavel,
            produto: row.produto,
          }))}
          empty="Nenhum lançamento de Produção hoje"
        />
      </section>
    </PageShell>
  )
}
