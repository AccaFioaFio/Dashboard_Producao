import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { ProgramacaoTela } from '@/components/programacao-tela'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Programação de Produção' }

export default function ProgramacaoPage() {
  return (
    <PageShell
      title="Programação de Produção"
      description="Monte por pedido (qtd e período). Se o pedido não existir na carga, informe nome fantasia e produtos manualmente."
    >
      <ProgramacaoTela />
    </PageShell>
  )
}
