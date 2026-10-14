'use client'

import { useState } from 'react'
import { ProgramacaoMontar } from '@/components/programacao-montar'
import { ProgramacaoResumo } from '@/components/programacao-resumo'
import { useProgramacaoBanco } from '@/components/use-programacao-banco'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type AbaMobile = 'consultar' | 'montar'

export function ProgramacaoTela() {
  const { banco, setBanco, recarregar } = useProgramacaoBanco()
  const [abaMobile, setAbaMobile] = useState<AbaMobile>('consultar')

  function aplicarBanco(next?: typeof banco) {
    if (next) setBanco(next)
    else void recarregar()
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex gap-1.5 md:hidden print:hidden">
        {(
          [
            ['consultar', 'Consultar'],
            ['montar', 'Montar pedido'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={abaMobile === value ? 'secondary' : 'outline'}
            className="h-10 flex-1"
            onClick={() => setAbaMobile(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div
        className={cn(
          'md:order-1',
          abaMobile !== 'montar' && 'hidden md:block',
        )}
      >
        <ProgramacaoMontar banco={banco} onSalvou={aplicarBanco} />
      </div>

      <div
        className={cn(
          'md:order-2',
          abaMobile !== 'consultar' && 'hidden md:block',
        )}
      >
        <ProgramacaoResumo banco={banco} onAlterou={aplicarBanco} />
      </div>
    </div>
  )
}
