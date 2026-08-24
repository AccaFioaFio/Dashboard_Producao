import { cn } from '@/lib/utils'

const TONE_BAR: Record<string, string> = {
  indigo: 'bg-chart-1',
  teal: 'bg-chart-2',
  amber: 'bg-chart-3',
  magenta: 'bg-chart-4',
  rose: 'bg-destructive',
}

export function KpiCard({
  label,
  value,
  hint,
  alert = false,
  progress,
  tone = 'indigo',
}: {
  label: string
  value: string
  hint?: string
  alert?: boolean
  progress?: number
  tone?: keyof typeof TONE_BAR
}) {
  const bar = alert ? TONE_BAR.rose : TONE_BAR[tone]
  const width = Math.max(8, Math.min(100, progress ?? 62))

  return (
    <div className={cn('card-surface flex flex-col gap-3 p-5', alert && 'ring-1 ring-destructive/30')}>
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>
      {hint ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
      <div className="mt-auto h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full', bar)} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}
