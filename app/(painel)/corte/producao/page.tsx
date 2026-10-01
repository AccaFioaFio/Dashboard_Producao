import type { Metadata } from 'next'
import { Search } from 'lucide-react'
import { PageShell } from '@/components/page-shell'
import { CorteProducaoLista } from '@/components/corte-producao-lista'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { CorteVoltarButton } from '@/components/corte-acao-nav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getItensPorPedido } from '@/data/pedidos'
import { formatInt } from '@/lib/format'
import { parseFilters } from '@/lib/filters'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Corte Produção' }

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function CorteProducaoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const pedido = first(params.pedido)?.trim() ?? ''
  const consulta = pedido ? await getItensPorPedido(pedido) : null
  const temQtdPedida = consulta?.itens.some((row) => row.qtdPedida != null) ?? false
  const totalPecas =
    consulta?.itens.reduce((sum, row) => sum + (row.qtdPedida ?? 0), 0) ?? 0
  const totalReal =
    consulta?.itens.reduce((sum, row) => sum + (row.qtdReal ?? 0), 0) ?? 0
  const mostrarLista = Boolean(consulta?.itens.length || consulta?.inclusaoManual)

  return (
    <PageShell
      title="Corte Produção"
      description="Pesquise o número do pedido. A quantidade pedida vem de Itens. Qtd real, qtd volumes, datas e responsável gravam sozinhos e continuam neste pedido. Quando há data de início e data final gravadas, a linha em produção da planilha recebe a primeira data de início e a última data final. O botão grava a lista do cortador e o alerta na Visão Geral. O e-mail está pausado."
      actions={<CorteVoltarButton filters={parseFilters({})} />}
    >
      <form
        action="/corte/producao"
        className="card-surface flex flex-wrap items-end gap-2 p-3"
      >
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
          A carga de Itens.xlsx ainda não entrou. Atualize os dados em
          Configurações.
        </p>
      ) : mostrarLista ? (
        <>
          <KpiGrid columns={4}>
            <KpiCard
              label="Pedido"
              value={consulta.pedidoNorm ?? consulta.pedidoInformado}
              hint={consulta.cliente ?? 'Sem cliente nesta carga'}
              detail={
                consulta.inclusaoManual
                  ? 'Pedido localizado na Corte e Costura.'
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
                  ? 'Produtos incluídos pelo código. A descrição vem da base de itens.'
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
              label="Qtd real cortada"
              value={formatInt(totalReal)}
              hint="Soma do que foi lançado na lista"
              detail="Soma de Qtd Real Corte preenchida nesta tela."
              tone="magenta"
            />
          </KpiGrid>

          <section className="flex min-w-0 flex-col gap-2">
            <h2 className="text-sm font-medium">Itens do pedido</h2>
            <p className="text-xs text-muted-foreground">
              {consulta.inclusaoManual
                ? 'Este pedido está na Corte e Costura e não tem linhas em Itens.xlsx. Informe o código do produto: a descrição entra da base de itens e a quantidade pedida fica em branco. Responsável, quantidades e datas gravam como nos outros pedidos.'
                : `Itens.xlsx · ${formatInt(consulta.itens.length)} produto${consulta.itens.length === 1 ? '' : 's'}. A qtd pedida é fixa. O que já foi preenchido e o que já entrou na lista continuam neste pedido.`}
            </p>
            <CorteProducaoLista
              key={consulta.pedidoNorm ?? pedido}
              pedidoNorm={consulta.pedidoNorm ?? pedido}
              itens={consulta.itens}
              permitirInclusao={consulta.inclusaoManual}
            />
          </section>
        </>
      ) : (
        <p className="card-surface px-4 py-3 text-xs text-muted-foreground">
          Nenhum item do pedido {consulta.pedidoInformado} na carga de
          Itens.xlsx. Confira o número ou atualize os dados.
        </p>
      )}
    </PageShell>
  )
}
