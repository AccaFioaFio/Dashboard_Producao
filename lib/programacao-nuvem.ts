import {
  createAdminClient,
  createAnonClient,
  isSupabaseConfigured,
} from '@/lib/supabase/admin'
import { CARGA_BUCKET } from '@/lib/supabase/constants'
import type { LinhaProgramacao } from '@/lib/programacao'

/** Pedido completo na nuvem (sobrevive à troca do SQLite da carga). */
export type ProgramacaoNuvemPedido = {
  pedido: string
  pedidoNorm: string | null
  cliente: string | null
  linhas: LinhaProgramacao[]
  savedAt: string
}

const PREFIXO = 'programacao-operacao'

function trechoSeguro(value: string) {
  const limpo = value.trim().replace(/[^A-Za-z0-9._-]+/g, '_')
  return limpo.slice(0, 80)
}

function chavePedido(pedido: string, pedidoNorm: string | null) {
  return (pedidoNorm ?? pedido).trim()
}

export function caminhoPedidoProgramacao(
  pedido: string,
  pedidoNorm: string | null,
) {
  return `${PREFIXO}/${trechoSeguro(chavePedido(pedido, pedidoNorm))}.json`
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

function numero(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function linhaDe(raw: unknown): LinhaProgramacao | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const key = texto(row.key)
  const pedido = texto(row.pedido)
  const nome = texto(row.nome)
  const quantidadeProducao = texto(row.quantidadeProducao)
  const dataInicio = texto(row.dataInicio)
  const dataFim = texto(row.dataFim)
  const savedAt = texto(row.savedAt)
  const itemId = texto(row.itemId)
  if (
    !key ||
    !pedido ||
    !nome ||
    !quantidadeProducao ||
    !dataInicio ||
    !dataFim ||
    !savedAt ||
    !itemId
  ) {
    return null
  }
  return {
    key,
    pedido,
    pedidoNorm: texto(row.pedidoNorm),
    cliente: texto(row.cliente),
    itemId,
    codProduto: texto(row.codProduto) ?? '',
    nome,
    qtdPedido: numero(row.qtdPedido),
    quantidadeProducao,
    dataInicio,
    dataFim,
    savedAt,
  }
}

function pedidoDe(raw: unknown): ProgramacaoNuvemPedido | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const pedido = texto(row.pedido)
  const savedAt = texto(row.savedAt)
  if (!pedido || !savedAt) return null
  const linhasRaw = Array.isArray(row.linhas) ? row.linhas : []
  const linhas = linhasRaw
    .map(linhaDe)
    .filter((linha): linha is LinhaProgramacao => linha != null)
  return {
    pedido,
    pedidoNorm: texto(row.pedidoNorm),
    cliente: texto(row.cliente),
    linhas,
    savedAt,
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

export async function listarPedidosProgramacaoNuvem(): Promise<
  ProgramacaoNuvemPedido[]
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

  const out: ProgramacaoNuvemPedido[] = []
  const batchSize = 8
  for (let i = 0; i < arquivos.length; i += batchSize) {
    const batch = arquivos.slice(i, i + batchSize)
    const lidos = await Promise.all(
      batch.map((nome) => baixarJson(`${PREFIXO}/${nome}`)),
    )
    for (const bruto of lidos) {
      const pedido = pedidoDe(bruto)
      if (pedido) out.push(pedido)
    }
  }
  return out
}

export async function gravarPedidoProgramacaoNuvem(
  pedido: ProgramacaoNuvemPedido,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = clienteEscrita()
  if (!client) {
    if (!isSupabaseConfigured()) return { ok: true }
    return {
      ok: false,
      error:
        'Falta SUPABASE_SERVICE_ROLE_KEY. Sem ela a programação não aparece no celular.',
    }
  }

  const path = caminhoPedidoProgramacao(pedido.pedido, pedido.pedidoNorm)
  const corpo: ProgramacaoNuvemPedido = {
    ...pedido,
    savedAt: pedido.savedAt || new Date().toISOString(),
  }
  const { error } = await client.storage
    .from(CARGA_BUCKET)
    .upload(path, JSON.stringify(corpo), {
      upsert: true,
      contentType: 'application/json',
      cacheControl: '0',
    })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function apagarPedidoProgramacaoNuvem(
  pedido: string,
  pedidoNorm: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = clienteEscrita()
  if (!client) {
    if (!isSupabaseConfigured()) return { ok: true }
    return {
      ok: false,
      error: 'Falta SUPABASE_SERVICE_ROLE_KEY para apagar a programação na nuvem.',
    }
  }
  const path = caminhoPedidoProgramacao(pedido, pedidoNorm)
  const { error } = await client.storage.from(CARGA_BUCKET).remove([path])
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
