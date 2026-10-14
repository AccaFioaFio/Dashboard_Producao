'use client'

import { useCallback, useEffect, useState } from 'react'
import { ProgramacaoResumo } from '@/components/programacao-resumo'
import {
  lerBancoProgramacao,
  type ProgramacaoBanco,
} from '@/lib/programacao'

export function ProgramacaoConsultaTela() {
  const [banco, setBanco] = useState<ProgramacaoBanco>({ version: 2, linhas: [] })

  const recarregar = useCallback(() => {
    setBanco(lerBancoProgramacao())
  }, [])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  return <ProgramacaoResumo banco={banco} onAlterou={recarregar} />
}
