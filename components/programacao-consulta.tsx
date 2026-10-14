'use client'

import { useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate, formatInt } from '@/lib/format'
import {
  agruparProgramacao,
  dataProducaoValida,
  type LinhaProgramacao,
  type ProgramacaoBanco,
} from '@/lib/programacao'

function formatQtd(value: number | null) {
  if (value == null) return '—'
  return formatInt(value)
}

function formatQtdProducao(value: string) {
  const n = Number(value.replace(',', '.'))
  if (!Number.isFinite(n)) return value
  return formatInt(n)
}

export function ProgramacaoConsulta({
  banco,
}: {
  banco: ProgramacaoBanco
}) {
  const [dataFiltro, setDataFiltro] = useState('')

  const grupos = useMemo(
    () => agruparProgramacao(banco.linhas, dataFiltro || undefined),
    [banco.linhas, dataFiltro],
  )

  const totalLinhas = useMemo(
    () => grupos.reduce((sum, g) => sum + g.pedidos.reduce((s, p) => s + p.linhas.length, 0), 0),
    [grupos],
  )

  const podeImprimir = totalLinhas > 0

  return (
    <div className="flex flex-col gap-3 print:gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2 print:hidden">
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
          Filtrar por data
          <Input
            type="date"
            value={dataFiltro}
            onChange={(event) => setDataFiltro(event.target.value)}
            className="h-10 w-full min-w-[12rem] text-base sm:h-8 sm:w-auto sm:text-sm"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {dataFiltro ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDataFiltro('')}
            >
              Ver todas as datas
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => window.print()}
            disabled={!podeImprimir}
          >
            <Printer />
            Imprimir
          </Button>
        </div>
      </div>

      <section
        className="card-surface flex flex-col gap-3 p-3 print:border print:border-foreground/20 print:shadow-none"
        data-programacao-print
      >
        <div className="hidden print:block">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Programação de Produção · Consulta
          </p>
          <p className="mt-1 text-sm">
            {dataFiltro && dataProducaoValida(dataFiltro)
              ? `Data: ${formatDate(dataFiltro)}`
              : 'Todas as datas programadas'}
          </p>
        </div>

        <p className="text-xs text-muted-foreground print:hidden">
          Só leitura. Escolha a data para ver o que entra na produção. Agrupado por data e
          pedido.
        </p>

        {banco.linhas.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma programação salva ainda. Monte em Programação de Produção e clique em
            Salvar.
          </p>
        ) : grupos.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nada programado para {formatDate(dataFiltro)}.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {grupos.map((grupo) => (
              <div key={grupo.dataProducao} className="flex flex-col gap-2">
                <h2 className="rounded-md bg-foreground px-3 py-2 text-xs font-semibold tracking-wide text-background uppercase">
                  {grupo.dataInicio === grupo.dataFim
                    ? formatDate(grupo.dataInicio)
                    : `${formatDate(grupo.dataInicio)} – ${formatDate(grupo.dataFim)}`}
                </h2>
                {grupo.pedidos.map((pedido) => (
                  <PedidoBloco key={`${grupo.dataProducao}-${pedido.pedido}`} pedido={pedido} />
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function PedidoBloco({
  pedido,
}: {
  pedido: {
    pedido: string
    cliente: string | null
    linhas: LinhaProgramacao[]
  }
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/80">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border/70 bg-muted/40 px-3 py-2">
        <span className="font-mono text-sm font-semibold tabular-nums">
          Pedido {pedido.pedido}
        </span>
        <span className="text-sm text-muted-foreground">
          {pedido.cliente?.trim() || 'Sem nome fantasia'}
        </span>
      </div>
      <div className="table-surface mobile-form-table min-w-0 overflow-x-auto">
        <table className="w-full md:min-w-[36rem] text-left text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground uppercase">
              <th className="px-3 py-2 font-semibold tracking-wide">Item</th>
              <th className="w-28 px-3 py-2 font-semibold tracking-wide">Qtd pedido</th>
              <th className="w-32 px-3 py-2 font-semibold tracking-wide">Qtd produção</th>
              <th className="w-44 px-3 py-2 font-semibold tracking-wide">Período</th>
            </tr>
          </thead>
          <tbody>
            {pedido.linhas.map((linha) => (
              <tr key={linha.key} className="border-t border-border/70">
                <td data-label="Item" data-span="full" className="px-3 py-2 break-words">
                  {linha.nome}
                </td>
                <td
                  data-label="Qtd pedido"
                  className="px-3 py-2 font-mono tabular-nums text-muted-foreground"
                >
                  {formatQtd(linha.qtdPedido)}
                </td>
                <td
                  data-label="Qtd produção"
                  className="px-3 py-2 font-mono tabular-nums"
                >
                  {formatQtdProducao(linha.quantidadeProducao)}
                </td>
                <td
                  data-label="Período"
                  data-span="full"
                  className="px-3 py-2 font-mono tabular-nums"
                >
                  {linha.dataInicio === linha.dataFim
                    ? formatDate(linha.dataInicio)
                    : `${formatDate(linha.dataInicio)} – ${formatDate(linha.dataFim)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
