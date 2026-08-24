import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { KpiCard } from '@/components/kpi-card'
import { FunnelCard } from '@/components/funnel-card'
import { MonthlyBars } from '@/components/monthly-bars'
import { AlertsBanner } from '@/components/alerts-banner'
import { RefreshForm } from '@/components/refresh-form'
import { SectionPlaceholder } from '@/components/section-placeholder'
import { LayoutDashboard } from 'lucide-react'
import {
  getAlertas,
  getFunil,
  getHeaderKpis,
  getLatestCarga,
  getSerieMensal,
} from '@/data/dashboard'
import { formatDateTime, formatInt } from '@/lib/format'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Visão geral' }

export default async function Page() {
  const [header, funil, serie, alertas, carga] = await Promise.all([
    getHeaderKpis(),
    getFunil(),
    getSerieMensal(),
    getAlertas(),
    getLatestCarga(),
  ])

  if (!header || !funil) {
    return (
      <PageShell
        title="Visão geral"
        description="Dashboard 2026 de corte, costura, revisão e oficinas."
        actions={<RefreshForm />}
      >
        <SectionPlaceholder
          icon={LayoutDashboard}
          title="Nenhuma carga 2026"
          description="Clique em Atualizar dados para copiar as planilhas do OneDrive, aplicar o recorte de 2026 e gravar os fatos."
        />
      </PageShell>
    )
  }

  return (
    <PageShell
      title="Visão geral"
      description={`Somente 2026. Última leitura ${formatDateTime(carga?.lidaEm)}.`}
      actions={<RefreshForm />}
    >
      <AlertsBanner
        wipPedidos={header.wipPedidos}
        wipPecas={header.wipPecas}
        tecidoPedidos={header.tecidoPedidos}
        tecidoPecas={header.tecidoPecas}
        oficinasPendentes={header.oficinasPendentes}
        ultimaRevisao={alertas.ultimaRevisao}
        ultimoEnvio={alertas.ultimoEnvio}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Peças cortadas"
          value={formatInt(header.pecasCortadas)}
          hint="SUM da quantidade, não contagem de linha"
        />
        <KpiCard
          label="Pedidos no corte"
          value={formatInt(header.pedidosCorte)}
          hint="Nº pedido distinto; * herda o cabeçalho"
        />
        <KpiCard
          label="Costura Produção"
          value={formatInt(header.pecasCosturaProd)}
          hint="Origem = Produção (funil)"
        />
        <KpiCard
          label="Revisão limpa"
          value={formatInt(header.pecasRevisao)}
          hint="Sem total da tabela e sem Qtd = pedido"
        />
        <KpiCard
          label="WIP corte"
          value={`${formatInt(header.wipPedidos)} / ${formatInt(header.wipPecas)}`}
          hint="Pedidos vigentes / peças no status EM PRODUÇÃO"
          alert={header.wipPedidos > 0}
        />
        <KpiCard
          label="Aguardando tecido"
          value={`${formatInt(header.tecidoPedidos)} / ${formatInt(header.tecidoPecas)}`}
          hint="Status vigente / peças no bloco"
          alert={header.tecidoPedidos > 0}
        />
        <KpiCard
          label="Oficinas pendentes"
          value={formatInt(header.oficinasPendentes)}
          hint={`Defeitos ${formatInt(header.oficinasDefeitos)}`}
          alert={header.oficinasPendentes > 0}
        />
        <KpiCard
          label="Hoje"
          value={`${formatInt(alertas.costuraHoje)} / ${formatInt(alertas.revisaoHoje)}`}
          hint="Costura Produção / revisão do dia"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(16rem,2fr)]">
        <MonthlyBars serie={serie} />
        <FunnelCard funil={funil} />
      </div>
    </PageShell>
  )
}
