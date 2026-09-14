import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

type Step = { label: string; date: string | null }

export function PedidoTimeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="card-surface grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, index) => {
        const done = Boolean(step.date)
        return (
          <li key={step.label} className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {index + 1}. {step.label}
            </span>
            <span
              className={cn(
                'font-mono text-sm tabular-nums',
                done ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {done ? formatDate(step.date) : '—'}
            </span>
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
