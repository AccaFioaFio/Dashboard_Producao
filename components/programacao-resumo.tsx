'use client'

import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate, formatInt } from '@/lib/format'
import {
  cadaDiaNoPeriodo,
  parseQuantidade,
  periodosSobrepoem,
  removerLinhasDoBanco,
  removerPedidoDoBanco,
  type LinhaProgramacao,
  type ProgramacaoBanco,
} from '@/lib/programacao'
import { cn } from '@/lib/utils'

type ModoPeriodo = 'dia' | 'semana' | 'mes'

type PedidoResumo = {
  key: string
  pedido: string
  pedidoNorm: string | null
  cliente: string | null
  linhas: LinhaProgramacao[]
}

function parseUtc(iso: string) {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia))
}

function toIso(date: Date) {
  return date.toISOString().slice(0, 10)
}

function hojeIso() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Segunda a domingo (ISO). */
function inicioSemana(iso: string) {
  const date = parseUtc(iso)
  const dia = date.getUTCDay()
  const delta = dia === 0 ? -6 : 1 - dia
  date.setUTCDate(date.getUTCDate() + delta)
  return toIso(date)
}

function fimSemana(iso: string) {
  const date = parseUtc(inicioSemana(iso))
  date.setUTCDate(date.getUTCDate() + 6)
  return toIso(date)
}

function chaveMes(iso: string) {
  return iso.slice(0, 7)
}

function fimMes(anoMes: string) {
  const [ano, mes] = anoMes.split('-').map(Number)
  return toIso(new Date(Date.UTC(ano, mes, 0)))
}

function valoresMes(datas: string[]) {
  return [...new Set(datas.map(chaveMes))].sort((a, b) => a.localeCompare(b))
}

function diasNaSemana(datas: string[], diaRef: string) {
  if (!diaRef) return []
  const inicio = inicioSemana(diaRef)
  const fim = fimSemana(diaRef)
  return datas.filter((dia) => dia >= inicio && dia <= fim)
}

/** Preferência (dia ou mês) a partir da referência atual / hoje. */
function preferenciaNoModo(modo: ModoPeriodo, atual: string) {
  const base =
    atual && /^\d{4}-\d{2}/.test(atual)
      ? atual.length === 7
        ? `${atual}-01`
        : atual.slice(0, 10)
      : hojeIso()
  if (modo === 'mes') return chaveMes(base)
  return base
}

/** Escolhe a opção com programação mais próxima da preferência. */
function escolherPadrao(opcoes: string[], preferida: string) {
  if (opcoes.length === 0) return ''
  if (preferida && opcoes.includes(preferida)) return preferida
  if (preferida) {
    const futura = opcoes.find((opcao) => opcao >= preferida)
    if (futura) return futura
    return opcoes[opcoes.length - 1] ?? ''
  }
  return opcoes[0] ?? ''
}

/** Ao entrar em Semana, escolhe um dia com programação na semana mais próxima. */
function escolherDiaSemana(datas: string[], preferida: string) {
  if (datas.length === 0) return ''
  const alvo = preferida || hojeIso()
  const naSemana = diasNaSemana(datas, alvo)
  if (naSemana.length > 0) {
    return escolherPadrao(naSemana, alvo)
  }
  return escolherPadrao(datas, alvo)
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

function totalProdutos(linhas: LinhaProgramacao[]) {
  let total = 0
  for (const linha of linhas) {
    total += parseQuantidade(linha.quantidadeProducao) ?? 0
  }
  return total
}

function formatPeriodo(inicio: string, fim: string) {
  if (inicio === fim) return formatDate(inicio)
  return `${formatDate(inicio)} – ${formatDate(fim)}`
}

function rotuloSemana(inicio: string) {
  return formatPeriodo(inicio, fimSemana(inicio))
}

function rotuloMes(anoMes: string) {
  const [ano, mes] = anoMes.split('-').map(Number)
  const nome = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(ano, mes - 1, 1)))
  return nome.charAt(0).toUpperCase() + nome.slice(1)
}

function agruparPedidos(linhas: LinhaProgramacao[]): PedidoResumo[] {
  const porPedido = new Map<string, PedidoResumo>()
  for (const row of linhas) {
    const key = `${row.pedidoNorm ?? row.pedido}`
    const existente = porPedido.get(key)
    if (existente) {
      existente.linhas.push(row)
    } else {
      porPedido.set(key, {
        key,
        pedido: row.pedido,
        pedidoNorm: row.pedidoNorm,
        cliente: row.cliente,
        linhas: [row],
      })
    }
  }
  return [...porPedido.values()]
    .map((pedido) => ({
      ...pedido,
      linhas: [...pedido.linhas].sort((a, b) => {
        const byInicio = a.dataInicio.localeCompare(b.dataInicio)
        if (byInicio !== 0) return byInicio
        const byFim = a.dataFim.localeCompare(b.dataFim)
        if (byFim !== 0) return byFim
        return a.nome.localeCompare(b.nome, 'pt-BR')
      }),
    }))
    .sort((a, b) =>
      a.pedido.localeCompare(b.pedido, 'pt-BR', { numeric: true }),
    )
}

export function ProgramacaoResumo({
  banco,
  onAlterou,
}: {
  banco: ProgramacaoBanco
  onAlterou?: () => void
}) {
  const [modo, setModo] = useState<ModoPeriodo>('dia')
  const [referencia, setReferencia] = useState('')
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set())

  const datasDisponiveis = useMemo(() => {
    const unicas = new Set<string>()
    for (const linha of banco.linhas) {
      for (const dia of cadaDiaNoPeriodo(linha.dataInicio, linha.dataFim)) {
        unicas.add(dia)
      }
    }
    return [...unicas].sort((a, b) => a.localeCompare(b))
  }, [banco.linhas])

  const opcoesChips = useMemo(() => {
    if (modo === 'dia') {
      return datasDisponiveis.map((data) => ({
        value: data,
        label: formatDate(data),
      }))
    }
    if (modo === 'semana') {
      // Chips = dias com programação dentro da semana da data selecionada
      return diasNaSemana(datasDisponiveis, referencia).map((data) => ({
        value: data,
        label: formatDate(data),
      }))
    }
    return valoresMes(datasDisponiveis).map((mes) => ({
      value: mes,
      label: rotuloMes(mes),
    }))
  }, [datasDisponiveis, modo, referencia])

  useEffect(() => {
    if (referencia) return
    if (datasDisponiveis.length === 0) return
    const preferida = preferenciaNoModo(modo, hojeIso())
    const padrao =
      modo === 'mes'
        ? escolherPadrao(valoresMes(datasDisponiveis), preferida)
        : modo === 'semana'
          ? escolherDiaSemana(datasDisponiveis, preferida)
          : escolherPadrao(datasDisponiveis, preferida)
    if (padrao) setReferencia(padrao)
  }, [modo, datasDisponiveis, referencia])

  const linhasFiltradas = useMemo(() => {
    if (!referencia) return []
    if (modo === 'dia' || modo === 'semana') {
      // Semana: filtra pelo dia escolhido nos chips (igual ao Dia)
      return banco.linhas.filter((row) =>
        periodosSobrepoem(row.dataInicio, row.dataFim, referencia, referencia),
      )
    }
    const inicio = `${referencia}-01`
    const fim = fimMes(referencia)
    return banco.linhas.filter((row) =>
      periodosSobrepoem(row.dataInicio, row.dataFim, inicio, fim),
    )
  }, [banco.linhas, modo, referencia])

  const pedidos = useMemo(
    () => agruparPedidos(linhasFiltradas),
    [linhasFiltradas],
  )

  function trocarModo(next: ModoPeriodo) {
    const preferida = preferenciaNoModo(next, referencia || hojeIso())
    const padrao =
      next === 'mes'
        ? escolherPadrao(valoresMes(datasDisponiveis), preferida)
        : next === 'semana'
          ? escolherDiaSemana(datasDisponiveis, preferida)
          : escolherPadrao(datasDisponiveis, preferida)
    setModo(next)
    setReferencia(padrao)
    setAbertos(new Set())
  }

  function selecionar(value: string) {
    setReferencia(value)
    setAbertos(new Set())
  }

  function selecionarDataSemana(value: string) {
    if (!value) {
      setReferencia('')
      setAbertos(new Set())
      return
    }
    const dias = diasNaSemana(datasDisponiveis, value)
    const dia =
      dias.includes(value) ? value : escolherPadrao(dias, value) || value
    setReferencia(dia)
    setAbertos(new Set())
  }

  function togglePedido(key: string) {
    setAbertos((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function excluirPedido(pedido: PedidoResumo) {
    const ok = window.confirm(
      `Excluir o pedido ${pedido.pedido} da programação? Todos os itens desse pedido serão removidos.`,
    )
    if (!ok) return
    removerPedidoDoBanco(pedido.pedido, pedido.pedidoNorm)
    setAbertos((prev) => {
      const next = new Set(prev)
      next.delete(pedido.key)
      return next
    })
    onAlterou?.()
  }

  function excluirItem(linha: LinhaProgramacao) {
    const ok = window.confirm(
      `Excluir o item "${linha.nome}" do pedido ${linha.pedido}?`,
    )
    if (!ok) return
    removerLinhasDoBanco([linha.key])
    onAlterou?.()
  }

  const periodoLabel =
    !referencia
      ? null
      : modo === 'mes'
        ? rotuloMes(referencia)
        : formatDate(referencia)

  const temProgramacaoSalva = datasDisponiveis.length > 0

  return (
    <section className="card-surface flex flex-col gap-3 p-3 print:hidden">
      <div>
        <h2 className="text-sm font-semibold tracking-wide">
          Consultar programação
        </h2>
        <p className="text-xs text-muted-foreground">
          Escolha dia, semana ou mês. Ao selecionar, veja o pedido e expanda os
          produtos.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['dia', 'Dia'],
            ['semana', 'Semana'],
            ['mes', 'Mês'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={modo === value ? 'secondary' : 'outline'}
            onClick={() => trocarModo(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        {modo === 'dia' ? (
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-44">
            Data
            <Input
              type="date"
              value={referencia}
              onChange={(event) => selecionar(event.target.value)}
              className="h-9 sm:h-8"
            />
          </label>
        ) : null}
        {modo === 'semana' ? (
          <div className="flex min-w-0 flex-col gap-1">
            <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-44">
              Data
              <Input
                type="date"
                value={referencia}
                onChange={(event) => selecionarDataSemana(event.target.value)}
                className="h-9 sm:h-8"
              />
            </label>
            {referencia ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                Semana {rotuloSemana(inicioSemana(referencia))}
              </p>
            ) : null}
          </div>
        ) : null}
        {modo === 'mes' ? (
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-44">
            Mês
            <Input
              type="month"
              value={referencia}
              onChange={(event) => selecionar(event.target.value)}
              className="h-9 sm:h-8"
            />
          </label>
        ) : null}
      </div>

      {!temProgramacaoSalva ? (
        <p className="text-xs text-muted-foreground">
          Nenhuma data programada ainda.
        </p>
      ) : opcoesChips.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Com programação
            {modo === 'semana' && referencia
              ? ` · ${rotuloSemana(inicioSemana(referencia))}`
              : ''}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {opcoesChips.map((opcao) => {
              const ativo = referencia === opcao.value
              return (
                <li key={opcao.value}>
                  <button
                    type="button"
                    onClick={() => selecionar(opcao.value)}
                    className={cn(
                      'rounded-md border px-2.5 py-1 font-mono text-sm tabular-nums transition-colors',
                      ativo
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border/80 bg-muted/30 hover:bg-muted/50',
                    )}
                  >
                    {opcao.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : modo === 'semana' && referencia ? (
        <p className="text-xs text-muted-foreground">
          Nenhum dia com programação em {rotuloSemana(inicioSemana(referencia))}.
          Escolha outra data para mudar de semana.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Selecione um período para ver as datas com programação.
        </p>
      )}

      {referencia ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {periodoLabel}
            {pedidos.length > 0
              ? ` · ${pedidos.length} pedido${pedidos.length === 1 ? '' : 's'}`
              : null}
          </p>
          {pedidos.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nada programado neste período.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {pedidos.map((pedido) => {
                const aberto = abertos.has(pedido.key)
                const qtdItens = pedido.linhas.length
                const qtdProdutos = totalProdutos(pedido.linhas)
                return (
                  <li
                    key={pedido.key}
                    className="rounded-lg border border-border/80"
                  >
                    <div className="flex items-stretch gap-0 overflow-hidden rounded-t-lg">
                      <button
                        type="button"
                        onClick={() => togglePedido(pedido.key)}
                        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40 md:py-2"
                        aria-expanded={aberto}
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background md:size-6">
                          {aberto ? (
                            <Minus className="size-3.5" />
                          ) : (
                            <Plus className="size-3.5" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="font-mono text-sm font-semibold tabular-nums">
                            Pedido {pedido.pedido}
                          </span>
                          <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                            {pedido.cliente?.trim() || 'Sem nome fantasia'}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                          <span className="block">
                            {qtdItens} item{qtdItens === 1 ? '' : 's'}
                          </span>
                          <span className="block">
                            {formatInt(qtdProdutos)} produto
                            {qtdProdutos === 1 ? '' : 's'}
                          </span>
                        </span>
                      </button>
                      <div className="flex items-center border-l border-border/70 px-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="size-9 text-destructive hover:bg-destructive/10 hover:text-destructive md:size-6"
                          onClick={() => excluirPedido(pedido)}
                          title="Excluir pedido da programação"
                          aria-label={`Excluir pedido ${pedido.pedido}`}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                    {aberto ? (
                      <div className="border-t border-border/70 bg-muted/15">
                        <div className="table-surface mobile-form-table min-w-0 overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="text-xs text-muted-foreground uppercase">
                                <th className="px-3 py-1.5 font-semibold tracking-wide">
                                  Produto
                                </th>
                                <th className="w-24 px-3 py-1.5 font-semibold tracking-wide">
                                  Qtd ped.
                                </th>
                                <th className="w-24 px-3 py-1.5 font-semibold tracking-wide">
                                  Qtd prod.
                                </th>
                                <th className="w-40 px-3 py-1.5 font-semibold tracking-wide">
                                  Período
                                </th>
                                <th className="w-12 px-1.5 py-1.5 font-semibold tracking-wide">
                                  <span className="sr-only">Excluir</span>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {pedido.linhas.map((linha) => (
                                <tr
                                  key={linha.key}
                                  className="border-t border-border/60"
                                >
                                  <td
                                    data-label="Produto"
                                    data-span="full"
                                    className="px-3 py-1.5 break-words"
                                  >
                                    {linha.nome}
                                  </td>
                                  <td
                                    data-label="Qtd ped."
                                    className="px-3 py-1.5 font-mono tabular-nums text-muted-foreground"
                                  >
                                    {formatQtd(linha.qtdPedido)}
                                  </td>
                                  <td
                                    data-label="Qtd prod."
                                    className="px-3 py-1.5 font-mono tabular-nums"
                                  >
                                    {formatQtdProducao(linha.quantidadeProducao)}
                                  </td>
                                  <td
                                    data-label="Período"
                                    data-span="full"
                                    className="px-3 py-1.5 font-mono tabular-nums"
                                  >
                                    {formatPeriodo(linha.dataInicio, linha.dataFim)}
                                  </td>
                                  <td
                                    data-label="Excluir"
                                    data-span="full"
                                    className="px-1.5 py-1.5"
                                  >
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-xs"
                                      className="size-9 text-destructive hover:bg-destructive/10 hover:text-destructive md:size-6"
                                      onClick={() => excluirItem(linha)}
                                      title="Excluir item"
                                      aria-label={`Excluir item ${linha.nome}`}
                                    >
                                      <Trash2 />
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  )
}
