'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarClock } from 'lucide-react'
import { AppearancePanel } from '@/components/appearance-panel'
import { PedidoSearch } from '@/components/pedido-search'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { findNavItem } from '@/lib/navigation'
import { parsePedidoParam } from '@/lib/pedido'

export function AppHeader({ stamp }: { stamp?: ReactNode }) {
  const pathname = usePathname()
  const current = findNavItem(pathname)
  const isRoot = pathname === '/'
  const pedidoMatch = pathname.match(/^\/pedidos\/([^/]+)$/)
  const pedidoLabel = pedidoMatch ? parsePedidoParam(pedidoMatch[1]) : null

  return (
    <header className="app-header relative sticky top-0 z-10 flex h-[var(--header-h)] shrink-0 items-center gap-3 px-3 text-header-foreground">
      <SidebarTrigger className="text-header-foreground hover:bg-white/10 hover:text-header-foreground" />

      <nav className="flex min-w-0 items-center gap-2 text-sm">
        {isRoot ? (
          <span className="font-medium tracking-wide">Visão Geral</span>
        ) : (
          <>
            <Link href="/" className="text-header-foreground/70 hover:text-header-foreground">
              Visão Geral
            </Link>
            <span className="text-header-foreground/40">/</span>
            {pedidoLabel ? (
              <>
                <Link
                  href="/pedidos"
                  className="text-header-foreground/70 hover:text-header-foreground"
                >
                  Pedidos
                </Link>
                <span className="text-header-foreground/40">/</span>
                <span className="truncate font-medium tracking-wide">{pedidoLabel}</span>
              </>
            ) : (
              <span className="truncate font-medium tracking-wide">
                {current?.title ?? 'Página'}
              </span>
            )}
          </>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <PedidoSearch />
        {stamp}
        <span className="hidden h-8 items-center gap-1.5 rounded-full bg-white/12 px-2.5 text-xs font-medium md:inline-flex">
          <CalendarClock className="size-3.5" />
          2026
        </span>
        <AppearancePanel />
      </div>
    </header>
  )
}
