import Link from 'next/link'
import { FUNIL_SLICE_META, type FunilSlice } from '@/lib/funil'
import { filtersToSearch, type DashFilters } from '@/lib/filters'
import { cn } from '@/lib/utils'

export function FatiaChips({
  pathname,
  values,
  counts,
}: {
  pathname: string
  values: DashFilters
  counts?: Partial<Record<FunilSlice, number>>
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {FUNIL_SLICE_META.map((item) => {
        const selected = (values.fatia ?? 'corte') === item.id
        const query = filtersToSearch({ ...values, fatia: item.id }).toString()
        const count = counts?.[item.id]
        return (
          <Link
            key={item.id}
            href={query ? `${pathname}?${query}` : pathname}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-medium transition',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border/80 bg-background/50 text-muted-foreground hover:border-primary/50 hover:text-foreground',
            )}
          >
            {item.label}
            {count != null ? ` · ${count}` : ''}
          </Link>
        )
      })}
    </div>
  )
}
