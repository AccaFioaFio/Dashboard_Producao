import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { ProgramacaoTela } from '@/components/programacao-tela'
import { canEditarProgramacao } from '@/lib/auth/access'
import { readSession } from '@/lib/auth/cookie'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Programação de Produção' }

export default async function ProgramacaoPage() {
  const session = await readSession()
  const podeEditar = session ? canEditarProgramacao(session.login) : false

  return (
    <PageShell
      title="Programação de Produção"
      description="Monte por pedido (qtd e período). Se o pedido não existir na carga, informe nome fantasia e produtos manualmente."
    >
      <ProgramacaoTela podeEditar={podeEditar} />
    </PageShell>
  )
}
