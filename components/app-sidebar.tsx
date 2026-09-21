'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
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
import { AtualizarDadosButton } from '@/components/atualizar-dados-button'
import { findNavItem, navigation } from '@/lib/navigation'

export function AppSidebar({ lastUpdate }: { lastUpdate?: ReactNode }) {
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
              <AtualizarDadosButton />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/80">
        {lastUpdate}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
