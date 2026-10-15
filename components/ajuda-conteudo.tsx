import Link from 'next/link'
import type { AjudaSecao } from '@/lib/ajuda'
import { cn } from '@/lib/utils'

function Lista({
  titulo,
  itens,
  tone = 'default',
}: {
  titulo: string
  itens: string[]
  tone?: 'default' | 'ok' | 'no'
}) {
  if (!itens.length) return null
  return (
    <div className="flex flex-col gap-1.5">
      <h3
        className={cn(
          'text-[11px] font-semibold tracking-wide uppercase',
          tone === 'ok' && 'text-teal-700 dark:text-teal-400',
          tone === 'no' && 'text-amber-800 dark:text-amber-400',
          tone === 'default' && 'text-muted-foreground',
        )}
      >
        {titulo}
      </h3>
      <ul className="list-disc space-y-1 pl-4 text-sm leading-snug text-foreground/90">
        {itens.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

export function AjudaSecaoView({
  secao,
  compact = false,
  showLink = false,
}: {
  secao: AjudaSecao
  compact?: boolean
  showLink?: boolean
}) {
  return (
    <article
      id={secao.id}
      className={cn(
        'flex flex-col gap-3',
        !compact && 'scroll-mt-20 rounded-lg border border-border/70 bg-card/40 p-4',
      )}
    >
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold tracking-tight">{secao.titulo}</h2>
          {showLink ? (
            <Link
              href={secao.href}
              className="text-xs font-medium text-primary hover:underline"
            >
              Abrir aba
            </Link>
          ) : null}
        </div>
        <p className="text-sm leading-snug text-muted-foreground">{secao.resumo}</p>
      </header>

      <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'md:grid-cols-2')}>
        <Lista titulo="No escopo" itens={secao.escopo} tone="ok" />
        <Lista titulo="Fora do escopo" itens={secao.foraEscopo} tone="no" />
        <Lista titulo="De onde vem" itens={secao.fontes} />
        <Lista titulo="Como o KPI é feito" itens={secao.kpis} />
        <Lista titulo="O que dá para fazer" itens={secao.daPra} tone="ok" />
        <Lista titulo="O que não dá" itens={secao.naoDa} tone="no" />
      </div>
    </article>
  )
}
