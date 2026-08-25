'use client'

import Link from 'next/link'
import { ArrowLeft, Banknote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { filtersToSearch, type DashFilters } from '@/lib/filters'

export function TecidosValoresButton({ filters }: { filters: DashFilters }) {
  const query = filtersToSearch(filters).toString()
  const href = query ? `/tecidos/valores?${query}` : '/tecidos/valores'
  return (
    <Button variant="outline" render={<Link href={href} />}>
      <Banknote />
      Valores do tecido
    </Button>
  )
}

export function TecidosMetrosButton({ filters }: { filters: DashFilters }) {
  const query = filtersToSearch(filters).toString()
  const href = query ? `/tecidos?${query}` : '/tecidos'
  return (
    <Button variant="outline" render={<Link href={href} />}>
      <ArrowLeft />
      Voltar aos metros
    </Button>
  )
}
