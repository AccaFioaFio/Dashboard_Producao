import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { getQualidadeEventos } from '@/data/pedidos'
import { QUALIDADE_TIPO_LABEL } from '@/lib/pedido'
import { formatInt, formatMeters, formatNumber } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Qualidade dos dados' }

export default async function InconsistenciasPage() {
  const grupos = await getQualidadeEventos()
  const total = grupos.reduce((sum, grupo) => sum + grupo.eventos.length, 0)

  return (
    <PageShell
      title="Qualidade dos dados"
      description="Eventos que o ETL já detecta na carga. Órfão 2026 não é sempre erro: revisão e oficina podem ser de pedido cortado em 2025."
    >
      <KpiGrid columns={3}>
        <KpiCard
          label="Eventos"
          value={formatInt(total)}
          hint="Todas as inconsistências e órfãos desta carga"
          tone="indigo"
        />
        <KpiCard
          label="Tipos"
          value={formatInt(grupos.length)}
          hint="Grupos distintos"
          tone="amber"
        />
        <KpiCard
          label="Com pedido"
          value={formatInt(
            grupos.reduce(
              (sum, grupo) => sum + grupo.eventos.filter((row) => row.pedidoNorm).length,
              0,
            ),
          )}
          hint="Linhas ligadas a um Nº pedido"
          tone="teal"
        />
      </KpiGrid>

      {grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum evento de qualidade nesta carga.</p>
      ) : null}

      {grupos.map((grupo) => (
        <section key={grupo.tipo} className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">
            {QUALIDADE_TIPO_LABEL[grupo.tipo] ?? grupo.tipo}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {formatInt(grupo.eventos.length)}
            </span>
          </h2>
          <SimpleTable
            columns={[
              { key: 'pedido', label: 'Pedido', link: true },
              { key: 'detalhe', label: 'Detalhe', wrap: true },
              { key: 'valor', label: 'Valor', numeric: true },
              { key: 'linha', label: 'Linha Excel', numeric: true },
            ]}
            rows={grupo.eventos.slice(0, 80).map((row) => ({
              pedido: row.pedidoNorm,
              detalhe: row.detalhe,
              valor:
                row.valor == null
                  ? '—'
                  : grupo.tipo === 'orfao_signus'
                    ? formatMeters(row.valor)
                    : formatNumber(row.valor, 0),
              linha: row.excelRow != null ? formatInt(row.excelRow) : '—',
              warning: grupo.tipo.startsWith('orfao_'),
              alert:
                grupo.tipo === 'lilica' ||
                grupo.tipo === 'revisao_qtd_eq_pedido' ||
                grupo.tipo === 'revisao_total',
            }))}
          />
          {grupo.eventos.length > 80 ? (
            <p className="text-xs text-muted-foreground">
              Mostrando 80 de {formatInt(grupo.eventos.length)}.
            </p>
          ) : null}
        </section>
      ))}
    </PageShell>
  )
}
