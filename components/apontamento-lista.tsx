'use client'

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import {
  buscarProdutoApontamento,
  salvarApontamento,
} from '@/app/actions/apontamento'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ORIGENS_COSTURA,
  RESPONSAVEIS_COSTURA,
  RESPONSAVEIS_REVISAO,
  type EtapaApontamento,
} from '@/lib/apontamento'
import { EXCEL_ROW_FORA_DA_CARGA } from '@/lib/corte-producao'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

export type ItemApontamentoLista = {
  codProduto: string
  excelRow: number
  nomeProduto: string | null
  qtdPedida: number | null
  origem: string | null
  qtdPecas: number | null
  dataProducao: string | null
  responsavel: string | null
}

function chaveCodigo(cod: string) {
  return cod.trim().replaceAll(' ', '').toLocaleLowerCase('pt-BR')
}

type Lancamento = {
  origem: string
  qtdPecas: string
  dataProducao: string
  responsavel: string
}

function textoQtd(value: number | null) {
  if (value == null) return ''
  return String(value)
}

function lancamentoIgual(a: Lancamento, b: Lancamento) {
  return (
    a.origem === b.origem &&
    a.qtdPecas.trim() === b.qtdPecas.trim() &&
    a.dataProducao === b.dataProducao &&
    a.responsavel === b.responsavel
  )
}

function Linha({
  etapa,
  pedidoNorm,
  item,
  temOrigem,
  qtdLabel,
  responsaveis,
}: {
  etapa: EtapaApontamento
  pedidoNorm: string
  item: ItemApontamentoLista
  temOrigem: boolean
  qtdLabel: string
  responsaveis: readonly string[]
}) {
  const inicial: Lancamento = {
    origem: item.origem ?? '',
    qtdPecas: textoQtd(item.qtdPecas),
    dataProducao: item.dataProducao ?? '',
    responsavel: item.responsavel ?? '',
  }
  const [origem, setOrigem] = useState(inicial.origem)
  const [qtdPecas, setQtdPecas] = useState(inicial.qtdPecas)
  const [dataProducao, setDataProducao] = useState(inicial.dataProducao)
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
  const colunas = temOrigem ? 7 : 6

  function gravar(next: Lancamento) {
    if (lancamentoIgual(next, gravado.current)) return
    const ticket = ++geracao.current
    fila.current = fila.current.then(async () => {
      const atual = valores.current
      if (ticket !== geracao.current || lancamentoIgual(atual, gravado.current)) return
      try {
        const result = await salvarApontamento({
          etapa,
          pedidoNorm,
          codProduto: item.codProduto,
          excelRow: item.excelRow,
          origem: atual.origem,
          qtdPecas: atual.qtdPecas,
          dataProducao: atual.dataProducao,
          responsavel: atual.responsavel,
          nomeProduto: item.nomeProduto,
        })
        if (!viva.current || ticket !== geracao.current) return
        if (result.ok) gravado.current = atual
        const preenchido =
          Boolean(atual.origem || atual.dataProducao || atual.responsavel) ||
          atual.qtdPecas.trim() !== ''
        setErro(result.ok ? null : result.error)
        setAviso(result.ok && preenchido ? 'Gravado neste pedido.' : null)
      } catch {
        if (viva.current && ticket === geracao.current) {
          setErro('Não foi possível gravar agora.')
        }
      }
    })
  }

  function agendar(next: Lancamento) {
    valores.current = next
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
      void salvarApontamento({
        etapa,
        pedidoNorm,
        codProduto: item.codProduto,
        excelRow: item.excelRow,
        origem: next.origem,
        qtdPecas: next.qtdPecas,
        dataProducao: next.dataProducao,
        responsavel: next.responsavel,
        nomeProduto: item.nomeProduto,
      })
    }
  }, [etapa, item.codProduto, item.excelRow, pedidoNorm])

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
        <td className="min-w-[12rem] px-1.5 py-1 leading-snug break-words">{descricao}</td>
        {temOrigem ? (
          <td className="w-44 px-1.5 py-1">
            <select
              aria-label={`Origem de ${descricao}`}
              value={origem}
              className={campo}
              onChange={(event) => {
                const next = event.currentTarget.value
                setOrigem(next)
                agendar({ ...valores.current, origem: next })
              }}
            >
              <option value="">—</option>
              {ORIGENS_COSTURA.map((nome) => (
                <option key={nome} value={nome}>
                  {nome}
                </option>
              ))}
            </select>
          </td>
        ) : null}
        <td className="w-40 px-1.5 py-1">
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
            {responsaveis.map((nome) => (
              <option key={nome} value={nome}>
                {nome}
              </option>
            ))}
          </select>
        </td>
        <td className="w-28 px-1.5 py-1">
          <input
            aria-label={`${qtdLabel} de ${descricao}`}
            inputMode="decimal"
            value={qtdPecas}
            className={cn(campo, 'text-right tabular-nums')}
            onChange={(event) => {
              const next = event.currentTarget.value
              setQtdPecas(next)
              agendar({ ...valores.current, qtdPecas: next })
            }}
            onBlur={(event) => {
              const next = event.currentTarget.value
              setQtdPecas(next)
              agendar({ ...valores.current, qtdPecas: next })
            }}
          />
        </td>
        <td className="w-36 px-1.5 py-1">
          <input
            aria-label={`Data produção de ${descricao}`}
            type="date"
            value={dataProducao}
            className={campo}
            onChange={(event) => {
              const next = event.currentTarget.value
              setDataProducao(next)
              agendar({ ...valores.current, dataProducao: next })
            }}
            onBlur={(event) => {
              const next = event.currentTarget.value
              setDataProducao(next)
              agendar({ ...valores.current, dataProducao: next })
            }}
          />
        </td>
      </tr>
      {erro ? (
        <tr>
          <td colSpan={colunas} className="px-1.5 pb-1 text-[11px] text-destructive">
            {erro}
          </td>
        </tr>
      ) : aviso ? (
        <tr>
          <td colSpan={colunas} className="px-1.5 pb-1 text-[11px] text-muted-foreground">
            {aviso}
          </td>
        </tr>
      ) : null}
    </>
  )
}

function IncluirProduto({
  etapa,
  pedidoNorm,
  existentes,
  onIncluir,
}: {
  etapa: EtapaApontamento
  pedidoNorm: string
  existentes: Set<string>
  onIncluir: (item: ItemApontamentoLista) => void
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
      const result = await buscarProdutoApontamento(
        etapa,
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
        origem: null,
        qtdPecas: null,
        dataProducao: null,
        responsavel: null,
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

export function ApontamentoLista({
  etapa,
  pedidoNorm,
  itens,
  permitirInclusao = false,
  temOrigem,
  qtdLabel,
}: {
  etapa: EtapaApontamento
  pedidoNorm: string
  itens: ItemApontamentoLista[]
  permitirInclusao?: boolean
  temOrigem: boolean
  qtdLabel: string
}) {
  const [extras, setExtras] = useState<ItemApontamentoLista[]>([])
  const responsaveis = etapa === 'costura' ? RESPONSAVEIS_COSTURA : RESPONSAVEIS_REVISAO
  const chavesServidor = new Set(itens.map((item) => chaveCodigo(item.codProduto)))
  const visiveis = [
    ...itens,
    ...extras.filter((item) => !chavesServidor.has(chaveCodigo(item.codProduto))),
  ]
  const chaves = new Set(visiveis.map((item) => chaveCodigo(item.codProduto)))

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {permitirInclusao ? (
        <IncluirProduto
          etapa={etapa}
          pedidoNorm={pedidoNorm}
          existentes={chaves}
          onIncluir={(item) => setExtras((atual) => [...atual, item])}
        />
      ) : null}
      {!visiveis.length ? (
        <p className="text-xs text-muted-foreground">
          Informe o código do produto para trazer a descrição da base de itens.
        </p>
      ) : (
        <div className="card-surface table-surface min-w-0 overflow-x-auto">
          <table className="w-full text-left text-[10px] leading-snug">
            <thead className="bg-muted/50 text-[9px] font-semibold tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="w-px px-1.5 py-1 text-right whitespace-nowrap">Qtd pedida</th>
                <th className="px-1.5 py-1 whitespace-nowrap">Código</th>
                <th className="px-1.5 py-1">Descrição do produto</th>
                {temOrigem ? <th className="px-1.5 py-1">Origem</th> : null}
                <th className="px-1.5 py-1">Responsável</th>
                <th className="px-1.5 py-1">{qtdLabel}</th>
                <th className="px-1.5 py-1">Data produção</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((item) => (
                <Linha
                  key={`${item.codProduto}:${item.excelRow}`}
                  etapa={etapa}
                  pedidoNorm={pedidoNorm}
                  item={item}
                  temOrigem={temOrigem}
                  qtdLabel={qtdLabel}
                  responsaveis={responsaveis}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
