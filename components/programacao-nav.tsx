'use client'

import Link from 'next/link'
import { ArrowLeft, CalendarRange } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type AreaProgramacao = 'corte' | 'costuras' | 'revisao'

const VOLTAR: Record<AreaProgramacao, { href: string; label: string }> = {
  corte: { href: '/corte', label: 'Voltar ao Corte' },
  costuras: { href: '/costuras', label: 'Voltar à Costura' },
  revisao: { href: '/revisao', label: 'Voltar à Revisão' },
}

export function VerProgramacaoButton({ area }: { area: AreaProgramacao }) {
  return (
    <span className="action-glow w-full sm:w-auto">
      <Button
        nativeButton={false}
        className="action-glow-face h-10 w-full sm:h-8 sm:w-auto"
        render={<Link href={`/${area}/programacao`} />}
      >
        <CalendarRange />
        Ver programação
      </Button>
    </span>
  )
}

export function ProgramacaoVoltarButton({ area }: { area: AreaProgramacao }) {
  const { href, label } = VOLTAR[area]
  return (
    <span className="action-glow w-full sm:w-auto">
      <Button
        nativeButton={false}
        className="action-glow-face h-10 w-full sm:h-8 sm:w-auto"
        render={<Link href={href} />}
      >
        <ArrowLeft />
        {label}
      </Button>
    </span>
  )
}
