'use client'

import { useMemo, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type CellValue = string | number | boolean | null

type TableColumn = { key: string; label: string; numeric?: boolean; wrap?: boolean }

type ChildRow = {
  cells: Record<string, CellValue>
  alert?: boolean
  warning?: boolean
}

export type GroupedTableGroup = {
  id: string
  cells: Record<string, CellValue>
  alert?: boolean
  warning?: boolean
  children: ChildRow[]
}

function cellClass(col: TableColumn, header = false) {
  return cn(
    'px-1.5 py-1',
    col.numeric
      ? 'w-px whitespace-nowrap text-right'
      : col.wrap
        ? 'min-w-[14rem] whitespace-normal break-words leading-snug'
        : 'min-w-0 whitespace-normal break-words leading-snug',
    !header && col.numeric && 'font-medium tabular-nums',
  )
}

function rowTone(row: { alert?: boolean; warning?: boolean }, nested = false) {
  return cn(
    'border-t border-border/80 hover:bg-muted/40',
    nested && 'bg-muted/20',
    row.alert &&
      'bg-destructive/[0.07] shadow-[inset_3px_0_0_0_var(--destructive)] hover:bg-destructive/12',
    !row.alert &&
      row.warning &&
      'bg-chart-3/15 shadow-[inset_3px_0_0_0_var(--chart-3)] hover:bg-chart-3/25',
  )
}

export function GroupedTable({
  columns,
  childColumns,
  groups,
  empty = 'Nenhum registro',
  childEmpty = 'Nenhum pedido neste grupo',
}: {
  columns: TableColumn[]
  childColumns: TableColumn[]
  groups: GroupedTableGroup[]
  empty?: string
  childEmpty?: string
}) {
  const ids = useMemo(
    () => groups.filter((group) => group.children.length > 0).map((group) => group.id),
    [groups],
  )
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const allOpen = ids.length > 0 && ids.every((id) => open.has(id))

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setOpen(allOpen ? new Set() : new Set(ids))
  }

  if (!groups.length) {
    return (
      <div className="card-surface table-surface px-4 py-8">
        <p className="text-xs text-muted-foreground">{empty}</p>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="xs" onClick={toggleAll}>
          {allOpen ? <Minus /> : <Plus />}
          {allOpen ? 'Recolher pedidos' : 'Abrir todos os pedidos'}
        </Button>
      </div>
      <div className="card-surface table-surface min-w-0 overflow-x-auto">
        <table className="w-full text-left text-[10px] leading-snug">
          <thead className="bg-muted/50 text-[9px] font-semibold tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="w-px px-1 py-1" aria-label="Abrir grupo" />
              {columns.map((col) => (
                <th key={col.key} className={cellClass(col, true)}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const expanded = open.has(group.id)
              const canExpand = group.children.length > 0
              return (
                <GroupRows
                  key={group.id}
                  group={group}
                  columns={columns}
                  childColumns={childColumns}
                  expanded={expanded}
                  canExpand={canExpand}
                  childEmpty={childEmpty}
                  onToggle={() => toggle(group.id)}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GroupRows({
  group,
  columns,
  childColumns,
  expanded,
  canExpand,
  childEmpty,
  onToggle,
}: {
  group: GroupedTableGroup
  columns: TableColumn[]
  childColumns: TableColumn[]
  expanded: boolean
  canExpand: boolean
  childEmpty: string
  onToggle: () => void
}) {
  return (
    <>
      <tr className={cn(rowTone(group), 'bg-muted/25 font-medium')}>
        <td className="w-px px-1.5 py-1">
          {canExpand ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-expanded={expanded}
              aria-label={expanded ? 'Recolher pedidos' : 'Abrir pedidos'}
              onClick={onToggle}
            >
              {expanded ? <Minus /> : <Plus />}
            </Button>
          ) : (
            <span className="inline-flex size-6 items-center justify-center text-muted-foreground">
              —
            </span>
          )}
        </td>
        {columns.map((col) => (
          <td key={col.key} className={cellClass(col)}>
            {group.cells[col.key] ?? '—'}
          </td>
        ))}
      </tr>
      {expanded ? (
        <tr className="border-t border-border/60">
          <td colSpan={columns.length + 1} className="bg-muted/15 px-3 py-2 pl-10">
            {group.children.length ? (
              <table className="w-full text-left text-[10px] leading-snug">
                <thead className="text-[9px] font-semibold tracking-wide text-muted-foreground uppercase">
                  <tr>
                    {childColumns.map((col) => (
                      <th key={col.key} className={cellClass(col, true)}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.children.map((child, index) => (
                    <tr key={index} className={rowTone(child, true)}>
                      {childColumns.map((col) => (
                        <td key={col.key} className={cellClass(col)}>
                          {child.cells[col.key] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-2 py-2 text-xs text-muted-foreground">{childEmpty}</p>
            )}
          </td>
        </tr>
      ) : null}
    </>
  )
}
