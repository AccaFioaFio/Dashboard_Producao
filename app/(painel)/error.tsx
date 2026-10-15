'use client'

import { useEffect } from 'react'
import { ErrorRecovery } from '@/components/error-recovery'

export default function PainelError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <ErrorRecovery
      reset={reset}
      title="Erro nesta aba"
      description="Não foi possível montar o conteúdo. Tente de novo; se o erro continuar, use Atualizar dados em Configurações."
    />
  )
}
