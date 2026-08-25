'use client'

import Link from 'next/link'
import { ArrowLeft, Banknote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { filtersToSearch, type DashFilters } from '@/lib/filters'

export function TecidosValoresButton({ filters }: { filters: DashFilters }) {
  const query = filtersToSearch(filters).toString()
  const href = query ? `/tecidos/valores?${query}` : '/tecidos/valores'
  return (
    <span className="action-glow">
      <Button className="action-glow-face" render={<Link href={href} />}>
        <Banknote />
        Valores do tecido
      </Button>
    </span>
  )
}

export function TecidosMetrosButton({ filters }: { filters: DashFilters }) {
  const query = filtersToSearch(filters).toString()
  const href = query ? `/tecidos?${query}` : '/tecidos'
  return (
    <span className="action-glow">
      <Button className="action-glow-face" render={<Link href={href} />}>
        <ArrowLeft />
        Voltar aos metros
      </Button>
    </span>
  )
}
