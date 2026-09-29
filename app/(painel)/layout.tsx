import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { AppHeader } from '@/components/app-header'
import { AppSidebar } from '@/components/app-sidebar'
import { CargaStamp } from '@/components/carga-stamp'
import { UltimaAtualizacaoSlot } from '@/components/ultima-atualizacao-slot'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { canAccessPath, homePath } from '@/lib/auth/access'
import { readSession } from '@/lib/auth/cookie'

export default async function PainelLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  const session = await readSession()
  if (!session) redirect('/login')

  const pathname = (await headers()).get('x-pathname') ?? ''
  if (pathname && !canAccessPath(pathname, session.acessos)) {
    redirect(homePath(session.acessos))
  }

  return (
    <SidebarProvider>
      <AppSidebar
        acessos={session.acessos}
        login={session.login}
        lastUpdate={<UltimaAtualizacaoSlot />}
      />
      <SidebarInset className="relative overflow-hidden">
        <AppHeader acessos={session.acessos} stamp={<CargaStamp />} />
        <div className="relative z-0 flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
