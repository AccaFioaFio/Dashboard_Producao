'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Shirt } from 'lucide-react'
import { marcarAlertaApontamentoVisto } from '@/app/actions/apontamento'
import type { AlertaApontamento } from '@/data/apontamento-alertas'
import { Button } from '@/components/ui/button'
import { formatDate, formatDateTime, formatNumber } from '@/lib/format'
import type { EtapaApontamento } from '@/lib/apontamento'
import { isCodigoGeradoSemCadastro } from '@/lib/produto-codigo-manual'

function quantidade(value: number | null) {
  if (value == null) return '—'
  return formatNumber(value, value % 1 ? 2 : 0)
}

function VistoButton({
  etapa,
  id,
  onVisto,
}: {
  etapa: EtapaApontamento
  id: string
  onVisto: (id: string) => void
}) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={pending}
        onClick={() => {
          setErro(null)
          startTransition(async () => {
            const result = await marcarAlertaApontamentoVisto(etapa, id)
            if (!result.ok) {
              setErro(result.error)
              return
            }
            onVisto(id)
            router.refresh()
          })
        }}
      >
        {pending ? 'Salvando…' : 'Visto'}
      </Button>
      {erro ? <p className="text-[11px] text-destructive">{erro}</p> : null}
    </div>
  )
}

function Lista({
  etapa,
  titulo,
  icon: Icon,
  anchor,
  alertas,
}: {
  etapa: EtapaApontamento
  titulo: string
  icon: typeof Shirt
  anchor: string
  alertas: AlertaApontamento[]
}) {
  const [ocultos, setOcultos] = useState<Set<string>>(() => new Set())
  const visiveis = alertas.filter((alerta) => !ocultos.has(alerta.id))
  if (!visiveis.length) return null

  return (
    <section id={anchor} className="card-surface flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 shrink-0 text-chart-3" />
        <h2 className="text-sm font-medium">{titulo}</h2>
      </div>
      <ul className="flex flex-col gap-3">
        {visiveis.map((alerta) => (
          <li
            key={`${etapa}:${alerta.id}`}
            className="flex flex-col gap-2 border-t border-border/80 pt-3 first:border-t-0 first:pt-0"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium">
                  Pedido {alerta.pedidoNorm}
                  {alerta.cliente ? ` · ${alerta.cliente}` : ''}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {formatDateTime(alerta.enviadoEm)} ·{' '}
                  {alerta.itens.length === 1
                    ? '1 produto'
                    : `${alerta.itens.length} produtos`}
                </p>
              </div>
              <VistoButton
                etapa={etapa}
                id={alerta.id}
                onVisto={(id) =>
                  setOcultos((prev) => {
                    const next = new Set(prev)
                    next.add(id)
                    return next
                  })
                }
              />
            </div>
            <ul className="flex flex-col gap-1 text-xs">
              {alerta.itens.map((item) => {
                const nome = item.nomeProduto?.replace(/\s+/g, ' ').trim() || '—'
                return (
                  <li
                    key={`${alerta.id}:${item.codProduto}`}
                    className="leading-snug"
                  >
                    <span className="font-medium tabular-nums">
                      {isCodigoGeradoSemCadastro(item.codProduto)
                        ? '—'
                        : item.codProduto}
                    </span>
                    {' · '}
                    {nome}
                    {etapa === 'costura' && item.origem
                      ? ` · ${item.origem}`
                      : ''}
                    {' · '}
                    <span className="font-bold tabular-nums">
                      {quantidade(item.qtdPecas)}
                    </span>
                    {' un.'}
                    {' · '}
                    {item.responsavel?.trim() || 'sem responsável'}
                    {' · '}
                    {formatDate(item.dataProducao)}
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function AlertaApontamentoListas({
  costura,
  revisao,
}: {
  costura: AlertaApontamento[]
  revisao: AlertaApontamento[]
}) {
  return (
    <>
      <Lista
        etapa="costura"
        titulo="Lista de costura produção"
        icon={Shirt}
        anchor="costuras-avisadas"
        alertas={costura}
      />
      <Lista
        etapa="revisao"
        titulo="Lista de revisão"
        icon={CheckCircle2}
        anchor="revisoes-avisadas"
        alertas={revisao}
      />
    </>
  )
}
