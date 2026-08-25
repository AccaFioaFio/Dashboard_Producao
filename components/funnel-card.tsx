import { formatInt } from '@/lib/format'
import type { FunilKpis } from '@/lib/etl/types'

export function FunnelCard({ funil }: { funil: FunilKpis }) {
  const rows = [
    { label: 'Corte 2026', value: funil.corte },
    { label: 'Com Costura Produção', value: funil.comCostura },
    { label: 'Sem Costura Produção', value: funil.semCostura },
    { label: 'Com Revisão', value: funil.comRevisao },
    { label: 'Sem Revisão', value: funil.semRevisao },
    { label: 'Costura sem Corte', value: funil.costuraSemCorte },
    { label: 'Revisão sem Corte', value: funil.revisaoSemCorte },
    { label: 'Oficinas (órfãos)', value: `${funil.oficinas} (${funil.oficinasOrfas})` },
  ]
  const max = funil.corte || 1

  return (
    <section className="card-surface flex min-w-0 flex-col p-3">
      <h2 className="mb-2 text-sm font-semibold tracking-wide">Funil de pedido 2026</h2>
      <ul className="flex flex-col gap-1.5">
        {rows.map((row, index) => {
          const numeric = typeof row.value === 'number' ? row.value : funil.oficinas
          const bars = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4']
          return (
            <li key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">{row.label}</span>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${bars[index % bars.length]}`}
                    style={{ width: `${Math.min(100, (numeric / max) * 100)}%` }}
                  />
                </div>
              </div>
              <span className="font-mono text-sm tabular-nums">
                {typeof row.value === 'number' ? formatInt(row.value) : row.value}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
