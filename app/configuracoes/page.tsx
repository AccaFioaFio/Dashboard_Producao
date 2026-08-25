import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { RefreshForm } from '@/components/refresh-form'
import { getLatestCarga } from '@/data/dashboard'
import { corteXlsxPath, oficinasXlsxPath, signusXlsPath } from '@/lib/paths'
import { formatDateTime } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Configurações' }

export default async function ConfiguracoesPage() {
  const carga = await getLatestCarga()

  return (
    <PageShell
      title="Configurações"
      description="Neste PC o refresh lê a pasta Arquivos do Excel. No site da Vercel, envie as três planilhas; a carga fica gravada no Blob Store."
      actions={<RefreshForm />}
    >
      <dl className="card-surface grid gap-3 p-3 text-sm sm:grid-cols-2">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <dt className="text-xs text-muted-foreground">CORTE_XLSX</dt>
          <dd className="break-all font-mono text-xs">{corteXlsxPath()}</dd>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <dt className="text-xs text-muted-foreground">OFICINAS_XLSX</dt>
          <dd className="break-all font-mono text-xs">{oficinasXlsxPath()}</dd>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <dt className="text-xs text-muted-foreground">SIGNUS_XLS</dt>
          <dd className="break-all font-mono text-xs">{signusXlsPath()}</dd>
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
        <div className="flex flex-col gap-1 sm:col-span-2">
          <dt className="text-xs text-muted-foreground">LastWriteTime Signus</dt>
          <dd>{formatDateTime(carga?.signusLastWrite)}</dd>
        </div>
      </dl>
    </PageShell>
  )
}
