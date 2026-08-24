import { cn } from '@/lib/utils'

export function SimpleTable({
  columns,
  rows,
  empty = 'Nenhum registro',
}: {
  columns: { key: string; label: string; numeric?: boolean }[]
  rows: Record<string, string | number | null>[]
  empty?: string
}) {
  if (!rows.length) {
    return (
      <div className="card-surface px-4 py-8">
        <p className="text-sm text-muted-foreground">{empty}</p>
      </div>
    )
  }

  return (
    <div className="card-surface min-w-0 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-3',
                  col.numeric
                    ? 'w-px whitespace-nowrap text-right'
                    : 'min-w-0',
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={index}
              className="border-t border-border/80 hover:bg-muted/40"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-4 py-3',
                    col.numeric
                      ? 'w-px whitespace-nowrap text-right font-medium tabular-nums'
                      : 'min-w-0 max-w-[14rem] truncate',
                  )}
                  title={
                    col.numeric ? undefined : String(row[col.key] ?? '')
                  }
                >
                  {row[col.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
