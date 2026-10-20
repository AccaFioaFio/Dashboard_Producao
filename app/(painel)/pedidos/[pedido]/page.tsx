import type { Metadata } from 'next'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { PageShell } from '@/components/page-shell'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import {
  PedidoTimeline,
  SectionMeta,
  SectionNote,
  uniqueLabels,
} from '@/components/pedido-ficha'
import {
  getPedidoFicha,
  type LinhaProdutoFicha,
  type PedidoFicha,
} from '@/data/pedidos'
import { QUALIDADE_TIPO_LABEL } from '@/lib/pedido'
import {
  formatDate,
  formatDays,
  formatInt,
  formatMeters,
  formatMoney,
  formatNumber,
  formatTecido,
  TIPO_TECIDO_LABEL,
} from '@/lib/format'
import { parsePedidoParam } from '@/lib/pedido'
import PedidoFichaLoading from './loading'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pedido: string }>
}): Promise<Metadata> {
  const { pedido } = await params
  return { title: `Pedido ${parsePedidoParam(pedido)}` }
}

function formatQtdLancada(value: number | null) {
  if (value == null) return '—'
  return formatNumber(value, value % 1 ? 2 : 0)
}

function celulaProduto(row: LinhaProdutoFicha) {
  return {
    cod: row.codProduto || '—',
    produto: row.produto || '—',
    origem: row.origem || '—',
    pecas: formatQtdLancada(row.pecas),
    responsavel: row.responsavel || '—',
    periodo: formatPeriodo(row.inicio, row.fim),
    warning: row.pendentes > 0 || (row.origemNorm != null && row.origemNorm !== 'Producao'),
    alert: row.defeitos > 0,
  }
}

const colunasProduto = [
  { key: 'cod', label: 'Código do Produto' },
  { key: 'produto', label: 'Produto', wrap: true as const },
  { key: 'pecas', label: 'Peças', numeric: true as const },
  { key: 'responsavel', label: 'Responsável' },
  { key: 'periodo', label: 'Período', nowrap: true as const },
]

function formatPeriodo(inicio: string | null, fim: string | null) {
  if (!inicio && !fim) return '—'
  if (inicio && fim) {
    return inicio === fim ? formatDate(inicio) : `${formatDate(inicio)} – ${formatDate(fim)}`
  }
  if (inicio) return `${formatDate(inicio)} –`
  return `– ${formatDate(fim)}`
}

/** KPIs + timeline — renderizam assim que a ficha resolve (antes das tabelas no stream). */
function PedidoFichaKpis({ ficha }: { ficha: PedidoFicha }) {
  return (
    <>
      {ficha.qualidade.length ? (
        <ul className="card-surface flex flex-col gap-1 px-3 py-2 text-xs text-destructive">
          {ficha.qualidade.map((item) => (
            <li key={`${item.tipo}-${item.detalhe}`}>
              {QUALIDADE_TIPO_LABEL[item.tipo] ?? item.tipo}
              {item.detalhe ? ` · ${item.detalhe}` : ''}
            </li>
          ))}
        </ul>
      ) : null}

      {ficha.corte?.observacao ? (
        <p className="card-surface px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {ficha.corte.observacao}
        </p>
      ) : null}

      <PedidoTimeline
        secoes={[
          { tipo: 'solo', label: 'PCP prontas', date: ficha.datas.pcpProntas },
          {
            tipo: 'par',
            dias: 'dias de corte',
            inicio: { label: 'Início corte', date: ficha.datas.inicioCorte },
            fim: { label: 'Final corte', date: ficha.datas.finalCorte },
          },
          {
            tipo: 'par',
            dias: 'dias de costura',
            inicio: { label: 'Início costura', date: ficha.datas.inicioCostura },
            fim: { label: 'Final costura', date: ficha.datas.finalCostura },
          },
          {
            tipo: 'par',
            dias: 'dias na oficina',
            inicio: { label: 'Envio oficina', date: ficha.datas.envioOficina },
            fim: { label: 'Final oficina', date: ficha.datas.retornoOficina },
            hint:
              [
                ficha.datas.oficinaAberta ? 'Ainda há peças na oficina' : null,
                ficha.datas.prometidaOficina
                  ? `Prometida ${formatDate(ficha.datas.prometidaOficina)}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ') || null,
          },
          {
            tipo: 'par',
            dias: 'dias de revisão',
            inicio: { label: 'Início revisão', date: ficha.datas.inicioRevisao },
            fim: { label: 'Final revisão', date: ficha.datas.finalRevisao },
          },
        ]}
      />

      <KpiGrid columns={7}>
        <KpiCard
          label="Peças cortadas"
          value={formatInt(ficha.totais.pecasCorte)}
          hint={ficha.flags.corte ? 'Soma no Corte deste pedido' : 'Sem Corte 2026'}
          detail="Programação de Corte · QTD PCS CORTADAS deste pedido."
          tone="indigo"
        />
        <KpiCard
          label="Peças de terceiros"
          value={formatInt(ficha.corte?.terceiros ?? 0)}
          hint={ficha.flags.corte ? 'QTD PCS TERCEIROS' : 'Sem Corte 2026'}
          detail="Programação de Corte · QTD PCS TERCEIROS deste pedido."
          tone="amber"
        />
        <KpiCard
          label="Peças de estoque"
          value={formatInt(ficha.corte?.estoque ?? 0)}
          hint={ficha.flags.corte ? 'Retirada do estoque' : 'Sem Corte 2026'}
          detail="Programação de Corte · QTD PCS ESTOQUE (retirada) deste pedido."
          tone="teal"
        />
        <KpiCard
          label="Peças na Costura Produção"
          value={formatInt(ficha.totais.pecasCosturaProd)}
          hint={
            ficha.totais.pecasCosturaServico
              ? `Serviço ${formatInt(ficha.totais.pecasCosturaServico)}`
              : 'Origem = Produção'
          }
          detail="Uma linha por produto e origem. O total é o da aba; a planilha não entra de novo."
          tone="teal"
        />
        <KpiCard
          label="Peças na Revisão"
          value={formatInt(ficha.totais.pecasRevisao)}
          hint="Total por produto"
          detail="Uma linha por produto. O total é o da aba; a planilha não entra de novo."
          tone="magenta"
        />
        <KpiCard
          label="Peças pendentes em oficina"
          value={formatInt(ficha.totais.pendentes)}
          hint={`Enviadas ${formatInt(ficha.totais.enviadas)} · defeitos ${formatInt(ficha.totais.defeitos)}`}
          detail="Oficinas · peças enviadas deste pedido ainda sem retorno."
          alert={ficha.totais.pendentes > 0}
          tone="amber"
        />
        <KpiCard
          label="Dias do ciclo"
          value={formatDays(ficha.totais.diasCiclo, 0)}
          hint="PCP prontas até a última Data Produção da Revisão"
          detail="Dias entre PCP prontas e a última Data Produção na Revisão deste pedido."
          tone="teal"
        />
      </KpiGrid>
    </>
  )
}

/** Tabelas em Suspense — no stream HTML ficam depois dos KPIs. */
function PedidoFichaTabelas({ ficha }: { ficha: PedidoFicha }) {
  const corteResponsaveis = uniqueLabels(ficha.corteProdutos.map((row) => row.responsavel))
  const metrosMeta = [
    ficha.totais.metrosCorte
      ? `${formatMeters(ficha.totais.metrosCorte)} no corte`
      : null,
    ficha.totais.metrosSignusBaixa
      ? `Signus ${formatMeters(ficha.totais.metrosSignusBaixa)}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const corteMeta = [
    ficha.corteProdutos.length
      ? `${formatInt(ficha.corteProdutos.length)} produto${ficha.corteProdutos.length === 1 ? '' : 's'}`
      : null,
    corteResponsaveis.length === 1 ? corteResponsaveis[0] : null,
    metrosMeta || null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Produtos</h2>
        {ficha.itens.length ? (
          <>
            <SectionMeta>
              {ficha.itens.every((row) => row.foraDoSignus)
                ? `${formatInt(ficha.itens.length)} código${ficha.itens.length === 1 ? '' : 's'} lançado${ficha.itens.length === 1 ? '' : 's'} neste pedido. Não há linha em Itens.xlsx, então qtd pedida e valor ficam em branco. Cortado, costurado e revisado = peças lançadas. Corte, costura e revisão = início – fim lançados na aba.`
                : ficha.itens.some((row) => row.foraDoSignus)
                  ? `Itens.xlsx e códigos lançados fora dessa carga. Qtd = pedida; valor = líquido. Cortado, costurado e revisado = peças lançadas deste código. Corte, costura e revisão = início – fim lançados na aba.`
                  : `Itens.xlsx · ${formatInt(ficha.itens.length)} linha${ficha.itens.length === 1 ? '' : 's'} deste pedido. Qtd = pedida; valor = líquido. Cortado, costurado e revisado = peças lançadas deste código. Corte, costura e revisão = início – fim lançados na aba.`}
            </SectionMeta>
            <SimpleTable
              columns={[
                { key: 'cod', label: 'Código' },
                { key: 'produto', label: 'Produto', wrap: true },
                { key: 'qtd', label: 'Qtd', numeric: true },
                { key: 'cortado', label: 'Cortado', numeric: true },
                { key: 'corte', label: 'Corte', nowrap: true },
                { key: 'costurado', label: 'Costurado', numeric: true },
                { key: 'costura', label: 'Costura', nowrap: true },
                { key: 'revisado', label: 'Revisado', numeric: true },
                { key: 'revisao', label: 'Revisão', nowrap: true },
                { key: 'valor', label: 'Valor', numeric: true },
              ]}
              rows={ficha.itens.map((row) => {
                const valor =
                  row.valorLiquido > 0 ? row.valorLiquido : row.valorBruto
                const nome = row.nomeProduto
                  ? `${row.nomeProduto}${row.categoriaProduto ? ` · ${row.categoriaProduto}` : ''}`
                  : row.categoriaProduto || '—'
                return {
                  cod: row.codProduto,
                  produto: nome,
                  qtd:
                    row.qtdPedida == null
                      ? '—'
                      : formatNumber(row.qtdPedida, row.qtdPedida % 1 ? 2 : 0),
                  cortado: formatQtdLancada(row.qtdCortada),
                  corte: formatPeriodo(row.inicioCorte, row.fimCorte),
                  costurado: formatQtdLancada(row.qtdCosturada),
                  costura: formatPeriodo(row.inicioCostura, row.fimCostura),
                  revisado: formatQtdLancada(row.qtdRevisada),
                  revisao: formatPeriodo(row.inicioRevisao, row.fimRevisao),
                  valor: valor > 0 ? formatMoney(valor) : '—',
                }
              })}
            />
          </>
        ) : (
          <SectionNote>
            Sem itens deste pedido na carga de Itens.xlsx.
          </SectionNote>
        )}
      </section>

      {ficha.corteProdutos.length ? (
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Corte</h2>
          <SectionMeta>{corteMeta}</SectionMeta>
          <SimpleTable
            columns={colunasProduto}
            rows={ficha.corteProdutos.map(celulaProduto)}
          />
        </section>
      ) : null}

      {ficha.costura.length ? (
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Costura</h2>
          <SimpleTable
            columns={[
              colunasProduto[0],
              colunasProduto[1],
              { key: 'origem', label: 'Serviço' },
              ...colunasProduto.slice(2),
            ]}
            rows={ficha.costura.map(celulaProduto)}
          />
        </section>
      ) : (
        <SectionNote>Sem lançamento de Costura em 2026.</SectionNote>
      )}

      {ficha.revisao.length ? (
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Revisão</h2>
          <SimpleTable
            columns={colunasProduto}
            rows={ficha.revisao.map(celulaProduto)}
          />
        </section>
      ) : (
        <SectionNote>Sem lançamento de Revisão em 2026.</SectionNote>
      )}

      {ficha.oficinas.length ? (
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Oficinas</h2>
          <SectionMeta>
            {[
              `${formatInt(ficha.oficinas.length)} produto${ficha.oficinas.length === 1 ? '' : 's'}`,
              ficha.totais.pendentes
                ? `${formatInt(ficha.totais.pendentes)} pendentes`
                : 'sem pendentes',
              ficha.totais.defeitos
                ? `${formatInt(ficha.totais.defeitos)} defeitos`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </SectionMeta>
          <SimpleTable
            columns={colunasProduto}
            rows={ficha.oficinas.map(celulaProduto)}
          />
        </section>
      ) : null}

      {ficha.signus.length ? (
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Signus</h2>
          <SectionMeta>
            {`${formatInt(ficha.signus.length)} movimento${ficha.signus.length === 1 ? '' : 's'} · ${formatMeters(ficha.totais.metrosSignusBaixa)} em baixa`}
          </SectionMeta>
          <SimpleTable
            columns={[
              { key: 'data', label: 'Data' },
              { key: 'tecido', label: 'Tecido', wrap: true },
              { key: 'metros', label: 'Metros', numeric: true },
              { key: 'tipo', label: 'Tipo' },
            ]}
            rows={ficha.signus.map((row) => ({
              data: formatDate(row.data),
              tecido: formatTecido(row.codProduto, row.nomeProduto),
              metros: formatMeters(row.metros, row.metros >= 10 ? 0 : 1),
              tipo: TIPO_TECIDO_LABEL[row.tipoNorm] ?? row.tipoNorm,
              warning: !row.isBaixa,
            }))}
          />
        </section>
      ) : (
        <SectionNote>Sem movimento Signus com este PED em Orig. Mov.</SectionNote>
      )}
    </>
  )
}

async function PedidoFichaContent({ pedido }: { pedido: string }) {
  const ficha = await getPedidoFicha(pedido)
  if (!ficha) notFound()

  const statusLabels = uniqueLabels(
    ficha.ocs.length
      ? ficha.ocs.map((oc) => oc.status)
      : [ficha.corte?.statusVigente],
  )
  const status = statusLabels.join(' · ') || null
  const cliente = ficha.corte?.cliente

  return (
    <PageShell
      title={`Pedido ${ficha.pedidoNorm}`}
      description={
        [cliente, ficha.corte?.canal, status].filter(Boolean).join(' · ') ||
        'Pedido 2026 sem cabeçalho de Corte neste ano.'
      }
    >
      <PedidoFichaKpis ficha={ficha} />
      <Suspense fallback={null}>
        <PedidoFichaTabelas ficha={ficha} />
      </Suspense>
    </PageShell>
  )
}

export default async function PedidoFichaPage({
  params,
}: {
  params: Promise<{ pedido: string }>
}) {
  const { pedido } = await params
  return (
    <Suspense fallback={<PedidoFichaLoading />}>
      <PedidoFichaContent pedido={pedido} />
    </Suspense>
  )
}
