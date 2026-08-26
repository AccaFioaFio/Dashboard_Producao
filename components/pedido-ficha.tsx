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

export function FlagChips({
  flags,
}: {
  flags: {
    corte: boolean
    costuraProd: boolean
    revisao: boolean
    oficinas: boolean
    signus: boolean
  }
}) {
  const items = [
    { on: flags.corte, label: 'Corte' },
    { on: flags.costuraProd, label: 'Costura Produção' },
    { on: flags.revisao, label: 'Revisão' },
    { on: flags.oficinas, label: 'Oficina' },
    { on: flags.signus, label: 'Signus' },
  ]
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li
          key={item.label}
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
            item.on
              ? 'border-primary/40 bg-primary/12 text-foreground'
              : 'border-border/70 bg-muted/40 text-muted-foreground',
          )}
        >
          {item.label}
        </li>
      ))}
    </ul>
  )
}
