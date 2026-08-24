'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, CalendarClock, Search } from 'lucide-react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { findNavItem } from '@/lib/navigation'

export function AppHeader() {
  const pathname = usePathname()
  const current = findNavItem(pathname)
  const isRoot = pathname === '/'

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 bg-header px-4 text-header-foreground">
      <SidebarTrigger className="text-header-foreground hover:bg-white/10 hover:text-header-foreground" />

      <nav className="flex min-w-0 items-center gap-2 text-sm">
        {isRoot ? (
          <span className="font-medium">Visão Geral</span>
        ) : (
          <>
            <Link href="/" className="text-header-foreground/70 hover:text-header-foreground">
              Visão Geral
            </Link>
            <span className="text-header-foreground/40">/</span>
            <span className="truncate font-medium">{current?.title ?? 'Página'}</span>
          </>
        )}
      </nav>

      <div className="ml-auto hidden items-center gap-2 sm:flex">
        <div className="flex h-8 items-center gap-2 rounded-full bg-white/12 px-3 text-xs text-header-foreground/80">
          <Search className="size-3.5" />
          <span>2026</span>
        </div>
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-white/12">
          <Bell className="size-3.5" />
        </span>
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/12 px-2.5 text-xs font-medium">
          <CalendarClock className="size-3.5" />
          Ano
        </span>
      </div>
    </header>
  )
}
