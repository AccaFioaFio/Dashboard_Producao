import { leadTimeDays } from '@/lib/dates'
import { formatDate, formatDays } from '@/lib/format'
import { cn } from '@/lib/utils'

type Marco = { label: string; date: string | null }

type Secao =
  | { tipo: 'solo'; label: string; date: string | null }
  | {
      tipo: 'par'
      dias: string
      inicio: Marco
      fim: Marco
      hint?: string | null
    }

function DataMarco({ label, date, numero }: Marco & { numero?: number }) {
  const done = Boolean(date)
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {numero ? `${numero}. ` : null}
        {label}
      </span>
      <span
        className={cn(
          'font-mono text-sm tabular-nums',
          done ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {done ? formatDate(date) : '—'}
      </span>
    </div>
  )
}

export function PedidoTimeline({ secoes }: { secoes: Secao[] }) {
  return (
    <ol className="card-surface flex flex-col">
      {secoes.map((secao, index) => {
        const numero = index + 1
        if (secao.tipo === 'solo') {
          return (
            <li
              key={secao.label}
              className="border-b border-border/70 px-3 py-2.5 last:border-b-0"
            >
              <DataMarco numero={numero} label={secao.label} date={secao.date} />
            </li>
          )
        }
        const dias = leadTimeDays(secao.inicio.date, secao.fim.date)
        return (
          <li
            key={secao.dias}
            className="flex flex-col gap-2 border-b border-border/70 px-3 py-2.5 last:border-b-0 sm:flex-row sm:items-end sm:justify-between"
          >
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-1">
              <DataMarco numero={numero} label={secao.inicio.label} date={secao.inicio.date} />
              <DataMarco label={secao.fim.label} date={secao.fim.date} />
              {secao.hint ? (
                <span className="col-span-2 text-[10px] leading-snug text-muted-foreground">
                  {secao.hint}
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col sm:items-end">
              <span className="font-mono text-sm tabular-nums">
                {formatDays(dias, 0)}
              </span>
              <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                {secao.dias}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function uniqueLabels(values: (string | null | undefined)[]) {
  return [
    ...new Set(
      values
        .map((value) => (value ?? '').replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    ),
  ]
}

export function isGenericProduto(value: string | null | undefined) {
  const v = (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  return !v || v === '—' || v === '-' || v === 'diversos'
}

export function SectionMeta({ children }: { children: string }) {
  if (!children.trim()) return null
  return <p className="text-xs text-muted-foreground">{children}</p>
}

export function SectionNote({
  children,
  className,
}: {
  children: string
  className?: string
}) {
  return (
    <p className={cn('text-xs text-muted-foreground', className)}>{children}</p>
  )
}
