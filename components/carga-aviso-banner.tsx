import { AlertTriangle } from 'lucide-react'
import { ensureCloudDatabase } from '@/lib/cloud/carga'
import { getDataHealthWarning } from '@/lib/cloud/data-health'

/**
 * Em toda abertura do painel sincroniza a carga.
 * No mobile (Vercel), a 1ª abertura da instância já publica todos os
 * lançamentos de costura/revisão do SQLite — sem pesquisar pedido a pedido.
 */
export async function CargaAvisoBanner() {
  try {
    await ensureCloudDatabase()
  } catch {
    // ensureCloudDatabase em geral não lança; se lançar, o error.tsx cobre a página.
  }

  const warning = getDataHealthWarning()
  if (!warning) return null

  return (
    <div
      className="flex items-start gap-2 border-b border-border bg-muted/50 px-4 py-2 text-xs text-muted-foreground"
      role="status"
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-chart-3" aria-hidden />
      <p className="min-w-0 text-pretty">{warning}</p>
    </div>
  )
}
