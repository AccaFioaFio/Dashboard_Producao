'use client'

import type { KeyboardEvent, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { PedidoLink } from '@/components/pedido-link'
import { cn } from '@/lib/utils'

type TableRow = Record<string, string | number | boolean | null> & {
  alert?: boolean
  warning?: boolean
  selected?: boolean
  /** Ignorado — tooltips nas linhas atrapalhavam a leitura. */
  hint?: string
  href?: string
}

export type TableColumn = {
  key: string
  label: string
  numeric?: boolean
  wrap?: boolean
  nowrap?: boolean
  link?: boolean
}

function columnClass(col: TableColumn, header = false, comfortable = false) {
  return cn(
    comfortable ? 'px-2.5 py-1.5' : 'px-1.5 py-1',
    col.numeric
      ? 'w-px whitespace-nowrap text-right'
      : col.nowrap
        ? 'whitespace-nowrap'
        : col.wrap
          ? cn(
              'whitespace-normal break-words leading-snug',
              comfortable ? 'min-w-[16rem]' : 'min-w-[12rem]',
            )
          : 'min-w-0 whitespace-normal break-words leading-snug',
    !header && col.numeric && 'font-medium tabular-nums',
  )
}

function TonedRow({
  row,
  children,
}: {
  row: TableRow
  children: ReactNode
}) {
  const router = useRouter()
  const href = row.href ? String(row.href) : undefined
  const className = cn(
    'border-t border-border/80 hover:bg-muted/40',
    href && 'cursor-pointer',
    row.selected &&
      'bg-primary/[0.08] shadow-[inset_3px_0_0_0_var(--primary)] hover:bg-primary/12',
    row.alert &&
      'bg-destructive/[0.07] shadow-[inset_3px_0_0_0_var(--destructive)] hover:bg-destructive/12',
    !row.alert &&
      !row.selected &&
      row.warning &&
      'bg-chart-3/15 shadow-[inset_3px_0_0_0_var(--chart-3)] hover:bg-chart-3/25',
  )

  const activate = () => {
    if (href) router.push(href)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (!href) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      activate()
    }
  }

  const rowProps = href
    ? {
        role: 'link' as const,
        tabIndex: 0,
        onClick: activate,
        onKeyDown,
      }
    : {}

  return (
    <tr className={className} {...rowProps}>
      {children}
    </tr>
  )
}

export function SimpleTable({
  columns,
  rows,
  empty = 'Nenhum registro',
  comfortable = false,
}: {
  columns: TableColumn[]
  rows: TableRow[]
  empty?: string
  comfortable?: boolean
}) {
  if (!rows.length) {
    return (
      <div className="card-surface px-3 py-4">
        <p className="text-xs text-muted-foreground">{empty}</p>
      </div>
    )
  }

  return (
    <div className="card-surface table-surface min-w-0 overflow-x-auto">
      <table
        className={cn(
          'w-full text-left leading-snug',
          comfortable ? 'text-xs' : 'text-[10px]',
        )}
      >
        <thead
          className={cn(
            'bg-muted/50 font-semibold tracking-wide text-muted-foreground uppercase',
            comfortable ? 'text-[10px]' : 'text-[9px]',
          )}
        >
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={columnClass(col, true, comfortable)}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <TonedRow key={index} row={row}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    columnClass(col, false, comfortable),
                    row.alert &&
                      col.key === 'defeitos' &&
                      'font-semibold text-destructive',
                    !row.alert &&
                      row.warning &&
                      col.key === 'pendentes' &&
                      'font-semibold text-[oklch(0.48_0.14_65)]',
                  )}
                >
                  {col.link ? (
                    <PedidoLink pedido={row[col.key] == null ? null : String(row[col.key])} />
                  ) : (
                    (row[col.key] ?? '—')
                  )}
                </td>
              ))}
            </TonedRow>
          ))}
        </tbody>
      </table>
    </div>
  )
}
