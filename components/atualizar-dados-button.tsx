'use client'

import { useState, useTransition } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { atualizarDados } from '@/app/actions/atualizar-dados'
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

export function AtualizarDadosButton() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [okAt, setOkAt] = useState<string | null>(null)

  function onClick() {
    if (pending) return
    setError(null)
    startTransition(async () => {
      try {
        const result = await atualizarDados()
        if (result.ok) {
          setOkAt(result.lidaEm)
          setError(null)
          window.setTimeout(() => window.location.reload(), 150)
          return
        }
        setOkAt(null)
        setError(result.error)
      } catch (error) {
        setOkAt(null)
        const message =
          error instanceof Error ? error.message : String(error)
        setError(
          /unexpected response/i.test(message)
            ? 'O servidor demorou ou falhou. Neste PC: confira a sinc e o Supabase no .env.local; no site online o botão só puxa a carga já publicada.'
            : message || 'Falha ao atualizar. Recarregue a página e tente de novo.',
        )
      }
    })
  }

  const label = pending
    ? 'Atualizando…'
    : okAt && !error
      ? 'Dados atualizados'
      : 'Atualização de dados'

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={error ?? 'Atualização de dados'}
        disabled={pending}
        onClick={onClick}
        className={cn(
          'sidebar-update-btn h-9 rounded-lg px-2.5 text-[13px] font-semibold',
          pending && 'opacity-90',
        )}
      >
        {pending ? (
          <Loader2 className="animate-spin" />
        ) : (
          <RefreshCw />
        )}
        <span>{label}</span>
      </SidebarMenuButton>
      {error ? (
        <p
          className="mt-1 px-2 text-[10px] leading-snug text-amber-200 group-data-[collapsible=icon]:hidden"
          title={error}
        >
          {error}
        </p>
      ) : null}
    </SidebarMenuItem>
  )
}
