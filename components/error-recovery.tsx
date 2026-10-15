'use client'

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ErrorRecovery({
  reset,
  title = 'Algo deu errado',
  description = 'Não foi possível carregar esta tela. Tente de novo; se o erro continuar, atualize os dados em Configurações.',
}: {
  reset: () => void
  title?: string
  description?: string
}) {
  return (
    <div className="flex min-h-[50vh] flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <AlertTriangle className="size-8 text-destructive" aria-hidden />
      <div className="flex max-w-md flex-col gap-1.5">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-pretty text-muted-foreground">{description}</p>
      </div>
      <Button type="button" onClick={reset}>
        Tentar de novo
      </Button>
    </div>
  )
}
