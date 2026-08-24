'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Factory } from 'lucide-react'
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
import { navigation } from '@/lib/navigation'

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border/80 px-2 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="Produção 2026"
              className="h-12 rounded-xl px-2 hover:bg-sidebar-accent"
              render={<Link href="/" />}
            >
              <span className="flex aspect-square size-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
                <Factory className="size-4" />
              </span>
              <span className="flex min-w-0 flex-col text-left leading-tight">
                <span className="truncate text-sm font-semibold tracking-wide">
                  Produção
                </span>
                <span className="truncate text-[11px] text-sidebar-foreground/60">
                  Recorte 2026
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="px-3 py-4">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {navigation.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={pathname === item.href}
                    tooltip={item.title}
                    className="h-10 rounded-xl px-3 text-[13px] font-medium"
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
        <div className="flex items-center gap-2 px-2 py-2 group-data-[collapsible=icon]:hidden">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-chart-2 opacity-40" />
            <span className="relative inline-flex size-2.5 rounded-full bg-chart-2" />
          </span>
          <p className="truncate text-xs text-sidebar-foreground/55">Painel ao vivo · 2026</p>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
