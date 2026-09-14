import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { SimpleTable } from '@/components/simple-table'
import { MonthlyAreaChart } from '@/components/monthly-area-chart'
import { FilterBar } from '@/components/filter-bar'
import { TecidosSubNav } from '@/components/tecidos-valores-nav'
import { getFilterOptions, getTecidos } from '@/data/dashboard'
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
  explainAguardandoTecido,
  explainEstoqueSemCorte,
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

export default async function TecidosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const filters = withCategoriaPadrao(parseFilters(await searchParams))
  const [tecidos, options] = await Promise.all([
    getTecidos(filters),
    getFilterOptions(),
  ])
  const metrosCorte = tecidos.metrosCorte
  const metrosSignus = tecidos.metrosSignus
  const metrosSignusComPedido = tecidos.metrosSignusComPedido
  const metrosSignusSemPedido = metrosSignus - metrosSignusComPedido
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
  const metrosProducao = baixaProducao?.metros ?? 0
  const metrosCanal = baixaCanal?.metros ?? 0
  const movProducao = baixaProducao?.movimentos ?? 0
  const movCanal = baixaCanal?.movimentos ?? 0
  const pedidosProducao = baixaProducao?.pedidos ?? 0
  const pedidosCanal = baixaCanal?.pedidos ?? 0

  return (
    <PageShell
      title="Tecidos"
      description={`Consumo no Corte e baixa no Signus (${YEAR}), cruzados pelo código do tecido. Signus e saldo só dos almox ${ALMOX_PRINCIPAIS_LABEL}, categoria MATÉRIA PRIMA por padrão. A diferença com o Corte usa só baixas com nº de pedido; baixas sem pedido ficam em card separado. Ambos já vêm filtrados pelo ano na carga — Corte pela data do pedido, Signus pela data do movimento. Saldo do estoque é snapshot (não filtra por mês/ano).`}
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
          value={`${formatMeters(metrosCorte)} · ${formatMeters(metrosCorteAproveitado)}`}
          hint="Total · c/ aproveitamento (consumo − economia)"
          detail={`Planilha de Corte · dois números no mesmo card:\n• Total: SUM dos metros apontados (MTS / TECIDOS) = ${formatMeters(metrosCorte)}\n• C/ aproveitamento: total − economia = ${formatMeters(metrosCorteAproveitado)} (economia ${formatMeters(metrosEconomia)})\n\nSó entram pedidos com data de corte em ${YEAR} (filtro na carga). O filtro de mês da tela corta dentro desse ano.`}
          tone="teal"
        />
        <KpiCard
          label="Baixa Signus c/ pedido"
          value={formatMeters(metrosSignusComPedido)}
          hint={`${formatInt(tecidos.movimentosBaixaComPedido)} movimentos · ${formatInt(tecidos.pedidosComBaixa)} pedidos`}
          detail={`Baixas oficiais no Signus (almox ${ALMOX_PRINCIPAIS_LABEL}) que trazem nº de pedido em Orig. Mov.\n\nTipos: Produção (insumos) + SAÍDA FF/AC/TC. É o recorte comparável com o consumo do Corte — o card ao lado mostra a diferença real.`}
          tone="indigo"
        />
        <KpiCard
          label="Diferença Corte − Signus"
          value={formatMeters(deltaReal)}
          hint={`${formatNumber(coberturaReal, 1)}% do Corte c/ aproveitamento já baixado`}
          detail={`Cálculo: consumo do Corte c/ aproveitamento (${formatMeters(metrosCorteAproveitado)}) − baixa Signus com nº de pedido (${formatMeters(metrosSignusComPedido)}).\n\nUsa o consumo após economia (total − economia), não o total bruto do Corte.\n\nNão inclui baixas sem pedido nem retorno do corte. Ainda não é fechamento pedido a pedido: datas e tipos (Produção + canal) podem divergir.`}
          tone="amber"
        />
        <KpiCard
          label="Baixa Signus sem pedido"
          value={formatMeters(metrosSignusSemPedido)}
          hint={`${formatInt(tecidos.baixasSemPedido)} movimentos · fora da diferença com o Corte`}
          detail={`Baixas oficiais no Signus sem nº de pedido em Orig. Mov. (${formatInt(tecidos.baixasSemPedido)} movimentos · ${formatMeters(metrosSignusSemPedido)}).\n\nNão entram na diferença Corte − Signus. Somadas à baixa c/ pedido dão o total oficial: ${formatMeters(metrosSignus)} (${formatInt(tecidos.movimentosBaixa)} movimentos).\n\nCostumam ser lançamentos auxiliares, canal ou códigos fora da programação.`}
          tone="magenta"
        />
        <KpiCard
          label="Baixa por tipo de movimentação"
          value={`${formatMeters(metrosProducao)} · ${formatMeters(metrosCanal)}`}
          hint={`${formatInt(movProducao)} mov. Produção · ${formatInt(movCanal)} mov. Canal`}
          detail={`Split da baixa oficial no Signus (almox ${ALMOX_PRINCIPAIS_LABEL}) — c/ e s/ pedido:\n• Produção (insumos): ${formatMeters(metrosProducao)} · ${formatInt(movProducao)} movimentos · ${formatInt(pedidosProducao)} pedidos\n• SAÍDA FF/AC/TC (canal): ${formatMeters(metrosCanal)} · ${formatInt(movCanal)} movimentos · ${formatInt(pedidosCanal)} pedidos\n\nOutros tipos (retorno, transferência, etc.) ficam na tabela “Baixa Signus por tipo”.`}
          tone="indigo"
        />
        <KpiCard
          label="Saldo atual em estoque"
          value={formatMeters(tecidos.saldoAtualMetros)}
          hint={`${formatInt(tecidos.estoqueCodigos)} códigos · só unidade metro`}
          detail={`Estoque Signus · soma do saldo atual (metros) só nos almox ${ALMOX_PRINCIPAIS_LABEL}.\n\nSnapshot da última carga — não filtra por mês nem por ano do dashboard. Use o filtro Categoria para isolar MATÉRIA PRIMA, etc.`}
          tone="teal"
        />
        <KpiCard
          label="Saldo reservado"
          value={formatMeters(tecidos.saldoReservadoMetros)}
          hint="Metros reservados no estoque"
          detail={`Estoque Signus · soma do Saldo reservado (metros) só nos almox ${ALMOX_PRINCIPAIS_LABEL}.\n\nTambém é snapshot da carga, sem filtro de mês/ano.`}
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
          value={formatMeters(tecidos.retornoCorte)}
          hint="Tipo “Retorno do corte” · fora da baixa oficial"
          detail={`Movimentos Signus do tipo “Retorno do corte” em ${YEAR}.\n\nNão entram no KPI de baixa oficial nem na diferença com o Corte.`}
          tone="magenta"
        />
      </KpiGrid>

      <div className="grid min-w-0 gap-[var(--page-gap)] lg:grid-cols-2">
        <MonthlyAreaChart
          title="Corte"
          description="Metros apontados no Corte, mês a mês."
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
          description="Metros baixados no Signus (produção + canal), mês a mês."
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
        <h2 className="text-sm font-medium">Tecidos mais usados</h2>
        <p className="text-xs text-muted-foreground">
          Ranking do Corte 2026. Signus = baixa nos almox principais; Saldo = mesmos almox.
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
            signus: formatMeters(row.signusMetros),
            saldo: formatMeters(row.saldoAtual),
            reservado: formatMeters(row.saldoReservado),
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
              signus: formatMeters(row.signus),
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
              { key: 'metros', label: 'Metros', numeric: true },
              { key: 'movimentos', label: 'Movimentos', numeric: true },
              { key: 'pedidos', label: 'Pedidos', numeric: true },
            ]}
            rows={tecidos.porTipo.map((row) => ({
              tipo: TIPO_TECIDO_LABEL[row.tipoNorm] ?? row.tipoNorm,
              metros: formatMeters(row.metros),
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
            signus: formatMeters(row.signusMetros),
            saldo: formatMeters(row.saldoAtual),
            reservado: formatMeters(row.saldoReservado),
            delta: formatMeters(row.corteMetros - row.signusMetros),
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
              { key: 'metros', label: 'Metros', numeric: true },
              { key: 'movimentos', label: 'Movimentos', numeric: true },
            ]}
            rows={tecidos.porCanalSignus.map((row) => ({
              nome: row.nome === '(sem canal)' ? 'Produção (insumos)' : row.nome,
              metros: formatMeters(row.metros),
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
              signus: formatMeters(row.signusMetros),
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
        <h2 className="text-sm font-medium">Estoque com saldo e sem código no Corte</h2>
        <p className="text-xs text-muted-foreground">
          Códigos em metro com saldo atual ≠ 0 nos almox principais e sem COD TECIDO no Corte.
        </p>
        <SimpleTable
          columns={[
            { key: 'tecido', label: 'Tecido', wrap: true },
            { key: 'saldo', label: 'Saldo', numeric: true },
            { key: 'reservado', label: 'Reserv.', numeric: true },
          ]}
          rows={tecidos.estoqueSemCorte.map((row) => ({
            tecido: formatTecido(row.cod, row.nome),
            saldo: formatMeters(row.saldoAtual),
            reservado: formatMeters(row.saldoReservado),
            hint: explainEstoqueSemCorte({
              tecido: formatTecido(row.cod, row.nome),
              saldoAtual: row.saldoAtual,
              saldoReservado: row.saldoReservado,
            }),
          }))}
          empty="Todo saldo em metro tem código no Corte"
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
            saldo: formatMeters(row.saldoAtual),
            reservado: formatMeters(row.saldoReservado),
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
