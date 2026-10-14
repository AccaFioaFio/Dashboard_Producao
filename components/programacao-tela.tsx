'use client'

import { ProgramacaoMontar } from '@/components/programacao-montar'
import { ProgramacaoResumo } from '@/components/programacao-resumo'
import { useProgramacaoBanco } from '@/components/use-programacao-banco'

export function ProgramacaoTela() {
  const { banco, setBanco, recarregar } = useProgramacaoBanco()

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <ProgramacaoMontar
        banco={banco}
        onSalvou={(next) => {
          if (next) setBanco(next)
          else void recarregar()
        }}
      />
      <ProgramacaoResumo
        banco={banco}
        onAlterou={(next) => {
          if (next) setBanco(next)
          else void recarregar()
        }}
      />
    </div>
  )
}
