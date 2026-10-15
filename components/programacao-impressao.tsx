'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
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
    <div className="programacao-print-cabecalho flex items-start justify-between gap-x-3 gap-y-1">
      <div className="min-w-0 flex-1">
        <p className="programacao-print-pedido tabular-nums">
          Pedido {pedido.pedido}
        </p>
        <p className="programacao-print-cliente">
          {pedido.cliente?.trim() || 'Sem nome fantasia'}
        </p>
        <p className="programacao-print-meta tabular-nums">
          {qtdItens} item{qtdItens === 1 ? '' : 's'} · {formatInt(qtdPecas)} peça
          {qtdPecas === 1 ? '' : 's'}
        </p>
      </div>
      <div className="programacao-print-periodo shrink-0 text-right">
        <p className="programacao-print-periodo-label">Período</p>
        <p className="programacao-print-periodo-valor tabular-nums">
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
    <table className="programacao-print-itens mt-1.5 w-full text-left">
      <thead>
        <tr>
          <th>Produto</th>
          <th className="w-16">Qtd ped.</th>
          <th className="w-16">Qtd prod.</th>
          <th className="w-28">Período</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((linha) => (
          <tr key={linha.key}>
            <td className="break-words">{linha.nome}</td>
            <td className="tabular-nums">{formatQtd(linha.qtdPedido)}</td>
            <td className="tabular-nums">
              {formatQtdProducao(linha.quantidadeProducao)}
            </td>
            <td className="tabular-nums">
              {formatPeriodo(linha.dataInicio, linha.dataFim)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function CabecalhoLista({
  dataInicio,
  dataFim,
  resumo,
}: {
  dataInicio: string | null
  dataFim: string | null
  resumo: string
}) {
  const temDatas = Boolean(dataInicio && dataFim)

  // div (não <header>): @media print esconde todos os `header` do app.
  return (
    <div className="programacao-print-header">
      <p className="programacao-print-kicker">Produção · 2026</p>
      <p className="programacao-print-titulo">Programação de Produção</p>
      {temDatas ? (
        <p className="programacao-print-datas tabular-nums">
          <span className="programacao-print-data-linha">
            Data inicial: {formatDate(dataInicio!)}
          </span>
          <span className="programacao-print-data-sep" aria-hidden>
            {' '}
            ·{' '}
          </span>
          <span className="programacao-print-data-linha">
            Data final: {formatDate(dataFim!)}
          </span>
        </p>
      ) : null}
      <p className="programacao-print-resumo">{resumo}</p>
    </div>
  )
}

export function ProgramacaoImpressaoLista({
  periodoLabel,
  dataInicio = null,
  dataFim = null,
  pedidos,
}: {
  periodoLabel: string | null
  dataInicio?: string | null
  dataFim?: string | null
  pedidos: PedidoImpressao[]
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const totalPecasLista = pedidos.reduce(
    (acc, pedido) => acc + totalPecas(pedido.linhas),
    0,
  )
  const resumo = [
    periodoLabel,
    `${pedidos.length} pedido${pedidos.length === 1 ? '' : 's'}`,
    `${formatInt(totalPecasLista)} peça${totalPecasLista === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ')

  const conteudo = (
    <div id="programacao-print-root" aria-hidden>
      <section
        data-programacao-print="lista-recolhido"
        className="programacao-print-lista"
      >
        <CabecalhoLista
          dataInicio={dataInicio}
          dataFim={dataFim}
          resumo={resumo || 'Programação'}
        />
        {pedidos.length === 0 ? (
          <p className="programacao-print-vazio">
            Nada programado neste período.
          </p>
        ) : (
          <ul className="programacao-print-cards">
            {pedidos.map((pedido) => (
              <li key={pedido.key} className="programacao-print-card">
                <CabecalhoPedido pedido={pedido} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        data-programacao-print="lista-expandido"
        className="programacao-print-lista"
      >
        <CabecalhoLista
          dataInicio={dataInicio}
          dataFim={dataFim}
          resumo={resumo || 'Programação'}
        />
        {pedidos.length === 0 ? (
          <p className="programacao-print-vazio">
            Nada programado neste período.
          </p>
        ) : (
          <ul className="programacao-print-cards programacao-print-cards--expandido">
            {pedidos.map((pedido) => (
              <li key={pedido.key} className="programacao-print-card">
                <CabecalhoPedido pedido={pedido} />
                <ItensPedido linhas={pedido.linhas} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )

  // Fora do layout do painel (overflow/hidden) para o preview de impressão.
  if (!mounted) return null
  return createPortal(conteudo, document.body)
}

export function dispararImpressaoProgramacao(
  modo: 'pedido' | 'lista-recolhido' | 'lista-expandido',
) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.print = modo

  let limpou = false
  const limpar = () => {
    if (limpou) return
    limpou = true
    delete root.dataset.print
    window.removeEventListener('afterprint', limpar)
  }
  window.addEventListener('afterprint', limpar)

  // Espera o atributo/CSS aplicarem antes de abrir o diálogo.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.print()
      // Fallback se afterprint não disparar (alguns browsers).
      window.setTimeout(limpar, 60_000)
    })
  })
}
