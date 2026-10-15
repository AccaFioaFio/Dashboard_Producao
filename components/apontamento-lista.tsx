'use client'

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ListChecks, Plus } from 'lucide-react'
import {
  buscarProdutoApontamento,
  salvarApontamento,
  salvarListaApontamento,
} from '@/app/actions/apontamento'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ORIGENS_COSTURA,
  RESPONSAVEIS_COSTURA,
  RESPONSAVEIS_REVISAO,
  origemCosturaConserto,
  type EtapaApontamento,
} from '@/lib/apontamento'
import { EXCEL_ROW_FORA_DA_CARGA } from '@/lib/corte-producao'
import { formatNumber } from '@/lib/format'
import { isCodigoGeradoSemCadastro } from '@/lib/produto-codigo-manual'
import { cn } from '@/lib/utils'

export type ItemApontamentoLista = {
  codProduto: string
  excelRow: number
  nomeProduto: string | null
  qtdPedida: number | null
  origem: string | null
  oficina: string | null
  qtdPecas: number | null
  dataProducao: string | null
  responsavel: string | null
  avisoDataProducao: string | null
  observacao: string | null
}

function chaveCodigo(cod: string) {
  return cod.trim().replaceAll(' ', '').toLocaleLowerCase('pt-BR')
}

type Lancamento = {
  origem: string
  oficina: string
  qtdPecas: string
  dataProducao: string
  responsavel: string
  observacao: string
}

function AvisoStatus({
  dataProducao,
  avisoDataProducao,
  dataConfirmada,
}: {
  dataProducao: string
  avisoDataProducao: string | null
  dataConfirmada?: string
}) {
  if (!dataProducao) return <span className="text-muted-foreground">—</span>
  if (avisoDataProducao === dataProducao || dataConfirmada === dataProducao) {
    return (
      <span className="font-medium text-emerald-700 dark:text-emerald-400">Na lista</span>
    )
  }
  return (
    <span className="font-medium text-amber-700 dark:text-amber-400">A salvar</span>
  )
}

function textoQtd(value: number | null) {
  if (value == null) return ''
  return String(value)
}

function lancamentoIgual(a: Lancamento, b: Lancamento) {
  return (
    a.origem === b.origem &&
    a.oficina === b.oficina &&
    a.qtdPecas.trim() === b.qtdPecas.trim() &&
    a.dataProducao === b.dataProducao &&
    a.responsavel === b.responsavel &&
    a.observacao.trim() === b.observacao.trim()
  )
}

function CampoSelect({
  label,
  value,
  items,
  onChange,
  className,
}: {
  label: string
  value: string
  items: readonly string[]
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <select
      aria-label={label}
      value={value}
      className={className}
      onChange={(event) => onChange(event.currentTarget.value)}
    >
      <option value="">—</option>
      {items.map((nome) => (
        <option key={nome} value={nome}>
          {nome}
        </option>
      ))}
    </select>
  )
}

function Linha({
  etapa,
  pedidoNorm,
  item,
  temOrigem,
  qtdLabel,
  responsaveis,
  oficinas,
  dataConfirmada,
  salvandoItem,
  onOcupada,
  onSalvarItem,
}: {
  etapa: EtapaApontamento
  pedidoNorm: string
  item: ItemApontamentoLista
  temOrigem: boolean
  qtdLabel: string
  responsaveis: readonly string[]
  oficinas: readonly string[]
  dataConfirmada?: string
  salvandoItem: boolean
  onOcupada: (ocupada: boolean) => void
  onSalvarItem: () => void
}) {
  const inicial: Lancamento = {
    origem: item.origem ?? '',
    oficina: origemCosturaConserto(item.origem ?? '') ? (item.oficina ?? '') : '',
    qtdPecas: textoQtd(item.qtdPecas),
    dataProducao: item.dataProducao ?? '',
    responsavel: item.responsavel ?? '',
    observacao: item.observacao ?? '',
  }
  const [origem, setOrigem] = useState(inicial.origem)
  const [oficina, setOficina] = useState(inicial.oficina)
  const [qtdPecas, setQtdPecas] = useState(inicial.qtdPecas)
  const [dataProducao, setDataProducao] = useState(inicial.dataProducao)
  const [responsavel, setResponsavel] = useState(inicial.responsavel)
  const [observacao, setObservacao] = useState(inicial.observacao)
  const valores = useRef(inicial)
  const gravado = useRef(inicial)
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fila = useRef(Promise.resolve())
  const geracao = useRef(0)
  const viva = useRef(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const descricao = item.nomeProduto?.replace(/\s+/g, ' ').trim() || '—'
  const colunas = temOrigem ? 10 : 8
  const mostraOficina = temOrigem && origemCosturaConserto(origem)
  const naLista =
    Boolean(dataProducao) &&
    (item.avisoDataProducao === dataProducao || dataConfirmada === dataProducao)

  function gravar(next: Lancamento) {
    if (lancamentoIgual(next, gravado.current)) {
      onOcupada(false)
      return
    }
    const ticket = ++geracao.current
    onOcupada(true)
    fila.current = fila.current
      .then(async () => {
        const atual = valores.current
        if (ticket !== geracao.current || lancamentoIgual(atual, gravado.current)) {
          if (ticket === geracao.current) onOcupada(false)
          return
        }
        try {
          const result = await salvarApontamento({
            etapa,
            pedidoNorm,
            codProduto: item.codProduto,
            excelRow: item.excelRow,
            origem: atual.origem,
            oficina: atual.oficina,
            qtdPecas: atual.qtdPecas,
            dataProducao: atual.dataProducao,
            responsavel: atual.responsavel,
            observacao: atual.observacao,
            nomeProduto: item.nomeProduto,
          })
          if (!viva.current || ticket !== geracao.current) return
          if (result.ok) gravado.current = atual
          const preenchido =
            Boolean(
              atual.origem ||
                atual.oficina ||
                atual.dataProducao ||
                atual.responsavel ||
                atual.observacao.trim(),
            ) || atual.qtdPecas.trim() !== ''
          setErro(result.ok ? null : result.error)
          setAviso(result.ok && preenchido ? 'Gravado neste pedido.' : null)
        } catch {
          if (viva.current && ticket === geracao.current) {
            setErro('Não foi possível gravar agora.')
          }
        } finally {
          if (viva.current && ticket === geracao.current) onOcupada(false)
        }
      })
      .catch(() => {
        /* mantém a fila viva após falha inesperada */
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

  async function salvarNaLista() {
    if (salvandoItem) return
    if (espera.current) {
      clearTimeout(espera.current)
      espera.current = null
    }
    gravar(valores.current)
    await fila.current
    onSalvarItem()
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
        oficina: next.oficina,
        qtdPecas: next.qtdPecas,
        dataProducao: next.dataProducao,
        responsavel: next.responsavel,
        observacao: next.observacao,
        nomeProduto: item.nomeProduto,
      }).catch(() => {
        /* unmount: evita rejection não tratada */
      })
    }
  }, [etapa, item.codProduto, item.excelRow, pedidoNorm, item.nomeProduto])

  const campo =
    'h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2 py-1 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 sm:h-7 sm:text-xs dark:bg-input/40'
  const area =
    'min-h-16 w-full min-w-0 resize-y rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 sm:min-h-12 sm:text-xs dark:bg-input/40'

  return (
    <>
      <tr className="border-t border-border/80">
        <td
          data-label="Qtd pedida"
          className="w-px px-1.5 py-1.5 text-right font-medium whitespace-nowrap tabular-nums"
        >
          {item.qtdPedida == null
            ? '—'
            : formatNumber(item.qtdPedida, item.qtdPedida % 1 ? 2 : 0)}
        </td>
        <td
          data-label="Código"
          className="px-1.5 py-1.5 font-medium whitespace-nowrap tabular-nums"
        >
          {isCodigoGeradoSemCadastro(item.codProduto) ? '—' : item.codProduto}
        </td>
        <td
          data-label="Descrição"
          data-span="full"
          className="min-w-[12rem] px-1.5 py-1.5 leading-snug break-words"
        >
          {descricao}
        </td>
        {temOrigem ? (
          <td data-label="Origem" data-span="full" className="w-44 px-1.5 py-1.5">
            <CampoSelect
              label={`Origem de ${descricao}`}
              value={origem}
              items={ORIGENS_COSTURA}
              className={campo}
              onChange={(next) => {
                const proximaOficina = origemCosturaConserto(next) ? oficina : ''
                setOrigem(next)
                setOficina(proximaOficina)
                agendar({ ...valores.current, origem: next, oficina: proximaOficina })
              }}
            />
          </td>
        ) : null}
        {temOrigem ? (
          <td data-label="Oficina" data-span="full" className="w-44 px-1.5 py-1.5">
            {mostraOficina ? (
              <CampoSelect
                label={`Oficina de ${descricao}`}
                value={oficina}
                items={oficinas}
                className={campo}
                onChange={(next) => {
                  setOficina(next)
                  agendar({ ...valores.current, oficina: next })
                }}
              />
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </td>
        ) : null}
        <td data-label="Responsável" data-span="full" className="w-40 px-1.5 py-1.5">
          <CampoSelect
            label={`Responsável de ${descricao}`}
            value={responsavel}
            items={responsaveis}
            className={campo}
            onChange={(next) => {
              setResponsavel(next)
              agendar({ ...valores.current, responsavel: next })
            }}
          />
        </td>
        <td data-label={qtdLabel} className="w-28 px-1.5 py-1.5">
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
        <td data-label="Data produção" className="w-36 px-1.5 py-1.5">
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
        <td data-label="Observação" data-span="full" className="min-w-[12rem] px-1.5 py-1.5">
          <textarea
            aria-label={`Observação de ${descricao}`}
            value={observacao}
            rows={2}
            maxLength={500}
            placeholder="Opcional"
            className={area}
            onChange={(event) => {
              const next = event.currentTarget.value
              setObservacao(next)
              agendar({ ...valores.current, observacao: next })
            }}
            onBlur={(event) => {
              const next = event.currentTarget.value
              setObservacao(next)
              agendar({ ...valores.current, observacao: next })
            }}
          />
        </td>
        <td data-label="Lista" data-span="full" className="px-1.5 py-1.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
            <AvisoStatus
              dataProducao={dataProducao}
              avisoDataProducao={item.avisoDataProducao}
              dataConfirmada={dataConfirmada}
            />
            <Button
              type="button"
              size="sm"
              disabled={salvandoItem || naLista}
              onClick={() => {
                void salvarNaLista()
              }}
              className="h-10 w-full sm:h-8 sm:w-auto"
            >
              <ListChecks />
              {salvandoItem ? 'Salvando…' : naLista ? 'Na lista' : 'Salvar na lista'}
            </Button>
          </div>
        </td>
      </tr>
      {erro ? (
        <tr>
          <td colSpan={colunas} className="px-1.5 pb-1 text-xs text-destructive sm:text-[11px]">
            {erro}
          </td>
        </tr>
      ) : aviso ? (
        <tr>
          <td
            colSpan={colunas}
            className="px-1.5 pb-1 text-xs text-muted-foreground sm:text-[11px]"
          >
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
    const textoCod = cod.trim()
    const textoDesc = descricao.trim()
    if (!textoCod && !textoDesc) {
      setErro('Informe o código ou a descrição do produto.')
      return
    }
    if (pedirDescricao && !textoDesc) {
      setErro('Informe a descrição do produto.')
      return
    }
    setErro(null)
    start(async () => {
      const result = await buscarProdutoApontamento(
        etapa,
        pedidoNorm,
        textoCod,
        textoDesc,
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
        setErro(
          isCodigoGeradoSemCadastro(result.codProduto)
            ? 'Esta descrição já está na lista.'
            : 'Este código já está na lista.',
        )
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
        oficina: null,
        qtdPecas: null,
        dataProducao: null,
        responsavel: null,
        avisoDataProducao: null,
        observacao: null,
      })
    })
  }

  return (
    <form
      onSubmit={enviar}
      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <label className="flex w-full shrink-0 flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-36">
        Código do produto
        <Input
          value={cod}
          onChange={(event) => {
            setCod(event.currentTarget.value)
            setPedirDescricao(false)
          }}
          placeholder="Opcional"
          maxLength={11}
          autoComplete="off"
          disabled={pendente}
          className="h-10 text-base sm:h-8 sm:text-sm"
        />
      </label>
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground sm:min-w-[16rem]">
        Descrição do produto
        <Input
          value={descricao}
          onChange={(event) => setDescricao(event.currentTarget.value)}
          placeholder={
            pedirDescricao
              ? 'Este código não está em Itens'
              : 'Obrigatória se não houver código'
          }
          autoComplete="off"
          disabled={pendente}
          className="h-10 text-base sm:h-8 sm:text-sm"
        />
      </label>
      <Button
        type="submit"
        size="sm"
        disabled={pendente}
        className="h-10 w-full sm:h-8 sm:w-auto"
      >
        <Plus />
        {pendente ? 'Buscando…' : pedirDescricao ? 'Cadastrar' : 'Incluir'}
      </Button>
      {erro ? <p className="w-full text-xs text-destructive">{erro}</p> : null}
      {pedirDescricao && !erro ? (
        <p className="w-full text-xs text-muted-foreground">
          Código novo. Informe a descrição para cadastrar o produto neste pedido.
        </p>
      ) : !pedirDescricao && !erro ? (
        <p className="w-full text-xs text-muted-foreground">
          Com código, a descrição vem da base de Itens quando existir. Sem código, digite só a
          descrição.
        </p>
      ) : null}
    </form>
  )
}

export function ApontamentoLista({
  etapa,
  pedidoNorm,
  itens,
  oficinas = [],
  permitirInclusao = false,
  temOrigem,
  qtdLabel,
}: {
  etapa: EtapaApontamento
  pedidoNorm: string
  itens: ItemApontamentoLista[]
  oficinas?: readonly string[]
  permitirInclusao?: boolean
  temOrigem: boolean
  qtdLabel: string
}) {
  const [extras, setExtras] = useState<ItemApontamentoLista[]>([])
  const [ocupadas, setOcupadas] = useState<Record<string, boolean>>({})
  const [lista, setLista] = useState<{ ok: boolean; texto: string } | null>(null)
  const [confirmadas, setConfirmadas] = useState<Record<string, string>>({})
  const [salvandoCod, setSalvandoCod] = useState<string | null>(null)
  const [salvando, startSalvar] = useTransition()
  const router = useRouter()
  const responsaveis = etapa === 'costura' ? RESPONSAVEIS_COSTURA : RESPONSAVEIS_REVISAO
  const gravando = Object.values(ocupadas).some(Boolean)
  const chavesServidor = new Set(itens.map((item) => chaveCodigo(item.codProduto)))
  const visiveis = [
    ...itens,
    ...extras.filter((item) => !chavesServidor.has(chaveCodigo(item.codProduto))),
  ]
  const chaves = new Set(visiveis.map((item) => chaveCodigo(item.codProduto)))
  const dica =
    etapa === 'costura'
      ? 'O que já entrou na lista fica neste pedido. Em cada item, Salvar na lista leva só aquele produto (origem Produção, qtd, data e responsável). Em Conserto, escolha também a oficina. O botão do topo salva todos os novos de uma vez.'
      : 'O que já entrou na lista fica neste pedido. Em cada item, Salvar na lista leva só aquele produto (qtd, data e responsável). O botão do topo salva todos os novos de uma vez.'

  function marcarOcupada(chave: string, ocupada: boolean) {
    setOcupadas((atual) => {
      if (Boolean(atual[chave]) === ocupada) return atual
      const next = { ...atual }
      if (ocupada) next[chave] = true
      else delete next[chave]
      return next
    })
  }

  function salvarLista(codProduto?: string) {
    setLista(null)
    setSalvandoCod(codProduto ?? '')
    startSalvar(async () => {
      const result = await salvarListaApontamento(etapa, pedidoNorm, codProduto)
      setLista({
        ok: result.ok,
        texto: result.ok ? result.aviso : result.error,
      })
      if (result.ok && result.itens.length) {
        setConfirmadas((atual) => {
          const next = { ...atual }
          for (const salvo of result.itens) {
            next[chaveCodigo(salvo.codProduto)] = salvo.dataProducao
          }
          return next
        })
      }
      setSalvandoCod(null)
      if (result.ok) router.refresh()
    })
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          type="button"
          size="sm"
          disabled={gravando || salvando}
          onClick={() => salvarLista()}
          className="h-10 w-full sm:h-8 sm:w-auto"
        >
          <ListChecks />
          {salvando && salvandoCod === '' ? 'Salvando…' : 'Salvar todos na lista'}
        </Button>
        <p className="text-xs text-muted-foreground sm:text-sm">
          {gravando ? 'Aguardando a gravação da lista.' : dica}
        </p>
      </div>
      {permitirInclusao ? (
        <IncluirProduto
          etapa={etapa}
          pedidoNorm={pedidoNorm}
          existentes={chaves}
          onIncluir={(item) => setExtras((atual) => [...atual, item])}
        />
      ) : null}
      {lista ? (
        <p
          className={cn(
            'text-xs sm:text-sm',
            lista.ok ? 'text-muted-foreground' : 'text-destructive',
          )}
        >
          {lista.texto}
        </p>
      ) : null}
      {!visiveis.length ? (
        <p className="text-xs text-muted-foreground sm:text-sm">
          Informe o código (para buscar a descrição) ou só a descrição do produto.
        </p>
      ) : (
        <div className="card-surface table-surface mobile-form-table min-w-0 overflow-x-auto">
          <table className="w-full text-left text-xs leading-snug sm:text-[11px]">
            <thead className="bg-muted/50 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase sm:text-[9px]">
              <tr>
                <th className="w-px px-1.5 py-1 text-right whitespace-nowrap">Qtd pedida</th>
                <th className="px-1.5 py-1 whitespace-nowrap">Código</th>
                <th className="px-1.5 py-1">Descrição do produto</th>
                {temOrigem ? <th className="px-1.5 py-1">Origem</th> : null}
                {temOrigem ? <th className="px-1.5 py-1">Oficina</th> : null}
                <th className="px-1.5 py-1">Responsável</th>
                <th className="px-1.5 py-1">{qtdLabel}</th>
                <th className="px-1.5 py-1">Data produção</th>
                <th className="px-1.5 py-1">Observação</th>
                <th className="px-1.5 py-1">Lista</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((item) => {
                const chave = chaveCodigo(item.codProduto)
                return (
                  <Linha
                    key={`${item.codProduto}:${item.excelRow}`}
                    etapa={etapa}
                    pedidoNorm={pedidoNorm}
                    item={item}
                    temOrigem={temOrigem}
                    qtdLabel={qtdLabel}
                    responsaveis={responsaveis}
                    oficinas={oficinas}
                    dataConfirmada={confirmadas[chave]}
                    salvandoItem={salvando && salvandoCod === item.codProduto}
                    onOcupada={(ocupada) =>
                      marcarOcupada(`${item.codProduto}:${item.excelRow}`, ocupada)
                    }
                    onSalvarItem={() => {
                      if (salvando) return
                      salvarLista(item.codProduto)
                    }}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
