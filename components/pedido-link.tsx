'use client'

import Link from 'next/link'
import { pedidoHref } from '@/lib/pedido'
import { cn } from '@/lib/utils'

export function PedidoLink({
  pedido,
  className,
}: {
  pedido: string | null | undefined
  className?: string
}) {
  const value = (pedido ?? '').trim()
  if (!value || value === '—') return <span className="text-muted-foreground">—</span>
  return (
    <Link
      href={pedidoHref(value)}
      className={cn(
        'font-medium text-primary underline-offset-2 hover:underline',
        className,
      )}
      onClick={(event) => event.stopPropagation()}
    >
      {value}
    </Link>
  )
}
