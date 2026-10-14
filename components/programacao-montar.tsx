'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import {
  ArrowDownToLine,
  CalendarPlus,
  CopyPlus,
  Equal,
  Plus,
  Printer,
  Save,
  Search,
  Trash2,
} from 'lucide-react'
import { buscarProgramacaoPedido } from '@/app/actions/programacao'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatInt } from '@/lib/format'
import {
  dataProducaoValida,
  itemComQuantidade,
  itemProntoParaSalvar,
  itensSalvosDoPedido,
  lerBancoProgramacao,
  mesclarPedidoNoBanco,
  periodoValido,
  removerPedidoDoBanco,
  type ItemProgramacao,
} from '@/lib/programacao'
import { cn } from '@/lib/utils'

type PedidoSessao = {
  pedido: string
  pedidoNorm: string | null
  cliente: string | null
}

function formatQtdPedido(value: number | null) {
  if (value == null) return '—'
  return formatInt(value)
}

function qtdPedidoComoTexto(value: number | null) {
  if (value == null || !Number.isFinite(value) || value <= 0) return null
  return String(value)
}

function qtdProducaoVazia(value: string) {
  return value.trim() === ''
}

function novoItemManual(): ItemProgramacao {
  return {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    codProduto: '',
    nome: '',
    qtdPedido: null,
    quantidadeProducao: '',
    dataInicio: '',
    dataFim: '',
  }
}

function itemEhManual(item: ItemProgramacao) {
  return item.id.startsWith('manual-') || !item.codProduto
}

export function ProgramacaoMontar({ onSalvou }: { onSalvou?: () => void }) {
  const [pedido, setPedido] = useState('')
  const [pedidoNorm, setPedidoNorm] = useState<string | null>(null)
  const [cliente, setCliente] = useState<string | null>(null)
  const [itens, setItens] = useState<ItemProgramacao[]>([])
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [buscou, setBuscou] = useState(false)
  const [manual, setManual] = useState(false)
  const [dataInicioLote, setDataInicioLote] = useState('')
  const [dataFimLote, setDataFimLote] = useState('')
  const [pedidosSessao, setPedidosSessao] = useState<PedidoSessao[]>([])
  const [pending, startTransition] = useTransition()
  const pedidoInputRef = useRef<HTMLInputElement>(null)

  const comQuantidade = useMemo(
    () => itens.filter(itemComQuantidade),
    [itens],
  )
  const prontos = useMemo(() => itens.filter(itemProntoParaSalvar), [itens])
  const faltandoPeriodo = comQuantidade.length - prontos.length
  const podeSalvar =
    Boolean(pedido.trim()) && prontos.length > 0 && faltandoPeriodo === 0
  const podeImprimir = podeSalvar
  const periodoLoteValido = periodoValido(dataInicioLote, dataFimLote)
  const chaveAtual = (pedidoNorm ?? pedido).trim()

  function entrarModoManual(pedidoInformado: string, aviso: string) {
    const banco = lerBancoProgramacao()
    const salvos = itensSalvosDoPedido(banco, pedidoInformado, null)
    const clienteSalvo =
      banco.linhas.find(
        (row) => (row.pedidoNorm ?? row.pedido).trim() === pedidoInformado,
      )?.cliente ?? null

    setPedido(pedidoInformado)
    setPedidoNorm(null)
    setCliente(clienteSalvo ?? '')
    setManual(true)
    setBuscou(true)
    setErro(null)
    setItens(salvos)
    setMensagem(
      salvos.length > 0
        ? `${aviso} Programação já salva carregada — ajuste, adicione produtos ou salve.`
        : `${aviso} Informe o nome fantasia, adicione os produtos e salve.`,
    )
  }

  function pesquisar(pedidoOverride?: string) {
    const informado = (pedidoOverride ?? pedido).trim()
    if (!informado) return
    if (pedidoOverride != null) setPedido(informado)
    setErro(null)
    setMensagem(null)
    startTransition(async () => {
      const result = await buscarProgramacaoPedido(informado)
      setBuscou(true)
      if (!result.ok) {
        setErro(result.error)
        setCliente(null)
        setPedidoNorm(null)
        setManual(false)
        setItens([])
        return
      }
      if (!result.loaded) {
        entrarModoManual(
          informado,
          'A carga de Itens.xlsx ainda não entrou.',
        )
        return
      }

      const pedidoInexistente =
        !result.pedidoNorm &&
        result.itens.length === 0 &&
        !result.cliente &&
        !result.inclusaoManual

      if (pedidoInexistente) {
        entrarModoManual(
          result.pedidoInformado || informado,
          'Pedido não encontrado nesta carga.',
        )
        return
      }

      const pedidoAtual =
        result.pedidoNorm ?? result.pedidoInformado ?? informado
      const salvos = itensSalvosDoPedido(
        lerBancoProgramacao(),
        pedidoAtual,
        result.pedidoNorm,
      )
      const porId = new Map(salvos.map((item) => [item.id, item]))
      const daCarga = result.itens.map((item) => {
        const salvo = porId.get(item.id)
        return {
          id: item.id,
          codProduto: item.codProduto,
          nome: salvo?.nome ?? item.nome,
          qtdPedido: item.qtdPedido,
          quantidadeProducao: salvo?.quantidadeProducao ?? '',
          dataInicio: salvo?.dataInicio ?? '',
          dataFim: salvo?.dataFim ?? '',
        }
      })
      const idsCarga = new Set(daCarga.map((item) => item.id))
      const extrasManuais = salvos.filter((item) => !idsCarga.has(item.id))
      const modoManual = result.inclusaoManual || result.itens.length === 0

      setPedido(pedidoAtual)
      setPedidoNorm(result.pedidoNorm)
      setCliente(result.cliente ?? '')
      setManual(modoManual)
      setItens([...daCarga, ...extrasManuais])
      setMensagem(
        modoManual && daCarga.length === 0
          ? salvos.length > 0
            ? 'Pedido sem itens na carga. Programação salva carregada — ajuste ou adicione produtos.'
            : 'Pedido sem itens na carga. Informe o nome fantasia, adicione os produtos e salve.'
          : salvos.length > 0
            ? 'Pedido carregado com a programação já salva. Ajuste e clique em Salvar.'
            : 'Pedido carregado. Informe data inicial e final (ou use o lote).',
      )
    })
  }

  function adicionarProduto() {
    setItens((prev) => [...prev, novoItemManual()])
    setMensagem('Produto adicionado. Preencha o nome, a qtd produção e o período.')
    setErro(null)
  }

  function atualizarItem(id: string, patch: Partial<ItemProgramacao>) {
    setItens((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }

  function aplicarQtdPedidoNasVazias() {
    setItens((prev) =>
      prev.map((item) => {
        if (!qtdProducaoVazia(item.quantidadeProducao)) return item
        const texto = qtdPedidoComoTexto(item.qtdPedido)
        if (texto == null) return item
        return { ...item, quantidadeProducao: texto }
      }),
    )
    setMensagem('Qtd do pedido aplicada nas linhas sem qtd produção.')
    setErro(null)
  }

  function aplicarPeriodoEmTodas() {
    if (!periodoLoteValido) {
      setErro('Informe data inicial e final válidas (início ≤ fim) na barra de lote.')
      return
    }
    setItens((prev) =>
      prev.map((item) => ({
        ...item,
        dataInicio: dataInicioLote,
        dataFim: dataFimLote,
      })),
    )
    setMensagem('Período aplicado em todos os itens.')
    setErro(null)
  }

  function preencherTudo() {
    if (!periodoLoteValido) {
      setErro('Informe data inicial e final válidas para preencher tudo.')
      return
    }
    setItens((prev) =>
      prev.map((item) => {
        const texto = qtdPedidoComoTexto(item.qtdPedido)
        return {
          ...item,
          quantidadeProducao: qtdProducaoVazia(item.quantidadeProducao)
            ? (texto ?? item.quantidadeProducao)
            : item.quantidadeProducao,
          dataInicio: dataInicioLote,
          dataFim: dataFimLote,
        }
      }),
    )
    setMensagem(
      'Qtd do pedido (vazias) e período aplicados. Ajuste se precisar e salve.',
    )
    setErro(null)
  }

  function usarQtdPedidoLinha(id: string, qtdPedido: number | null) {
    const texto = qtdPedidoComoTexto(qtdPedido)
    if (texto == null) return
    atualizarItem(id, { quantidadeProducao: texto })
  }

  function removerItemDaLista(id: string) {
    setItens((prev) => prev.filter((item) => item.id !== id))
    setMensagem('Item removido da lista. Salve para gravar a alteração (ou exclua o pedido).')
    setErro(null)
  }

  function excluirPedidoSalvo() {
    if (!pedido.trim()) return
    const ok = window.confirm(
      `Excluir o pedido ${pedido.trim()} da programação salva? Todos os itens desse pedido serão removidos.`,
    )
    if (!ok) return
    const { removidos } = removerPedidoDoBanco(pedido.trim(), pedidoNorm)
    const chave = (pedidoNorm ?? pedido).trim()
    setPedidosSessao((prev) =>
      prev.filter((item) => (item.pedidoNorm ?? item.pedido).trim() !== chave),
    )
    setItens([])
    setBuscou(false)
    setManual(false)
    setPedido('')
    setPedidoNorm(null)
    setCliente(null)
    setErro(null)
    setMensagem(
      removidos > 0
        ? 'Pedido excluído da programação. Informe o próximo pedido.'
        : 'Esse pedido não tinha programação salva.',
    )
    onSalvou?.()
    window.setTimeout(() => pedidoInputRef.current?.focus(), 0)
  }

  function copiarPeriodoDeCima(index: number) {
    if (index <= 0) return
    const anterior = itens[index - 1]
    if (!anterior || !periodoValido(anterior.dataInicio, anterior.dataFim)) return
    atualizarItem(itens[index].id, {
      dataInicio: anterior.dataInicio,
      dataFim: anterior.dataFim,
    })
  }

  function focarProximaLinha(
    campo: 'quantidadeProducao' | 'dataInicio' | 'dataFim',
    index: number,
  ) {
    const proximo = document.querySelector<HTMLInputElement>(
      `[data-prog-field="${campo}"][data-prog-index="${index + 1}"]`,
    )
    proximo?.focus()
    proximo?.select?.()
  }

  function limparParaProximoPedido(mensagemFinal?: string) {
    setPedido('')
    setPedidoNorm(null)
    setCliente(null)
    setItens([])
    setBuscou(false)
    setManual(false)
    setErro(null)
    setMensagem(mensagemFinal ?? 'Salvo. Informe o próximo pedido.')
    window.setTimeout(() => pedidoInputRef.current?.focus(), 0)
  }

  function registrarPedidoSessao(entry: PedidoSessao) {
    const chave = (entry.pedidoNorm ?? entry.pedido).trim()
    setPedidosSessao((prev) => {
      const filtrados = prev.filter(
        (item) => (item.pedidoNorm ?? item.pedido).trim() !== chave,
      )
      return [...filtrados, entry]
    })
  }

  function salvar() {
    if (!podeSalvar) return
    const filtrados = prontos
    const removidos = itens.length - filtrados.length
    const pedidoSalvo = pedido.trim()
    const clienteSalvo = cliente?.trim() ? cliente.trim() : null
    mesclarPedidoNoBanco({
      pedido: pedidoSalvo,
      pedidoNorm,
      cliente: clienteSalvo,
      itens: filtrados,
    })
    registrarPedidoSessao({
      pedido: pedidoSalvo,
      pedidoNorm: pedidoNorm ?? null,
      cliente: clienteSalvo,
    })
    setErro(null)
    onSalvou?.()
    limparParaProximoPedido(
      removidos > 0
        ? `Programação salva. ${removidos} item${removidos === 1 ? '' : 's'} sem qtd produção saiu da lista. Informe o próximo pedido.`
        : undefined,
    )
  }

  function imprimir() {
    if (!podeImprimir) return
    setItens(prontos)
    window.setTimeout(() => window.print(), 50)
  }

  return (
    <div className="flex flex-col gap-3 print:gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
        <Button
          type="button"
          variant="outline"
          onClick={excluirPedidoSalvo}
          disabled={!pedido.trim() || pending}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 />
          Excluir pedido
        </Button>
        <Button type="button" variant="outline" onClick={salvar} disabled={!podeSalvar}>
          <Save />
          Salvar
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={imprimir}
          disabled={!podeImprimir}
        >
          <Printer />
          Imprimir
        </Button>
      </div>

      <section
        className="card-surface flex flex-col gap-3 p-3 print:border print:border-foreground/20 print:shadow-none"
        data-programacao-print
      >
        <div className="hidden print:block">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Programação de Produção
          </p>
        </div>

        {pedidosSessao.length > 0 ? (
          <div className="flex flex-col gap-1.5 print:hidden">
            <p className="text-xs font-medium text-muted-foreground">
              Pedidos nesta sessão
            </p>
            <div className="flex flex-wrap gap-1.5">
              {pedidosSessao.map((item) => {
                const chave = (item.pedidoNorm ?? item.pedido).trim()
                const ativo = chave === chaveAtual && buscou
                return (
                  <Button
                    key={chave}
                    type="button"
                    variant={ativo ? 'secondary' : 'outline'}
                    size="sm"
                    disabled={pending}
                    onClick={() => pesquisar(item.pedidoNorm ?? item.pedido)}
                    className={cn('max-w-full', ativo && 'ring-1 ring-ring/40')}
                    title={item.cliente ?? undefined}
                  >
                    <span className="truncate">
                      {item.pedido}
                      {item.cliente ? ` · ${item.cliente}` : ''}
                    </span>
                  </Button>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground sm:min-w-[12rem]">
            Número do pedido
            <Input
              ref={pedidoInputRef}
              value={pedido}
              onChange={(event) => setPedido(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  pesquisar()
                }
              }}
              placeholder="Ex.: 17226"
              autoComplete="off"
              inputMode="numeric"
              className="h-10 text-base sm:h-8 sm:text-sm print:border-0 print:bg-transparent print:px-0"
            />
          </label>
          <label className="flex min-w-0 flex-[1.4] flex-col gap-1 text-xs font-medium text-muted-foreground sm:min-w-[16rem]">
            Nome fantasia
            <Input
              value={cliente ?? ''}
              readOnly={!manual}
              onChange={(event) => setCliente(event.target.value)}
              placeholder={
                manual
                  ? 'Digite o nome fantasia'
                  : 'Aparece ao pesquisar o pedido'
              }
              className={cn(
                'h-10 text-base sm:h-8 sm:text-sm print:border-0 print:bg-transparent print:px-0',
                !manual && 'bg-muted/40',
              )}
            />
          </label>
          <Button
            type="button"
            onClick={() => pesquisar()}
            disabled={pending || !pedido.trim()}
            className="h-10 w-full sm:h-8 sm:w-auto print:hidden"
          >
            <Search />
            {pending ? 'Pesquisando…' : 'Pesquisar'}
          </Button>
        </div>

        {erro ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive print:hidden">
            {erro}
          </p>
        ) : null}
        {mensagem ? (
          <p className="rounded-lg border border-primary/20 bg-primary/[0.08] px-3 py-2 text-xs text-foreground print:hidden">
            {mensagem}
          </p>
        ) : null}
        {faltandoPeriodo > 0 ? (
          <p className="text-xs text-muted-foreground print:hidden">
            {faltandoPeriodo} item{faltandoPeriodo === 1 ? '' : 's'} com qtd produção ainda
            sem período válido (data inicial e final).
          </p>
        ) : null}

        {!buscou ? (
          <p className="text-xs text-muted-foreground print:hidden">
            Digite o número do pedido e pesquise para listar os itens. Se o pedido não
            existir na carga, dá para informar o nome fantasia e incluir os produtos
            manualmente.
          </p>
        ) : (
          <>
            {manual ? (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground print:hidden">
                Modo manual: preencha o nome fantasia e use &quot;Adicionar produto&quot;
                para incluir os itens.
              </p>
            ) : null}
            <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/20 p-2.5 print:hidden sm:flex-row sm:flex-wrap sm:items-end">
              <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-40">
                Data inicial
                <Input
                  type="date"
                  value={dataInicioLote}
                  onChange={(event) => {
                    const value = event.target.value
                    setDataInicioLote(value)
                    if (
                      value &&
                      (!dataFimLote ||
                        (dataProducaoValida(dataFimLote) && dataFimLote < value))
                    ) {
                      setDataFimLote(value)
                    }
                  }}
                  className="h-9 sm:h-8"
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-40">
                Data final
                <Input
                  type="date"
                  value={dataFimLote}
                  onChange={(event) => setDataFimLote(event.target.value)}
                  className="h-9 sm:h-8"
                />
              </label>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={aplicarPeriodoEmTodas}
                  disabled={!periodoLoteValido}
                >
                  <CalendarPlus />
                  Aplicar período
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={aplicarQtdPedidoNasVazias}
                >
                  <Equal />
                  Usar qtd do pedido
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={preencherTudo}
                  disabled={!periodoLoteValido}
                >
                  <CopyPlus />
                  Preencher tudo
                </Button>
              </div>
            </div>

            <div className="table-surface min-w-0 overflow-x-auto rounded-lg border border-border/80">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead className="bg-foreground text-background">
                  <tr>
                    <th className="px-3 py-2 text-xs font-semibold tracking-wide uppercase">
                      Item
                    </th>
                    <th className="w-28 px-3 py-2 text-xs font-semibold tracking-wide uppercase">
                      {manual ? 'Qtd ref.' : 'Qtd pedido'}
                    </th>
                    <th className="w-32 px-3 py-2 text-xs font-semibold tracking-wide uppercase">
                      Qtd produção
                    </th>
                    <th className="w-40 px-3 py-2 text-xs font-semibold tracking-wide uppercase">
                      Data inicial
                    </th>
                    <th className="w-40 px-3 py-2 text-xs font-semibold tracking-wide uppercase">
                      Data final
                    </th>
                    <th className="w-24 px-3 py-2 text-xs font-semibold tracking-wide uppercase print:hidden">
                      Atalhos
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {itens.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-4 text-xs text-muted-foreground"
                      >
                        Nenhum produto na lista.
                        {manual
                          ? ' Clique em Adicionar produto para incluir.'
                          : ' Pesquise outro pedido ou adicione um produto.'}
                      </td>
                    </tr>
                  ) : null}
                  {itens.map((item, index) => {
                    const podeEditarQtdRef = manual || itemEhManual(item)
                    const podeUsarQtd = qtdPedidoComoTexto(item.qtdPedido) != null
                    const anterior = index > 0 ? itens[index - 1] : null
                    const podeCopiarPeriodo = Boolean(
                      anterior &&
                        periodoValido(anterior.dataInicio, anterior.dataFim),
                    )
                    return (
                      <tr key={item.id} className="border-t border-border/70">
                        <td className="px-2 py-1.5">
                          <Input
                            value={item.nome}
                            onChange={(event) =>
                              atualizarItem(item.id, { nome: event.target.value })
                            }
                            placeholder={manual ? 'Nome do produto' : undefined}
                            className="h-9 border-transparent bg-transparent print:border-0 print:px-0"
                            aria-label="Item"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          {podeEditarQtdRef ? (
                            <Input
                              value={
                                item.qtdPedido == null ? '' : String(item.qtdPedido)
                              }
                              onChange={(event) => {
                                const texto = event.target.value.trim().replace(',', '.')
                                if (!texto) {
                                  atualizarItem(item.id, { qtdPedido: null })
                                  return
                                }
                                const n = Number(texto)
                                atualizarItem(item.id, {
                                  qtdPedido: Number.isFinite(n) ? n : null,
                                })
                              }}
                              inputMode="decimal"
                              placeholder="—"
                              className="h-9 border-transparent bg-transparent tabular-nums print:border-0 print:px-0"
                              aria-label="Quantidade de referência"
                            />
                          ) : (
                            <span className="px-1 font-mono text-sm tabular-nums text-muted-foreground">
                              {formatQtdPedido(item.qtdPedido)}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            value={item.quantidadeProducao}
                            onChange={(event) =>
                              atualizarItem(item.id, {
                                quantidadeProducao: event.target.value,
                              })
                            }
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                focarProximaLinha('quantidadeProducao', index)
                              }
                            }}
                            data-prog-field="quantidadeProducao"
                            data-prog-index={index}
                            inputMode="decimal"
                            placeholder="0"
                            className="h-9 border-transparent bg-transparent tabular-nums print:border-0 print:px-0"
                            aria-label="Quantidade na produção"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="date"
                            value={item.dataInicio}
                            onChange={(event) => {
                              const value = event.target.value
                              atualizarItem(item.id, {
                                dataInicio: value,
                                dataFim:
                                  !item.dataFim ||
                                  (dataProducaoValida(item.dataFim) &&
                                    item.dataFim < value)
                                    ? value
                                    : item.dataFim,
                              })
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                focarProximaLinha('dataInicio', index)
                              }
                            }}
                            data-prog-field="dataInicio"
                            data-prog-index={index}
                            className="h-9 border-transparent bg-transparent print:border-0 print:px-0"
                            aria-label="Data inicial na produção"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="date"
                            value={item.dataFim}
                            onChange={(event) =>
                              atualizarItem(item.id, {
                                dataFim: event.target.value,
                              })
                            }
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                focarProximaLinha('dataFim', index)
                              }
                            }}
                            data-prog-field="dataFim"
                            data-prog-index={index}
                            className="h-9 border-transparent bg-transparent print:border-0 print:px-0"
                            aria-label="Data final na produção"
                          />
                        </td>
                        <td className="px-1.5 py-1.5 print:hidden">
                          <div className="flex items-center gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              disabled={!podeUsarQtd}
                              onClick={() =>
                                usarQtdPedidoLinha(item.id, item.qtdPedido)
                              }
                              title="Qtd = pedido"
                              aria-label="Usar quantidade do pedido nesta linha"
                            >
                              <Equal />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              disabled={!podeCopiarPeriodo}
                              onClick={() => copiarPeriodoDeCima(index)}
                              title="Copiar período de cima"
                              aria-label="Copiar período da linha de cima"
                            >
                              <ArrowDownToLine />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => removerItemDaLista(item.id)}
                              title="Remover item da lista"
                              aria-label={`Remover item ${item.nome}`}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="print:hidden">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={adicionarProduto}
              >
                <Plus />
                Adicionar produto
              </Button>
            </div>
          </>
        )}

        <p className="text-xs text-muted-foreground print:hidden">
          Informe data inicial e final (um dia ou vários). Use o lote para aplicar o
          período a todos. Itens sem nome ou sem quantidade saem da lista ao salvar.
        </p>
      </section>
    </div>
  )
}
