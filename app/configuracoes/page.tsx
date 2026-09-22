import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { getLatestCarga } from '@/data/dashboard'
import {
  corteXlsxPath,
  estoqueXlsxPath,
  itensXlsxPath,
  oficinasXlsxPath,
  pedidosXlsxPath,
  signusXlsPath,
} from '@/lib/paths'
import { formatDateTime } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Configurações' }

export default async function ConfiguracoesPage() {
  const carga = await getLatestCarga()

  return (
    <PageShell
      title="Configurações"
      description="A sinc mantém Arquivos do Excel. O botão lê essa pasta, grava o SQLite e publica no Supabase."
    >
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Igual ao Orçamentos: neste PC deixe{' '}
        <span className="font-mono text-xs">pnpm carga:sync:watch</span> e clique em{' '}
        <span className="font-semibold">Atualização de dados</span> (com{' '}
        <span className="font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</span> no{' '}
        <span className="font-mono text-xs">.env.local</span>). O site online só lê a
        carga publicada — sem Blob e sem push do SQLite.
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
        <div className="flex flex-col gap-1 sm:col-span-2">
          <dt className="text-xs text-muted-foreground">ESTOQUE_XLSX</dt>
          <dd className="break-all font-mono text-xs">{estoqueXlsxPath()}</dd>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <dt className="text-xs text-muted-foreground">PEDIDOS_XLSX</dt>
          <dd className="break-all font-mono text-xs">{pedidosXlsxPath()}</dd>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <dt className="text-xs text-muted-foreground">ITENS_XLSX</dt>
          <dd className="break-all font-mono text-xs">{itensXlsxPath()}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">Última leitura</dt>
          <dd>{formatDateTime(carga?.lidaEm)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">Total de Pedidos</dt>
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
        <div className="flex flex-col gap-1 sm:col-span-2">
          <dt className="text-xs text-muted-foreground">LastWriteTime Estoque</dt>
          <dd>{formatDateTime(carga?.estoqueLastWrite)}</dd>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <dt className="text-xs text-muted-foreground">LastWriteTime Pedidos</dt>
          <dd>{formatDateTime(carga?.pedidosLastWrite)}</dd>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <dt className="text-xs text-muted-foreground">LastWriteTime Itens</dt>
          <dd>{formatDateTime(carga?.itensLastWrite)}</dd>
        </div>
      </dl>
    </PageShell>
  )
}
