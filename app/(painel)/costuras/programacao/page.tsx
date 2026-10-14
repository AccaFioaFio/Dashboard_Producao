import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { ProgramacaoConsultaTela } from '@/components/programacao-consulta-tela'
import { ProgramacaoVoltarButton } from '@/components/programacao-nav'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Ver programação · Costura' }

export default function CosturasProgramacaoPage() {
  return (
    <PageShell
      title="Ver programação"
      description="Consulta só leitura. Escolha dia, semana ou mês; veja o pedido e expanda os produtos."
      actions={<ProgramacaoVoltarButton area="costuras" />}
    >
      <ProgramacaoConsultaTela />
    </PageShell>
  )
}
