'use client'

import { useActionState, useState, type FormEvent } from 'react'
import { RefreshCw } from 'lucide-react'
import { aplicarCargaRemota, atualizarDados } from '@/app/actions/refresh'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { buildSnapshotFromWorkbooks } from '@/lib/etl/build-snapshot'
import { checkInvariants } from '@/lib/etl/kpis'
import type { SnapshotPayload } from '@/lib/etl/types'
import { CLOUD_SNAPSHOT_BLOB } from '@/lib/cloud/constants'
import type { RefreshResult } from '@/lib/etl/refresh'
import * as XLSX from 'xlsx'

const isVercel = Boolean(process.env.NEXT_PUBLIC_VERCEL_ENV)

export function RefreshForm() {
  if (isVercel) return <UploadRefreshForm />
  return <FolderRefreshForm />
}

function FolderRefreshForm() {
  const [state, action, pending] = useActionState(atualizarDados, null)

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <span className="action-glow">
        <Button type="submit" disabled={pending} className="action-glow-face">
          <RefreshCw className={pending ? 'animate-spin' : undefined} />
          {pending ? 'Atualizando…' : 'Atualizar dados'}
        </Button>
      </span>
      <StatusMessage state={state} />
    </form>
  )
}

function UploadRefreshForm() {
  const [state, setState] = useState<RefreshResult | null>(null)
  const [pending, setPending] = useState(false)
  const [progress, setProgress] = useState('')

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const corte = data.get('corte')
    const oficinas = data.get('oficinas')
    const signus = data.get('signus')
    const secret = String(data.get('secret') ?? '')
    if (!(corte instanceof File) || !corte.size) {
      setState({ ok: false, error: 'Selecione o arquivo de Corte.' })
      return
    }
    if (!(oficinas instanceof File) || !oficinas.size) {
      setState({ ok: false, error: 'Selecione o arquivo de Oficinas.' })
      return
    }
    if (!(signus instanceof File) || !signus.size) {
      setState({ ok: false, error: 'Selecione o arquivo Signus.' })
      return
    }

    setPending(true)
    setState(null)
    try {
      setProgress('Lendo as planilhas…')
      const payload = await snapshotFromFiles(corte, oficinas, signus)
      const errors = checkInvariants(payload.snapshot)
      if (errors.length) {
        setState({
          ok: false,
          error: `Invariantes falharam; carga anterior mantida. ${errors.join(' | ')}`,
        })
        return
      }
      setProgress('Enviando a carga…')
      const gzipped = await gzipJson(payload)
      const { upload } = await import('@vercel/blob/client')
      await upload(CLOUD_SNAPSHOT_BLOB, gzipped, {
        access: 'private',
        handleUploadUrl: '/api/blob/upload',
        clientPayload: secret,
        multipart: true,
        contentType: 'application/gzip',
      })
      setProgress('Gravando no site…')
      const result = await aplicarCargaRemota(secret)
      setState(result)
      if (result.ok) form.reset()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setState({ ok: false, error: message })
    } finally {
      setPending(false)
      setProgress('')
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col items-end gap-2">
      <label className="w-full text-right text-[11px] text-muted-foreground">
        Corte (.xlsx)
        <Input name="corte" type="file" accept=".xlsx,.xls" required className="mt-1 cursor-pointer" />
      </label>
      <label className="w-full text-right text-[11px] text-muted-foreground">
        Oficinas (.xlsx)
        <Input name="oficinas" type="file" accept=".xlsx,.xls" className="mt-1" required />
      </label>
      <label className="w-full text-right text-[11px] text-muted-foreground">
        Signus (.xls)
        <Input name="signus" type="file" accept=".xlsx,.xls" className="mt-1" required />
      </label>
      <label className="w-full text-right text-[11px] text-muted-foreground">
        Senha (se configurada)
        <Input name="secret" type="password" autoComplete="current-password" className="mt-1" />
      </label>
      <span className="action-glow">
        <Button type="submit" disabled={pending} className="action-glow-face">
          <RefreshCw className={pending ? 'animate-spin' : undefined} />
          {pending ? progress || 'Atualizando…' : 'Enviar planilhas'}
        </Button>
      </span>
      <StatusMessage state={state} />
    </form>
  )
}

async function snapshotFromFiles(
  corte: File,
  oficinas: File,
  signus: File,
): Promise<SnapshotPayload> {
  const [corteWb, oficinasWb, signusWb] = await Promise.all([
    readWorkbookFile(corte),
    readWorkbookFile(oficinas),
    readWorkbookFile(signus),
  ])
  return {
    snapshot: buildSnapshotFromWorkbooks(corteWb, oficinasWb, signusWb),
    cortePath: corte.name,
    oficinasPath: oficinas.name,
    signusPath: signus.name,
    corteLastWrite: new Date(corte.lastModified).toISOString(),
    oficinasLastWrite: new Date(oficinas.lastModified).toISOString(),
    signusLastWrite: new Date(signus.lastModified).toISOString(),
  }
}

async function readWorkbookFile(file: File) {
  const buffer = new Uint8Array(await file.arrayBuffer())
  return XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
    cellNF: false,
    cellText: false,
  })
}

async function gzipJson(payload: SnapshotPayload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))
  return new File([await new Response(stream).blob()], 'carga.json.gz', {
    type: 'application/gzip',
  })
}

function StatusMessage({ state }: { state: RefreshResult | null }) {
  if (!state) return null
  if (state.ok) {
    return (
      <p className="max-w-xs text-right text-xs text-muted-foreground">
        Carga 2026 atualizada.
      </p>
    )
  }
  return (
    <p className="max-w-sm text-right text-xs text-destructive">{state.error}</p>
  )
}
