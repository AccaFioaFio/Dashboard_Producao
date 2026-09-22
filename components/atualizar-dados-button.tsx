'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import type { AtualizarDadosResult } from '@/lib/etl/atualizar-dados'
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

/** Acima do ETL típico (~45s) + publish; abaixo de hang infinito. */
const CLIENT_TIMEOUT_MS = 100_000

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
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS)
    try {
      const response = await fetch('/api/atualizar-dados', {
        method: 'POST',
        cache: 'no-store',
        signal: controller.signal,
      })
      let result: AtualizarDadosResult
      try {
        result = (await response.json()) as AtualizarDadosResult
      } catch {
        throw new Error(
          `Resposta inválida do servidor (HTTP ${response.status}).`,
        )
      }
      if (result.ok) {
        setOkAt(result.lidaEm)
        setError(null)
        window.location.reload()
        return
      }
      setOkAt(null)
      setError(result.error || `Falha ao atualizar (HTTP ${response.status}).`)
    } catch (error) {
      setOkAt(null)
      if (error instanceof DOMException && error.name === 'AbortError') {
        setError(
          'Demorou mais de 100s e foi interrompido. Recarregue a página e tente de novo; se repetir, reinicie o npm run dev.',
        )
      } else {
        const message =
          error instanceof Error ? error.message : String(error)
        setError(
          message || 'Falha ao atualizar. Recarregue a página e tente de novo.',
        )
      }
    } finally {
      window.clearTimeout(timer)
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
            ? 'Lê as planilhas e publica. Se nada mudou, responde na hora.'
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
