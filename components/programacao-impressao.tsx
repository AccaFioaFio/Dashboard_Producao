import { formatDate, formatInt } from '@/lib/format'
import { parseQuantidade, type LinhaProgramacao } from '@/lib/programacao'

export type PedidoImpressao = {
  key: string
  pedido: string
  cliente: string | null
  linhas: LinhaProgramacao[]
}

function formatPeriodo(inicio: string, fim: string) {
  if (!inicio || !fim) return '—'
  if (inicio === fim) return formatDate(inicio)
  return `${formatDate(inicio)} – ${formatDate(fim)}`
}

function periodoDoPedido(linhas: LinhaProgramacao[]) {
  let dataInicio = ''
  let dataFim = ''
  for (const linha of linhas) {
    if (!linha.dataInicio || !linha.dataFim) continue
    if (!dataInicio || linha.dataInicio < dataInicio) dataInicio = linha.dataInicio
    if (!dataFim || linha.dataFim > dataFim) dataFim = linha.dataFim
  }
  if (!dataInicio || !dataFim) return null
  return { dataInicio, dataFim }
}

function totalPecas(linhas: LinhaProgramacao[]) {
  let total = 0
  for (const linha of linhas) {
    total += parseQuantidade(linha.quantidadeProducao) ?? 0
  }
  return total
}

function formatQtd(value: number | null) {
  if (value == null) return '—'
  return formatInt(value)
}

function formatQtdProducao(value: string) {
  const n = Number(value.replace(',', '.'))
  if (!Number.isFinite(n)) return value
  return formatInt(n)
}

function CabecalhoPedido({ pedido }: { pedido: PedidoImpressao }) {
  const periodo = periodoDoPedido(pedido.linhas)
  const qtdItens = pedido.linhas.length
  const qtdPecas = totalPecas(pedido.linhas)

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-base font-bold tabular-nums">
          Pedido {pedido.pedido}
        </p>
        <p className="mt-0.5 text-sm">
          {pedido.cliente?.trim() || 'Sem nome fantasia'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          {qtdItens} item{qtdItens === 1 ? '' : 's'} · {formatInt(qtdPecas)} peça
          {qtdPecas === 1 ? '' : 's'}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Período
        </p>
        <p className="mt-0.5 font-mono text-lg font-bold tabular-nums">
          {periodo
            ? formatPeriodo(periodo.dataInicio, periodo.dataFim)
            : '—'}
        </p>
      </div>
    </div>
  )
}

function ItensPedido({ linhas }: { linhas: LinhaProgramacao[] }) {
  return (
    <table className="mt-2 w-full text-left text-sm">
      <thead>
        <tr className="border-b border-foreground/20 text-[10px] text-muted-foreground uppercase">
          <th className="py-1 pr-2 font-semibold tracking-wide">Produto</th>
          <th className="w-20 py-1 px-2 font-semibold tracking-wide">Qtd ped.</th>
          <th className="w-20 py-1 px-2 font-semibold tracking-wide">Qtd prod.</th>
          <th className="w-36 py-1 pl-2 font-semibold tracking-wide">Período</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((linha) => (
          <tr key={linha.key} className="border-b border-foreground/10">
            <td className="py-1.5 pr-2 break-words">{linha.nome}</td>
            <td className="py-1.5 px-2 font-mono tabular-nums text-muted-foreground">
              {formatQtd(linha.qtdPedido)}
            </td>
            <td className="py-1.5 px-2 font-mono tabular-nums">
              {formatQtdProducao(linha.quantidadeProducao)}
            </td>
            <td className="py-1.5 pl-2 font-mono tabular-nums">
              {formatPeriodo(linha.dataInicio, linha.dataFim)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function ProgramacaoImpressaoLista({
  periodoLabel,
  pedidos,
}: {
  periodoLabel: string | null
  pedidos: PedidoImpressao[]
}) {
  const titulo = periodoLabel ?? 'Programação'
  const resumo = `${pedidos.length} pedido${pedidos.length === 1 ? '' : 's'}`

  return (
    <>
      <section
        data-programacao-print="lista-recolhido"
        className="hidden flex-col gap-4 text-foreground"
      >
        <header>
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Programação de Produção · Pedidos
          </p>
          <p className="mt-1 text-sm font-medium">
            {titulo} · {resumo}
          </p>
        </header>
        {pedidos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nada programado neste período.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pedidos.map((pedido) => (
              <li
                key={pedido.key}
                className="rounded-md border border-foreground/25 px-3 py-2.5"
              >
                <CabecalhoPedido pedido={pedido} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        data-programacao-print="lista-expandido"
        className="hidden flex-col gap-4 text-foreground"
      >
        <header>
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Programação de Produção · Pedidos e itens
          </p>
          <p className="mt-1 text-sm font-medium">
            {titulo} · {resumo}
          </p>
        </header>
        {pedidos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nada programado neste período.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {pedidos.map((pedido) => (
              <li
                key={pedido.key}
                className="rounded-md border border-foreground/25 px-3 py-2.5"
              >
                <CabecalhoPedido pedido={pedido} />
                <ItensPedido linhas={pedido.linhas} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

export function dispararImpressaoProgramacao(
  modo: 'pedido' | 'lista-recolhido' | 'lista-expandido',
) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.print = modo
  const limpar = () => {
    delete root.dataset.print
    window.removeEventListener('afterprint', limpar)
  }
  window.addEventListener('afterprint', limpar)
  window.setTimeout(() => window.print(), 50)
}
