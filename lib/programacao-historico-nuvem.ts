import {
  createAdminClient,
  createAnonClient,
  isSupabaseConfigured,
} from '@/lib/supabase/admin'
import { CARGA_BUCKET } from '@/lib/supabase/constants'
import type {
  ProgramacaoHistoricoAcao,
  ProgramacaoHistoricoEvento,
} from '@/lib/programacao-historico'

const PREFIXO = 'programacao-historico'

const ACOES: ProgramacaoHistoricoAcao[] = [
  'salvar_pedido',
  'excluir_pedido',
  'excluir_item',
]

function trechoSeguro(value: string) {
  const limpo = value.trim().replace(/[^A-Za-z0-9._-]+/g, '_')
  return limpo.slice(0, 80)
}

export function caminhoHistoricoProgramacao(id: string) {
  return `${PREFIXO}/${trechoSeguro(id)}.json`
}

function clienteLeitura() {
  if (!isSupabaseConfigured()) return null
  return createAdminClient() ?? createAnonClient()
}

function clienteEscrita() {
  return createAdminClient()
}

function texto(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function acaoDe(value: unknown): ProgramacaoHistoricoAcao | null {
  return typeof value === 'string' && ACOES.includes(value as ProgramacaoHistoricoAcao)
    ? (value as ProgramacaoHistoricoAcao)
    : null
}

function eventoDe(raw: unknown): ProgramacaoHistoricoEvento | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = texto(row.id)
  const ocorridoEm = texto(row.ocorridoEm)
  const usuarioLogin = texto(row.usuarioLogin)
  const acao = acaoDe(row.acao)
  const detalhe = texto(row.detalhe)
  if (!id || !ocorridoEm || !usuarioLogin || !acao || !detalhe) return null
  return {
    id,
    ocorridoEm,
    usuarioLogin,
    acao,
    pedido: texto(row.pedido),
    pedidoNorm: texto(row.pedidoNorm),
    cliente: texto(row.cliente),
    itemKey: texto(row.itemKey),
    itemNome: texto(row.itemNome),
    detalhe,
  }
}

async function baixarJson(path: string) {
  const client = clienteLeitura()
  if (!client) return null
  const { data, error } = await client.storage.from(CARGA_BUCKET).download(path)
  if (error || !data) return null
  try {
    return JSON.parse(await data.text()) as unknown
  } catch {
    return null
  }
}

export async function listarHistoricoProgramacaoNuvem(): Promise<
  ProgramacaoHistoricoEvento[]
> {
  const client = clienteLeitura()
  if (!client) return []

  const arquivos: string[] = []
  const page = 1000
  let offset = 0
  for (;;) {
    const { data, error } = await client.storage.from(CARGA_BUCKET).list(PREFIXO, {
      limit: page,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error || !data?.length) break
    for (const item of data) {
      if (item.name?.endsWith('.json')) arquivos.push(item.name)
    }
    if (data.length < page) break
    offset += data.length
  }

  if (!arquivos.length) return []

  const out: ProgramacaoHistoricoEvento[] = []
  const batchSize = 8
  for (let i = 0; i < arquivos.length; i += batchSize) {
    const batch = arquivos.slice(i, i + batchSize)
    const lidos = await Promise.all(
      batch.map((nome) => baixarJson(`${PREFIXO}/${nome}`)),
    )
    for (const bruto of lidos) {
      const evento = eventoDe(bruto)
      if (evento) out.push(evento)
    }
  }
  return out
}

export async function gravarHistoricoProgramacaoNuvem(
  evento: ProgramacaoHistoricoEvento,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = clienteEscrita()
  if (!client) {
    if (!isSupabaseConfigured()) return { ok: true }
    return {
      ok: false,
      error:
        'Falta SUPABASE_SERVICE_ROLE_KEY. Sem ela o histórico não aparece no celular.',
    }
  }

  const path = caminhoHistoricoProgramacao(evento.id)
  const { error } = await client.storage
    .from(CARGA_BUCKET)
    .upload(path, JSON.stringify(evento), {
      upsert: false,
      contentType: 'application/json',
      cacheControl: '0',
    })
  if (error) {
    // Já existe: append-only — não sobrescreve.
    if (/exists|already|duplicate/i.test(error.message)) return { ok: true }
    return { ok: false, error: error.message }
  }
  return { ok: true }
}
