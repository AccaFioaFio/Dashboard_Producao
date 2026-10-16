import { Search } from 'lucide-react'
import { PageShell } from '@/components/page-shell'
import { ApontamentoLista } from '@/components/apontamento-lista'
import { ApontamentoVoltarButton } from '@/components/apontamento-nav'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getApontamentoPedido,
  listarOficinasApontamento,
  listarPlanilhaPedido,
  somarLancadoSoPlanilha,
} from '@/data/apontamento'
import {
  ETAPAS_APONTAMENTO,
  OBS_JA_LANCADO_PLANILHA,
  type EtapaApontamento,
} from '@/lib/apontamento'
import { formatDate, formatInt } from '@/lib/format'

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export async function ApontamentoTela({
  etapa,
  searchParams,
}: {
  etapa: EtapaApontamento
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const pedido = first(params.pedido)?.trim() ?? ''
  const consulta = pedido ? await getApontamentoPedido(etapa, pedido) : null
  const oficinas = etapa === 'costura' ? listarOficinasApontamento() : []
  const planilha =
    consulta?.pedidoNorm != null
      ? listarPlanilhaPedido(etapa, consulta.pedidoNorm)
      : []
  const config = ETAPAS_APONTAMENTO[etapa]
  const temQtdPedida = consulta?.itens.some((row) => row.qtdPedida != null) ?? false
  const totalPecas =
    consulta?.itens.reduce((sum, row) => sum + (row.qtdPedida ?? 0), 0) ?? 0
  const totalNosCards =
    consulta?.itens.reduce((sum, row) => sum + (row.qtdPecas ?? 0), 0) ?? 0
  const totalPlanilha = planilha.reduce((sum, row) => sum + row.pecas, 0)
  const totalSoPlanilhaNoCard =
    consulta?.pedidoNorm != null
      ? somarLancadoSoPlanilha(etapa, consulta.pedidoNorm)
      : 0
  // Tela + planilha, sem duplicar o que já foi anotado no card como “já lançado na planilha”.
  const totalLancado = totalNosCards + totalPlanilha - totalSoPlanilhaNoCard
  const mostrarLista = Boolean(consulta?.itens.length || consulta?.inclusaoManual)
  const descricao =
    etapa === 'costura'
      ? `Pesquise o pedido. Já lançado no card = total do produto. Se a planilha trouxe qtd sem descrição completa, some no produto certo e anote na observação “${OBS_JA_LANCADO_PLANILHA}” (não duplica no KPI). Soma nova = outra data/qtd.`
      : `Pesquise o pedido. Já lançado no card = total do produto. Se a planilha trouxe qtd sem descrição completa, some no produto certo e anote na observação “${OBS_JA_LANCADO_PLANILHA}” (não duplica no KPI). Soma nova = outra data/qtd.`

  return (
    <PageShell
      title={config.titulo}
      description={descricao}
      actions={<ApontamentoVoltarButton etapa={etapa} />}
    >
      <form
        action={config.href}
        className="card-surface flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground sm:min-w-[16rem]">
          Número do pedido
          <Input
            name="pedido"
            defaultValue={pedido}
            placeholder="Ex.: 17226"
            autoComplete="off"
            inputMode="numeric"
            className="h-10 text-base sm:h-8 sm:text-sm"
          />
        </label>
        <Button type="submit" className="h-10 w-full sm:h-8 sm:w-auto">
          <Search />
          Pesquisar
        </Button>
      </form>

      {!consulta ? (
        <p className="text-xs text-muted-foreground">
          Digite o número do pedido e pesquise para listar os itens.
        </p>
      ) : !consulta.loaded ? (
        <p className="card-surface px-4 py-3 text-xs text-muted-foreground">
          A carga de Itens.xlsx ainda não entrou. Atualize os dados em Configurações.
        </p>
      ) : mostrarLista ? (
        <>
          <KpiGrid columns={4}>
            <KpiCard
              label="Pedido"
              value={consulta.pedidoNorm ?? consulta.pedidoInformado}
              hint={
                consulta.cliente
                  ? consulta.cliente
                  : consulta.inclusaoManual
                    ? 'Pedido informado nesta tela'
                    : 'Sem cliente nesta carga'
              }
              detail={
                consulta.inclusaoManual
                  ? consulta.cliente
                    ? 'Pedido na Corte, sem linhas em Itens. Dá para incluir código da base ou cadastrar código e descrição.'
                    : 'Este número não está na base. Inclua um código de Itens ou cadastre código e descrição.'
                  : 'Número do pedido pesquisado em Itens.xlsx.'
              }
              tone="indigo"
            />
            <KpiCard
              label="Itens"
              value={formatInt(consulta.itens.length)}
              hint={consulta.status ?? '—'}
              detail={
                consulta.inclusaoManual
                  ? 'Produtos incluídos neste pedido. A descrição vem de Itens quando o código já existe.'
                  : 'Cada código deste pedido aparece uma vez.'
              }
              tone="teal"
            />
            <KpiCard
              label="Quantidade pedida"
              value={temQtdPedida ? formatInt(totalPecas) : '—'}
              hint={consulta.canal ?? '—'}
              detail={
                consulta.inclusaoManual
                  ? 'Este pedido não tem quantidade pedida em Itens.xlsx.'
                  : 'Soma de Qtd Pedida dos itens deste pedido.'
              }
              tone="amber"
            />
            <KpiCard
              label="Qtd lançada"
              value={formatInt(totalLancado)}
              hint={
                totalPlanilha > 0
                  ? `${formatInt(totalNosCards)} na tela + ${formatInt(totalPlanilha)} na planilha`
                  : 'Soma já lançada neste pedido'
              }
              detail={`Total = cards + planilha. Se a planilha veio sem descrição completa, some no produto certo e anote “${OBS_JA_LANCADO_PLANILHA}” (não duplica).`}
              tone="magenta"
            />
          </KpiGrid>

          {planilha.length ? (
            <section className="flex min-w-0 flex-col gap-2">
              <h2 className="text-sm font-medium">Já na planilha (texto incompleto)</h2>
              <p className="text-xs text-muted-foreground">
                Use o produto certo no card abaixo, some a qtd e anote na observação:{' '}
                <span className="font-medium text-foreground">{OBS_JA_LANCADO_PLANILHA}</span>.
              </p>
              <div className="card-surface table-surface min-w-0 overflow-x-auto">
                <table className="w-full text-left text-xs leading-snug sm:text-[11px]">
                  <thead className="bg-muted/50 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase sm:text-[9px]">
                    <tr>
                      <th className="px-1.5 py-1">Data</th>
                      <th className="px-1.5 py-1 text-right">Peças</th>
                      <th className="px-1.5 py-1">Produto (planilha)</th>
                      <th className="px-1.5 py-1">Responsável</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planilha.map((row, index) => (
                      <tr key={`${row.dataProducao}-${index}`} className="border-t border-border/80">
                        <td className="px-1.5 py-1.5 whitespace-nowrap">
                          {formatDate(row.dataProducao)}
                        </td>
                        <td className="px-1.5 py-1.5 text-right font-medium tabular-nums">
                          {formatInt(row.pecas)}
                        </td>
                        <td className="px-1.5 py-1.5 break-words">
                          {row.produto?.trim() || '—'}
                        </td>
                        <td className="px-1.5 py-1.5 whitespace-nowrap">
                          {row.responsavel?.trim() || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="flex min-w-0 flex-col gap-2">
            <h2 className="text-sm font-medium">Itens do pedido</h2>
            <p className="text-xs text-muted-foreground">
              {consulta.inclusaoManual
                ? `Já lançado no card = total. Se veio da planilha sem descrição completa, some aqui e anote “${OBS_JA_LANCADO_PLANILHA}”.`
                : `Itens.xlsx · ${formatInt(consulta.itens.length)} produto${consulta.itens.length === 1 ? '' : 's'}. Já lançado = total do card; Qtd a somar + Data = esta entrada.`}
            </p>
            <ApontamentoLista
              key={consulta.pedidoNorm ?? pedido}
              etapa={etapa}
              pedidoNorm={consulta.pedidoNorm ?? pedido}
              itens={consulta.itens}
              oficinas={oficinas}
              permitirInclusao={consulta.inclusaoManual}
              temOrigem={config.temOrigem}
              qtdLabel={config.qtdLabel}
            />
          </section>
        </>
      ) : (
        <p className="card-surface px-4 py-3 text-xs text-muted-foreground">
          Nenhum item do pedido {consulta.pedidoInformado} na carga de Itens.xlsx. Confira o
          número ou atualize os dados.
        </p>
      )}
    </PageShell>
  )
}
