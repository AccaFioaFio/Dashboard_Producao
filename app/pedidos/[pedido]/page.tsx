import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageShell } from '@/components/page-shell'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import {
  PedidoTimeline,
  SectionMeta,
  SectionNote,
  isGenericProduto,
  uniqueLabels,
} from '@/components/pedido-ficha'
import { getPedidoFicha } from '@/data/pedidos'
import { QUALIDADE_TIPO_LABEL } from '@/lib/pedido'
import {
  formatDate,
  formatDays,
  formatInt,
  formatMeters,
  formatMoney,
  formatProduto,
  formatTecido,
  TIPO_TECIDO_LABEL,
} from '@/lib/format'
import { parsePedidoParam } from '@/lib/pedido'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pedido: string }>
}): Promise<Metadata> {
  const { pedido } = await params
  return { title: `Pedido ${parsePedidoParam(pedido)}` }
}

function formatMetrosCell(value: number | null | undefined) {
  if (value == null) return '—'
  return formatMeters(value, value >= 10 ? 0 : 1)
}

export default async function PedidoFichaPage({
  params,
}: {
  params: Promise<{ pedido: string }>
}) {
  const { pedido } = await params
  const ficha = await getPedidoFicha(pedido)
  if (!ficha) notFound()

  const statusLabels = uniqueLabels(
    ficha.ocs.length
      ? ficha.ocs.map((oc) => oc.status)
      : [ficha.corte?.statusVigente],
  )
  const status = statusLabels.join(' · ') || null
  const cliente = ficha.corte?.cliente
  const statusMix = statusLabels.length > 1

  const linhaByExcel = new Map(
    ficha.linhas.map((row) => [row.excelRow, row] as const),
  )
  const corteRows =
    ficha.ocs.length > 0
      ? ficha.ocs.map((oc) => {
          const linha = linhaByExcel.get(oc.excelRow)
          return {
            excelRow: oc.excelRow,
            data: oc.data,
            tecido: formatProduto(oc),
            metros: linha?.metros ?? null,
            economia: linha?.economia ?? null,
            pecas: oc.pecas,
            status: oc.status,
            responsavel: oc.responsavel,
            isHeader: true,
          }
        })
      : ficha.linhas
          .filter(
            (row) =>
              row.isHeader ||
              row.metros != null ||
              row.pecas != null ||
              row.tecido,
          )
          .map((row) => ({
            excelRow: row.excelRow,
            data: null as string | null,
            tecido: formatTecido(row.codTecido, row.tecido),
            metros: row.metros,
            economia: row.economia,
            pecas: row.pecas,
            status: row.status,
            responsavel: null as string | null,
            isHeader: row.isHeader,
          }))

  const corteResponsaveis = uniqueLabels(corteRows.map((row) => row.responsavel))
  const showCorteResponsavel = corteResponsaveis.length > 1
  const showEconomia = corteRows.some(
    (row) => row.economia != null && row.economia !== 0,
  )

  const pecasRef =
    ficha.totais.pecasCorte ||
    ficha.totais.pecasCosturaProd ||
    ficha.totais.pecasRevisao

  const hideOficinasProduto = ficha.oficinas
    .map((row) => formatProduto(row))
    .every(isGenericProduto)

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
    corteRows.length
      ? `${formatInt(corteRows.length)} OC${corteRows.length === 1 ? '' : 's'}`
      : null,
    !showCorteResponsavel && corteResponsaveis[0]
      ? corteResponsaveis[0]
      : null,
    metrosMeta || null,
    pecasRef ? `${formatInt(pecasRef)} pç` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <PageShell
      title={`Pedido ${ficha.pedidoNorm}`}
      description={
        [cliente, ficha.corte?.canal, status].filter(Boolean).join(' · ') ||
        'Pedido 2026 sem cabeçalho de Corte neste ano.'
      }
    >
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
        steps={[
          { label: 'PCP prontas', date: ficha.datas.pcpProntas },
          { label: 'Início corte', date: ficha.datas.inicioCorte },
          { label: 'Final corte', date: ficha.datas.finalCorte },
          { label: 'Costura Produção', date: ficha.datas.primeiraCosturaProd },
          { label: 'Envio oficina', date: ficha.datas.ultimoEnvio },
          { label: 'Retorno oficina', date: ficha.datas.ultimoRetorno },
          { label: '1ª revisão', date: ficha.datas.primeiraRevisao },
          { label: 'Última revisão', date: ficha.datas.ultimaRevisao },
        ]}
      />

      <KpiGrid columns={5}>
        <KpiCard
          label="Peças cortadas"
          value={formatInt(ficha.totais.pecasCorte)}
          hint={ficha.flags.corte ? 'Soma no Corte deste pedido' : 'Sem Corte 2026'}
          detail="Planilha de Corte · SUM da quantidade deste pedido."
          tone="indigo"
        />
        <KpiCard
          label="Peças na Costura Produção"
          value={formatInt(ficha.totais.pecasCosturaProd)}
          hint={
            ficha.totais.pecasCosturaServico
              ? `Serviço ${formatInt(ficha.totais.pecasCosturaServico)}`
              : 'Origem = Produção'
          }
          detail="Relatório de Costura · peças com Origem = Produção deste pedido."
          tone="teal"
        />
        <KpiCard
          label="Peças na Revisão"
          value={formatInt(ficha.totais.pecasRevisao)}
          hint="Pode ser maior que o corte (recorte de ano ou vários lançamentos)"
          detail="Relatório de Revisão · peças limpas deste pedido."
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

      {corteRows.length ? (
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Corte</h2>
          <SectionMeta>{corteMeta}</SectionMeta>
          {statusMix ? (
            <SectionNote>
              Status mistos neste pedido — cada OC mostra o seu.
            </SectionNote>
          ) : null}
          <SimpleTable
            columns={[
              { key: 'data', label: 'Data' },
              { key: 'tecido', label: 'Tecido', wrap: true },
              { key: 'metros', label: 'Metros', numeric: true },
              ...(showEconomia
                ? [{ key: 'economia', label: 'Economia', numeric: true as const }]
                : []),
              { key: 'pecas', label: 'Peças', numeric: true },
              { key: 'status', label: 'Status' },
              ...(showCorteResponsavel
                ? [{ key: 'responsavel', label: 'Responsável' }]
                : []),
            ]}
            rows={corteRows.map((row) => ({
              data: formatDate(row.data),
              tecido: row.tecido,
              metros: formatMetrosCell(row.metros),
              economia: formatMetrosCell(row.economia),
              pecas: row.pecas != null ? formatInt(row.pecas) : '—',
              status: row.status,
              responsavel: row.responsavel,
              alert: row.status === 'EM PRODUÇÃO',
              warning: row.status === 'AGUARDANDO TECIDO',
            }))}
          />
        </section>
      ) : null}

      {ficha.costura.length ? (
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Costura</h2>
          <SimpleTable
            columns={[
              { key: 'data', label: 'Data' },
              { key: 'origem', label: 'Origem' },
              { key: 'pecas', label: 'Peças', numeric: true },
              { key: 'responsavel', label: 'Responsável' },
              { key: 'produto', label: 'Produto', wrap: true },
            ]}
            rows={ficha.costura.map((row) => ({
              data: formatDate(row.dataProducao),
              origem: row.origem,
              pecas: formatInt(row.pecas),
              responsavel: row.responsavel,
              produto: formatProduto(row),
              warning: row.origemNorm !== 'Producao',
            }))}
          />
        </section>
      ) : (
        <SectionNote>Sem lançamento de Costura em 2026.</SectionNote>
      )}

      {ficha.revisao.length ? (
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Revisão</h2>
          <SimpleTable
            columns={[
              { key: 'data', label: 'Data' },
              { key: 'pecas', label: 'Peças', numeric: true },
              { key: 'responsavel', label: 'Responsável' },
              { key: 'produto', label: 'Produto', wrap: true },
            ]}
            rows={ficha.revisao.map((row) => ({
              data: formatDate(row.dataProducao),
              pecas: formatInt(row.pecas),
              responsavel: row.responsavel,
              produto: formatProduto(row),
            }))}
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
              `${formatInt(ficha.oficinas.length)} lote${ficha.oficinas.length === 1 ? '' : 's'}`,
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
            columns={[
              { key: 'oficina', label: 'Oficina' },
              ...(!hideOficinasProduto
                ? [{ key: 'produto', label: 'Produto', wrap: true as const }]
                : []),
              { key: 'envio', label: 'Envio' },
              { key: 'retorno', label: 'Retorno' },
              { key: 'enviadas', label: 'Enviadas', numeric: true },
              { key: 'retornadas', label: 'Retornadas', numeric: true },
              { key: 'pendentes', label: 'Pendentes', numeric: true },
              { key: 'defeitos', label: 'Defeitos', numeric: true },
              { key: 'valor', label: 'Valor', numeric: true },
            ]}
            rows={ficha.oficinas.map((row) => ({
              oficina: row.oficina,
              produto: formatProduto(row),
              envio: formatDate(row.dataEnvio),
              retorno: formatDate(row.dataRetorno),
              enviadas: formatInt(row.enviadas),
              retornadas: formatInt(row.retornadas),
              pendentes: formatInt(row.pendentes),
              defeitos: formatInt(row.defeitos),
              valor: row.valorTotal != null ? formatMoney(row.valorTotal) : '—',
              warning: row.pendentes > 0,
              alert: row.defeitos > 0,
            }))}
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
    </PageShell>
  )
}
