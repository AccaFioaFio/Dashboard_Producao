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
    <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <h2 className="mb-3 text-sm font-medium">Funil de pedido 2026</h2>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const numeric = typeof row.value === 'number' ? row.value : funil.oficinas
          return (
            <li key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-muted-foreground">{row.label}</span>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
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
