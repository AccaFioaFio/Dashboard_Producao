'use client'

import { useRef, useState, type MouseEvent, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type VendasEstadoClienteView = {
  href: string
  cod: string
  cliente: string
  pedidos: string
  faturado: string
  ticket: string
  part: string
  metros: string
  topTecido: string
}

export type VendasEstadoRankingRow = {
  uf: string
  href: string
  posicao: number
  estado: string
  faturado: string
  participacao: string
  pedidos: string
  parceiros: string
  diferenca: string
  projecao: string
  clientes: VendasEstadoClienteView[]
}

const PARENT_COLUMNS = [
  { key: 'posicao', label: '#', numeric: true },
  { key: 'estado', label: 'Estado' },
  { key: 'faturado', label: 'Faturado', numeric: true },
  { key: 'participacao', label: 'Part.', numeric: true },
  { key: 'pedidos', label: 'Pedidos', numeric: true },
  { key: 'parceiros', label: 'Parceiros', numeric: true },
  { key: 'diferenca', label: 'Diferença', numeric: true },
] as const

function cellClass(numeric?: boolean) {
  return cn(
    'px-2.5 py-1.5',
    numeric
      ? 'w-px whitespace-nowrap text-right font-medium tabular-nums'
      : 'min-w-0 whitespace-normal break-words leading-snug',
  )
}

function nestedCell(numeric?: boolean) {
  return cn(
    'px-1.5 py-1.5 align-top',
    numeric
      ? 'whitespace-nowrap text-right font-medium tabular-nums'
      : 'min-w-0 whitespace-normal break-words leading-snug',
  )
}

function clientCount(total: number) {
  return total === 1 ? '1 cliente' : `${total} clientes`
}

export function VendasEstadoRanking({
  rows,
  selectedUf,
  initialOpenUf,
  projecaoLabel,
}: {
  rows: VendasEstadoRankingRow[]
  selectedUf?: string
  initialOpenUf?: string
  projecaoLabel: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState<Set<string>>(() =>
    new Set(initialOpenUf ? [initialOpenUf] : []),
  )
  const seenUf = useRef(selectedUf)
  if (selectedUf && seenUf.current !== selectedUf) {
    seenUf.current = selectedUf
    if (initialOpenUf === selectedUf) {
      setOpen((current) => {
        if (current.has(selectedUf)) return current
        const next = new Set(current)
        next.add(selectedUf)
        return next
      })
    }
  }

  const expandable = rows.filter((row) => row.clientes.length > 0).map((row) => row.uf)
  const allOpen = expandable.length > 0 && expandable.every((uf) => open.has(uf))

  function toggle(uf: string) {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(uf)) next.delete(uf)
      else next.add(uf)
      return next
    })
  }

  function go(href: string) {
    router.push(href)
  }

  function onRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, href: string) {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      go(href)
    }
  }

  if (!rows.length) {
    return (
      <div className="card-surface px-3 py-4">
        <p className="text-xs text-muted-foreground">Nenhuma venda final neste recorte.</p>
      </div>
    )
  }

  const columns = [
    ...PARENT_COLUMNS,
    { key: 'projecao', label: projecaoLabel, numeric: true },
  ]

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => setOpen(allOpen ? new Set() : new Set(expandable))}
        >
          {allOpen ? <Minus /> : <Plus />}
          {allOpen ? 'Recolher clientes' : 'Abrir clientes de todos os estados'}
        </Button>
      </div>
      <div className="card-surface table-surface min-w-0 overflow-x-auto [container-type:inline-size]">
        <table className="w-full text-left text-xs leading-snug">
          <thead className="bg-muted/50 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="w-px px-1 py-1.5" aria-label="Abrir clientes" />
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(cellClass(col.numeric), 'font-semibold')}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const expanded = open.has(row.uf)
              const selected = selectedUf === row.uf
              const cells: Record<string, string | number> = {
                posicao: row.posicao,
                estado: row.estado,
                faturado: row.faturado,
                participacao: row.participacao,
                pedidos: row.pedidos,
                parceiros: row.parceiros,
                diferenca: row.diferenca,
                projecao: row.projecao,
              }
              return (
                <EstadoRows
                  key={row.uf}
                  row={row}
                  cells={cells}
                  columns={columns}
                  expanded={expanded}
                  selected={selected}
                  onToggle={(event) => {
                    event.stopPropagation()
                    toggle(row.uf)
                  }}
                  onOpen={() => go(row.href)}
                  onKeyDown={(event) => onRowKeyDown(event, row.href)}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EstadoRows({
  row,
  cells,
  columns,
  expanded,
  selected,
  onToggle,
  onOpen,
  onKeyDown,
}: {
  row: VendasEstadoRankingRow
  cells: Record<string, string | number>
  columns: { key: string; label: string; numeric: true | undefined }[]
  expanded: boolean
  selected: boolean
  onToggle: (event: MouseEvent<HTMLButtonElement>) => void
  onOpen: () => void
  onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => void
}) {
  return (
    <>
      <tr
        className={cn(
          'cursor-pointer border-t border-border/80 hover:bg-muted/40',
          selected &&
            'bg-primary/[0.08] shadow-[inset_3px_0_0_0_var(--primary)] hover:bg-primary/12',
        )}
        role="link"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={onKeyDown}
      >
        <td className="w-px px-1.5 py-1.5">
          {row.clientes.length ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-expanded={expanded}
              aria-label={
                expanded
                  ? `Recolher clientes de ${row.estado}`
                  : `Abrir ${clientCount(row.clientes.length)} de ${row.estado}`
              }
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
          <td key={col.key} className={cn(cellClass(col.numeric), 'font-medium')}>
            {cells[col.key]}
          </td>
        ))}
      </tr>
      {expanded ? (
        <tr className="border-t border-border/60">
          <td colSpan={columns.length + 1} className="bg-muted/15 p-0">
            <div className="sticky left-0 w-[100cqw] max-w-[100cqw] px-3 py-2">
            <p className="mb-1.5 text-[10px] text-muted-foreground">
              {clientCount(row.clientes.length)} em {row.estado}. Mesma leitura do
              Top Clientes: venda final, sem Consumidor final. Part. é a fatia
              do faturado desses clientes no estado.
            </p>
            {row.clientes.length ? (
              <table className="w-full table-fixed text-left text-[11px] leading-snug">
                <colgroup>
                  <col className="w-8" />
                  <col className="w-14" />
                  <col />
                  <col className="w-14" />
                  <col className="w-[6.25rem]" />
                  <col className="w-[6.25rem]" />
                  <col className="w-12" />
                  <col className="w-16" />
                  <col className="w-[22%]" />
                </colgroup>
                <thead className="text-[9px] font-semibold tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className={nestedCell(true)}>#</th>
                    <th className={nestedCell()}>Cód.</th>
                    <th className={nestedCell()}>Cliente</th>
                    <th className={nestedCell(true)}>Pedidos</th>
                    <th className={nestedCell(true)}>Faturado</th>
                    <th className={nestedCell(true)}>Ticket</th>
                    <th className={nestedCell(true)}>Part.</th>
                    <th className={nestedCell(true)}>Metros</th>
                    <th className={nestedCell()}>Top tecido</th>
                  </tr>
                </thead>
                <tbody>
                  {row.clientes.map((cliente, index) => (
                    <tr
                      key={cliente.cliente}
                      className="border-t border-border/70 bg-background/40 hover:bg-muted/40"
                    >
                      <td className={nestedCell(true)}>{index + 1}</td>
                      <td className={nestedCell()}>{cliente.cod}</td>
                      <td className={nestedCell()}>
                        <Link
                          href={cliente.href}
                          className="font-medium text-primary underline-offset-2 hover:underline"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {cliente.cliente}
                        </Link>
                      </td>
                      <td className={nestedCell(true)}>{cliente.pedidos}</td>
                      <td className={nestedCell(true)}>{cliente.faturado}</td>
                      <td className={nestedCell(true)}>{cliente.ticket}</td>
                      <td className={nestedCell(true)}>{cliente.part}</td>
                      <td className={nestedCell(true)}>{cliente.metros}</td>
                      <td className={nestedCell()}>{cliente.topTecido}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
<p className="text-xs text-muted-foreground">
              Nenhum cliente nomeado neste estado.
            </p>
            )}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  )
}
