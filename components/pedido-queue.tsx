import Link from 'next/link'
import { pedidoHref } from '@/lib/pedido'
import { cn } from '@/lib/utils'

export type QueueCardRow = {
  pedido: string | null
  title?: string
  lines: (string | null | undefined)[]
  alert?: boolean
  warning?: boolean
}

export function PedidoQueue({ rows, empty }: { rows: QueueCardRow[]; empty: string }) {
  if (!rows.length) {
    return (
      <div className="card-surface px-3 py-4 md:hidden">
        <p className="text-xs text-muted-foreground">{empty}</p>
      </div>
    )
  }

  return (
    <ul className="grid gap-2 md:hidden">
      {rows.map((row, index) => {
        const pedido = (row.pedido ?? '').trim()
        const cardClass = cn(
          'card-surface flex flex-col gap-1 p-3',
          row.alert &&
            'bg-destructive/[0.07] shadow-[inset_3px_0_0_0_var(--destructive)]',
          !row.alert &&
            row.warning &&
            'bg-chart-3/15 shadow-[inset_3px_0_0_0_var(--chart-3)]',
        )
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-2">
              {pedido && pedido !== '—' ? (
                <span className="text-sm font-medium text-primary underline-offset-2 group-hover:underline">
                  {pedido}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
              {row.title ? (
                <span className="text-[11px] text-muted-foreground">{row.title}</span>
              ) : null}
            </div>
            <p className="text-xs leading-snug text-muted-foreground">
              {row.lines.filter(Boolean).join(' · ')}
            </p>
          </>
        )

        return (
          <li key={`${row.pedido ?? 'x'}-${index}`}>
            {pedido && pedido !== '—' ? (
              <Link
                href={pedidoHref(pedido)}
                prefetch
                className={cn(cardClass, 'group')}
              >
                {body}
              </Link>
            ) : (
              <div className={cardClass}>{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
