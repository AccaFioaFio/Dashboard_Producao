import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { FilterBar } from '@/components/filter-bar'
import { BrazilMap } from '@/components/brazil-map'
import { VendasEstadoRanking } from '@/components/vendas-estado-ranking'
import { VendasRepresentantesButton } from '@/components/vendas-rep-nav'
import { getVendasPorEstado } from '@/data/vendas-estado'
import {
  MONTH_LABELS,
  formatInt,
  formatMeters,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatTecido,
} from '@/lib/format'
import { filtersToSearch, parseFilters } from '@/lib/filters'
import { YEAR } from '@/lib/year'
import { isUfBrasil } from '@/lib/uf'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Venda por estado' }

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function formatTendencia(ritmo: number | null) {
  if (ritmo == null || !Number.isFinite(ritmo)) return 'sem base em 2025'
  const pct = Math.round((ritmo - 1) * 100)
  if (pct === 0) return 'ritmo igual a 2025'
  return `${pct > 0 ? '+' : ''}${pct}% vs 2025`
}

export default async function VendasEstadoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const filters = parseFilters(params)
  const ufParam = first(params.uf)?.trim().toUpperCase()
  const data = getVendasPorEstado(filters)
  const mesAbertoLabel =
    data.mesAberto > 0 ? MONTH_LABELS[data.mesAberto - 1] : '—'
  const mesProximoLabel =
    data.mesProximo != null ? MONTH_LABELS[data.mesProximo - 1] : '—'
  const selected =
    data.ranking.find((row) => row.uf === ufParam) ??
    data.ranking.find((row) => row.noMapa) ??
    data.ranking[0]
  const lider = data.ranking[0]
  const segundo = data.ranking[1]
  const values = Object.fromEntries(
    data.ranking.filter((row) => row.noMapa).map((row) => [row.uf, row.faturado]),
  )

  function hrefFor(uf: string) {
    const query = filtersToSearch(filters)
    query.set('uf', uf)
    return `/vendas?${query.toString()}`
  }

  return (
    <PageShell
      title="Venda por estado"
      description={`Venda final de ${YEAR} por UF do endereço principal do parceiro. A diferença é a distância para o estado acima no ranking. A projeção é o mesmo mês de ${YEAR - 1} no ritmo da empresa, repartido pela fatia de cada UF nos meses já fechados.`}
      actions={<VendasRepresentantesButton filters={filters} />}
    >
      <FilterBar
        pathname="/vendas"
        values={filters}
        options={data.options}
        fields={['mes', 'canal']}
      />

      {!data.loaded ? (
        <p className="text-sm text-muted-foreground">
          Carregue Pedidos.xlsx e rode a carga para liberar esta aba.
        </p>
      ) : data.parceiros === 0 ? (
        <p className="text-sm text-muted-foreground">
          O cadastro Parceiro Comercial.xlsx ainda não entrou na carga. Atualize
          os dados para cruzar a UF.
        </p>
      ) : (
        <>
          <KpiGrid columns={5}>
            <KpiCard
              label={filters.mes ? `Faturado · ${MONTH_LABELS[filters.mes - 1]}` : `Faturado ${YEAR}`}
              value={formatMoneyCompact(data.faturado)}
              hint={
                data.faturadoExterior > 0
                  ? `Exterior ${formatMoneyCompact(data.faturadoExterior)}`
                  : 'Endereço principal do parceiro'
              }
              detail="Pedidos.xlsx · valor faturado da venda final, cruzado com a UF principal de Parceiro Comercial.xlsx."
              tone="teal"
            />
            <KpiCard
              label="Estados com venda"
              value={formatInt(data.estadosComVenda)}
              hint={lider ? `Líder ${lider.uf}` : '—'}
              detail="UFs do Brasil com faturamento no recorte. Exterior e sem UF ficam fora do mapa e entram no ranking."
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
                  ? `${lider.uf} à frente de ${segundo.uf}`
                  : 'Um estado no recorte'
              }
              detail="Faturado do 1º menos o faturado do 2º. Na tabela, cada linha mostra a distância para o estado imediatamente acima."
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
              detail={`Um número só para a empresa: ${mesProximoLabel} de ${YEAR - 1} × ritmo dos meses fechados. Na tabela, cada UF recebe a fatia do que faturou nesses meses. A mesma conta vale para representantes.`}
              tone="indigo"
            />
          </KpiGrid>

          <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(16rem,0.95fr)]">
            <BrazilMap
              values={values}
              selected={selected && isUfBrasil(selected.uf) ? selected.uf : undefined}
              query={filtersToSearch(filters).toString()}
            />
            <section className="card-surface flex flex-col gap-2 p-3">
              <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                {selected ? `${selected.posicao}º` : 'Estado'}
              </p>
              <h2 className="text-lg font-bold tracking-tight">
                {selected ? `${selected.nome} · ${selected.uf}` : '—'}
              </h2>
              {selected ? (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
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
                    <dt className="text-[10px] text-muted-foreground">Para o de cima</dt>
                    <dd className="font-mono font-medium tabular-nums">
                      {selected.diferencaReais == null
                        ? 'líder'
                        : formatMoneyCompact(selected.diferencaReais)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-muted-foreground">Fatia da projeção</dt>
                    <dd className="font-medium">
                      {formatNumber(selected.participacaoFechadaPct, 1)}% dos meses fechados
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-muted-foreground">
                      {mesAbertoLabel} realizado
                    </dt>
                    <dd className="font-mono font-medium tabular-nums">
                      {formatMoneyCompact(selected.realizadoMesAberto)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-muted-foreground">
                      Projeção {mesProximoLabel}
                    </dt>
                    <dd className="font-mono font-medium tabular-nums">
                      {selected.projecaoProximoMes == null
                        ? '—'
                        : formatMoneyCompact(selected.projecaoProximoMes)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma venda no recorte.</p>
              )}
              <p className="text-[10px] leading-snug text-muted-foreground">
                {formatInt(selected?.pedidos ?? 0)} pedidos ·{' '}
                {formatInt(selected?.parceiros ?? 0)} parceiros
              </p>
            </section>
          </div>

          <section className="flex min-w-0 flex-col gap-2">
            <h2 className="text-sm font-medium">Ranking</h2>
            <p className="text-xs text-muted-foreground">
              Diferença = quanto este estado fica atrás do imediatamente acima,
              em reais e em pontos de participação. Projeção {mesProximoLabel}{' '}
              é a fatia deste estado na projeção da empresa e não acompanha o
              filtro de mês. O + abre os clientes da UF, na mesma base do Top
              Clientes.
            </p>
            <VendasEstadoRanking
              selectedUf={selected?.uf}
              initialOpenUf={ufParam && selected?.uf === ufParam ? selected.uf : undefined}
              projecaoLabel={`Projeção ${mesProximoLabel}`}
              rows={data.ranking.map((row) => ({
                uf: row.uf,
                href: hrefFor(row.uf),
                posicao: row.posicao,
                estado: `${row.uf} · ${row.nome}`,
                faturado: formatMoneyCompact(row.faturado),
                participacao: `${formatNumber(row.participacaoPct, 1)}%`,
                pedidos: formatInt(row.pedidos),
                parceiros: formatInt(row.parceiros),
                diferenca:
                  row.diferencaReais == null
                    ? 'líder'
                    : `${formatMoneyCompact(row.diferencaReais)} · ${formatNumber(row.diferencaPp ?? 0, 1)} p.p.`,
                projecao:
                  row.projecaoProximoMes == null
                    ? '—'
                    : formatMoneyCompact(row.projecaoProximoMes),
                clientes: row.clientes.map((cliente) => {
                  const query = filtersToSearch({
                    ...filters,
                    cliente: cliente.cliente,
                  }).toString()
                  const tecido = cliente.topTecido
                    ? formatTecido(cliente.topTecido, cliente.topTecidoNome)
                    : null
                  return {
                    href: query ? `/top-clientes?${query}` : '/top-clientes',
                    cod: cliente.codCliente || '—',
                    cliente: cliente.cliente,
                    pedidos: formatInt(cliente.pedidos),
                    faturado: formatMoney(cliente.valorFaturado),
                    ticket: formatMoney(cliente.ticketMedio),
                    part: `${formatNumber(cliente.participacaoPct, 1)}%`,
                    metros: formatMeters(cliente.metros),
                    topTecido: tecido
                      ? `${tecido} (${formatMeters(cliente.topTecidoMetros)})`
                      : cliente.produtoTerceiros
                        ? 'Produto de terceiros'
                        : '—',
                  }
                }),
              }))}
            />
          </section>
        </>
      )}
    </PageShell>
  )
}
