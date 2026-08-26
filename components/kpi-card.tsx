'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const TONE_BAR: Record<string, string> = {
  indigo: 'bg-chart-1',
  teal: 'bg-chart-2',
  amber: 'bg-chart-3',
  magenta: 'bg-chart-4',
  rose: 'bg-destructive',
}

export function KpiGrid({
  children,
  columns = 4,
  className,
}: {
  children: ReactNode
  columns?: 3 | 4 | 5
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid auto-rows-fr grid-cols-1 items-stretch gap-2 sm:grid-cols-2',
        columns === 3 && 'xl:grid-cols-3',
        columns === 4 && 'xl:grid-cols-4',
        columns === 5 && 'lg:grid-cols-3 xl:grid-cols-5',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function KpiCard({
  label,
  value,
  hint,
  detail,
  alert = false,
  warning = false,
  progress,
  tone = 'indigo',
  href,
}: {
  label: string
  value: string
  hint?: string
  detail?: string
  alert?: boolean
  warning?: boolean
  progress?: number
  tone?: keyof typeof TONE_BAR
  href?: string
}) {
  const bar = alert ? TONE_BAR.rose : warning ? TONE_BAR.amber : TONE_BAR[tone]
  const width = progress == null ? null : Math.max(8, Math.min(100, progress))
  const tooltip = detail ?? hint
  const className = cn(
    'kpi-shine card-surface flex h-full min-h-[var(--kpi-min-h)] w-full min-w-0 flex-col gap-1 p-[var(--kpi-pad)]',
    tooltip && 'cursor-help',
    href && 'transition hover:ring-1 hover:ring-primary/40',
    alert &&
      'bg-destructive/[0.07] shadow-[inset_3px_0_0_0_var(--destructive)] ring-1 ring-destructive/25',
    !alert &&
      warning &&
      'bg-chart-3/20 shadow-[inset_3px_0_0_0_var(--chart-3)] ring-1 ring-chart-3/35',
  )
  const inner = (
    <>
      <p className="truncate text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          'truncate font-mono text-lg font-bold tracking-tight tabular-nums',
          alert && 'text-destructive',
          !alert && warning && 'text-[oklch(0.48_0.14_65)]',
          !alert && !warning && 'text-foreground',
        )}
      >
        {value}
      </p>
      <p className="line-clamp-2 min-h-[1.15rem] text-[10px] leading-snug text-muted-foreground">
        {hint || '\u00a0'}
      </p>
      {width != null ? (
        <div className="mt-auto h-0.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full shadow-[0_0_16px_color-mix(in_oklch,var(--glow)_70%,transparent)]',
              bar,
            )}
            style={{ width: `${width}%` }}
          />
        </div>
      ) : (
        <div className="mt-auto" />
      )}
    </>
  )

  const body = href ? (
    <Link href={href} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  )

  if (!tooltip) return body

  return (
    <Tooltip>
      <TooltipTrigger
        delay={160}
        className="flex h-full min-w-0"
        render={<div className="flex h-full min-w-0" />}
      >
        {body}
      </TooltipTrigger>
      <TooltipContent className="max-w-sm whitespace-pre-line text-left leading-snug">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}
