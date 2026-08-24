import { MONTH_LABELS, formatInt } from '@/lib/format'
import type { SerieMensal } from '@/lib/etl/types'

export function MonthlyBars({ serie }: { serie: SerieMensal[] }) {
  const max = Math.max(
    1,
    ...serie.flatMap((row) => [row.cortadas, row.costura, row.revisao]),
  )

  return (
    <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <h2 className="mb-1 text-sm font-medium">Série mensal 2026 (peças)</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Acompanhamento, não fechamento. Costura só Origem = Produção.
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-8">
        {serie.map((row) => (
          <div key={row.mes} className="flex flex-col gap-2">
            <div className="flex h-28 items-end gap-1">
              <Bar value={row.cortadas} max={max} className="bg-primary" />
              <Bar value={row.costura} max={max} className="bg-chart-2" />
              <Bar value={row.revisao} max={max} className="bg-chart-3" />
            </div>
            <p className="text-center text-xs font-medium">{MONTH_LABELS[row.mes - 1]}</p>
            <p className="text-center font-mono text-[10px] leading-tight text-muted-foreground">
              {formatInt(row.cortadas)}
              <br />
              {formatInt(row.costura)}
              <br />
              {formatInt(row.revisao)}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <Legend className="bg-primary" label="Cortadas" />
        <Legend className="bg-chart-2" label="Costura Produção" />
        <Legend className="bg-chart-3" label="Revisão" />
      </div>
    </section>
  )
}

function Bar({
  value,
  max,
  className,
}: {
  value: number
  max: number
  className: string
}) {
  return (
    <div
      className={`w-full rounded-sm ${className}`}
      style={{ height: `${Math.max(4, (value / max) * 100)}%` }}
      title={formatInt(value)}
    />
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2 rounded-sm ${className}`} />
      {label}
    </span>
  )
}
