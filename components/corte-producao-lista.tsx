'use client'

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ListChecks, Plus } from 'lucide-react'
import {
  buscarProdutoParaLancamento,
  salvarCorteProducao,
  salvarListaCortador,
} from '@/app/actions/corte-producao'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EXCEL_ROW_FORA_DA_CARGA, OPCOES_RESPONSAVEL_CORTE } from '@/lib/corte-producao'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

export type CorteProducaoItem = {
  codProduto: string
  excelRow: number
  nomeProduto: string | null
  qtdPedida: number | null
  qtdReal: number | null
  qtdVolumes: number | null
  dataInicio: string | null
  dataFinal: string | null
  responsavel: string | null
  avisoDataFinal: string | null
}

function chaveCodigo(cod: string) {
  return cod.trim().replaceAll(' ', '').toLocaleLowerCase('pt-BR')
}

type Lancamento = {
  qtdReal: string
  qtdVolumes: string
  dataInicio: string
  dataFinal: string
  responsavel: string
}

function AvisoStatus({
  dataFinal,
  avisoDataFinal,
  dataFinalConfirmada,
}: {
  dataFinal: string
  avisoDataFinal: string | null
  dataFinalConfirmada?: string
}) {
  if (!dataFinal) return <span className="text-muted-foreground">—</span>
  if (avisoDataFinal === dataFinal || dataFinalConfirmada === dataFinal) {
    return <span className="font-medium text-emerald-700 dark:text-emerald-400">Na lista</span>
  }
  return <span className="font-medium text-amber-700 dark:text-amber-400">A salvar</span>
}

function textoQtd(value: number | null) {
  if (value == null) return ''
  return String(value)
}

function lancamentoIgual(a: Lancamento, b: Lancamento) {
  return (
    a.qtdReal.trim() === b.qtdReal.trim() &&
    a.qtdVolumes.trim() === b.qtdVolumes.trim() &&
    a.dataInicio === b.dataInicio &&
    a.dataFinal === b.dataFinal &&
    a.responsavel === b.responsavel
  )
}

function Linha({
  pedidoNorm,
  item,
  dataFinalConfirmada,
  onOcupada,
}: {
  pedidoNorm: string
  item: CorteProducaoItem
  dataFinalConfirmada?: string
  onOcupada: (ocupada: boolean) => void
}) {
  const inicial: Lancamento = {
    qtdReal: textoQtd(item.qtdReal),
    qtdVolumes: textoQtd(item.qtdVolumes),
    dataInicio: item.dataInicio ?? '',
    dataFinal: item.dataFinal ?? '',
    responsavel: item.responsavel ?? '',
  }
  const [qtdReal, setQtdReal] = useState(inicial.qtdReal)
  const [qtdVolumes, setQtdVolumes] = useState(inicial.qtdVolumes)
  const [dataInicio, setDataInicio] = useState(inicial.dataInicio)
  const [dataFinal, setDataFinal] = useState(inicial.dataFinal)
  const [responsavel, setResponsavel] = useState(inicial.responsavel)
  const valores = useRef(inicial)
  const gravado = useRef(inicial)
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fila = useRef(Promise.resolve())
  const geracao = useRef(0)
  const viva = useRef(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const descricao = item.nomeProduto?.replace(/\s+/g, ' ').trim() || '—'

  function gravar(next: Lancamento) {
    if (lancamentoIgual(next, gravado.current)) {
      onOcupada(false)
      return
    }
    const ticket = ++geracao.current
    onOcupada(true)
    fila.current = fila.current.then(async () => {
      const atual = valores.current
      if (ticket !== geracao.current || lancamentoIgual(atual, gravado.current)) {
        if (ticket === geracao.current) onOcupada(false)
        return
      }
      try {
        const result = await salvarCorteProducao({
          pedidoNorm,
          codProduto: item.codProduto,
          excelRow: item.excelRow,
          qtdReal: atual.qtdReal,
          qtdVolumes: atual.qtdVolumes,
          dataInicio: atual.dataInicio,
          dataFinal: atual.dataFinal,
          responsavel: atual.responsavel,
          nomeProduto: item.nomeProduto,
        })
        if (!viva.current || ticket !== geracao.current) return
        if (result.ok) gravado.current = atual
        setErro(result.ok ? null : result.error)
        setAviso(result.ok ? (result.aviso ?? null) : null)
      } finally {
        if (viva.current && ticket === geracao.current) onOcupada(false)
      }
    })
  }

  function agendar(next: Lancamento) {
    valores.current = next
    onOcupada(true)
    if (espera.current) clearTimeout(espera.current)
    espera.current = setTimeout(() => {
      espera.current = null
      gravar(valores.current)
    }, 300)
  }

  useEffect(() => {
    viva.current = true
    return () => {
      viva.current = false
      if (!espera.current) return
      clearTimeout(espera.current)
      espera.current = null
      const next = valores.current
      if (lancamentoIgual(next, gravado.current)) return
      void salvarCorteProducao({
        pedidoNorm,
        codProduto: item.codProduto,
        excelRow: item.excelRow,
        qtdReal: next.qtdReal,
        qtdVolumes: next.qtdVolumes,
        dataInicio: next.dataInicio,
        dataFinal: next.dataFinal,
        responsavel: next.responsavel,
        nomeProduto: item.nomeProduto,
      })
    }
  }, [item.codProduto, item.excelRow, pedidoNorm])

  const campo =
    'h-7 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 py-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'

  return (
    <>
      <tr className="border-t border-border/80">
        <td className="w-px px-1.5 py-1 text-right font-medium whitespace-nowrap tabular-nums">
          {item.qtdPedida == null
            ? '—'
            : formatNumber(item.qtdPedida, item.qtdPedida % 1 ? 2 : 0)}
        </td>
        <td className="px-1.5 py-1 font-medium whitespace-nowrap tabular-nums">
          {item.codProduto}
        </td>
        <td className="min-w-[12rem] px-1.5 py-1 leading-snug break-words">
          {descricao}
        </td>
        <td className="w-56 px-1.5 py-1">
          <select
            aria-label={`Responsável de ${descricao}`}
            value={responsavel}
            className={campo}
            onChange={(event) => {
              const next = event.currentTarget.value
              setResponsavel(next)
              agendar({ ...valores.current, responsavel: next })
            }}
          >
            <option value="">—</option>
            {OPCOES_RESPONSAVEL_CORTE.map((nome) => (
              <option key={nome} value={nome}>
                {nome}
              </option>
            ))}
          </select>
        </td>
        <td className="w-28 px-1.5 py-1">
          <input
            aria-label={`Qtd real corte de ${descricao}`}
            inputMode="decimal"
            value={qtdReal}
            className={cn(campo, 'text-right tabular-nums')}
            onChange={(event) => {
              const next = event.currentTarget.value
              setQtdReal(next)
              agendar({ ...valores.current, qtdReal: next })
            }}
            onBlur={(event) => {
              const next = event.currentTarget.value
              setQtdReal(next)
              agendar({ ...valores.current, qtdReal: next })
            }}
          />
        </td>
        <td className="w-28 px-1.5 py-1">
          <input
            aria-label={`Qtd volumes de ${descricao}`}
            inputMode="decimal"
            value={qtdVolumes}
            className={cn(campo, 'text-right tabular-nums')}
            onChange={(event) => {
              const next = event.currentTarget.value
              setQtdVolumes(next)
              agendar({ ...valores.current, qtdVolumes: next })
            }}
            onBlur={(event) => {
              const next = event.currentTarget.value
              setQtdVolumes(next)
              agendar({ ...valores.current, qtdVolumes: next })
            }}
          />
        </td>
        <td className="w-36 px-1.5 py-1">
          <input
            aria-label={`Data início corte de ${descricao}`}
            type="date"
            value={dataInicio}
            className={campo}
            onChange={(event) => {
              const next = event.currentTarget.value
              setDataInicio(next)
              agendar({ ...valores.current, dataInicio: next })
            }}
            onBlur={(event) => {
              const next = event.currentTarget.value
              setDataInicio(next)
              agendar({ ...valores.current, dataInicio: next })
            }}
          />
        </td>
        <td className="w-36 px-1.5 py-1">
          <input
            aria-label={`Data final corte de ${descricao}`}
            type="date"
            value={dataFinal}
            className={campo}
            onChange={(event) => {
              const next = event.currentTarget.value
              setDataFinal(next)
              agendar({ ...valores.current, dataFinal: next })
            }}
            onBlur={(event) => {
              const next = event.currentTarget.value
              setDataFinal(next)
              agendar({ ...valores.current, dataFinal: next })
            }}
          />
        </td>
        <td className="w-16 px-1.5 py-1 whitespace-nowrap">
          <AvisoStatus
            dataFinal={dataFinal}
            avisoDataFinal={item.avisoDataFinal}
            dataFinalConfirmada={dataFinalConfirmada}
          />
        </td>
      </tr>
      {erro ? (
        <tr>
          <td colSpan={9} className="px-1.5 pb-1 text-[11px] text-destructive">
            {erro}
          </td>
        </tr>
      ) : aviso ? (
        <tr>
          <td colSpan={9} className="px-1.5 pb-1 text-[11px] text-muted-foreground">
            {aviso}
          </td>
        </tr>
      ) : null}
    </>
  )
}

function IncluirProduto({
  pedidoNorm,
  existentes,
  onIncluir,
}: {
  pedidoNorm: string
  existentes: Set<string>
  onIncluir: (item: CorteProducaoItem) => void
}) {
  const [cod, setCod] = useState('')
  const [descricao, setDescricao] = useState('')
  const [pedirDescricao, setPedirDescricao] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, start] = useTransition()

  function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const texto = cod.trim()
    if (!texto) {
      setErro('Informe o código do produto.')
      return
    }
    if (pedirDescricao && !descricao.trim()) {
      setErro('Informe a descrição do produto.')
      return
    }
    setErro(null)
    start(async () => {
      const result = await buscarProdutoParaLancamento(
        pedidoNorm,
        texto,
        pedirDescricao ? descricao : '',
      )
      if (!result.ok) {
        setErro(result.error)
        return
      }
      if (result.precisaDescricao) {
        setPedirDescricao(true)
        setErro(null)
        return
      }
      if (existentes.has(chaveCodigo(result.codProduto))) {
        setErro('Este código já está na lista.')
        return
      }
      setCod('')
      setDescricao('')
      setPedirDescricao(false)
      onIncluir({
        codProduto: result.codProduto,
        excelRow: EXCEL_ROW_FORA_DA_CARGA,
        nomeProduto: result.nomeProduto,
        qtdPedida: null,
        qtdReal: null,
        qtdVolumes: null,
        dataInicio: null,
        dataFinal: null,
        responsavel: null,
        avisoDataFinal: null,
      })
    })
  }

  return (
    <form onSubmit={enviar} className="flex flex-wrap items-end gap-2">
      <label className="flex w-36 shrink-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
        Código do produto
        <Input
          value={cod}
          onChange={(event) => {
            setCod(event.currentTarget.value)
            setPedirDescricao(false)
          }}
          placeholder="0101056050"
          maxLength={11}
          autoComplete="off"
          disabled={pendente}
        />
      </label>
      {pedirDescricao ? (
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
          Descrição do produto
          <Input
            value={descricao}
            onChange={(event) => setDescricao(event.currentTarget.value)}
            placeholder="Este código não está em Itens"
            autoComplete="off"
            disabled={pendente}
          />
        </label>
      ) : null}
      <Button type="submit" size="sm" disabled={pendente}>
        <Plus />
        {pendente ? 'Buscando…' : pedirDescricao ? 'Cadastrar' : 'Incluir'}
      </Button>
      {erro ? <p className="w-full text-xs text-destructive">{erro}</p> : null}
      {pedirDescricao && !erro ? (
        <p className="w-full text-xs text-muted-foreground">
          Código novo. Informe a descrição para cadastrar o produto neste pedido.
        </p>
      ) : null}
    </form>
  )
}

export function CorteProducaoLista({
  pedidoNorm,
  itens,
  permitirInclusao = false,
}: {
  pedidoNorm: string
  itens: CorteProducaoItem[]
  permitirInclusao?: boolean
}) {
  const [extras, setExtras] = useState<CorteProducaoItem[]>([])
  const [ocupadas, setOcupadas] = useState<Record<string, boolean>>({})
  const [lista, setLista] = useState<{ ok: boolean; texto: string } | null>(null)
  const [confirmadas, setConfirmadas] = useState<Record<string, string>>({})
  const [salvando, startSalvar] = useTransition()
  const router = useRouter()
  const gravando = Object.values(ocupadas).some(Boolean)
  const chavesServidor = new Set(itens.map((item) => chaveCodigo(item.codProduto)))
  const visiveis = [
    ...itens,
    ...extras.filter((item) => !chavesServidor.has(chaveCodigo(item.codProduto))),
  ]
  const chaves = new Set(visiveis.map((item) => chaveCodigo(item.codProduto)))

  function marcarOcupada(chave: string, ocupada: boolean) {
    setOcupadas((atual) => {
      if (Boolean(atual[chave]) === ocupada) return atual
      const next = { ...atual }
      if (ocupada) next[chave] = true
      else delete next[chave]
      return next
    })
  }

  function salvarLista() {
    setLista(null)
    startSalvar(async () => {
      const result = await salvarListaCortador(pedidoNorm)
      setLista({
        ok: result.ok,
        texto: result.ok ? result.aviso : result.error,
      })
      if (result.ok && result.itens.length) {
        setConfirmadas((atual) => {
          const next = { ...atual }
          for (const salvo of result.itens) {
            next[chaveCodigo(salvo.codProduto)] = salvo.dataFinal
          }
          return next
        })
      }
      if (result.ok) router.refresh()
    })
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={gravando || salvando}
          onClick={salvarLista}
        >
          <ListChecks />
          {salvando ? 'Salvando…' : 'Salvar na lista'}
        </Button>
        <p className="text-xs text-muted-foreground">
          {gravando
            ? 'Aguardando a gravação da lista.'
            : 'O que já entrou na lista fica neste pedido. O próximo clique leva só os itens novos com data final. O e-mail está pausado.'}
        </p>
      </div>
      {permitirInclusao ? (
        <IncluirProduto
          pedidoNorm={pedidoNorm}
          existentes={chaves}
          onIncluir={(item) => setExtras((atual) => [...atual, item])}
        />
      ) : null}
      {lista ? (
        <p
          className={cn(
            'text-xs',
            lista.ok ? 'text-muted-foreground' : 'text-destructive',
          )}
        >
          {lista.texto}
        </p>
      ) : null}
      {!visiveis.length ? (
        <p className="text-xs text-muted-foreground">
          Informe o código do produto para trazer a descrição da base de itens.
        </p>
      ) : (
      <div className="card-surface table-surface min-w-0 overflow-x-auto">
      <table className={cn('w-full text-left text-[10px] leading-snug')}>
        <thead className="bg-muted/50 text-[9px] font-semibold tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="w-px px-1.5 py-1 text-right whitespace-nowrap">Qtd pedida</th>
            <th className="px-1.5 py-1 whitespace-nowrap">Código</th>
            <th className="px-1.5 py-1">Descrição do produto</th>
            <th className="px-1.5 py-1">Responsável</th>
            <th className="px-1.5 py-1">Qtd Real Corte</th>
            <th className="px-1.5 py-1">Qtd volumes</th>
            <th className="px-1.5 py-1">Data Inicio Corte</th>
            <th className="px-1.5 py-1">Data Final Corte</th>
            <th className="px-1.5 py-1">Lista</th>
          </tr>
        </thead>
        <tbody>
          {visiveis.map((item) => (
            <Linha
              key={`${item.codProduto}:${item.excelRow}`}
              pedidoNorm={pedidoNorm}
              item={item}
              dataFinalConfirmada={confirmadas[chaveCodigo(item.codProduto)]}
              onOcupada={(ocupada) =>
                marcarOcupada(`${item.codProduto}:${item.excelRow}`, ocupada)
              }
            />
          ))}
        </tbody>
      </table>
      </div>
      )}
    </div>
  )
}
