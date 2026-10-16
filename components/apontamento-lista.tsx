'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from 'react'
import { ListChecks, Pencil, Plus, X } from 'lucide-react'
import {
  buscarProdutoApontamento,
  corrigirApontamento,
  salvarListaApontamento,
  somarApontamento,
} from '@/app/actions/apontamento'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  OBS_JA_LANCADO_PLANILHA,
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
  datasAvisadas?: string[]
  observacao: string | null
}

function chaveCodigo(cod: string) {
  return cod.trim().replaceAll(' ', '').toLocaleLowerCase('pt-BR')
}

function AvisoStatus({
  dataProducao,
  datasAvisadas,
  dataConfirmada,
}: {
  dataProducao: string
  datasAvisadas: string[]
  dataConfirmada?: string
}) {
  if (!dataProducao) return <span className="text-muted-foreground">—</span>
  if (datasAvisadas.includes(dataProducao) || dataConfirmada === dataProducao) {
    return (
      <span className="font-medium text-emerald-700 dark:text-emerald-400">Na lista</span>
    )
  }
  return (
    <span className="font-medium text-amber-700 dark:text-amber-400">A salvar</span>
  )
}

function parseQtd(value: string): number | null | 'invalida' {
  const texto = value.trim().replace(',', '.')
  if (!texto) return null
  const numero = Number(texto)
  if (!Number.isFinite(numero) || numero < 0) return 'invalida'
  return numero
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
  onCorrigido,
  onRegisterFlush,
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
  onCorrigido?: () => void
  onRegisterFlush: (
    chave: string,
    flush: (() => Promise<{ ok: boolean; somou: boolean }>) | null,
  ) => void
}) {
  const jaLancadoInicial = item.qtdPecas ?? 0
  const [origem, setOrigem] = useState('')
  const [oficina, setOficina] = useState('')
  const [jaLancado, setJaLancado] = useState(jaLancadoInicial)
  const [adicionar, setAdicionar] = useState('')
  const [dataProducao, setDataProducao] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [observacao, setObservacao] = useState('')
  const [modoCorrigir, setModoCorrigir] = useState(false)
  const [corrigindo, setCorrigindo] = useState(false)
  const [datasAvisadas, setDatasAvisadas] = useState<string[]>(
    item.datasAvisadas ?? [],
  )
  const jaLancadoRef = useRef(jaLancadoInicial)
  const adicionarRef = useRef('')
  const origemRef = useRef('')
  const oficinaRef = useRef('')
  const dataRef = useRef('')
  const responsavelRef = useRef('')
  const observacaoRef = useRef('')
  const modoCorrigirRef = useRef(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const descricao = item.nomeProduto?.replace(/\s+/g, ' ').trim() || '—'
  const chave = chaveCodigo(item.codProduto)
  const colunas = temOrigem ? 11 : 9
  const mostraOficina = temOrigem && origemCosturaConserto(origem)
  const naLista =
    Boolean(dataProducao) &&
    (datasAvisadas.includes(dataProducao) || dataConfirmada === dataProducao)
  const temAdicao = Boolean(adicionar.trim())
  const botaoDesabilitado =
    salvandoItem || corrigindo || (!modoCorrigir && naLista && !temAdicao)
  const rotuloBotao = salvandoItem
    ? 'Salvando…'
    : corrigindo
      ? 'Corrigindo…'
      : modoCorrigir
        ? 'Aplicar correção'
        : temAdicao && jaLancado > 0
          ? 'Adicionar'
          : naLista && !temAdicao
            ? 'Na lista'
            : 'Salvar na lista'

  // Ref estável: o pai chama o flush depois do re-render de “Salvando…”.
  // Se o effect re-registrar a cada render, o cleanup zera o Map no meio do clique
  // e a soma (qtd + observação) nunca chega ao servidor — some ao atualizar.
  const aplicarAdicaoRef = useRef<() => Promise<{ ok: boolean; somou: boolean }>>(
    async () => ({ ok: true, somou: false }),
  )

  aplicarAdicaoRef.current = async () => {
    if (modoCorrigirRef.current) {
      return { ok: true, somou: false }
    }
    const parsed = parseQtd(adicionarRef.current)
    if (parsed === 'invalida') {
      setErro('A quantidade precisa ser um número a partir de zero.')
      return { ok: false, somou: false }
    }
    if (parsed == null || parsed <= 0) {
      return { ok: true, somou: false }
    }
    onOcupada(true)
    try {
      const result = await somarApontamento({
        etapa,
        pedidoNorm,
        codProduto: item.codProduto,
        excelRow: item.excelRow,
        origem: origemRef.current,
        oficina: oficinaRef.current,
        qtdPecas: adicionarRef.current,
        dataProducao: dataRef.current,
        responsavel: responsavelRef.current,
        observacao: observacaoRef.current,
        nomeProduto: item.nomeProduto,
      })
      if (!result.ok) {
        setErro(result.error)
        return { ok: false, somou: false }
      }
      jaLancadoRef.current = result.total
      setJaLancado(result.total)
      adicionarRef.current = ''
      setAdicionar('')
      setErro(null)
      setAviso(
        `Somou nesta data. Total do produto: ${formatNumber(result.total, result.total % 1 ? 2 : 0)} peças.`,
      )
      return { ok: true, somou: true }
    } catch {
      setErro('Não foi possível somar a quantidade agora.')
      return { ok: false, somou: false }
    } finally {
      onOcupada(false)
    }
  }

  function entrarCorrigir() {
    modoCorrigirRef.current = true
    setModoCorrigir(true)
    adicionarRef.current = ''
    setAdicionar('')
    setErro(null)
    setAviso(
      'Digite o total correto (ou 0 para apagar) e toque em Aplicar correção. Isso substitui todas as somas deste produto.',
    )
  }

  function cancelarCorrigir() {
    modoCorrigirRef.current = false
    setModoCorrigir(false)
    adicionarRef.current = ''
    setAdicionar('')
    setErro(null)
    setAviso(null)
  }

  async function aplicarCorrecao() {
    const parsed = parseQtd(adicionarRef.current)
    if (parsed === 'invalida') {
      setErro('A quantidade precisa ser um número a partir de zero.')
      return
    }
    if (parsed == null) {
      setErro('Informe o novo total (ou zero para apagar).')
      return
    }
    const atual = jaLancadoRef.current
    const novoFmt = formatNumber(parsed, parsed % 1 ? 2 : 0)
    const atualFmt = formatNumber(atual, atual % 1 ? 2 : 0)
    const ok = window.confirm(
      parsed === 0
        ? `Zerar o lançamento de "${descricao}"?\n\nTotal atual: ${atualFmt}\n\nIsso apaga todas as somas deste produto neste pedido.`
        : `Corrigir o total de "${descricao}"?\n\nTotal atual: ${atualFmt}\nNovo total: ${novoFmt}\n\nIsso substitui todas as somas deste produto neste pedido.`,
    )
    if (!ok) return

    setCorrigindo(true)
    onOcupada(true)
    setErro(null)
    try {
      const result = await corrigirApontamento({
        etapa,
        pedidoNorm,
        codProduto: item.codProduto,
        excelRow: item.excelRow,
        origem: origemRef.current,
        oficina: oficinaRef.current,
        qtdPecas: adicionarRef.current,
        dataProducao: dataRef.current,
        responsavel: responsavelRef.current,
        observacao: observacaoRef.current,
        nomeProduto: item.nomeProduto,
      })
      if (!result.ok) {
        setErro(result.error)
        return
      }
      jaLancadoRef.current = result.total
      setJaLancado(result.total)
      setDatasAvisadas([])
      adicionarRef.current = ''
      setAdicionar('')
      modoCorrigirRef.current = false
      setModoCorrigir(false)
      setAviso(
        result.total === 0
          ? 'Lançamento apagado. O total deste produto ficou zerado.'
          : `Total corrigido para ${formatNumber(result.total, result.total % 1 ? 2 : 0)} peças.`,
      )
      onCorrigido?.()
    } catch {
      setErro('Não foi possível corrigir o total agora.')
    } finally {
      setCorrigindo(false)
      onOcupada(false)
    }
  }

  function salvarNaLista() {
    if (salvandoItem || botaoDesabilitado) return
    if (modoCorrigir) {
      void aplicarCorrecao()
      return
    }
    onSalvarItem()
  }

  useEffect(() => {
    const total = item.qtdPecas ?? 0
    jaLancadoRef.current = total
    setJaLancado(total)
    setDatasAvisadas(item.datasAvisadas ?? [])
  }, [item.qtdPecas, item.datasAvisadas])

  useEffect(() => {
    const flush = () => aplicarAdicaoRef.current()
    onRegisterFlush(chave, flush)
    return () => onRegisterFlush(chave, null)
  }, [chave, onRegisterFlush])

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
                origemRef.current = next
                oficinaRef.current = proximaOficina
                setOrigem(next)
                setOficina(proximaOficina)
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
                  oficinaRef.current = next
                  setOficina(next)
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
              responsavelRef.current = next
              setResponsavel(next)
            }}
          />
        </td>
        <td
          data-label="Já lançado"
          className="w-28 px-1.5 py-1.5 text-right font-medium whitespace-nowrap tabular-nums"
        >
          <div className="flex flex-col items-end gap-1">
            <span>{formatNumber(jaLancado, jaLancado % 1 ? 2 : 0)}</span>
            {jaLancado > 0 && !modoCorrigir ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={salvandoItem || corrigindo}
                onClick={entrarCorrigir}
                className="h-7 px-1.5 text-[10px] text-muted-foreground sm:h-6"
              >
                <Pencil className="size-3" />
                Corrigir
              </Button>
            ) : null}
          </div>
        </td>
        <td
          data-label={modoCorrigir ? 'Novo total' : qtdLabel}
          className="w-28 px-1.5 py-1.5"
        >
          <input
            aria-label={
              modoCorrigir
                ? `Novo total de ${descricao}`
                : `${qtdLabel} de ${descricao}`
            }
            inputMode="decimal"
            value={adicionar}
            placeholder={modoCorrigir ? 'Novo total' : 'Somar'}
            className={cn(
              campo,
              'text-right tabular-nums',
              modoCorrigir && 'border-amber-500/60',
            )}
            onChange={(event) => {
              const next = event.currentTarget.value
              adicionarRef.current = next
              setAdicionar(next)
              setErro(null)
            }}
          />
        </td>
        <td data-label="Data produção" className="w-36 px-1.5 py-1.5">
          <input
            aria-label={
              modoCorrigir
                ? `Data da correção de ${descricao}`
                : `Data desta soma de ${descricao}`
            }
            type="date"
            value={dataProducao}
            className={campo}
            onChange={(event) => {
              const next = event.currentTarget.value
              dataRef.current = next
              setDataProducao(next)
            }}
          />
        </td>
        <td data-label="Observação" data-span="full" className="min-w-[12rem] px-1.5 py-1.5">
          <textarea
            aria-label={`Observação de ${descricao}`}
            value={observacao}
            rows={2}
            maxLength={500}
            placeholder={`Ex.: ${OBS_JA_LANCADO_PLANILHA}`}
            className={area}
            onChange={(event) => {
              const next = event.currentTarget.value
              observacaoRef.current = next
              setObservacao(next)
            }}
          />
        </td>
        <td data-label="Lista" data-span="full" className="px-1.5 py-1.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
            {modoCorrigir ? (
              <span className="font-medium text-amber-700 dark:text-amber-400">
                Corrigindo
              </span>
            ) : (
              <AvisoStatus
                dataProducao={dataProducao}
                datasAvisadas={datasAvisadas}
                dataConfirmada={dataConfirmada}
              />
            )}
            <Button
              type="button"
              size="sm"
              disabled={botaoDesabilitado}
              onClick={salvarNaLista}
              className="h-10 w-full sm:h-8 sm:w-auto"
            >
              {modoCorrigir ? <Pencil /> : <ListChecks />}
              {rotuloBotao}
            </Button>
            {modoCorrigir ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={corrigindo}
                onClick={cancelarCorrigir}
                className="h-10 w-full sm:h-8 sm:w-auto"
              >
                <X />
                Cancelar
              </Button>
            ) : null}
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
        datasAvisadas: [],
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
  const flushers = useRef(
    new Map<string, () => Promise<{ ok: boolean; somou: boolean }>>(),
  )
  const responsaveis = etapa === 'costura' ? RESPONSAVEIS_COSTURA : RESPONSAVEIS_REVISAO
  const gravando = Object.values(ocupadas).some(Boolean)
  const chavesServidor = new Set(itens.map((item) => chaveCodigo(item.codProduto)))
  const visiveis = [
    ...itens,
    ...extras.filter((item) => !chavesServidor.has(chaveCodigo(item.codProduto))),
  ]
  const chaves = new Set(visiveis.map((item) => chaveCodigo(item.codProduto)))
  const dica = `Já lançado = total do card (todas as datas). Errou a digitação? Use Corrigir para substituir o total (ou zerar com 0). Soma nova = outra data/qtd. Se a qtd já existia na planilha (descrição incompleta), some no produto certo e anote “${OBS_JA_LANCADO_PLANILHA}”.`

  function marcarOcupada(chave: string, ocupada: boolean) {
    setOcupadas((atual) => {
      if (Boolean(atual[chave]) === ocupada) return atual
      const next = { ...atual }
      if (ocupada) next[chave] = true
      else delete next[chave]
      return next
    })
  }

  const registerFlush = useCallback(
    (
      chave: string,
      flush: (() => Promise<{ ok: boolean; somou: boolean }>) | null,
    ) => {
      if (flush) flushers.current.set(chave, flush)
      else flushers.current.delete(chave)
    },
    [],
  )

  async function flushAdicoes(codProduto?: string) {
    if (codProduto) {
      const flush = flushers.current.get(chaveCodigo(codProduto))
      if (!flush) {
        return {
          ok: false,
          somou: false,
          erro: 'A tela ainda estava montando. Toque de novo em Salvar na lista.',
        }
      }
      const result = await flush()
      return { ...result, erro: null as string | null }
    }
    // Várias linhas em paralelo (desktop e mobile usam o mesmo fluxo).
    const resultados = await Promise.all(
      [...flushers.current.values()].map((flush) => flush()),
    )
    let somou = false
    for (const result of resultados) {
      if (!result.ok) return { ok: false, somou, erro: null as string | null }
      if (result.somou) somou = true
    }
    return { ok: true, somou, erro: null as string | null }
  }

  function salvarLista(codProduto?: string) {
    setLista(null)
    setSalvandoCod(codProduto ?? '')
    startSalvar(async () => {
      const flush = await flushAdicoes(codProduto)
      if (!flush.ok) {
        setLista({
          ok: false,
          texto:
            flush.erro ??
            'Não foi possível somar a quantidade pendente. Confira a Qtd a somar, data e responsável.',
        })
        setSalvandoCod(null)
        return
      }
      const result = await salvarListaApontamento(etapa, pedidoNorm, codProduto)
      const textoOk =
        result.ok && result.salvos === 0 && flush.somou
          ? 'Quantidade somada. O total aparece em Já lançado.'
          : result.ok
            ? result.aviso
            : result.error
      setLista({
        ok: result.ok,
        texto: textoOk,
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
      // Linha já atualiza no estado local (Já lançado / Na lista) — sem refresh RSC
      // pesado no desktop nem no mobile. KPIs do topo atualizam na próxima pesquisa.
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
                <th className="w-28 px-1.5 py-1 text-right whitespace-nowrap">Já lançado</th>
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
                    onRegisterFlush={registerFlush}
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
