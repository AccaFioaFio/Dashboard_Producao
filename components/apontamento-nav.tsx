'use client'

import Link from 'next/link'
import { ArrowLeft, ClipboardCheck, Shirt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { EtapaApontamento } from '@/lib/apontamento'

export function CosturaProducaoButton() {
  return (
    <span className="action-glow">
      <Button
        nativeButton={false}
        className="action-glow-face"
        render={<Link href="/costuras/producao" />}
      >
        <Shirt />
        Costura Produção
      </Button>
    </span>
  )
}

export function RevisaoLancamentoButton() {
  return (
    <span className="action-glow">
      <Button
        nativeButton={false}
        className="action-glow-face"
        render={<Link href="/revisao/lancamento" />}
      >
        <ClipboardCheck />
        Lançar revisão
      </Button>
    </span>
  )
}

export function ApontamentoVoltarButton({ etapa }: { etapa: EtapaApontamento }) {
  const href = etapa === 'costura' ? '/costuras' : '/revisao'
  const label = etapa === 'costura' ? 'Voltar à Costura' : 'Voltar à Revisão'
  return (
    <span className="action-glow">
      <Button nativeButton={false} className="action-glow-face" render={<Link href={href} />}>
        <ArrowLeft />
        {label}
      </Button>
    </span>
  )
}
