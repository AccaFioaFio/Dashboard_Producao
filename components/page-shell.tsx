import type { ReactNode } from 'react'
import { AjudaTrigger } from '@/components/ajuda-trigger'

type PageShellProps = {
  title: string
  description: string
  actions?: ReactNode
  /** Botão “Como funciona” da tela atual. Padrão: ligado. */
  help?: boolean
  children: ReactNode
}

export function PageShell({
  title,
  description,
  actions,
  help = true,
  children,
}: PageShellProps) {
  const trailing =
    help || actions ? (
      <div className="flex w-full min-w-0 shrink-0 flex-wrap items-center gap-2 md:w-auto md:justify-end">
        {help ? <AjudaTrigger /> : null}
        {actions}
      </div>
    ) : null

  return (
    <main
      className="page-shell flex min-w-0 flex-1 flex-col"
      style={{ gap: 'var(--page-gap)', padding: 'var(--page-pad)' }}
    >
      <div className="page-heading flex flex-col gap-2 print:hidden md:flex-row md:items-end md:justify-between">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-primary uppercase">
            Produção · 2026
          </p>
          <h1 className="text-balance text-xl font-bold tracking-tight md:text-2xl">
            {title}
          </h1>
          <p className="max-w-2xl text-pretty text-xs leading-snug text-muted-foreground">
            {description}
          </p>
        </div>
        {trailing}
      </div>
      {children}
    </main>
  )
}
