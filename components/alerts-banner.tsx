import { AlertTriangle } from 'lucide-react'
import { formatDate, formatInt } from '@/lib/format'

export function AlertsBanner({
  wipPedidos,
  wipPecas,
  tecidoPedidos,
  tecidoPecas,
  oficinasPendentes,
  ultimaRevisao,
  ultimoEnvio,
}: {
  wipPedidos: number
  wipPecas: number
  tecidoPedidos: number
  tecidoPecas: number
  oficinasPendentes: number
  ultimaRevisao: string | null
  ultimoEnvio: string | null
}) {
  const items = [
    wipPedidos
      ? `WIP corte: ${formatInt(wipPedidos)} pedidos / ${formatInt(wipPecas)} pçs`
      : null,
    tecidoPedidos
      ? `Aguardando tecido: ${formatInt(tecidoPedidos)} pedidos / ${formatInt(tecidoPecas)} pçs`
      : null,
    oficinasPendentes
      ? `Oficinas pendentes: ${formatInt(oficinasPendentes)} pçs`
      : null,
    ultimaRevisao
      ? `Última revisão apontada: ${formatDate(ultimaRevisao)}`
      : 'Revisão sem data',
    ultimoEnvio
      ? `Último envio a oficina: ${formatDate(ultimoEnvio)}`
      : 'Oficinas sem envio',
  ].filter(Boolean) as string[]

  return (
    <div className="flex items-start gap-3 rounded-xl border border-chart-3/40 bg-chart-3/10 px-4 py-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-chart-3" />
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
