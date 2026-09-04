import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { formatDate, formatInt, formatMeters } from '@/lib/format'
import { pedidosFatiaHref } from '@/lib/funil'
import { cn } from '@/lib/utils'

type AlertItem = {
  key: string
  text: string
  href: string
  tone: 'block' | 'lag' | 'info'
}

export function AlertsBanner({
  wipPedidos,
  wipPecas,
  tecidoPedidos,
  tecidoPecas,
  tecidoMetros,
  oficinasPendentes,
  ultimaRevisao,
  ultimoEnvio,
}: {
  wipPedidos: number
  wipPecas: number
  tecidoPedidos: number
  tecidoPecas: number
  tecidoMetros: number
  oficinasPendentes: number
  ultimaRevisao: string | null
  ultimoEnvio: string | null
}) {
  const items: AlertItem[] = []
  if (wipPedidos) {
    items.push({
      key: 'wip',
      text: `WIP Corte: ${formatInt(wipPedidos)} OCs / ${formatInt(wipPecas)} pçs`,
      href: pedidosFatiaHref('wip'),
      tone: 'block',
    })
  }
  if (tecidoPedidos) {
    items.push({
      key: 'tecido',
      text: `Aguardando tecido: ${formatInt(tecidoPedidos)} OCs / ${formatMeters(tecidoMetros)} / ${formatInt(tecidoPecas)} pçs`,
      href: pedidosFatiaHref('aguardandoTecido'),
      tone: 'block',
    })
  }
  if (oficinasPendentes) {
    items.push({
      key: 'oficinas',
      text: `Oficinas pendentes: ${formatInt(oficinasPendentes)} pçs`,
      href: '/oficinas',
      tone: 'block',
    })
  }
  items.push({
    key: 'revisao',
    text: ultimaRevisao
      ? `Última Revisão apontada: ${formatDate(ultimaRevisao)}`
      : 'Revisão sem data',
    href: '/revisao',
    tone: ultimaRevisao ? 'lag' : 'block',
  })
  items.push({
    key: 'envio',
    text: ultimoEnvio
      ? `Último envio a oficina: ${formatDate(ultimoEnvio)}`
      : 'Oficinas sem envio',
    href: '/oficinas',
    tone: ultimoEnvio ? 'info' : 'lag',
  })

  return (
    <div className="card-surface flex items-start gap-2 px-3 py-2">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-chart-3" />
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className={cn(
                'underline-offset-2 hover:underline',
                item.tone === 'block' && 'font-medium text-destructive',
                item.tone === 'lag' && 'text-[oklch(0.48_0.14_65)]',
                item.tone === 'info' && 'text-muted-foreground',
              )}
            >
              {item.text}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
