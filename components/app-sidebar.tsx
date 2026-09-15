'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { findNavItem, navigation } from '@/lib/navigation'
import { cn } from '@/lib/utils'

function WatcherStatusFooter() {
  const [online, setOnline] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function refresh() {
      try {
        const res = await fetch('/api/watcher-status')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { online?: boolean }
        if (!cancelled) setOnline(Boolean(data.online))
      } catch {
        if (!cancelled) setOnline(false)
      }
    }

    void refresh()

    function onVisible() {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return (
    <div className="flex items-center gap-2 px-2 py-2 group-data-[collapsible=icon]:hidden">
      <span className="relative flex size-2.5">
        {online ? (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-chart-2 opacity-40" />
        ) : null}
        <span
          className={cn(
            'relative inline-flex size-2.5 rounded-full',
            online ? 'bg-chart-2' : 'bg-sidebar-foreground/35',
          )}
        />
      </span>
      <p className="truncate text-xs text-sidebar-foreground/55">
        {online ? 'Carga recente' : 'Sem publicação recente'}
      </p>
    </div>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const activeHref = findNavItem(pathname)?.href

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border/80 px-2 py-1.5">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="Fio a Fio"
              className="h-auto min-h-10 justify-center overflow-visible py-1.5 hover:bg-transparent group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-1!"
              render={<Link href="/" />}
            >
              <img
                src="/logo-fio-a-fio.png?v=3"
                alt="Fio a Fio"
                className="h-12 w-auto max-w-full object-contain group-data-[collapsible=icon]:h-6"
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="px-2 py-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {navigation.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={activeHref === item.href}
                    tooltip={item.title}
                    className="h-9 rounded-lg px-2.5 text-[13px] font-medium"
                    render={<Link href={item.href} />}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/80">
        <WatcherStatusFooter />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
