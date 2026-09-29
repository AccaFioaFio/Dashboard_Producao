import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, Inter } from 'next/font/google'
import { AppearanceProvider } from '@/components/appearance-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { APPEARANCE_BOOTSTRAP } from '@/lib/appearance'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans-loaded',
})
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono-loaded',
})

export const metadata: Metadata = {
  title: {
    default: 'Produção 2026',
    template: '%s · Produção 2026',
  },
  description: 'Dashboard de produção 2026.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: '#3d2e8a',
}

/** Literal obrigatório; Hobby da Vercel aceita até 60s. */
export const maxDuration = 60

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${ibmPlexMono.variable} ${inter.className} bg-background`}
      data-theme="violeta"
      data-layout="compacto"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOTSTRAP }} />
      </head>
      <body className="antialiased">
        <AppearanceProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </AppearanceProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
