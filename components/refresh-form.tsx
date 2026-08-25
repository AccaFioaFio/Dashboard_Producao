'use client'

import { useActionState } from 'react'
import { RefreshCw } from 'lucide-react'
import { atualizarDados } from '@/app/actions/refresh'
import { Button } from '@/components/ui/button'
import type { RefreshResult } from '@/lib/etl/refresh'

export function RefreshForm() {
  const [state, action, pending] = useActionState(atualizarDados, null)

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <span className="action-glow">
        <Button type="submit" disabled={pending} className="action-glow-face">
          <RefreshCw className={pending ? 'animate-spin' : undefined} />
          {pending ? 'Atualizando…' : 'Atualizar dados'}
        </Button>
      </span>
      <StatusMessage state={state} />
    </form>
  )
}

function StatusMessage({ state }: { state: RefreshResult | null }) {
  if (!state) return null
  if (state.ok) {
    return (
      <p className="max-w-xs text-right text-xs text-muted-foreground">
        Carga 2026 atualizada.
      </p>
    )
  }
  return (
    <p className="max-w-sm text-right text-xs text-destructive">{state.error}</p>
  )
}
