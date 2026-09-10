'use client'

import Link from 'next/link'
import { ArrowLeft, Banknote, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { filtersToSearch, type DashFilters } from '@/lib/filters'

function withQuery(path: string, filters: DashFilters) {
  const query = filtersToSearch(filters).toString()
  return query ? `${path}?${query}` : path
}

export function TecidosValoresButton({ filters }: { filters: DashFilters }) {
  return (
    <span className="action-glow">
      <Button className="action-glow-face" render={<Link href={withQuery('/tecidos/valores', filters)} />}>
        <Banknote />
        Valores do tecido
      </Button>
    </span>
  )
}

export function TecidosRastreioButton({ filters }: { filters: DashFilters }) {
  return (
    <span className="action-glow">
      <Button className="action-glow-face" render={<Link href={withQuery('/tecidos/rastreio', filters)} />}>
        <Search />
        Rastrear baixa
      </Button>
    </span>
  )
}

export function TecidosMetrosButton({ filters }: { filters: DashFilters }) {
  return (
    <span className="action-glow">
      <Button className="action-glow-face" render={<Link href={withQuery('/tecidos', filters)} />}>
        <ArrowLeft />
        Voltar aos metros
      </Button>
    </span>
  )
}

export function TecidosSubNav({
  filters,
  current,
}: {
  filters: DashFilters
  current: 'metros' | 'valores' | 'rastreio'
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {current !== 'metros' ? <TecidosMetrosButton filters={filters} /> : null}
      {current !== 'rastreio' ? <TecidosRastreioButton filters={filters} /> : null}
      {current !== 'valores' ? <TecidosValoresButton filters={filters} /> : null}
    </div>
  )
}
