import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import { SectionPlaceholder } from '@/components/section-placeholder'
import { ListOrdered } from 'lucide-react'

export default function PedidoNotFound() {
  return (
    <PageShell title="Pedido não encontrado" description="Esse número não está na carga 2026.">
      <SectionPlaceholder
        icon={ListOrdered}
        title="Sem este pedido em 2026"
        description="Ele pode ter sido cortado em outro ano, ou o número não bate com o Excel. Volte à lista e busque de novo."
      />
      <p className="text-sm">
        <Link href="/pedidos" className="text-primary underline-offset-2 hover:underline">
          Abrir lista de pedidos
        </Link>
      </p>
    </PageShell>
  )
}
