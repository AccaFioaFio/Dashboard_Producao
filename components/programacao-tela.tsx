'use client'

import { useCallback, useEffect, useState } from 'react'
import { ProgramacaoMontar } from '@/components/programacao-montar'
import { ProgramacaoResumo } from '@/components/programacao-resumo'
import {
  lerBancoProgramacao,
  type ProgramacaoBanco,
} from '@/lib/programacao'

export function ProgramacaoTela() {
  const [banco, setBanco] = useState<ProgramacaoBanco>({ version: 2, linhas: [] })

  const recarregar = useCallback(() => {
    setBanco(lerBancoProgramacao())
  }, [])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <ProgramacaoMontar onSalvou={recarregar} />
      <ProgramacaoResumo banco={banco} onAlterou={recarregar} />
    </div>
  )
}
