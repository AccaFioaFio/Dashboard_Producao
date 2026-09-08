'use client'

import Link from 'next/link'
import { ArrowLeft, Handshake } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { filtersToSearch, type DashFilters } from '@/lib/filters'

export function CorteAcaoButton({ filters }: { filters: DashFilters }) {
  const query = filtersToSearch(filters).toString()
  const href = query ? `/corte/acao-comercial?${query}` : '/corte/acao-comercial'
  return (
    <span className="action-glow">
      <Button className="action-glow-face" render={<Link href={href} />}>
        <Handshake />
        Ação Comercial
      </Button>
    </span>
  )
}

export function CorteVoltarButton({ filters }: { filters: DashFilters }) {
  const query = filtersToSearch(filters).toString()
  const href = query ? `/corte?${query}` : '/corte'
  return (
    <span className="action-glow">
      <Button className="action-glow-face" render={<Link href={href} />}>
        <ArrowLeft />
        Voltar ao Corte
      </Button>
    </span>
  )
}
