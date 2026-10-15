'use client'

import { ProgramacaoResumo } from '@/components/programacao-resumo'
import { useProgramacaoBanco } from '@/components/use-programacao-banco'

export function ProgramacaoConsultaTela({
  podeEditar = false,
}: {
  podeEditar?: boolean
}) {
  const { banco, setBanco, recarregar, erroCarga } = useProgramacaoBanco()

  return (
    <div className="flex flex-col gap-4">
      {erroCarga ? (
        <p className="card-surface px-3 py-2 text-xs text-destructive" role="status">
          {erroCarga}
        </p>
      ) : null}
      <ProgramacaoResumo
        banco={banco}
        podeEditar={podeEditar}
        onAlterou={(next) => {
          if (next) setBanco(next)
          else void recarregar()
        }}
      />
    </div>
  )
}
