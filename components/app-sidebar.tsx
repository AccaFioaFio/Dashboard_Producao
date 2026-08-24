'use client'

import Link from 'next/link'
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
import { navigation } from '@/lib/navigation'

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border/80 px-2 py-2.5">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="Fio a Fio"
              className="h-auto min-h-12 justify-center overflow-visible py-2 hover:bg-transparent group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-1!"
              render={<Link href="/" />}
            >
              <img
                src="/logo-fio-a-fio.png?v=3"
                alt="Fio a Fio"
                className="h-16 w-auto max-w-full object-contain group-data-[collapsible=icon]:h-6"
              />
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
