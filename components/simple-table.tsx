'use client'

import type { ReactNode } from 'react'
import { PedidoLink } from '@/components/pedido-link'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type TableRow = Record<string, string | number | boolean | null> & {
  alert?: boolean
  warning?: boolean
  hint?: string
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
  const className = cn(
    'border-t border-border/80 hover:bg-muted/40',
    row.hint && 'cursor-help',
    row.alert &&
      'bg-destructive/[0.07] shadow-[inset_3px_0_0_0_var(--destructive)] hover:bg-destructive/12',
    !row.alert &&
      row.warning &&
      'bg-chart-3/15 shadow-[inset_3px_0_0_0_var(--chart-3)] hover:bg-chart-3/25',
  )
  if (!row.hint) {
    return <tr className={className}>{children}</tr>
  }
  return (
    <Tooltip>
      <TooltipTrigger delay={180} render={<tr className={className} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        className="max-w-sm whitespace-pre-line text-left leading-snug"
      >
        {row.hint}
      </TooltipContent>
    </Tooltip>
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
