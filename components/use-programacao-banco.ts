'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  carregarProgramacao,
  importarProgramacaoLocal,
} from '@/app/actions/programacao'
import {
  gravarBancoProgramacao,
  lerBancoProgramacao,
  type ProgramacaoBanco,
} from '@/lib/programacao'

const VAZIO: ProgramacaoBanco = { version: 2, linhas: [] }

function espelharLocal(banco: ProgramacaoBanco) {
  // Só grava espelho quando há dados — evita apagar backup local após wipe da carga.
  if (banco.linhas.length === 0) return
  try {
    gravarBancoProgramacao(banco)
  } catch {
    /* ignore quota / private mode */
  }
}

export function useProgramacaoBanco() {
  const [banco, setBancoState] = useState<ProgramacaoBanco>(VAZIO)

  const setBanco = useCallback((next: ProgramacaoBanco) => {
    setBancoState(next)
    espelharLocal(next)
  }, [])

  const recarregar = useCallback(async () => {
    const result = await carregarProgramacao()
    if (!result.ok) {
      const local = lerBancoProgramacao()
      setBancoState(local.linhas.length > 0 ? local : VAZIO)
      return local.linhas.length > 0 ? local : VAZIO
    }

    if (result.banco.linhas.length === 0) {
      const local = lerBancoProgramacao()
      if (local.linhas.length > 0) {
        const imported = await importarProgramacaoLocal(local.linhas)
        if (imported.ok && imported.banco.linhas.length > 0) {
          setBanco(imported.banco)
          return imported.banco
        }
        // SQLite ainda vazio: mostra o espelho deste aparelho.
        setBancoState(local)
        return local
      }
      setBancoState(VAZIO)
      return VAZIO
    }

    setBanco(result.banco)
    return result.banco
  }, [setBanco])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  return { banco, setBanco, recarregar }
}
