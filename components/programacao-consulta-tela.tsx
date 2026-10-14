'use client'

import { ProgramacaoResumo } from '@/components/programacao-resumo'
import { useProgramacaoBanco } from '@/components/use-programacao-banco'

export function ProgramacaoConsultaTela() {
  const { banco, setBanco, recarregar } = useProgramacaoBanco()

  return (
    <ProgramacaoResumo
      banco={banco}
      onAlterou={(next) => {
        if (next) setBanco(next)
        else void recarregar()
      }}
    />
  )
}
