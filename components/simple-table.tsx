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
      <p className="px-1 py-6 text-sm text-muted-foreground">{empty}</p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
      <table className="w-full min-w-xl text-left text-sm">
        <thead className="bg-muted/60 text-xs text-muted-foreground">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-3 py-2 font-medium',
                  col.numeric && 'text-right',
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-border">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-3 py-2',
                    col.numeric && 'text-right font-mono tabular-nums',
                  )}
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
