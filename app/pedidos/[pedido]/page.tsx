import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageShell } from '@/components/page-shell'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { FlagChips, PedidoTimeline } from '@/components/pedido-ficha'
import { getPedidoFicha } from '@/data/pedidos'
import { QUALIDADE_TIPO_LABEL } from '@/lib/pedido'
import {
  formatDate,
  formatDays,
  formatInt,
  formatMeters,
  formatMoney,
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

export default async function PedidoFichaPage({
  params,
}: {
  params: Promise<{ pedido: string }>
}) {
  const { pedido } = await params
  const ficha = await getPedidoFicha(pedido)
  if (!ficha) notFound()

  const status =
    ficha.ocs.length > 0
      ? [...new Set(ficha.ocs.map((oc) => oc.status).filter(Boolean))].join(' · ')
      : ficha.corte?.statusVigente
  const cliente = ficha.corte?.cliente

  return (
    <PageShell
      title={`Pedido ${ficha.pedidoNorm}`}
      description={[cliente, ficha.corte?.canal, status].filter(Boolean).join(' · ') ||
        'Pedido 2026 sem cabeçalho de Corte neste ano.'}
    >
      <FlagChips flags={ficha.flags} />

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
          hint={ficha.flags.corte ? 'SUM da quantidade no Corte' : 'Sem Corte 2026'}
          tone="indigo"
        />
        <KpiCard
          label="Costura Produção"
          value={formatInt(ficha.totais.pecasCosturaProd)}
          hint={
            ficha.totais.pecasCosturaServico
              ? `Serviço ${formatInt(ficha.totais.pecasCosturaServico)}`
              : 'Origem = Produção'
          }
          tone="teal"
        />
        <KpiCard
          label="Revisão"
          value={formatInt(ficha.totais.pecasRevisao)}
          hint="Pode ser maior que o corte (recorte de ano ou vários lançamentos)"
          tone="magenta"
        />
        <KpiCard
          label="Oficina pendente"
          value={formatInt(ficha.totais.pendentes)}
          hint={`Enviadas ${formatInt(ficha.totais.enviadas)} · defeitos ${formatInt(ficha.totais.defeitos)}`}
          alert={ficha.totais.pendentes > 0}
          tone="amber"
        />
        <KpiCard
          label="Ciclo"
          value={formatDays(ficha.totais.diasCiclo, 0)}
          hint="PCP prontas até a última Data Produção da Revisão"
          tone="teal"
        />
      </KpiGrid>

      {ficha.ocs.length ? (
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Ordens de corte</h2>
          <p className="text-xs text-muted-foreground">
            Cada cabeçalho da planilha é uma OC. O mesmo nº pedido com status diferente
            aparece em filas separadas.
          </p>
          <SimpleTable
            columns={[
              { key: 'linha', label: 'Linha Excel', numeric: true },
              { key: 'data', label: 'Data' },
              { key: 'status', label: 'Status' },
              { key: 'pecas', label: 'Peças', numeric: true },
              { key: 'responsavel', label: 'Responsável' },
            ]}
            rows={ficha.ocs.map((row) => ({
              linha: row.excelRow,
              data: formatDate(row.data),
              status: row.status,
              pecas: formatInt(row.pecas),
              responsavel: row.responsavel,
              alert: row.status === 'EM PRODUÇÃO',
              warning: row.status === 'AGUARDANDO TECIDO',
            }))}
          />
        </section>
      ) : null}

      {ficha.linhas.length ? (
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Tecido no Corte</h2>
          <p className="text-xs text-muted-foreground">
            {formatMeters(ficha.totais.metrosCorte)} programados · Signus{' '}
            {formatMeters(ficha.totais.metrosSignusBaixa)}.
          </p>
          <SimpleTable
            columns={[
              { key: 'linha', label: 'Linha', numeric: true },
              { key: 'tecido', label: 'Tecido', wrap: true },
              { key: 'metros', label: 'Metros', numeric: true },
              { key: 'economia', label: 'Economia', numeric: true },
              { key: 'pecas', label: 'Peças', numeric: true },
              { key: 'status', label: 'Status' },
            ]}
            rows={ficha.linhas.map((row) => ({
              linha: row.excelRow,
              tecido: formatTecido(row.codTecido, row.tecido),
              metros: row.metros != null ? formatMeters(row.metros, row.metros >= 10 ? 0 : 1) : '—',
              economia:
                row.economia != null
                  ? formatMeters(row.economia, row.economia >= 10 ? 0 : 1)
                  : '—',
              pecas: row.pecas != null ? formatInt(row.pecas) : '—',
              status: row.status,
              alert: row.isHeader && row.status === 'EM PRODUÇÃO',
              warning: row.isHeader && row.status === 'AGUARDANDO TECIDO',
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
              { key: 'produto', label: 'Produto' },
            ]}
            rows={ficha.costura.map((row) => ({
              data: formatDate(row.dataProducao),
              origem: row.origem,
              pecas: formatInt(row.pecas),
              responsavel: row.responsavel,
              produto: row.produto,
              warning: row.origemNorm !== 'Producao',
            }))}
          />
        </section>
      ) : (
        <p className="text-xs text-muted-foreground">Sem lançamento de Costura em 2026.</p>
      )}

      {ficha.revisao.length ? (
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Revisão</h2>
          <SimpleTable
            columns={[
              { key: 'data', label: 'Data' },
              { key: 'pecas', label: 'Peças', numeric: true },
              { key: 'responsavel', label: 'Responsável' },
              { key: 'produto', label: 'Produto' },
            ]}
            rows={ficha.revisao.map((row) => ({
              data: formatDate(row.dataProducao),
              pecas: formatInt(row.pecas),
              responsavel: row.responsavel,
              produto: row.produto,
            }))}
          />
        </section>
      ) : (
        <p className="text-xs text-muted-foreground">Sem lançamento de Revisão em 2026.</p>
      )}

      {ficha.oficinas.length ? (
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Oficinas</h2>
          <SimpleTable
            columns={[
              { key: 'oficina', label: 'Oficina' },
              { key: 'envio', label: 'Envio' },
              { key: 'retorno', label: 'Retorno' },
              { key: 'enviadas', label: 'Enviadas', numeric: true },
              { key: 'pendentes', label: 'Pendentes', numeric: true },
              { key: 'defeitos', label: 'Defeitos', numeric: true },
              { key: 'valor', label: 'Valor', numeric: true },
            ]}
            rows={ficha.oficinas.map((row) => ({
              oficina: row.oficina,
              envio: formatDate(row.dataEnvio),
              retorno: formatDate(row.dataRetorno),
              enviadas: formatInt(row.enviadas),
              pendentes: formatInt(row.pendentes),
              defeitos: formatInt(row.defeitos),
              valor: row.valorTotal != null ? formatMoney(row.valorTotal) : '—',
              warning: row.pendentes > 0,
              alert: row.defeitos > 0,
            }))}
          />
        </section>
      ) : (
        <p className="text-xs text-muted-foreground">Sem lote de oficina em 2026.</p>
      )}

      {ficha.signus.length ? (
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Movimentos Signus</h2>
          <SimpleTable
            columns={[
              { key: 'data', label: 'Data' },
              { key: 'tecido', label: 'Tecido', wrap: true },
              { key: 'metros', label: 'Metros', numeric: true },
              { key: 'tipo', label: 'Tipo' },
              { key: 'origem', label: 'Orig. Mov.' },
            ]}
            rows={ficha.signus.map((row) => ({
              data: formatDate(row.data),
              tecido: formatTecido(row.codProduto, row.nomeProduto),
              metros: formatMeters(row.metros, row.metros >= 10 ? 0 : 1),
              tipo: TIPO_TECIDO_LABEL[row.tipoNorm] ?? row.tipoNorm,
              origem: row.origemMov,
              warning: !row.isBaixa,
            }))}
          />
        </section>
      ) : (
        <p className="text-xs text-muted-foreground">
          Sem movimento Signus com este PED em Orig. Mov.
        </p>
      )}
    </PageShell>
  )
}
