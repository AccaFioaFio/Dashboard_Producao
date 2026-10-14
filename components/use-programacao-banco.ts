'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  carregarProgramacao,
  importarProgramacaoLocal,
} from '@/app/actions/programacao'
import {
  lerBancoProgramacao,
  PROGRAMACAO_STORAGE_KEY,
  type ProgramacaoBanco,
} from '@/lib/programacao'

const VAZIO: ProgramacaoBanco = { version: 2, linhas: [] }

export function useProgramacaoBanco() {
  const [banco, setBanco] = useState<ProgramacaoBanco>(VAZIO)
  const migrou = useRef(false)

  const recarregar = useCallback(async () => {
    const result = await carregarProgramacao()
    if (!result.ok) {
      setBanco(VAZIO)
      return VAZIO
    }

    if (!migrou.current && result.banco.linhas.length === 0) {
      migrou.current = true
      const local = lerBancoProgramacao()
      if (local.linhas.length > 0) {
        const imported = await importarProgramacaoLocal(local.linhas)
        if (imported.ok) {
          try {
            window.localStorage.removeItem(PROGRAMACAO_STORAGE_KEY)
          } catch {
            /* ignore */
          }
          setBanco(imported.banco)
          return imported.banco
        }
      }
    } else {
      migrou.current = true
    }

    setBanco(result.banco)
    return result.banco
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  return { banco, setBanco, recarregar }
}
