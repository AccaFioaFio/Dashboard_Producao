'use client'

import { ProgramacaoResumo } from '@/components/programacao-resumo'
import { useProgramacaoBanco } from '@/components/use-programacao-banco'

export function ProgramacaoConsultaTela({
  podeEditar = false,
}: {
  podeEditar?: boolean
}) {
  const { banco, setBanco, recarregar } = useProgramacaoBanco()

  return (
    <ProgramacaoResumo
      banco={banco}
      podeEditar={podeEditar}
      onAlterou={(next) => {
        if (next) setBanco(next)
        else void recarregar()
      }}
    />
  )
}
