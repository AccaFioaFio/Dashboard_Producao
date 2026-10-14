import { createAdminClient, createAnonClient, isSupabaseConfigured } from '@/lib/supabase/admin'
import { CARGA_BUCKET } from '@/lib/supabase/constants'
import { ETAPAS_APONTAMENTO, type EtapaApontamento } from '@/lib/apontamento'

export type ApontamentoNuvem = {
  codProduto: string
  origem: string | null
  qtdPecas: number | null
  dataProducao: string | null
  responsavel: string | null
  avisoDataProducao: string | null
  observacao: string | null
  nomeProduto: string | null
  atualizadoEm: string
}

export type ApontamentoNuvemAlertaItem = {
  codProduto: string
  nomeProduto: string | null
  qtdPecas: number | null
  dataProducao: string
  responsavel: string | null
  origem?: string | null
}

export type ApontamentoNuvemAlerta = {
  id: string
  pedidoNorm: string
  cliente: string | null
  enviadoEm: string
  vistoEm: string | null
  itens: ApontamentoNuvemAlertaItem[]
}

function trechoSeguro(value: string) {
  const limpo = value.trim().replace(/[^A-Za-z0-9._-]+/g, '_')
  return limpo.slice(0, 80)
}

function caminhoItem(etapa: EtapaApontamento, pedidoNorm: string, codProduto: string) {
  return `${ETAPAS_APONTAMENTO[etapa].nuvem}/${trechoSeguro(pedidoNorm)}/${trechoSeguro(codProduto)}.json`
}

function caminhoAlerta(etapa: EtapaApontamento, id: string) {
  return `${ETAPAS_APONTAMENTO[etapa].nuvem}/_alertas/${trechoSeguro(id)}.json`
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

function lancamentoDe(raw: unknown, codArquivo?: string): ApontamentoNuvem | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const atualizadoEm = texto(row.atualizadoEm)
  const codProduto = texto(row.codProduto) ?? codArquivo ?? null
  if (!atualizadoEm || !codProduto) return null
  return {
    codProduto,
    origem: texto(row.origem),
    qtdPecas: numero(row.qtdPecas),
    dataProducao: texto(row.dataProducao),
    responsavel: texto(row.responsavel),
    avisoDataProducao: texto(row.avisoDataProducao),
    observacao: texto(row.observacao),
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

export type ApontamentoNuvemComPedido = ApontamentoNuvem & { pedidoNorm: string }

/** Lista pastas de pedido em costura-operacao / revisao-operacao (sem _alertas). */
async function listarPastasPedidoNuvem(etapa: EtapaApontamento): Promise<string[]> {
  const client = clienteLeitura()
  if (!client) return []
  const prefixo = ETAPAS_APONTAMENTO[etapa].nuvem
  const pastas: string[] = []
  const page = 1000
  let offset = 0
  for (;;) {
    const { data, error } = await client.storage.from(CARGA_BUCKET).list(prefixo, {
      limit: page,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error || !data?.length) break
    for (const item of data) {
      if (!item.name || item.name === '_alertas') continue
      if (item.name.endsWith('.json')) continue
      pastas.push(item.name)
    }
    if (data.length < page) break
    offset += data.length
  }
  return pastas
}

/**
 * Todos os lançamentos da etapa na nuvem (JSON no Storage).
 * Usado para o KPI somar planilha + tela mesmo quando o SQLite publicado veio sem eles.
 */
export async function listarTodosApontamentosNuvem(
  etapa: EtapaApontamento,
): Promise<ApontamentoNuvemComPedido[]> {
  const pastas = await listarPastasPedidoNuvem(etapa)
  if (!pastas.length) return []

  const out: ApontamentoNuvemComPedido[] = []
  const batchSize = 8
  for (let i = 0; i < pastas.length; i += batchSize) {
    const batch = pastas.slice(i, i + batchSize)
    const mapas = await Promise.all(batch.map((pedido) => lerApontamentoNuvem(etapa, pedido)))
    for (let j = 0; j < batch.length; j += 1) {
      const pedidoNorm = batch[j]
      for (const lancamento of mapas[j].values()) {
        out.push({ ...lancamento, pedidoNorm })
      }
    }
  }
  return out
}

export type ApontamentoNuvemGravacao = Omit<
  ApontamentoNuvem,
  'atualizadoEm' | 'avisoDataProducao'
> & {
  avisoDataProducao?: string | null
}

export async function gravarApontamentoNuvem(
  etapa: EtapaApontamento,
  pedidoNorm: string,
  lancamento: ApontamentoNuvemGravacao,
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
  const avisoInformado = Object.prototype.hasOwnProperty.call(
    lancamento,
    'avisoDataProducao',
  )
  const avisoDataProducao: string | null = avisoInformado
    ? (lancamento.avisoDataProducao ?? null)
    : (anterior?.avisoDataProducao ?? null)

  const corpo: ApontamentoNuvem = {
    codProduto: lancamento.codProduto,
    origem: lancamento.origem,
    qtdPecas: lancamento.qtdPecas,
    dataProducao: lancamento.dataProducao,
    responsavel: lancamento.responsavel,
    avisoDataProducao,
    observacao: lancamento.observacao ?? null,
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

export async function marcarAvisoApontamentoNuvem(
  etapa: EtapaApontamento,
  pedidoNorm: string,
  codProduto: string,
  dataProducao: string,
  fallback?: ApontamentoNuvemGravacao,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const atual = lancamentoDe(await baixarJson(caminhoItem(etapa, pedidoNorm, codProduto)))
  const base = atual ?? fallback
  if (!base) return { ok: true }
  return gravarApontamentoNuvem(etapa, pedidoNorm, {
    codProduto: base.codProduto,
    origem: base.origem,
    qtdPecas: base.qtdPecas,
    dataProducao,
    responsavel: base.responsavel,
    observacao: base.observacao,
    nomeProduto: base.nomeProduto,
    avisoDataProducao: dataProducao,
  })
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

function alertaDe(raw: unknown, id: string): ApontamentoNuvemAlerta | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const pedidoNorm = texto(row.pedidoNorm)
  const enviadoEm = texto(row.enviadoEm)
  if (!pedidoNorm || !enviadoEm) return null
  const itensBrutos = Array.isArray(row.itens) ? row.itens : []
  const itens: ApontamentoNuvemAlertaItem[] = []
  for (const item of itensBrutos) {
    if (!item || typeof item !== 'object') continue
    const linha = item as Record<string, unknown>
    const codProduto = texto(linha.codProduto)
    const dataProducao = texto(linha.dataProducao)
    if (!codProduto || !dataProducao) continue
    itens.push({
      codProduto,
      nomeProduto: texto(linha.nomeProduto),
      qtdPecas: numero(linha.qtdPecas),
      dataProducao,
      responsavel: texto(linha.responsavel),
      origem: texto(linha.origem),
    })
  }
  return {
    id: texto(row.id) ?? id,
    pedidoNorm,
    cliente: texto(row.cliente),
    enviadoEm,
    vistoEm: texto(row.vistoEm),
    itens,
  }
}

export async function listarAlertasApontamentoNuvem(
  etapa: EtapaApontamento,
): Promise<ApontamentoNuvemAlerta[]> {
  const client = clienteLeitura()
  if (!client) return []
  const { data, error } = await client.storage
    .from(CARGA_BUCKET)
    .list(`${ETAPAS_APONTAMENTO[etapa].nuvem}/_alertas`, {
      limit: 100,
      sortBy: { column: 'name', order: 'desc' },
    })
  if (error || !data?.length) return []

  const alertas = await Promise.all(
    data
      .filter((item) => item.name.endsWith('.json'))
      .map(async (item) => {
        const id = item.name.replace(/\.json$/, '')
        return alertaDe(await baixarJson(caminhoAlerta(etapa, id)), id)
      }),
  )
  return alertas.filter((alerta): alerta is ApontamentoNuvemAlerta => Boolean(alerta))
}

export async function criarAlertaApontamentoNuvem(
  etapa: EtapaApontamento,
  alerta: ApontamentoNuvemAlerta,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = clienteEscrita()
  if (!client) {
    if (!isSupabaseConfigured()) return { ok: true }
    return { ok: false, error: 'Falta SUPABASE_SERVICE_ROLE_KEY para gravar o alerta.' }
  }
  const { error } = await client.storage
    .from(CARGA_BUCKET)
    .upload(caminhoAlerta(etapa, alerta.id), JSON.stringify(alerta), {
      upsert: true,
      contentType: 'application/json',
      cacheControl: '0',
    })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function marcarAlertaApontamentoNuvemVisto(
  etapa: EtapaApontamento,
  id: string,
) {
  const alerta = alertaDe(await baixarJson(caminhoAlerta(etapa, id)), id)
  if (!alerta || alerta.vistoEm) return { ok: true as const }
  const client = clienteEscrita()
  if (!client) return { ok: true as const }
  const { error } = await client.storage
    .from(CARGA_BUCKET)
    .upload(
      caminhoAlerta(etapa, id),
      JSON.stringify({ ...alerta, vistoEm: new Date().toISOString() }),
      { upsert: true, contentType: 'application/json', cacheControl: '0' },
    )
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}
