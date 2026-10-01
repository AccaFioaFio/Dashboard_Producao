import { Search } from 'lucide-react'
import { PageShell } from '@/components/page-shell'
import { ApontamentoLista } from '@/components/apontamento-lista'
import { ApontamentoVoltarButton } from '@/components/apontamento-nav'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getApontamentoPedido } from '@/data/apontamento'
import { ETAPAS_APONTAMENTO, type EtapaApontamento } from '@/lib/apontamento'
import { formatInt } from '@/lib/format'

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
  const config = ETAPAS_APONTAMENTO[etapa]
  const temQtdPedida = consulta?.itens.some((row) => row.qtdPedida != null) ?? false
  const totalPecas =
    consulta?.itens.reduce((sum, row) => sum + (row.qtdPedida ?? 0), 0) ?? 0
  const totalLancado =
    consulta?.itens.reduce((sum, row) => sum + (row.qtdPecas ?? 0), 0) ?? 0
  const mostrarLista = Boolean(consulta?.itens.length || consulta?.inclusaoManual)
  const descricao =
    etapa === 'costura'
      ? 'Pesquise o número do pedido. Se ele já tem itens, a lista abre. Se o número não está na base, inclua o código: a descrição vem de Itens quando o código existe, e é digitada quando o código é novo. Origem, qtd peças, data de produção e responsável gravam sozinhos neste pedido.'
      : 'Pesquise o número do pedido. Se ele já tem itens, a lista abre. Se o número não está na base, inclua o código: a descrição vem de Itens quando o código existe, e é digitada quando o código é novo. Qtd, data de produção e responsável gravam sozinhos neste pedido.'

  return (
    <PageShell
      title={config.titulo}
      description={descricao}
      actions={<ApontamentoVoltarButton etapa={etapa} />}
    >
      <form action={config.href} className="card-surface flex flex-wrap items-end gap-2 p-3">
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
          Número do pedido
          <Input
            name="pedido"
            defaultValue={pedido}
            placeholder="Ex.: 17226"
            autoComplete="off"
            inputMode="numeric"
          />
        </label>
        <Button type="submit">
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
              hint="Soma do que foi preenchido nesta lista"
              detail={
                etapa === 'costura'
                  ? 'Soma de Qtd peças preenchida nesta tela.'
                  : 'Soma de Qtd preenchida nesta tela.'
              }
              tone="magenta"
            />
          </KpiGrid>

          <section className="flex min-w-0 flex-col gap-2">
            <h2 className="text-sm font-medium">Itens do pedido</h2>
            <p className="text-xs text-muted-foreground">
              {consulta.inclusaoManual
                ? 'Informe o código do produto. Se ele já existe em Itens, a descrição entra do cadastro. Se não existe, digite a descrição. A quantidade pedida fica em branco.'
                : `Itens.xlsx · ${formatInt(consulta.itens.length)} produto${consulta.itens.length === 1 ? '' : 's'}. A qtd pedida é fixa. O que já foi preenchido continua neste pedido.`}
            </p>
            <ApontamentoLista
              key={consulta.pedidoNorm ?? pedido}
              etapa={etapa}
              pedidoNorm={consulta.pedidoNorm ?? pedido}
              itens={consulta.itens}
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
