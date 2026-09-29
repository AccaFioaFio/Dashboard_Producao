'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Scissors } from 'lucide-react'
import { marcarAlertaCorteVisto } from '@/app/actions/corte-producao'
import type { AlertaCorte } from '@/data/corte-alertas'
import { Button } from '@/components/ui/button'
import { formatDate, formatDateTime, formatNumber } from '@/lib/format'

function quantidade(value: number | null) {
  if (value == null) return '—'
  return formatNumber(value, value % 1 ? 2 : 0)
}

function VistoButton({ id }: { id: string }) {
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
            const result = await marcarAlertaCorteVisto(id)
            if (!result.ok) {
              setErro(result.error)
              return
            }
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

export function AlertaCorteLista({ alertas }: { alertas: AlertaCorte[] }) {
  if (!alertas.length) return null

  return (
    <section id="cortes-avisados" className="card-surface flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <Scissors className="size-3.5 shrink-0 text-chart-3" />
        <h2 className="text-sm font-medium">Cortes avisados</h2>
      </div>
      <ul className="flex flex-col gap-3">
        {alertas.map((alerta) => (
          <li key={alerta.id} className="flex flex-col gap-2 border-t border-border/80 pt-3 first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium">
                  Pedido {alerta.pedidoNorm}
                  {alerta.cliente ? ` · ${alerta.cliente}` : ''}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {formatDateTime(alerta.enviadoEm)} ·{' '}
                  {alerta.itens.length === 1 ? '1 produto' : `${alerta.itens.length} produtos`}
                </p>
              </div>
              <VistoButton id={alerta.id} />
            </div>
            <ul className="flex flex-col gap-1 text-xs">
              {alerta.itens.map((item) => {
                const nome = item.nomeProduto?.replace(/\s+/g, ' ').trim() || '—'
                return (
                  <li key={`${alerta.id}:${item.codProduto}`} className="leading-snug">
                    <span className="font-medium tabular-nums">{item.codProduto}</span>
                    {' · '}
                    {nome}
                    {' · '}
                    {quantidade(item.qtdReal)} un.
                    {' · '}
                    {item.responsavel?.trim() || 'sem responsável'}
                    {' · final '}
                    {formatDate(item.dataFinal)}
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
