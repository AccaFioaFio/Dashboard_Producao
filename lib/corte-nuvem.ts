import { createAdminClient, createAnonClient, isSupabaseConfigured } from '@/lib/supabase/admin'
import { CARGA_BUCKET } from '@/lib/supabase/constants'

/** Lançamento do corte fora do SQLite da carga (esse arquivo é trocado a cada publicação). */
export type CorteNuvemLancamento = {
  qtdReal: number | null
  qtdVolumes: number | null
  dataInicio: string | null
  dataFinal: string | null
  responsavel: string | null
  avisoDataFinal: string | null
  nomeProduto: string | null
  atualizadoEm: string
}

export type CorteNuvemAlertaItem = {
  codProduto: string
  nomeProduto: string | null
  qtdReal: number | null
  dataInicio: string | null
  dataFinal: string
  responsavel: string | null
}

export type CorteNuvemAlerta = {
  id: string
  pedidoNorm: string
  cliente: string | null
  enviadoEm: string
  vistoEm: string | null
  itens: CorteNuvemAlertaItem[]
}

const PREFIXO = 'corte-operacao'

function trechoSeguro(value: string) {
  const limpo = value.trim().replace(/[^A-Za-z0-9._-]+/g, '_')
  return limpo.slice(0, 80)
}

function caminhoItem(pedidoNorm: string, codProduto: string) {
  return `${PREFIXO}/${trechoSeguro(pedidoNorm)}/${trechoSeguro(codProduto)}.json`
}

function caminhoAlerta(id: string) {
  return `${PREFIXO}/_alertas/${trechoSeguro(id)}.json`
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

function lancamentoDe(raw: unknown): CorteNuvemLancamento | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const atualizadoEm = texto(row.atualizadoEm)
  if (!atualizadoEm) return null
  return {
    qtdReal: numero(row.qtdReal),
    qtdVolumes: numero(row.qtdVolumes),
    dataInicio: texto(row.dataInicio),
    dataFinal: texto(row.dataFinal),
    responsavel: texto(row.responsavel),
    avisoDataFinal: texto(row.avisoDataFinal),
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

/**
 * Cópias mais novas vencem. Se a data final é a mesma e só a mais antiga
 * ainda tem o aviso da lista, a marca fica: um salvamento de campo pode
 * reescrever a nuvem sem o aviso.
 */
export function escolherLancamento(
  local: CorteNuvemLancamento | undefined,
  nuvem: CorteNuvemLancamento | undefined,
) {
  if (!local) return nuvem
  if (!nuvem) return local
  const maisNovo = local.atualizadoEm >= nuvem.atualizadoEm ? local : nuvem
  const outro = maisNovo === local ? nuvem : local
  const nomeProduto = maisNovo.nomeProduto ?? outro.nomeProduto
  if (
    maisNovo.dataFinal &&
    maisNovo.dataFinal === outro.dataFinal &&
    outro.avisoDataFinal === outro.dataFinal &&
    maisNovo.avisoDataFinal !== maisNovo.dataFinal
  ) {
    return { ...maisNovo, avisoDataFinal: outro.avisoDataFinal, nomeProduto }
  }
  if (nomeProduto === maisNovo.nomeProduto) return maisNovo
  return { ...maisNovo, nomeProduto }
}

export async function lerLancamentosNuvem(pedidoNorm: string) {
  const mapa = new Map<string, CorteNuvemLancamento>()
  const client = clienteLeitura()
  const pedido = trechoSeguro(pedidoNorm)
  if (!client || !pedido) return mapa

  const { data, error } = await client.storage.from(CARGA_BUCKET).list(`${PREFIXO}/${pedido}`, {
    limit: 200,
  })
  if (error || !data?.length) return mapa

  await Promise.all(
    data
      .filter((item) => item.name.endsWith('.json'))
      .map(async (item) => {
        const codProduto = item.name.replace(/\.json$/, '')
        const bruto = await baixarJson(`${PREFIXO}/${pedido}/${item.name}`)
        const lancamento = lancamentoDe(bruto)
        if (lancamento) mapa.set(codProduto, lancamento)
      }),
  )
  return mapa
}

export async function gravarLancamentoNuvem(
  pedidoNorm: string,
  codProduto: string,
  lancamento: Omit<CorteNuvemLancamento, 'avisoDataFinal' | 'atualizadoEm' | 'nomeProduto'> & {
    avisoDataFinal?: string | null
    nomeProduto?: string | null
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = clienteEscrita()
  if (!client) {
    if (!isSupabaseConfigured()) return { ok: true }
    return {
      ok: false,
      error:
        'Falta SUPABASE_SERVICE_ROLE_KEY. Sem ela o lançamento some ao reabrir o corte.',
    }
  }

  const path = caminhoItem(pedidoNorm, codProduto)
  const anterior = lancamentoDe(await baixarJson(path))
  const dataFinal = lancamento.dataFinal
  const avisoInformado = 'avisoDataFinal' in lancamento
  let avisoDataFinal: string | null = dataFinal
    ? avisoInformado
      ? (lancamento.avisoDataFinal ?? null)
      : (anterior?.avisoDataFinal ?? null)
    : null
  if (!avisoInformado && dataFinal && avisoDataFinal !== dataFinal) {
    const recente = lancamentoDe(await baixarJson(path))
    if (recente?.dataFinal === dataFinal && recente.avisoDataFinal === dataFinal) {
      avisoDataFinal = dataFinal
    }
  }
  const corpo: CorteNuvemLancamento = {
    qtdReal: lancamento.qtdReal,
    qtdVolumes: lancamento.qtdVolumes,
    dataInicio: lancamento.dataInicio,
    dataFinal,
    responsavel: lancamento.responsavel,
    avisoDataFinal,
    nomeProduto:
      lancamento.nomeProduto !== undefined
        ? lancamento.nomeProduto
        : (anterior?.nomeProduto ?? null),
    atualizadoEm: new Date().toISOString(),
  }
  const { error } = await client.storage.from(CARGA_BUCKET).upload(path, JSON.stringify(corpo), {
    upsert: true,
    contentType: 'application/json',
    cacheControl: '0',
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function apagarLancamentoNuvem(
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
  const { error } = await client.storage.from(CARGA_BUCKET).remove([caminhoItem(pedidoNorm, codProduto)])
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function marcarAvisoNuvem(
  pedidoNorm: string,
  codProduto: string,
  dataFinal: string,
  fallback?: Omit<CorteNuvemLancamento, 'avisoDataFinal' | 'atualizadoEm'>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const atual = lancamentoDe(await baixarJson(caminhoItem(pedidoNorm, codProduto)))
  const base = atual ?? fallback
  if (!base) return { ok: true }
  return gravarLancamentoNuvem(pedidoNorm, codProduto, {
    ...base,
    dataFinal,
    avisoDataFinal: dataFinal,
  })
}

function alertaDe(raw: unknown, id: string): CorteNuvemAlerta | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const pedidoNorm = texto(row.pedidoNorm)
  const enviadoEm = texto(row.enviadoEm)
  if (!pedidoNorm || !enviadoEm) return null
  const itensBrutos = Array.isArray(row.itens) ? row.itens : []
  const itens: CorteNuvemAlertaItem[] = []
  for (const item of itensBrutos) {
    if (!item || typeof item !== 'object') continue
    const linha = item as Record<string, unknown>
    const codProduto = texto(linha.codProduto)
    const dataFinal = texto(linha.dataFinal)
    if (!codProduto || !dataFinal) continue
    itens.push({
      codProduto,
      nomeProduto: texto(linha.nomeProduto),
      qtdReal: numero(linha.qtdReal),
      dataInicio: texto(linha.dataInicio),
      dataFinal,
      responsavel: texto(linha.responsavel),
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

export async function listarAlertasNuvem(): Promise<CorteNuvemAlerta[]> {
  const client = clienteLeitura()
  if (!client) return []
  const { data, error } = await client.storage.from(CARGA_BUCKET).list(`${PREFIXO}/_alertas`, {
    limit: 100,
    sortBy: { column: 'name', order: 'desc' },
  })
  if (error || !data?.length) return []

  const alertas = await Promise.all(
    data
      .filter((item) => item.name.endsWith('.json'))
      .map(async (item) => {
        const id = item.name.replace(/\.json$/, '')
        return alertaDe(await baixarJson(caminhoAlerta(id)), id)
      }),
  )
  return alertas.filter((alerta): alerta is CorteNuvemAlerta => Boolean(alerta))
}

export async function criarAlertaNuvem(
  alerta: CorteNuvemAlerta,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = clienteEscrita()
  if (!client) {
    if (!isSupabaseConfigured()) return { ok: true }
    return { ok: false, error: 'Falta SUPABASE_SERVICE_ROLE_KEY para gravar o alerta.' }
  }
  const { error } = await client.storage
    .from(CARGA_BUCKET)
    .upload(caminhoAlerta(alerta.id), JSON.stringify(alerta), {
      upsert: true,
      contentType: 'application/json',
      cacheControl: '0',
    })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function marcarAlertaNuvemVisto(id: string) {
  const alerta = alertaDe(await baixarJson(caminhoAlerta(id)), id)
  if (!alerta || alerta.vistoEm) return { ok: true as const }
  const client = clienteEscrita()
  if (!client) return { ok: true as const }
  const { error } = await client.storage
    .from(CARGA_BUCKET)
    .upload(
      caminhoAlerta(id),
      JSON.stringify({ ...alerta, vistoEm: new Date().toISOString() }),
      { upsert: true, contentType: 'application/json', cacheControl: '0' },
    )
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}
