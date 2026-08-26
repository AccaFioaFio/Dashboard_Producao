import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
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
      description="Quem consulta o dashboard não envia planilha. Neste PC, pnpm carga:watch lê a origem e publica a carga na nuvem."
    >
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Deixe o publicador ligado neste computador (terminal ou tarefa do
        Windows): <span className="font-mono text-xs">pnpm carga:watch</span>.
        Sem o processo no ar, o site fica na última carga boa. Coloque{' '}
        <span className="font-mono text-xs">BLOB_READ_WRITE_TOKEN</span> no{' '}
        <span className="font-mono text-xs">.env</span> local (o mesmo Blob da
        Vercel) e, se a fábrica grava no OneDrive, os caminhos absolutos{' '}
        <span className="font-mono text-xs">CORTE_XLSX</span>,{' '}
        <span className="font-mono text-xs">OFICINAS_XLSX</span> e{' '}
        <span className="font-mono text-xs">SIGNUS_XLS</span>.
      </p>
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
