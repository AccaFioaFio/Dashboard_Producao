import { cn } from '@/lib/utils'

type TableRow = Record<string, string | number | boolean | null> & {
  alert?: boolean
  warning?: boolean
}

export type TableColumn = {
  key: string
  label: string
  numeric?: boolean
  wrap?: boolean
}

function columnClass(col: TableColumn, header = false) {
  return cn(
    'px-1.5 py-1',
    col.numeric
      ? 'w-px whitespace-nowrap text-right'
      : col.wrap
        ? 'min-w-[12rem] whitespace-normal break-words leading-snug'
        : 'min-w-0 whitespace-normal break-words leading-snug',
    !header && col.numeric && 'font-medium tabular-nums',
  )
}

export function SimpleTable({
  columns,
  rows,
  empty = 'Nenhum registro',
}: {
  columns: TableColumn[]
  rows: TableRow[]
  empty?: string
}) {
  if (!rows.length) {
    return (
      <div className="card-surface px-4 py-8">
        <p className="text-[10px] text-muted-foreground">{empty}</p>
      </div>
    )
  }

  return (
    <div className="card-surface table-surface min-w-0 overflow-x-auto">
      <table className="w-full text-left text-[10px] leading-snug">
        <thead className="bg-muted/50 text-[9px] font-semibold tracking-wide text-muted-foreground uppercase">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={columnClass(col, true)}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={index}
              className={cn(
                'border-t border-border/80 hover:bg-muted/40',
                row.alert &&
                  'bg-destructive/[0.07] shadow-[inset_3px_0_0_0_var(--destructive)] hover:bg-destructive/12',
                !row.alert &&
                  row.warning &&
                  'bg-chart-3/15 shadow-[inset_3px_0_0_0_var(--chart-3)] hover:bg-chart-3/25',
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    columnClass(col),
                    row.alert &&
                      col.key === 'defeitos' &&
                      'font-semibold text-destructive',
                    !row.alert &&
                      row.warning &&
                      col.key === 'pendentes' &&
                      'font-semibold text-[oklch(0.48_0.14_65)]',
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
