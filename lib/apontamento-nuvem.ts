import { createAdminClient, createAnonClient, isSupabaseConfigured } from '@/lib/supabase/admin'
import { CARGA_BUCKET } from '@/lib/supabase/constants'
import { ETAPAS_APONTAMENTO, type EtapaApontamento } from '@/lib/apontamento'

export type ApontamentoNuvem = {
  codProduto: string
  origem: string | null
  qtdPecas: number | null
  dataProducao: string | null
  responsavel: string | null
  nomeProduto: string | null
  atualizadoEm: string
}

function trechoSeguro(value: string) {
  const limpo = value.trim().replace(/[^A-Za-z0-9._-]+/g, '_')
  return limpo.slice(0, 80)
}

function caminhoItem(etapa: EtapaApontamento, pedidoNorm: string, codProduto: string) {
  return `${ETAPAS_APONTAMENTO[etapa].nuvem}/${trechoSeguro(pedidoNorm)}/${trechoSeguro(codProduto)}.json`
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

function lancamentoDe(raw: unknown, codArquivo: string): ApontamentoNuvem | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const atualizadoEm = texto(row.atualizadoEm)
  const codProduto = texto(row.codProduto) ?? codArquivo
  if (!atualizadoEm || !codProduto) return null
  return {
    codProduto,
    origem: texto(row.origem),
    qtdPecas: numero(row.qtdPecas),
    dataProducao: texto(row.dataProducao),
    responsavel: texto(row.responsavel),
    nomeProduto: texto(row.nomeProduto),
    atualizadoEm,
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

export async function lerApontamentoNuvem(etapa: EtapaApontamento, pedidoNorm: string) {
  const mapa = new Map<string, ApontamentoNuvem>()
  const client = clienteLeitura()
  const pedido = trechoSeguro(pedidoNorm)
  const prefixo = ETAPAS_APONTAMENTO[etapa].nuvem
  if (!client || !pedido) return mapa

  const { data, error } = await client.storage.from(CARGA_BUCKET).list(`${prefixo}/${pedido}`, {
    limit: 200,
  })
  if (error || !data?.length) return mapa

  await Promise.all(
    data
      .filter((item) => item.name.endsWith('.json'))
      .map(async (item) => {
        const codArquivo = item.name.replace(/\.json$/, '')
        const lancamento = lancamentoDe(
          await baixarJson(`${prefixo}/${pedido}/${item.name}`),
          codArquivo,
        )
        if (lancamento) mapa.set(lancamento.codProduto, lancamento)
      }),
  )
  return mapa
}

export async function gravarApontamentoNuvem(
  etapa: EtapaApontamento,
  pedidoNorm: string,
  lancamento: Omit<ApontamentoNuvem, 'atualizadoEm'>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = clienteEscrita()
  if (!client) {
    if (!isSupabaseConfigured()) return { ok: true }
    return {
      ok: false,
      error: 'Falta SUPABASE_SERVICE_ROLE_KEY. Sem ela o lançamento some ao reabrir a tela.',
    }
  }

  const path = caminhoItem(etapa, pedidoNorm, lancamento.codProduto)
  const anterior = lancamentoDe(await baixarJson(path))
  const corpo: ApontamentoNuvem = {
    ...lancamento,
    nomeProduto: lancamento.nomeProduto ?? anterior?.nomeProduto ?? null,
    atualizadoEm: new Date().toISOString(),
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

export async function apagarApontamentoNuvem(
  etapa: EtapaApontamento,
  pedidoNorm: string,
  codProduto: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = clienteEscrita()
  if (!client) {
    if (!isSupabaseConfigured()) return { ok: true }
    return {
      ok: false,
      error: 'Falta SUPABASE_SERVICE_ROLE_KEY para apagar o lançamento na nuvem.',
    }
  }
  const { error } = await client.storage
    .from(CARGA_BUCKET)
    .remove([caminhoItem(etapa, pedidoNorm, codProduto)])
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
