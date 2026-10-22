import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { MonthlyAreaChart } from '@/components/monthly-area-chart'
import { FilterBar } from '@/components/filter-bar'
import { TecidosSubNav } from '@/components/tecidos-valores-nav'
import { SectionPlaceholder } from '@/components/section-placeholder'
import { Layers } from 'lucide-react'
import { getFilterOptions, getLatestCarga, getTecidos } from '@/data/dashboard'
import {
  MONTH_LABELS,
  TIPO_TECIDO_LABEL,
  formatInt,
  formatMeters,
  formatNumber,
  formatTecido,
} from '@/lib/format'
import { parseFilters, withCategoriaPadrao } from '@/lib/filters'
import { YEAR } from '@/lib/year'
import { ALMOX_PRINCIPAIS_LABEL } from '@/lib/almox-principais'
import {
  complementoQuebra,
  formatClasse,
  formatQuebra,
  normalizarClasse,
  temOutraUnidade,
  textoCodigos,
  valorPrincipal,
} from '@/lib/tecido-unidade'
import {
  explainAguardandoTecido,
  explainBaixaSemPedido,
  explainEstoqueSemCorte,
  explainRetornoCorteLista,
  explainSignusSemCorte,
  explainTecidoCanal,
  explainTecidoCruzado,
  explainTecidoMes,
  explainTecidoRanking,
  explainTecidoTipo,
  tipoTecidoHint,
} from '@/lib/table-explain'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Tecidos' }

function comHint(extra: string, hint: string) {
  return extra ? `${extra} · ${hint}` : hint
}

export default async function TecidosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const filters = withCategoriaPadrao(parseFilters(await searchParams))
  const categoria = filters.categoria ?? 'MATÉRIA PRIMA'
  const descricao = `Consumo no Corte e baixa no Signus (${YEAR}), cruzados pelo código do item. Signus e saldo só dos almox ${ALMOX_PRINCIPAIS_LABEL}, categoria ${categoria}. Metro, peça, quilo e folha ficam separados. A diferença com o Corte usa só metros de baixas com nº de pedido; baixas sem pedido ficam em card separado. Corte e Signus já vêm filtrados pelo ano na carga. Saldo do estoque é snapshot (não filtra por mês/ano).`
  const [tecidos, options, carga] = await Promise.all([
    getTecidos(filters),
    getFilterOptions(),
    getLatestCarga(),
  ])
  const metrosCorte = tecidos.metrosCorte
  const metrosSignus = tecidos.metrosSignus
  const metrosSignusComPedido = tecidos.metrosSignusComPedido
  const metrosEconomia = tecidos.metrosEconomia
  const metrosCorteAproveitado = metrosCorte - metrosEconomia
  const economiaPct = metrosCorte > 0 ? (metrosEconomia / metrosCorte) * 100 : 0
  const deltaReal = metrosCorteAproveitado - metrosSignusComPedido
  const coberturaReal =
    metrosCorteAproveitado > 0
      ? (metrosSignusComPedido / metrosCorteAproveitado) * 100
      : 0
  const baixaProducao = tecidos.baixaPorTipoOficial.find(
    (row) => row.tipoNorm === 'baixa_producao',
  )
  const baixaCanal = tecidos.baixaPorTipoOficial.find(
    (row) => row.tipoNorm === 'baixa_canal',
  )
  const metrosProducao = baixaProducao?.quebra ?? tecidos.signusProducao
  const metrosCanal = baixaCanal?.quebra ?? tecidos.signusCanal
  const movProducao = baixaProducao?.movimentos ?? 0
  const movCanal = baixaCanal?.movimentos ?? 0
  const pedidosProducao = baixaProducao?.pedidos ?? 0
  const pedidosCanal = baixaCanal?.pedidos ?? 0

  if (!carga) {
    return (
      <PageShell
        title="Tecidos"
        description={descricao}
        actions={<TecidosSubNav filters={filters} current="metros" />}
      >
        <SectionPlaceholder
          icon={Layers}
          title="Nenhuma carga 2026"
          description="Atualize os dados em Configurações para liberar os Tecidos."
        />
      </PageShell>
    )
  }

  return (
    <PageShell
      title="Tecidos"
      description={descricao}
      actions={<TecidosSubNav filters={filters} current="metros" />}
    >
      <FilterBar
        pathname="/tecidos"
        values={filters}
        options={options}
        fields={['mes', 'canal', 'cliente', 'categoria', 'q']}
      />

      <KpiGrid columns={5}>
        <KpiCard
          label="Consumo de tecido no Corte"
          value={formatMeters(metrosCorte)}
          hint={`${formatMeters(metrosCorteAproveitado)} c/ aproveitamento (consumo − economia)`}
          detail={`Planilha de Corte · dois números no mesmo card:\n• Total: SUM dos metros apontados (MTS / TECIDOS) = ${formatMeters(metrosCorte)}\n• C/ aproveitamento: total − economia = ${formatMeters(metrosCorteAproveitado)} (economia ${formatMeters(metrosEconomia)})\n\nSó entram pedidos com data de corte em ${YEAR} (filtro na carga). O filtro de mês da tela corta dentro desse ano.`}
          tone="teal"
        />
        <KpiCard
          label="Baixa Signus c/ pedido"
          value={valorPrincipal(tecidos.signusComPedido)}
          hint={comHint(
            complementoQuebra(tecidos.signusComPedido),
            `${formatInt(tecidos.movimentosBaixaComPedido)} movimentos · ${formatInt(tecidos.pedidosComBaixa)} pedidos`,
          )}
          detail={`Baixas oficiais no Signus (almox ${ALMOX_PRINCIPAIS_LABEL}, categoria ${categoria}) que trazem nº de pedido em Orig. Mov.\n\nA unidade vem do estoque do mesmo código. Sem cadastro no saldo, a quantidade aparece sem sufixo. A diferença com o Corte usa só a parte em metros (${formatMeters(metrosSignusComPedido)}).`}
          tone="indigo"
        />
        <KpiCard
          label="Diferença Corte − Signus"
          value={formatMeters(deltaReal)}
          hint={`${formatNumber(coberturaReal, 1)}% do Corte c/ aproveitamento já baixado`}
          detail={`Cálculo em metros: consumo do Corte c/ aproveitamento (${formatMeters(metrosCorteAproveitado)}) − baixa Signus com nº de pedido em metros (${formatMeters(metrosSignusComPedido)}).\n\nPeça, quilo e folha ficam de fora dessa conta. Usa o consumo após economia (total − economia).`}
          tone="amber"
        />
        <KpiCard
          label="Baixa Signus sem pedido"
          value={valorPrincipal(tecidos.signusSemPedido)}
          hint={comHint(
            complementoQuebra(tecidos.signusSemPedido),
            `${formatInt(tecidos.baixasSemPedido)} movimentos · fora da diferença com o Corte`,
          )}
          detail={`Baixas oficiais no Signus sem nº de pedido em Orig. Mov. (${formatInt(tecidos.baixasSemPedido)} movimentos · ${formatQuebra(tecidos.signusSemPedido)}).\n\nNão entram na diferença Corte − Signus. A parte em metros, somada à baixa c/ pedido, dá ${formatMeters(metrosSignus)} (${formatInt(tecidos.movimentosBaixa)} movimentos).`}
          tone="magenta"
        />
        <KpiCard
          label="Baixa por tipo de movimentação"
          value={valorPrincipal(metrosProducao)}
          hint={comHint(
            [
              `Canal ${valorPrincipal(metrosCanal)}`,
              complementoQuebra(metrosProducao),
              complementoQuebra(metrosCanal),
            ]
              .filter(Boolean)
              .join(' · '),
            `${formatInt(movProducao)} mov. Produção · ${formatInt(movCanal)} mov. Canal`,
          )}
          detail={`Split da baixa oficial no Signus (almox ${ALMOX_PRINCIPAIS_LABEL}, categoria ${categoria}) — c/ e s/ pedido:\n• Produção (insumos): ${formatQuebra(metrosProducao)} · ${formatInt(movProducao)} movimentos · ${formatInt(pedidosProducao)} pedidos\n• SAÍDA FF/AC/TC (canal): ${formatQuebra(metrosCanal)} · ${formatInt(movCanal)} movimentos · ${formatInt(pedidosCanal)} pedidos\n\nOutros tipos ficam na tabela “Baixa Signus por tipo”.`}
          tone="indigo"
        />
        <KpiCard
          label="Saldo atual em estoque"
          value={valorPrincipal(tecidos.saldoAtualQuebra)}
          hint={comHint(
            complementoQuebra(tecidos.saldoAtualQuebra),
            textoCodigos(tecidos.estoqueCodigosQuebra) ||
              `${formatInt(tecidos.estoqueCodigos)} códigos`,
          )}
          detail={`Estoque Signus da categoria ${categoria}, almox ${ALMOX_PRINCIPAIS_LABEL}.\n\nCada unidade fica na própria conta: ${formatQuebra(tecidos.saldoAtualQuebra)}. Snapshot da última carga — não filtra por mês nem por ano.`}
          tone="teal"
        />
        <KpiCard
          label="Saldo reservado"
          value={valorPrincipal(tecidos.saldoReservadoQuebra)}
          hint={comHint(
            complementoQuebra(tecidos.saldoReservadoQuebra),
            'Reserva do estoque, na unidade de cada código',
          )}
          detail={`Estoque Signus da categoria ${categoria}, almox ${ALMOX_PRINCIPAIS_LABEL}: ${formatQuebra(tecidos.saldoReservadoQuebra)}.\n\nTambém é snapshot da carga, sem filtro de mês/ano.`}
          tone="magenta"
        />
        <KpiCard
          label="Economia de tecido"
          value={formatMeters(metrosEconomia)}
          hint={`${formatNumber(economiaPct, 1)}% do consumo do Corte`}
          detail={`Coluna de economia da planilha de Corte (quando a baixa fica abaixo do consumo na linha).\n\nNão é o inverso da diferença Corte − Signus: pode haver economia positiva e saldo de baixas sem pedido ao mesmo tempo.`}
          tone="teal"
          progress={Math.min(100, Math.max(12, economiaPct * 12))}
        />
        <KpiCard
          label="Aguardando tecido"
          value={`${formatInt(tecidos.tecidoPedidos)} / ${formatMeters(tecidos.tecidoMetros)}`}
          hint={`${formatInt(tecidos.tecidoPecas)} peças com status AGUARDANDO TECIDO`}
          detail={`Ordens de corte ${YEAR} com status AGUARDANDO TECIDO (pedidos / metros). Não entra na diferença Corte − Signus.`}
          alert={tecidos.tecidoPedidos > 0}
        />
        <KpiCard
          label="Retorno de tecido do corte"
          value={valorPrincipal(tecidos.retornoQuebra)}
          hint={comHint(
            complementoQuebra(tecidos.retornoQuebra),
            'Tipo “Retorno do corte” · fora da baixa oficial',
          )}
          detail={`Movimentos Signus do tipo “Retorno do corte” em ${YEAR}, categoria ${categoria}: ${formatQuebra(tecidos.retornoQuebra)}.\n\nNão entram no KPI de baixa oficial nem na diferença com o Corte.`}
          tone="magenta"
        />
      </KpiGrid>

      <div className="grid min-w-0 gap-[var(--page-gap)] lg:grid-cols-2">
        <MonthlyAreaChart
          title="Corte"
          description={`Metros do Corte na categoria ${categoria}, mês a mês.`}
          labels={tecidos.porMes.map((row) => MONTH_LABELS[row.mes - 1])}
          series={[
            {
              key: 'corte',
              label: 'Corte',
              color: 'var(--chart-1)',
              values: tecidos.porMes.map((row) => row.corte),
            },
          ]}
        />
        <MonthlyAreaChart
          title="Baixa Signus"
          description="Só a parte em metros da baixa. Peça, quilo e folha ficam na tabela do mês."
          labels={tecidos.porMes.map((row) => MONTH_LABELS[row.mes - 1])}
          series={[
            {
              key: 'signus',
              label: 'Baixa Signus',
              color: 'var(--chart-2)',
              values: tecidos.porMes.map((row) => row.signus),
            },
          ]}
        />
      </div>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">
          {categoria === 'MATÉRIA PRIMA' ? 'Tecidos mais usados' : `Itens de ${categoria}`}
        </h2>
        <p className="text-xs text-muted-foreground">
          Lista nasce da baixa Signus da categoria {categoria}. Corte entra só quando o
          mesmo código foi cortado; senão o Corte fica em zero.
        </p>
        <SimpleTable
          columns={[
            { key: 'tecido', label: 'Tecido', wrap: true },
            { key: 'corte', label: 'Corte', numeric: true },
            { key: 'share', label: '% Corte', numeric: true },
            { key: 'signus', label: 'Signus', numeric: true },
            { key: 'saldo', label: 'Saldo', numeric: true },
            { key: 'reservado', label: 'Reserv.', numeric: true },
            { key: 'economia', label: 'Economia', numeric: true },
            { key: 'pedidos', label: 'Pedidos', numeric: true },
          ]}
          rows={tecidos.porTecido.map((row) => ({
            tecido: formatTecido(row.cod, row.nome),
            corte: formatMeters(row.metros),
            share:
              metrosCorte > 0
                ? `${formatNumber((row.metros / metrosCorte) * 100, 1)}%`
                : '—',
            signus: formatClasse(row.signusMetros, normalizarClasse(row.classe)),
            saldo: formatClasse(row.saldoAtual, normalizarClasse(row.saldoClasse)),
            reservado: formatClasse(row.saldoReservado, normalizarClasse(row.saldoClasse)),
            economia: formatMeters(row.economia, row.economia >= 10 ? 0 : 1),
            pedidos: formatInt(row.pedidos),
            hint: explainTecidoRanking({
              tecido: formatTecido(row.cod, row.nome),
              metros: row.metros,
              signusMetros: row.signusMetros,
              saldoAtual: row.saldoAtual,
              saldoReservado: row.saldoReservado,
              economia: row.economia,
              pedidos: row.pedidos,
              totalCorte: metrosCorte,
            }),
          }))}
          empty="Sem consumo de tecido na carga"
        />
      </section>

      <div className="grid min-w-0 gap-[var(--page-gap)] lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Por mês</h2>
          <SimpleTable
            columns={[
              { key: 'mes', label: 'Mês' },
              { key: 'corte', label: 'Corte', numeric: true },
              { key: 'signus', label: 'Signus', numeric: true },
            ]}
            rows={tecidos.porMes.map((row) => ({
              mes: MONTH_LABELS[row.mes - 1],
              corte: formatMeters(row.corte),
              signus: formatQuebra(row.signusQuebra),
              hint: explainTecidoMes({
                mes: MONTH_LABELS[row.mes - 1],
                corte: row.corte,
                signus: row.signus,
              }),
            }))}
          />
        </section>
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Baixa Signus por tipo</h2>
          <p className="text-xs text-muted-foreground">
            A diferença com o Corte usa só baixas com nº de pedido. Esta tabela
            lista todos os tipos; Produção + SAÍDA FF/AC/TC formam a baixa
            oficial (c/ e s/ pedido).
          </p>
          <SimpleTable
            columns={[
              { key: 'tipo', label: 'Tipo' },
              { key: 'metros', label: tecidos.porTipo.some((row) => row.quebra && temOutraUnidade(row.quebra)) ? 'Qtd' : 'Metros', numeric: true },
              { key: 'movimentos', label: 'Movimentos', numeric: true },
              { key: 'pedidos', label: 'Pedidos', numeric: true },
            ]}
            rows={tecidos.porTipo.map((row) => ({
              tipo: TIPO_TECIDO_LABEL[row.tipoNorm] ?? row.tipoNorm,
              metros: row.quebra ? formatQuebra(row.quebra) : formatMeters(row.metros),
              movimentos: formatInt(row.movimentos),
              pedidos: formatInt(row.pedidos),
              hint: explainTecidoTipo({
                tipo: TIPO_TECIDO_LABEL[row.tipoNorm] ?? row.tipoNorm,
                metros: row.metros,
                movimentos: row.movimentos,
                pedidos: row.pedidos,
                extra: tipoTecidoHint(row.tipoNorm),
              }),
            }))}
            empty="Sem movimentação Signus. Atualize os dados."
          />
        </section>
      </div>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Corte × Signus × Estoque</h2>
        <p className="text-xs text-muted-foreground">
          COD TECIDO da programação × Código produto (Signus e estoque dos almox principais).
        </p>
        <SimpleTable
          columns={[
            { key: 'tecido', label: 'Tecido', wrap: true },
            { key: 'corte', label: 'Corte', numeric: true },
            { key: 'signus', label: 'Signus', numeric: true },
            { key: 'saldo', label: 'Saldo', numeric: true },
            { key: 'reservado', label: 'Reserv.', numeric: true },
            { key: 'delta', label: 'Delta C−S', numeric: true },
          ]}
          rows={tecidos.cruzados.map((row) => ({
            tecido: formatTecido(row.cod, row.nome),
            corte: formatMeters(row.corteMetros),
            signus: formatClasse(row.signusMetros, normalizarClasse(row.classe)),
            saldo: formatClasse(row.saldoAtual, normalizarClasse(row.saldoClasse)),
            reservado: formatClasse(row.saldoReservado, normalizarClasse(row.saldoClasse)),
            delta:
              normalizarClasse(row.classe) === 'metro'
                ? formatMeters(row.corteMetros - row.signusMetros)
                : '—',
            hint: explainTecidoCruzado({
              tecido: formatTecido(row.cod, row.nome),
              corteMetros: row.corteMetros,
              signusMetros: row.signusMetros,
              saldoAtual: row.saldoAtual,
              saldoReservado: row.saldoReservado,
              cortePedidos: row.cortePedidos,
              signusPedidos: row.signusPedidos,
            }),
          }))}
        />
      </section>

      <div className="grid min-w-0 gap-[var(--page-gap)] lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Baixa Signus por canal</h2>
          <SimpleTable
            columns={[
              { key: 'nome', label: 'Canal' },
              { key: 'metros', label: tecidos.porCanalSignus.some((row) => temOutraUnidade(row.quebra)) ? 'Qtd' : 'Metros', numeric: true },
              { key: 'movimentos', label: 'Movimentos', numeric: true },
            ]}
            rows={tecidos.porCanalSignus.map((row) => ({
              nome: row.nome === '(sem canal)' ? 'Produção (insumos)' : row.nome,
              metros: formatQuebra(row.quebra),
              movimentos: formatInt(row.movimentos),
              hint: explainTecidoCanal({
                nome: row.nome === '(sem canal)' ? 'Produção (insumos)' : row.nome,
                metros: row.metros,
                movimentos: row.movimentos,
              }),
            }))}
          />
        </section>
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">Signus sem código no Corte</h2>
          <SimpleTable
            columns={[
              { key: 'tecido', label: 'Tecido', wrap: true },
              { key: 'signus', label: 'Signus', numeric: true },
              { key: 'pedidos', label: 'Pedidos', numeric: true },
            ]}
            rows={tecidos.signusSemCorte.map((row) => ({
              tecido: formatTecido(row.cod, row.nome),
              signus: formatClasse(row.signusMetros, normalizarClasse(row.classe)),
              pedidos: formatInt(row.signusPedidos),
              hint: explainSignusSemCorte({
                tecido: formatTecido(row.cod, row.nome),
                signusMetros: row.signusMetros,
                signusPedidos: row.signusPedidos,
              }),
            }))}
            empty="Toda baixa Signus tem código no Corte"
          />
        </section>
      </div>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Baixa Signus sem pedido</h2>
        <p className="text-xs text-muted-foreground">
          Cada linha é baixa oficial (Produção insumos ou SAÍDA FF/AC/TC) sem nº de
          pedido. Orig. Mov. é o texto da planilha: INV, AJUSTE, ESTOQUE, AMOSTRA ou
          outro. Movimento cujo tipo já é Inventário ou Ajuste não entra neste card.
        </p>
        <SimpleTable
          columns={[
            { key: 'tecido', label: 'Tecido', wrap: true },
            { key: 'tipo', label: 'Tipo', wrap: true },
            { key: 'origem', label: 'Orig. Mov.', wrap: true },
            { key: 'qtd', label: 'Qtd', numeric: true },
            { key: 'movimentos', label: 'Movimentos', numeric: true },
          ]}
          rows={tecidos.baixasSemPedidoLista.map((row) => {
            const tipo =
              row.tipoNorm === 'baixa_canal'
                ? row.tipoMovimento
                : (TIPO_TECIDO_LABEL[row.tipoNorm] ?? row.tipoMovimento)
            const origem = row.origemMov || '—'
            const qtd = formatQuebra(row.quebra)
            return {
              tecido: formatTecido(row.cod, row.nome),
              tipo,
              origem,
              qtd,
              movimentos: formatInt(row.movimentos),
              hint: explainBaixaSemPedido({
                tecido: formatTecido(row.cod, row.nome),
                tipo,
                origemMov: origem,
                qtd,
                movimentos: row.movimentos,
              }),
            }
          })}
          empty="Nenhuma baixa oficial sem pedido"
        />
      </section>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Retorno de tecido do corte</h2>
        <p className="text-xs text-muted-foreground">
          Tipo “Retorno do corte” na movimentação Signus, uma linha por código.
          Não entra na baixa oficial nem na diferença com o Corte.
        </p>
        <SimpleTable
          columns={[
            { key: 'tecido', label: 'Tecido', wrap: true },
            { key: 'qtd', label: 'Qtd', numeric: true },
            { key: 'movimentos', label: 'Movimentos', numeric: true },
          ]}
          rows={tecidos.retornoLista.map((row) => {
            const qtd = formatQuebra(row.quebra)
            return {
              tecido: formatTecido(row.cod, row.nome),
              qtd,
              movimentos: formatInt(row.movimentos),
              hint: explainRetornoCorteLista({
                tecido: formatTecido(row.cod, row.nome),
                qtd,
                movimentos: row.movimentos,
              }),
            }
          })}
          empty="Nenhum retorno de tecido do corte"
        />
      </section>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Estoque com saldo e sem código no Corte</h2>
        <p className="text-xs text-muted-foreground">
          Códigos da categoria {categoria} com saldo atual ≠ 0 nos almox principais e sem COD TECIDO no Corte.
        </p>
        <SimpleTable
          columns={[
            { key: 'tecido', label: 'Tecido', wrap: true },
            { key: 'saldo', label: 'Saldo', numeric: true },
            { key: 'reservado', label: 'Reserv.', numeric: true },
          ]}
          rows={tecidos.estoqueSemCorte.map((row) => ({
            tecido: formatTecido(row.cod, row.nome),
            saldo: formatClasse(row.saldoAtual, normalizarClasse(row.classe)),
            reservado: formatClasse(row.saldoReservado, normalizarClasse(row.classe)),
            hint: explainEstoqueSemCorte({
              tecido: formatTecido(row.cod, row.nome),
              saldoAtual: row.saldoAtual,
              saldoReservado: row.saldoReservado,
            }),
          }))}
          empty="Todo saldo da categoria tem código no Corte"
        />
      </section>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Aguardando tecido para produção</h2>
        <p className="text-xs text-muted-foreground">
          Status AGUARDANDO TECIDO na programação de Corte: pedido, tecido, metros e saldo.
        </p>
        <SimpleTable
          columns={[
            { key: 'pedido', label: 'Pedido', link: true },
            { key: 'cliente', label: 'Cliente' },
            { key: 'tecido', label: 'Tecido', wrap: true },
            { key: 'metros', label: 'Metros', numeric: true },
            { key: 'saldo', label: 'Saldo', numeric: true },
            { key: 'reservado', label: 'Reserv.', numeric: true },
            { key: 'pecas', label: 'Peças', numeric: true },
            { key: 'status', label: 'Status' },
          ]}
          rows={tecidos.tecido.map((row) => ({
            pedido: row.pedidoNorm,
            cliente: row.cliente,
            tecido: formatTecido(row.codTecido, row.tecido),
            metros: formatNumber(row.metros, row.metros >= 100 ? 0 : 1),
            saldo: formatClasse(row.saldoAtual, normalizarClasse(row.saldoClasse)),
            reservado: formatClasse(row.saldoReservado, normalizarClasse(row.saldoClasse)),
            pecas: formatInt(row.pecas),
            status: row.statusVigente ?? 'AGUARDANDO TECIDO',
            hint: explainAguardandoTecido({
              ...row,
              tecido: formatTecido(row.codTecido, row.tecido),
            }),
          }))}
          empty="Nenhum pedido aguardando tecido"
        />
      </section>
    </PageShell>
  )
}
