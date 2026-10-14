import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { ProgramacaoConsultaTela } from '@/components/programacao-consulta-tela'
import { ProgramacaoVoltarButton } from '@/components/programacao-nav'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Ver programação · Revisão' }

export default function RevisaoProgramacaoPage() {
  return (
    <PageShell
      title="Ver programação"
      description="Consulta só leitura. Escolha dia, semana ou mês; veja o pedido e expanda os produtos."
      actions={<ProgramacaoVoltarButton area="revisao" />}
    >
      <ProgramacaoConsultaTela />
    </PageShell>
  )
}
