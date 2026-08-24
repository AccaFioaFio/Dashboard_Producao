'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarClock } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { findNavItem } from '@/lib/navigation'

export function AppHeader() {
  const pathname = usePathname()
  const current = findNavItem(pathname)
  const isRoot = pathname === '/'

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-sm">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />

      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            {isRoot ? (
              <BreadcrumbPage>Visão geral</BreadcrumbPage>
            ) : (
              <BreadcrumbLink render={<Link href="/" />}>
                Visão geral
              </BreadcrumbLink>
            )}
          </BreadcrumbItem>
          {!isRoot && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{current?.title ?? 'Página'}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-2">
        <Badge variant="outline" className="hidden font-mono sm:inline-flex">
          <CalendarClock data-icon="inline-start" />
          2026
        </Badge>
      </div>
    </header>
  )
}
