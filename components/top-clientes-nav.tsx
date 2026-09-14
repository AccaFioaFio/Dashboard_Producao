'use client'

import Link from 'next/link'
import { ArrowLeft, ChartArea, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { filtersToSearch, type DashFilters } from '@/lib/filters'

function withQuery(path: string, filters: DashFilters) {
  const query = filtersToSearch(filters).toString()
  return query ? `${path}?${query}` : path
}

export function TopClientesRankingButton({ filters }: { filters: DashFilters }) {
  return (
    <span className="action-glow">
      <Button
        className="action-glow-face"
        render={<Link href={withQuery('/top-clientes', filters)} />}
      >
        <ArrowLeft />
        Maiores clientes
      </Button>
    </span>
  )
}

export function TopClientesPrevisaoButton({ filters }: { filters: DashFilters }) {
  return (
    <span className="action-glow">
      <Button
        className="action-glow-face"
        render={<Link href={withQuery('/top-clientes/previsao', filters)} />}
      >
        <Package />
        Previsão de compra
      </Button>
    </span>
  )
}

export function TopClientesResumoButton({ filters }: { filters: DashFilters }) {
  return (
    <span className="action-glow">
      <Button
        className="action-glow-face"
        render={<Link href={withQuery('/top-clientes/resumo', filters)} />}
      >
        <ChartArea />
        Mix e resumo
      </Button>
    </span>
  )
}

export function TopClientesSubNav({
  filters,
  current,
}: {
  filters: DashFilters
  current: 'ranking' | 'previsao' | 'resumo'
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {current !== 'ranking' ? (
        <TopClientesRankingButton filters={filters} />
      ) : null}
      {current !== 'previsao' ? (
        <TopClientesPrevisaoButton filters={filters} />
      ) : null}
      {current !== 'resumo' ? (
        <TopClientesResumoButton filters={filters} />
      ) : null}
    </div>
  )
}
