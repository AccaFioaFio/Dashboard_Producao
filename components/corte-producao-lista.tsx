'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Mail } from 'lucide-react'
import { enviarEmailCorteProducao, salvarCorteProducao } from '@/app/actions/corte-producao'
import { Button } from '@/components/ui/button'
import { OPCOES_RESPONSAVEL_CORTE } from '@/lib/corte-producao'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

export type CorteProducaoItem = {
  codProduto: string
  excelRow: number
  nomeProduto: string | null
  qtdPedida: number
  qtdReal: number | null
  dataInicio: string | null
  dataFinal: string | null
  responsavel: string | null
  avisoDataFinal: string | null
}

type Lancamento = {
  qtdReal: string
  dataInicio: string
  dataFinal: string
  responsavel: string
}

function AvisoStatus({
  dataFinal,
  avisoDataFinal,
}: {
  dataFinal: string
  avisoDataFinal: string | null
}) {
  if (!dataFinal) return <span className="text-muted-foreground">—</span>
  if (avisoDataFinal === dataFinal) {
    return <span className="font-medium text-emerald-700 dark:text-emerald-400">Enviado</span>
  }
  return <span className="font-medium text-amber-700 dark:text-amber-400">A enviar</span>
}

function textoQtd(value: number | null) {
  if (value == null) return ''
  return String(value)
}

function Linha({
  pedidoNorm,
  item,
  onOcupada,
}: {
  pedidoNorm: string
  item: CorteProducaoItem
  onOcupada: (ocupada: boolean) => void
}) {
  const inicial: Lancamento = {
    qtdReal: textoQtd(item.qtdReal),
    dataInicio: item.dataInicio ?? '',
    dataFinal: item.dataFinal ?? '',
    responsavel: item.responsavel ?? '',
  }
  const [qtdReal, setQtdReal] = useState(inicial.qtdReal)
  const [dataInicio, setDataInicio] = useState(inicial.dataInicio)
  const [dataFinal, setDataFinal] = useState(inicial.dataFinal)
  const [responsavel, setResponsavel] = useState(inicial.responsavel)
  const valores = useRef(inicial)
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const descricao = item.nomeProduto?.replace(/\s+/g, ' ').trim() || '—'

  function gravar(next: Lancamento) {
    const salvo: Lancamento = {
      qtdReal: textoQtd(item.qtdReal),
      dataInicio: item.dataInicio ?? '',
      dataFinal: item.dataFinal ?? '',
      responsavel: item.responsavel ?? '',
    }
    if (
      next.qtdReal.trim() === salvo.qtdReal &&
      next.dataInicio === salvo.dataInicio &&
      next.dataFinal === salvo.dataFinal &&
      next.responsavel === salvo.responsavel
    ) {
      onOcupada(false)
      return
    }
    startTransition(async () => {
      try {
        const result = await salvarCorteProducao({
          pedidoNorm,
          codProduto: item.codProduto,
          excelRow: item.excelRow,
          qtdReal: next.qtdReal,
          dataInicio: next.dataInicio,
          dataFinal: next.dataFinal,
          responsavel: next.responsavel,
        })
        setErro(result.ok ? null : result.error)
      } finally {
        onOcupada(false)
      }
    })
  }

  function agendar(next: Lancamento) {
    valores.current = next
    onOcupada(true)
    if (espera.current) clearTimeout(espera.current)
    espera.current = setTimeout(() => gravar(valores.current), 300)
  }

  const campo =
    'h-7 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 py-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'

  return (
    <>
      <tr className="border-t border-border/80">
        <td className="w-px px-1.5 py-1 text-right font-medium whitespace-nowrap tabular-nums">
          {formatNumber(item.qtdPedida, item.qtdPedida % 1 ? 2 : 0)}
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
            disabled={pending}
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
            disabled={pending}
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
        <td className="w-36 px-1.5 py-1">
          <input
            aria-label={`Data início corte de ${descricao}`}
            type="date"
            value={dataInicio}
            disabled={pending}
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
            disabled={pending}
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
          <AvisoStatus dataFinal={dataFinal} avisoDataFinal={item.avisoDataFinal} />
        </td>
      </tr>
      {erro ? (
        <tr>
          <td colSpan={8} className="px-1.5 pb-1 text-[11px] text-destructive">
            {erro}
          </td>
        </tr>
      ) : null}
    </>
  )
}

export function CorteProducaoLista({
  pedidoNorm,
  itens,
}: {
  pedidoNorm: string
  itens: CorteProducaoItem[]
}) {
  const [ocupadas, setOcupadas] = useState<Record<string, boolean>>({})
  const [email, setEmail] = useState<{ ok: boolean; texto: string } | null>(null)
  const [enviando, startEnvio] = useTransition()
  const router = useRouter()
  const gravando = Object.values(ocupadas).some(Boolean)

  function marcarOcupada(chave: string, ocupada: boolean) {
    setOcupadas((atual) => {
      if (Boolean(atual[chave]) === ocupada) return atual
      const next = { ...atual }
      if (ocupada) next[chave] = true
      else delete next[chave]
      return next
    })
  }

  function enviar() {
    setEmail(null)
    startEnvio(async () => {
      const result = await enviarEmailCorteProducao(pedidoNorm)
      setEmail({
        ok: result.ok,
        texto: result.ok ? result.aviso : result.error,
      })
      if (result.ok && result.enviados > 0) router.refresh()
    })
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={gravando || enviando}
          onClick={enviar}
        >
          <Mail />
          {enviando ? 'Enviando…' : 'Enviar e-mail'}
        </Button>
        <p className="text-xs text-muted-foreground">
          {gravando
            ? 'Aguardando a gravação da lista.'
            : 'O que já foi enviado fica no pedido. O próximo e-mail leva só os itens novos com data final.'}
        </p>
      </div>
      {email ? (
        <p
          className={cn(
            'text-xs',
            email.ok ? 'text-muted-foreground' : 'text-destructive',
          )}
        >
          {email.texto}
        </p>
      ) : null}
      <div className="card-surface table-surface min-w-0 overflow-x-auto">
      <table className={cn('w-full text-left text-[10px] leading-snug')}>
        <thead className="bg-muted/50 text-[9px] font-semibold tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="w-px px-1.5 py-1 text-right whitespace-nowrap">Qtd pedida</th>
            <th className="px-1.5 py-1 whitespace-nowrap">Código</th>
            <th className="px-1.5 py-1">Descrição do produto</th>
            <th className="px-1.5 py-1">Responsável</th>
            <th className="px-1.5 py-1">Qtd Real Corte</th>
            <th className="px-1.5 py-1">Data Inicio Corte</th>
            <th className="px-1.5 py-1">Data Final Corte</th>
            <th className="px-1.5 py-1">E-mail</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => (
            <Linha
              key={`${item.codProduto}:${item.excelRow}`}
              pedidoNorm={pedidoNorm}
              item={item}
              onOcupada={(ocupada) =>
                marcarOcupada(`${item.codProduto}:${item.excelRow}`, ocupada)
              }
            />
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
