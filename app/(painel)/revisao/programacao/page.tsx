import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { ProgramacaoConsultaTela } from '@/components/programacao-consulta-tela'
import { ProgramacaoVoltarButton } from '@/components/programacao-nav'
import { canEditarProgramacao } from '@/lib/auth/access'
import { readSession } from '@/lib/auth/cookie'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Ver programação · Revisão' }

export default async function RevisaoProgramacaoPage() {
  const session = await readSession()
  const podeEditar = session ? canEditarProgramacao(session.login) : false

  return (
    <PageShell
      title="Ver programação"
      description={
        podeEditar
          ? 'Escolha dia, semana ou mês; veja o pedido e expanda os produtos.'
          : 'Consulta só leitura. Escolha dia, semana ou mês; veja o pedido e expanda os produtos.'
      }
      actions={<ProgramacaoVoltarButton area="revisao" />}
    >
      <ProgramacaoConsultaTela podeEditar={podeEditar} />
    </PageShell>
  )
}
