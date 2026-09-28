'use client'

import Link from 'next/link'
import { ArrowLeft, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { filtersToSearch, type DashFilters } from '@/lib/filters'

export function VendasRepresentantesButton({ filters }: { filters: DashFilters }) {
  const query = filtersToSearch(filters).toString()
  const href = query ? `/vendas/representantes?${query}` : '/vendas/representantes'
  return (
    <span className="action-glow">
      <Button className="action-glow-face" render={<Link href={href} />}>
        <Users />
        Representantes
      </Button>
    </span>
  )
}

export function VendasEstadosButton({ filters }: { filters: DashFilters }) {
  const query = filtersToSearch(filters).toString()
  const href = query ? `/vendas?${query}` : '/vendas'
  return (
    <span className="action-glow">
      <Button className="action-glow-face" render={<Link href={href} />}>
        <ArrowLeft />
        Voltar aos estados
      </Button>
    </span>
  )
}
