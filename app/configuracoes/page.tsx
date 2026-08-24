import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { RefreshForm } from '@/components/refresh-form'
import { getLatestCarga } from '@/data/dashboard'
import { corteXlsxPath, oficinasXlsxPath } from '@/lib/paths'
import { formatDateTime } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Configurações' }

export default async function ConfiguracoesPage() {
  const carga = await getLatestCarga()

  return (
    <PageShell
      title="Configurações"
      description="Fontes OneDrive e última carga 2026. O refresh copia os .xlsx para cache; se a cópia falhar, a carga anterior permanece."
      actions={<RefreshForm />}
    >
      <dl className="grid gap-4 rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10 sm:grid-cols-2">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <dt className="text-xs text-muted-foreground">CORTE_XLSX</dt>
          <dd className="break-all font-mono text-xs">{corteXlsxPath()}</dd>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <dt className="text-xs text-muted-foreground">OFICINAS_XLSX</dt>
          <dd className="break-all font-mono text-xs">{oficinasXlsxPath()}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">Última leitura</dt>
          <dd>{formatDateTime(carga?.lidaEm)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">Pedidos no Corte</dt>
          <dd className="font-mono">{carga?.pedidosCorte ?? '—'}</dd>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <dt className="text-xs text-muted-foreground">LastWriteTime Corte</dt>
          <dd>{formatDateTime(carga?.corteLastWrite)}</dd>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <dt className="text-xs text-muted-foreground">LastWriteTime Oficinas</dt>
          <dd>{formatDateTime(carga?.oficinasLastWrite)}</dd>
        </div>
      </dl>
    </PageShell>
  )
}
