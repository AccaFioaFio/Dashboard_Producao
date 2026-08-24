import { cn } from '@/lib/utils'

export function KpiCard({
  label,
  value,
  hint,
  alert = false,
}: {
  label: string
  value: string
  hint?: string
  alert?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-xl bg-card p-4 ring-1 ring-foreground/10',
        alert && 'ring-destructive/40',
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="font-mono text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
