import { AlertTriangle } from 'lucide-react'
import { formatDate, formatInt, formatMeters } from '@/lib/format'

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
  const items = [
    wipPedidos
      ? `WIP Corte: ${formatInt(wipPedidos)} pedidos / ${formatInt(wipPecas)} pçs`
      : null,
    tecidoPedidos
      ? `Aguardando tecido: ${formatInt(tecidoPedidos)} pedidos / ${formatMeters(tecidoMetros)} / ${formatInt(tecidoPecas)} pçs`
      : null,
    oficinasPendentes
      ? `Oficinas pendentes: ${formatInt(oficinasPendentes)} pçs`
      : null,
    ultimaRevisao
      ? `Última Revisão apontada: ${formatDate(ultimaRevisao)}`
      : 'Revisão sem data',
    ultimoEnvio
      ? `Último envio a oficina: ${formatDate(ultimoEnvio)}`
      : 'Oficinas sem envio',
  ].filter(Boolean) as string[]

  return (
    <div className="card-surface flex items-start gap-2 px-3 py-2">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-chart-3" />
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
