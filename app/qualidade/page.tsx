import type { Metadata } from 'next'
import { Timer } from 'lucide-react'
import { PageShell } from '@/components/page-shell'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { MonthlyAreaChart } from '@/components/monthly-area-chart'
import { FilterBar } from '@/components/filter-bar'
import { getFilterOptions, getTempoProducao } from '@/data/dashboard'
import {
  MONTH_LABELS,
  formatDate,
  formatDays,
  formatInt,
  formatNumber,
} from '@/lib/format'
import { parseFilters } from '@/lib/filters'
import {
  explainFaixa,
  explainGrupo,
  explainMes,
  explainTempoAberto,
  explainTempoCiclo,
  explainTempoInvertido,
  explainTempoSemPcp,
} from '@/lib/tempo-explain'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Tempo de produção' }

function pct(part: number, total: number) {
  if (!total) return '—'
  return `${formatNumber((part / total) * 100, 0)}%`
}

export default async function TempoProducaoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const filters = parseFilters(await searchParams)
  const [tempo, options] = await Promise.all([
    getTempoProducao(filters),
    getFilterOptions(),
  ])
  const foraDaMedia = tempo.revisaoSemPcp + tempo.inconsistentes + tempo.semDatas

  return (
    <PageShell
      title="Tempo de produção"
      description="Passe o mouse nas linhas para ver o ciclo do pedido e a observação do Corte, se houver. Início = PCP prontas. Fim = última Data Produção da Revisão."
    >
      <FilterBar
        pathname="/qualidade"
        values={filters}
        options={options}
        fields={['mes', 'canal', 'cliente', 'responsavel', 'q']}
      />

      <KpiGrid columns={5}>
        <KpiCard
          label="Pedidos no ciclo"
          value={formatInt(tempo.medidos)}
          hint={`${pct(tempo.medidos, tempo.recorte)} do recorte · ${formatInt(tempo.pecasMedidas)} peças`}
          detail={`Pedidos com PCP prontas e Data Produção na Revisão.\n${formatInt(tempo.medidos)} de ${formatInt(tempo.recorte)} pedidos do recorte (${pct(tempo.medidos, tempo.recorte)}).\n${formatInt(tempo.comPcp)} com PCP · ${formatInt(tempo.comRevisao)} com Revisão.`}
          tone="indigo"
          progress={
            tempo.recorte
              ? Math.min(100, (tempo.medidos / tempo.recorte) * 100)
              : 0
          }
        />
        <KpiCard
          label="Mediana"
          value={formatDays(tempo.medianaDias)}
          hint="Metade dos pedidos fecha até este prazo"
          detail={`Metade dos ${formatInt(tempo.medidos)} pedidos medidos sai de PCP prontas e chega na Revisão em até ${formatDays(tempo.medianaDias)}.\nFaixa ${formatDays(tempo.minDias, 0)} a ${formatDays(tempo.maxDias, 0)}. A mediana não é puxada por lotes enormes.`}
          tone="teal"
        />
        <KpiCard
          label="Média por pedido"
          value={formatDays(tempo.mediaDias)}
          hint={
            tempo.mediaPonderadaPecas != null
              ? `Por peça ${formatDays(tempo.mediaPonderadaPecas)} — lotes grandes demoram mais`
              : 'PCP prontas → última Revisão'
          }
          detail={`Média simples: cada pedido vale 1, hoje ${formatDays(tempo.mediaDias)}.\nMédia por peça: ${formatDays(tempo.mediaPonderadaPecas)}. Sobe quando os pedidos grandes ficam mais tempo no ciclo.`}
          tone="amber"
        />
        <KpiCard
          label="P90"
          value={formatDays(tempo.p90Dias)}
          hint="9 em cada 10 pedidos fecham até aqui"
          detail={`90% dos pedidos medidos saem de PCP prontas e chegam na Revisão em até ${formatDays(tempo.p90Dias)}.\nOs 10% mais lentos ficam na tabela abaixo.`}
          tone="magenta"
        />
        <KpiCard
          label="Aguardando Revisão"
          value={formatInt(tempo.pcpSemRevisao)}
          hint="PCP prontas, ainda sem Data Produção"
          detail={`Ciclo aberto: o PCP já marcou prontas, mas o pedido ainda não aparece no Relatório de Revisão 2026.\n${formatInt(tempo.pcpSemRevisao)} de ${formatInt(tempo.recorte)} pedidos. Não entra na média enquanto não houver Data Produção.`}
          warning={tempo.pcpSemRevisao > 0}
          progress={
            tempo.recorte
              ? Math.min(100, (tempo.pcpSemRevisao / tempo.recorte) * 100)
              : 0
          }
        />
      </KpiGrid>

      <KpiGrid columns={3}>
        <KpiCard
          label="PCP → Final do corte"
          value={formatDays(tempo.etapaCorte.media)}
          hint={
            tempo.etapaCorte.n
              ? `Mediana ${formatDays(tempo.etapaCorte.mediana)} · ${formatInt(tempo.etapaCorte.n)} pedidos`
              : 'Só com as duas datas no Corte'
          }
          detail={`Do dia em que o PCP ficou pronto até o Final do corte.\nMédia ${formatDays(tempo.etapaCorte.media)} · mediana ${formatDays(tempo.etapaCorte.mediana)} em ${formatInt(tempo.etapaCorte.n ?? 0)} pedidos com as duas datas.`}
          tone="indigo"
        />
        <KpiCard
          label="Final do corte → Revisão"
          value={formatDays(tempo.etapaPosCorte.media)}
          hint={
            tempo.etapaPosCorte.n
              ? `Mediana ${formatDays(tempo.etapaPosCorte.mediana)} · ${formatInt(tempo.etapaPosCorte.n)} pedidos`
              : 'Costura, oficina e fila até a Revisão'
          }
          detail={`Do Final do corte até a última Data Produção na Revisão (costura, oficina e fila).\nMédia ${formatDays(tempo.etapaPosCorte.media)} · mediana ${formatDays(tempo.etapaPosCorte.mediana)} em ${formatInt(tempo.etapaPosCorte.n ?? 0)} pedidos.`}
          tone="teal"
        />
        <KpiCard
          label="Fora da média"
          value={formatInt(foraDaMedia)}
          hint={`${formatInt(tempo.revisaoSemPcp)} sem PCP · ${formatInt(tempo.inconsistentes)} datas invertidas`}
          detail={`Não entram no cálculo do ciclo:\n• ${formatInt(tempo.revisaoSemPcp)} com Revisão e PCP prontas vazia\n• ${formatInt(tempo.inconsistentes)} com Data Produção anterior ao PCP\n• ${formatInt(tempo.semDatas)} sem as duas datas`}
          warning={foraDaMedia > 0}
          tone="amber"
        />
      </KpiGrid>

      <MonthlyAreaChart
        title="Média de dias no fechamento"
        description="Mês da última Data Produção na Revisão. Só pedidos com PCP prontas e Revisão."
        labels={tempo.porMes.map((row) => MONTH_LABELS[row.mes - 1])}
        series={[
          {
            key: 'media',
            label: 'Média de dias',
            color: 'var(--chart-1)',
            values: tempo.porMes.map((row) => row.mediaDias),
          },
        ]}
      />

      <div className="grid min-w-0 gap-[var(--page-gap)] lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Faixas de tempo</h2>
          <p className="text-xs text-muted-foreground">
            Dias corridos de PCP prontas até a última Data Produção da Revisão.
          </p>
          <SimpleTable
            columns={[
              { key: 'faixa', label: 'Faixa' },
              { key: 'pedidos', label: 'Pedidos', numeric: true },
              { key: 'share', label: '%', numeric: true },
              { key: 'pecas', label: 'Peças', numeric: true },
            ]}
            rows={tempo.faixas.map((row) => {
              const share = pct(row.pedidos, tempo.medidos)
              return {
                faixa: row.label,
                pedidos: formatInt(row.pedidos),
                share,
                pecas: formatInt(row.pecas),
                hint: explainFaixa(row.label, row.pedidos, row.pecas, share),
                warning: row.key === '61-90' && row.pedidos > 0,
                alert: row.key === '90+' && row.pedidos > 0,
              }
            })}
            empty="Nenhum pedido com PCP prontas e Revisão neste recorte."
          />
        </section>
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Por mês da Revisão</h2>
          <SimpleTable
            columns={[
              { key: 'mes', label: 'Mês' },
              { key: 'pedidos', label: 'Pedidos', numeric: true },
              { key: 'media', label: 'Média', numeric: true },
              { key: 'pecas', label: 'Peças', numeric: true },
            ]}
            rows={tempo.porMes.map((row) => ({
              mes: MONTH_LABELS[row.mes - 1],
              pedidos: formatInt(row.pedidos),
              media: formatDays(row.mediaDias),
              pecas: formatInt(row.pecas),
              hint: explainMes(
                MONTH_LABELS[row.mes - 1],
                row.pedidos,
                row.pecas,
                row.mediaDias,
              ),
            }))}
            empty="Sem fechamento de Revisão no recorte."
          />
        </section>
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Canal</h2>
          <SimpleTable
            columns={[
              { key: 'nome', label: 'Canal' },
              { key: 'pedidos', label: 'Pedidos', numeric: true },
              { key: 'media', label: 'Média', numeric: true },
              { key: 'mediana', label: 'Mediana', numeric: true },
            ]}
            rows={tempo.porCanal.map((row) => ({
              nome: row.nome,
              pedidos: formatInt(row.pedidos),
              media: formatDays(row.mediaDias),
              mediana: formatDays(row.medianaDias),
              hint: explainGrupo(
                'Canal',
                row.nome,
                row.pedidos,
                row.pecas,
                row.mediaDias,
                row.medianaDias,
              ),
            }))}
          />
        </section>
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Responsável do Corte</h2>
          <SimpleTable
            columns={[
              { key: 'nome', label: 'Responsável' },
              { key: 'pedidos', label: 'Pedidos', numeric: true },
              { key: 'media', label: 'Média', numeric: true },
              { key: 'mediana', label: 'Mediana', numeric: true },
            ]}
            rows={tempo.porResponsavel.map((row) => ({
              nome: row.nome,
              pedidos: formatInt(row.pedidos),
              media: formatDays(row.mediaDias),
              mediana: formatDays(row.medianaDias),
              hint: explainGrupo(
                'Responsável',
                row.nome,
                row.pedidos,
                row.pecas,
                row.mediaDias,
                row.medianaDias,
              ),
            }))}
          />
        </section>
      </div>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Maiores clientes</h2>
        <SimpleTable
          columns={[
            { key: 'nome', label: 'Cliente' },
            { key: 'pedidos', label: 'Pedidos', numeric: true },
            { key: 'pecas', label: 'Peças', numeric: true },
            { key: 'media', label: 'Média', numeric: true },
            { key: 'mediana', label: 'Mediana', numeric: true },
          ]}
          rows={tempo.porCliente.map((row) => ({
            nome: row.nome,
            pedidos: formatInt(row.pedidos),
            pecas: formatInt(row.pecas),
            media: formatDays(row.mediaDias),
            mediana: formatDays(row.medianaDias),
            hint: explainGrupo(
              'Cliente',
              row.nome,
              row.pedidos,
              row.pecas,
              row.mediaDias,
              row.medianaDias,
            ),
          }))}
        />
      </section>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-medium">
          <Timer className="size-3.5 text-primary" />
          Pedidos mais lentos
        </h2>
        <p className="text-xs text-muted-foreground">
          Passe o mouse na linha para o ciclo e a observação. Destaque a partir de 60 dias.
        </p>
        <SimpleTable
          columns={[
            { key: 'pedido', label: 'Pedido' },
            { key: 'pcp', label: 'PCP prontas' },
            { key: 'finalCorte', label: 'Final corte' },
            { key: 'revisao', label: 'Data produção' },
            { key: 'dias', label: 'Dias', numeric: true },
            { key: 'corte', label: 'PCP → corte', numeric: true },
            { key: 'pos', label: 'Corte → revisão', numeric: true },
            { key: 'pecas', label: 'Peças', numeric: true },
            { key: 'cliente', label: 'Cliente' },
            { key: 'canal', label: 'Canal' },
          ]}
          rows={tempo.maisLentos.map((row) => ({
            pedido: row.pedidoNorm,
            pcp: formatDate(row.pcpProntas),
            finalCorte: formatDate(row.finalCorte),
            revisao: formatDate(row.dataRevisaoUltima),
            dias: formatDays(row.diasTotal, 0),
            corte: formatDays(row.diasPcpAteFinal, 0),
            pos: formatDays(row.diasFinalAteRevisao, 0),
            pecas: formatInt(row.pecas),
            cliente: row.cliente,
            canal: row.canal,
            hint: explainTempoCiclo(row),
            warning: row.diasTotal >= 45 && row.diasTotal < 60,
            alert: row.diasTotal >= 60,
          }))}
          empty="Nenhum ciclo medido neste recorte."
        />
      </section>

      <div className="grid min-w-0 gap-[var(--page-gap)] lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Pedidos mais rápidos</h2>
          <SimpleTable
            columns={[
              { key: 'pedido', label: 'Pedido' },
              { key: 'pcp', label: 'PCP prontas' },
              { key: 'revisao', label: 'Data produção' },
              { key: 'dias', label: 'Dias', numeric: true },
              { key: 'cliente', label: 'Cliente' },
            ]}
            rows={tempo.maisRapidos.map((row) => ({
              pedido: row.pedidoNorm,
              pcp: formatDate(row.pcpProntas),
              revisao: formatDate(row.dataRevisaoUltima),
              dias: formatDays(row.diasTotal, 0),
              cliente: row.cliente,
              hint: explainTempoCiclo(row),
            }))}
            empty="Nenhum ciclo medido neste recorte."
          />
        </section>
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">PCP prontas sem Revisão</h2>
          <p className="text-xs text-muted-foreground">
            Dias em aberto até hoje. Pedido ainda não cruzou com o Relatório de Revisão 2026.
          </p>
          <SimpleTable
            columns={[
              { key: 'pedido', label: 'Pedido' },
              { key: 'pcp', label: 'PCP prontas' },
              { key: 'finalCorte', label: 'Final corte' },
              { key: 'dias', label: 'Aberto', numeric: true },
              { key: 'status', label: 'Status' },
              { key: 'cliente', label: 'Cliente' },
            ]}
            rows={tempo.abertos.map((row) => ({
              pedido: row.pedidoNorm,
              pcp: formatDate(row.pcpProntas),
              finalCorte: formatDate(row.finalCorte),
              dias: formatDays(row.diasAberto, 0),
              status: row.statusVigente,
              cliente: row.cliente,
              hint: explainTempoAberto(row),
              warning:
                row.diasAberto != null &&
                row.diasAberto >= 30 &&
                row.diasAberto < 60,
              alert: row.diasAberto != null && row.diasAberto >= 60,
            }))}
            empty="Nenhum pedido com PCP prontas aguardando Revisão."
          />
        </section>
      </div>

      <div className="grid min-w-0 gap-[var(--page-gap)] lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Revisão sem PCP prontas</h2>
          <p className="text-xs text-muted-foreground">
            {formatInt(tempo.revisaoSemPcp)} pedidos no Corte 2026 com Data Produção na
            Revisão e PCP prontas vazia — o ciclo não dá para medir.
          </p>
          <SimpleTable
            columns={[
              { key: 'pedido', label: 'Pedido' },
              { key: 'revisao', label: 'Data produção' },
              { key: 'finalCorte', label: 'Final corte' },
              { key: 'pecas', label: 'Peças', numeric: true },
              { key: 'cliente', label: 'Cliente' },
            ]}
            rows={tempo.semPcp.map((row) => ({
              pedido: row.pedidoNorm,
              revisao: formatDate(row.dataRevisaoUltima),
              finalCorte: formatDate(row.finalCorte),
              pecas: formatInt(row.pecas),
              cliente: row.cliente,
              hint: explainTempoSemPcp(row),
              warning: true,
            }))}
            empty="Todo pedido revisado neste recorte tem PCP prontas."
          />
        </section>
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Datas invertidas</h2>
          <p className="text-xs text-muted-foreground">
            Última Data Produção anterior a PCP prontas. Fica fora da média.
          </p>
          <SimpleTable
            columns={[
              { key: 'pedido', label: 'Pedido' },
              { key: 'pcp', label: 'PCP prontas' },
              { key: 'revisao', label: 'Data produção' },
              { key: 'dias', label: 'Dias', numeric: true },
              { key: 'cliente', label: 'Cliente' },
            ]}
            rows={tempo.datasInvertidas.map((row) => ({
              pedido: row.pedidoNorm,
              pcp: formatDate(row.pcpProntas),
              revisao: formatDate(row.dataRevisaoUltima),
              dias: formatDays(row.diasTotal, 0),
              cliente: row.cliente,
              hint: explainTempoInvertido(row),
              alert: true,
            }))}
            empty="Nenhuma Data Produção anterior ao PCP prontas."
          />
        </section>
      </div>
    </PageShell>
  )
}
