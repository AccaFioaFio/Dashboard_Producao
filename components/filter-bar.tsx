'use client'

import { useRouter } from 'next/navigation'
import { SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  countActiveFilters,
  filtersToSearch,
  type DashFilters,
  type FilterField,
  type FilterOptions,
} from '@/lib/filters'
import { MONTH_LABELS } from '@/lib/format'
import { cn } from '@/lib/utils'

const ALL = '__all__'

type FilterBarProps = {
  pathname: string
  values: DashFilters
  options: FilterOptions
  fields: FilterField[]
}

export function FilterBar({ pathname, values, options, fields }: FilterBarProps) {
  const router = useRouter()
  const active = countActiveFilters(values)

  function push(next: DashFilters) {
    const query = filtersToSearch(next).toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  function setField<K extends FilterField>(key: K, value: DashFilters[K]) {
    push({ ...values, [key]: value || undefined })
  }

  return (
    <section className="filter-bar card-surface flex flex-col gap-2 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <SlidersHorizontal className="size-3.5" />
          </span>
          Recorte
          {active ? (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {active}
            </span>
          ) : (
            <span className="text-xs font-normal text-muted-foreground">2026 inteiro</span>
          )}
        </div>
        {active ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => push({})}
            className="h-7 text-xs"
          >
            <X className="size-3.5" />
            Limpar
          </Button>
        ) : null}
      </div>

      {fields.includes('mes') ? (
        <div className="flex flex-wrap gap-1.5">
          {options.meses.map((mes) => {
            const selected = values.mes === mes
            return (
              <button
                key={mes}
                type="button"
                onClick={() => setField('mes', selected ? undefined : mes)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground shadow-[0_0_16px_-6px_var(--primary)]'
                    : 'border-border/80 bg-background/50 text-muted-foreground hover:border-primary/50 hover:text-foreground',
                )}
              >
                {MONTH_LABELS[mes - 1]}
              </button>
            )
          })}
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {fields.includes('q') ? (
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Pedido
            </span>
            <Input
              key={values.q ?? ''}
              defaultValue={values.q ?? ''}
              placeholder="Nº pedido"
              className="bg-background/70"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setField('q', event.currentTarget.value.trim())
                }
              }}
              onBlur={(event) => setField('q', event.currentTarget.value.trim())}
            />
          </label>
        ) : null}

        {fields.includes('canal') ? (
          <FilterSelect
            label="Canal"
            value={values.canal}
            items={options.canais}
            onChange={(value) => setField('canal', value)}
          />
        ) : null}
        {fields.includes('cliente') ? (
          <FilterSelect
            label="Cliente"
            value={values.cliente}
            items={options.clientes}
            onChange={(value) => setField('cliente', value)}
          />
        ) : null}
        {fields.includes('responsavel') ? (
          <FilterSelect
            label="Responsável"
            value={values.responsavel}
            items={options.responsaveis}
            onChange={(value) => setField('responsavel', value)}
          />
        ) : null}
        {fields.includes('produto') ? (
          <FilterSelect
            label="Produto"
            value={values.produto}
            items={options.produtos}
            onChange={(value) => setField('produto', value)}
          />
        ) : null}
        {fields.includes('oficina') ? (
          <FilterSelect
            label="Oficina"
            value={values.oficina}
            items={options.oficinas}
            onChange={(value) => setField('oficina', value)}
          />
        ) : null}
      </div>
    </section>
  )
}

function FilterSelect({
  label,
  value,
  items,
  onChange,
}: {
  label: string
  value?: string
  items: string[]
  onChange: (value: string | undefined) => void
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <Select
        value={value ?? ALL}
        onValueChange={(next) => onChange(!next || next === ALL ? undefined : String(next))}
      >
        <SelectTrigger className="h-8 w-full min-w-0 bg-background/70">
          <SelectValue>
            {(selected) => (
              <span className="truncate">
                {selected == null || selected === ALL ? 'Todos' : String(selected)}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false} className="max-h-72">
          <SelectItem value={ALL}>Todos</SelectItem>
          {items.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}
