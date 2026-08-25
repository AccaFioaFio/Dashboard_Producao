import type { ReactNode } from 'react'

type PageShellProps = {
  title: string
  description: string
  actions?: ReactNode
  children: ReactNode
}

export function PageShell({
  title,
  description,
  actions,
  children,
}: PageShellProps) {
  return (
    <main
      className="page-shell flex min-w-0 flex-1 flex-col"
      style={{ gap: 'var(--page-gap)', padding: 'var(--page-pad)' }}
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-0.5">
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
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </main>
  )
}
