import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { FilterBar } from '@/components/filter-bar'
import { VendasEstadosButton } from '@/components/vendas-rep-nav'
import { getVendasPorRepresentante } from '@/data/vendas-representante'
import {
  MONTH_LABELS,
  formatInt,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
} from '@/lib/format'
import { filtersToSearch, parseFilters } from '@/lib/filters'
import { YEAR } from '@/lib/year'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Venda por representante' }

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function formatTendencia(ritmo: number | null) {
  if (ritmo == null || !Number.isFinite(ritmo)) return 'sem base em 2025'
  const pct = Math.round((ritmo - 1) * 100)
  if (pct === 0) return 'ritmo igual a 2025'
  return `${pct > 0 ? '+' : ''}${pct}% vs 2025`
}

function formatRitmoCurto(ritmo: number | null) {
  if (ritmo == null || !Number.isFinite(ritmo)) return null
  const pct = Math.round((ritmo - 1) * 100)
  if (pct === 0) return 'igual a 2025'
  return `${pct > 0 ? '+' : ''}${pct}% vs 2025`
}

function formatProjecaoIndividual(
  valor: number | null,
  ritmo: number | null,
  usaRitmoEmpresa: boolean,
  mesLabel: string,
) {
  if (valor == null) return 'sem base'
  if (!usaRitmoEmpresa && valor === 0 && ritmo != null && ritmo > 0) {
    return `sem ${mesLabel}/2025`
  }
  const money = formatMoneyCompact(valor)
  if (usaRitmoEmpresa) return `${money} · ritmo da empresa`
  const ritmoTxt = formatRitmoCurto(ritmo)
  return ritmoTxt ? `${money} · ${ritmoTxt}` : money
}

export default async function VendasRepresentantePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const filters = parseFilters(params)
  const repParam = first(params.rep)?.trim()
  const data = getVendasPorRepresentante(filters)
  const mesAbertoLabel = data.mesAberto > 0 ? MONTH_LABELS[data.mesAberto - 1] : '—'
  const mesProximoLabel =
    data.mesProximo != null ? MONTH_LABELS[data.mesProximo - 1] : '—'
  const selected =
    data.ranking.find((row) => row.representante === repParam) ?? data.ranking[0]
  const lider = data.ranking[0]
  const segundo = data.ranking[1]

  function hrefFor(representante: string) {
    const query = filtersToSearch(filters)
    query.set('rep', representante)
    return `/vendas/representantes?${query.toString()}`
  }

  return (
    <PageShell
      title="Venda por representante"
      description={`Venda final de ${YEAR} pelo vendedor do pedido. A diferença é a distância para o representante acima no ranking. ${mesProximoLabel}\u00A0·\u00A0empresa reparte a projeção da empresa pela fatia de cada um nos meses fechados. ${mesProximoLabel}\u00A0·\u00A0ritmo dele é o mesmo mês de ${YEAR - 1} desse representante no ritmo dele.`}
      actions={<VendasEstadosButton filters={filters} />}
    >
      <FilterBar
        pathname="/vendas/representantes"
        values={filters}
        options={data.options}
        fields={['mes', 'canal']}
      />

      {!data.loaded ? (
        <p className="text-sm text-muted-foreground">
          Carregue Pedidos.xlsx e rode a carga para liberar esta aba.
        </p>
      ) : (
        <>
          <KpiGrid columns={5}>
            <KpiCard
              label={
                filters.mes
                  ? `Faturado · ${MONTH_LABELS[filters.mes - 1]}`
                  : `Faturado ${YEAR}`
              }
              value={formatMoneyCompact(data.faturado)}
              hint="Coluna Vendedor do pedido"
              detail="Pedidos.xlsx · valor faturado da venda final, agrupado pelo representante."
              tone="teal"
            />
            <KpiCard
              label="Representantes com venda"
              value={formatInt(data.representantesComVenda)}
              hint={lider ? `Líder ${lider.representante}` : '—'}
              detail="Quem teve faturamento no recorte. Pedido sem vendedor entra como sem representante."
              tone="indigo"
            />
            <KpiCard
              label="Diferença do líder"
              value={
                lider && segundo
                  ? formatMoneyCompact(lider.faturado - segundo.faturado)
                  : '—'
              }
              hint={
                lider && segundo
                  ? `${lider.representante} à frente`
                  : 'Um representante no recorte'
              }
              detail="Faturado do 1º menos o faturado do 2º. Na tabela, cada linha mostra a distância para o representante imediatamente acima."
              tone="amber"
            />
            <KpiCard
              label={`${mesAbertoLabel} realizado / projetado`}
              value={formatMoneyCompact(data.realizadoMesAberto)}
              hint={`Projetado ${formatMoneyCompact(data.projecaoMesAberto)}`}
              detail={`${mesAbertoLabel} ainda está aberto: o realizado é o que já entrou; o projetado é ${mesAbertoLabel} de ${YEAR - 1} no ritmo da empresa. O filtro de mês não altera esta conta.`}
              tone="magenta"
            />
            <KpiCard
              label={`Projeção ${mesProximoLabel}`}
              value={formatMoneyCompact(data.projecaoProximoMes)}
              hint={formatTendencia(data.ritmoGeral)}
              detail={`Um número só para a empresa: ${mesProximoLabel} de ${YEAR - 1} × ritmo dos meses fechados. Na tabela, ${mesProximoLabel} · empresa reparte esse total pela fatia de cada representante. ${mesProximoLabel} · ritmo dele usa o ${mesProximoLabel} de ${YEAR - 1} e o ritmo desse representante, e a soma dessas linhas pode diferir deste cartão.`}
              tone="indigo"
            />
          </KpiGrid>

          {selected ? (
            <section className="card-surface flex flex-col gap-2 p-3">
              <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                {selected.posicao === 1
                  ? '1º · quem mais vende neste recorte'
                  : `${selected.posicao}º no ranking`}
              </p>
              <h2 className="text-lg font-bold tracking-tight break-words">{selected.representante}</h2>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-3 xl:grid-cols-7">
                <div>
                  <dt className="text-[10px] text-muted-foreground">Faturado</dt>
                  <dd className="font-mono font-medium tabular-nums">
                    {formatMoney(selected.faturado)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] text-muted-foreground">Participação</dt>
                  <dd className="font-mono font-medium tabular-nums">
                    {formatNumber(selected.participacaoPct, 1)}%
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] text-muted-foreground">Pedidos</dt>
                  <dd className="font-mono font-medium tabular-nums">
                    {formatInt(selected.pedidos)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] text-muted-foreground">Clientes</dt>
                  <dd className="font-mono font-medium tabular-nums">
                    {formatInt(selected.clientes)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] text-muted-foreground">Para o de cima</dt>
                  <dd className="font-mono font-medium tabular-nums">
                    {selected.diferencaReais == null
                      ? 'líder'
                      : formatMoneyCompact(selected.diferencaReais)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] text-muted-foreground">{mesProximoLabel} · empresa</dt>
                  <dd className="font-mono font-medium tabular-nums">
                    {selected.projecaoProximoMes == null
                      ? '—'
                      : formatMoneyCompact(selected.projecaoProximoMes)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] text-muted-foreground">{mesProximoLabel} · ritmo dele</dt>
                  <dd className="font-mono font-medium tabular-nums">
                    {formatProjecaoIndividual(
                      selected.projecaoProximoMesIndividual,
                      selected.ritmoIndividual,
                      selected.projecaoIndividualUsaRitmoEmpresa,
                      mesProximoLabel,
                    )}
                  </dd>
                </div>
              </dl>
              <p className="text-[10px] leading-snug text-muted-foreground">
                {formatNumber(selected.participacaoFechadaPct, 1)}% da projeção da empresa
                · {mesAbertoLabel} realizado {formatMoneyCompact(selected.realizadoMesAberto)}
                ·{' '}
                {selected.projecaoIndividualUsaRitmoEmpresa
                  ? 'ritmo dele usa o ritmo da empresa, porque não há base nos meses fechados de 2025'
                  : selected.ritmoIndividual == null
                    ? 'ritmo dele sem base em 2025'
                    : `ritmo dele ${formatRitmoCurto(selected.ritmoIndividual)}`}
              </p>
            </section>
          ) : null}

          <section className="flex min-w-0 flex-col gap-2">
            <h2 className="text-sm font-medium">Ranking</h2>
            <p className="text-xs text-muted-foreground">
              Diferença = quanto este representante fica atrás do imediatamente acima,
              em reais e em pontos de participação. Pedidos e clientes são a contagem
              da venda final no recorte. {mesProximoLabel} · empresa é a fatia dele na
              projeção da empresa. {mesProximoLabel} · ritmo dele é o {mesProximoLabel}{' '}
              de {YEAR - 1} desse representante multiplicado pelo ritmo dele nos meses
              já fechados. As duas colunas ignoram o filtro de mês. Sem venda dele nesse
              período de {YEAR - 1}, a coluna fica sem base; se a base existir só no mês,
              entra o ritmo da empresa.
            </p>
            <SimpleTable
              comfortable
              columns={[
                { key: 'posicao', label: '#', numeric: true },
                { key: 'representante', label: 'Representante', wrap: true },
                { key: 'faturado', label: 'Faturado', numeric: true },
                { key: 'participacao', label: 'Part.', numeric: true },
                { key: 'pedidos', label: 'Pedidos', numeric: true },
                { key: 'clientes', label: 'Clientes', numeric: true },
                { key: 'diferenca', label: 'Diferença', numeric: true },
                { key: 'projecao', label: `${mesProximoLabel} · empresa`, numeric: true },
                { key: 'projecaoIndividual', label: `${mesProximoLabel} · ritmo dele`, numeric: true },
              ]}
              rows={data.ranking.map((row) => ({
                href: hrefFor(row.representante),
                selected: selected?.representante === row.representante,
                posicao: row.posicao,
                representante: row.representante,
                faturado: formatMoneyCompact(row.faturado),
                participacao: `${formatNumber(row.participacaoPct, 1)}%`,
                pedidos: formatInt(row.pedidos),
                clientes: formatInt(row.clientes),
                diferenca:
                  row.diferencaReais == null
                    ? 'líder'
                    : `${formatMoneyCompact(row.diferencaReais)} · ${formatNumber(row.diferencaPp ?? 0, 1)} p.p.`,
                projecao:
                  row.projecaoProximoMes == null
                    ? '—'
                    : formatMoneyCompact(row.projecaoProximoMes),
                projecaoIndividual: formatProjecaoIndividual(
                  row.projecaoProximoMesIndividual,
                  row.ritmoIndividual,
                  row.projecaoIndividualUsaRitmoEmpresa,
                  mesProximoLabel,
                ),
              }))}
              empty="Nenhuma venda final neste recorte."
            />
          </section>
        </>
      )}
    </PageShell>
  )
}
