'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { atualizarDados } from '@/app/actions/atualizar-dados'
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

export function AtualizarDadosButton() {
  const [pending, setPending] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [okAt, setOkAt] = useState<string | null>(null)
  const startedAt = useRef<number | null>(null)

  useEffect(() => {
    if (!pending) {
      setElapsedSec(0)
      startedAt.current = null
      return
    }
    startedAt.current = Date.now()
    const id = window.setInterval(() => {
      if (startedAt.current == null) return
      setElapsedSec(Math.floor((Date.now() - startedAt.current) / 1000))
    }, 500)
    return () => window.clearInterval(id)
  }, [pending])

  async function onClick() {
    if (pending) return
    setError(null)
    setPending(true)
    try {
      const result = await atualizarDados()
      if (result.ok) {
        setOkAt(result.lidaEm)
        setError(null)
        window.location.reload()
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
    } finally {
      setPending(false)
    }
  }

  const label = pending
    ? elapsedSec > 0
      ? `Atualizando… ${elapsedSec}s`
      : 'Atualizando…'
    : okAt && !error
      ? 'Dados atualizados'
      : 'Atualização de dados'

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={
          error ??
          (pending
            ? 'Lê as planilhas e publica (~40–60s). Aguarde o fim.'
            : 'Atualização de dados')
        }
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
