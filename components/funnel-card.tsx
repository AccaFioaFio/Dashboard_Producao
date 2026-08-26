import Link from 'next/link'
import { formatInt } from '@/lib/format'
import type { FunilKpis } from '@/lib/etl/types'
import { FUNIL_SLICE_META, pedidosFatiaHref, type FunilSlice } from '@/lib/funil'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const VALUE: Record<FunilSlice, (funil: FunilKpis) => number> = {
  corte: (funil) => funil.corte,
  comCostura: (funil) => funil.comCostura,
  semCostura: (funil) => funil.semCostura,
  comRevisao: (funil) => funil.comRevisao,
  semRevisao: (funil) => funil.semRevisao,
  costuraSemCorte: (funil) => funil.costuraSemCorte,
  revisaoSemCorte: (funil) => funil.revisaoSemCorte,
  oficinas: (funil) => funil.oficinas,
  oficinasOrfas: (funil) => funil.oficinasOrfas,
  wip: () => 0,
  aguardandoTecido: () => 0,
}

function SliceRow({
  slice,
  value,
  max,
  tone,
}: {
  slice: FunilSlice
  value: number
  max: number
  tone: string
}) {
  const meta = FUNIL_SLICE_META.find((item) => item.id === slice)!
  return (
    <Tooltip>
      <TooltipTrigger
        delay={180}
        render={
          <Link
            href={pedidosFatiaHref(slice)}
            className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-0.5 py-0.5 hover:bg-muted/50"
          />
        }
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">{meta.label}</span>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full', tone)}
              style={{ width: `${Math.min(100, max ? (value / max) * 100 : 0)}%` }}
            />
          </div>
        </div>
        <span className="font-mono text-sm tabular-nums">{formatInt(value)}</span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        className="max-w-sm whitespace-pre-line text-left leading-snug"
      >
        {meta.hint}
        {'\n'}Clique para ver a lista de pedidos.
      </TooltipContent>
    </Tooltip>
  )
}

export function FunnelCard({
  funil,
  wipPedidos = 0,
  tecidoPedidos = 0,
}: {
  funil: FunilKpis
  wipPedidos?: number
  tecidoPedidos?: number
}) {
  const maxEtapa = Math.max(funil.corte, 1)

  return (
    <section className="card-surface flex min-w-0 flex-col gap-3 p-3">
      <div>
        <h2 className="text-sm font-semibold tracking-wide">Funil de pedido 2026</h2>
        <p className="text-xs text-muted-foreground">
          Clique na fatia para abrir a lista. Etapas não somam com as filas.
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Etapas
        </p>
        <ul className="flex flex-col gap-1.5">
          <li>
            <SliceRow slice="corte" value={VALUE.corte(funil)} max={maxEtapa} tone="bg-chart-1" />
          </li>
          <li>
            <SliceRow
              slice="comCostura"
              value={VALUE.comCostura(funil)}
              max={maxEtapa}
              tone="bg-chart-2"
            />
          </li>
          <li>
            <SliceRow
              slice="comRevisao"
              value={VALUE.comRevisao(funil)}
              max={maxEtapa}
              tone="bg-chart-3"
            />
          </li>
        </ul>
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Filas e órfãos
        </p>
        <ul className="flex flex-col gap-1.5">
          {(
            [
              ['semCostura', 'bg-chart-4'],
              ['semRevisao', 'bg-chart-4'],
              ['costuraSemCorte', 'bg-destructive/80'],
              ['revisaoSemCorte', 'bg-destructive/80'],
              ['oficinasOrfas', 'bg-chart-3'],
            ] as const
          ).map(([slice, tone]) => (
            <li key={slice}>
              <SliceRow slice={slice} value={VALUE[slice](funil)} max={maxEtapa} tone={tone} />
            </li>
          ))}
        </ul>
      </div>

      {wipPedidos || tecidoPedidos ? (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Parados agora
          </p>
          <ul className="flex flex-col gap-1.5">
            {wipPedidos ? (
              <li>
                <SliceRow slice="wip" value={wipPedidos} max={maxEtapa} tone="bg-destructive" />
              </li>
            ) : null}
            {tecidoPedidos ? (
              <li>
                <SliceRow
                  slice="aguardandoTecido"
                  value={tecidoPedidos}
                  max={maxEtapa}
                  tone="bg-chart-3"
                />
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <p className="text-[11px] text-muted-foreground">
        Oficinas no ano: {formatInt(funil.oficinas)} pedidos · {formatInt(funil.oficinasNoCorte)}{' '}
        também no Corte.
      </p>
    </section>
  )
}
