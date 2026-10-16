import { createAdminClient, createAnonClient, isSupabaseConfigured } from '@/lib/supabase/admin'
import { CARGA_BUCKET } from '@/lib/supabase/constants'
import { ETAPAS_APONTAMENTO, type EtapaApontamento } from '@/lib/apontamento'

/** Uma soma parcial (pode ser em datas diferentes do mesmo produto). */
export type ApontamentoNuvemEntrada = {
  excelRow: number
  origem: string | null
  oficina: string | null
  qtdPecas: number | null
  dataProducao: string | null
  responsavel: string | null
  avisoDataProducao: string | null
  observacao: string | null
  atualizadoEm: string
}

export type ApontamentoNuvem = {
  codProduto: string
  origem: string | null
  oficina: string | null
  qtdPecas: number | null
  dataProducao: string | null
  responsavel: string | null
  avisoDataProducao: string | null
  observacao: string | null
  nomeProduto: string | null
  atualizadoEm: string
  /** Entradas parciais; se ausente, o documento legado conta como uma entrada. */
  entradas?: ApontamentoNuvemEntrada[]
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

function entradaDe(raw: unknown): ApontamentoNuvemEntrada | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const atualizadoEm = texto(row.atualizadoEm)
  const excelRow = numero(row.excelRow)
  if (!atualizadoEm || excelRow == null || !Number.isInteger(excelRow)) return null
  return {
    excelRow,
    origem: texto(row.origem),
    oficina: texto(row.oficina),
    qtdPecas: numero(row.qtdPecas),
    dataProducao: texto(row.dataProducao),
    responsavel: texto(row.responsavel),
    avisoDataProducao: texto(row.avisoDataProducao),
    observacao: texto(row.observacao),
    atualizadoEm,
  }
}

function agregarEntradas(
  codProduto: string,
  nomeProduto: string | null,
  entradas: ApontamentoNuvemEntrada[],
): ApontamentoNuvem {
  const ordenadas = [...entradas].sort((a, b) =>
    a.atualizadoEm < b.atualizadoEm ? 1 : a.atualizadoEm > b.atualizadoEm ? -1 : 0,
  )
  const recente = ordenadas[0]
  const pecas = ordenadas.reduce((sum, row) => sum + (row.qtdPecas ?? 0), 0)
  return {
    codProduto,
    origem: recente?.origem ?? null,
    oficina: recente?.oficina ?? null,
    qtdPecas: pecas > 0 ? pecas : recente?.qtdPecas ?? null,
    dataProducao: recente?.dataProducao ?? null,
    responsavel: recente?.responsavel ?? null,
    avisoDataProducao: recente?.avisoDataProducao ?? null,
    observacao: recente?.observacao ?? null,
    nomeProduto,
    atualizadoEm: recente?.atualizadoEm ?? new Date().toISOString(),
    entradas: ordenadas,
  }
}

export function entradasDoLancamento(doc: ApontamentoNuvem): ApontamentoNuvemEntrada[] {
  if (doc.entradas?.length) return doc.entradas
  return [
    {
      excelRow: 0,
      origem: doc.origem,
      oficina: doc.oficina,
      qtdPecas: doc.qtdPecas,
      dataProducao: doc.dataProducao,
      responsavel: doc.responsavel,
      avisoDataProducao: doc.avisoDataProducao,
      observacao: doc.observacao,
      atualizadoEm: doc.atualizadoEm,
    },
  ]
}

function lancamentoDe(raw: unknown, codArquivo?: string): ApontamentoNuvem | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const atualizadoEm = texto(row.atualizadoEm)
  const codProduto = texto(row.codProduto) ?? codArquivo ?? null
  if (!atualizadoEm || !codProduto) return null
  const nomeProduto = texto(row.nomeProduto)
  const entradasBrutas = Array.isArray(row.entradas) ? row.entradas : null
  if (entradasBrutas?.length) {
    const entradas = entradasBrutas
      .map((item) => entradaDe(item))
      .filter((item): item is ApontamentoNuvemEntrada => Boolean(item))
    if (entradas.length) return agregarEntradas(codProduto, nomeProduto, entradas)
  }
  return {
    codProduto,
    origem: texto(row.origem),
    oficina: texto(row.oficina),
    qtdPecas: numero(row.qtdPecas),
    dataProducao: texto(row.dataProducao),
    responsavel: texto(row.responsavel),
    avisoDataProducao: texto(row.avisoDataProducao),
    observacao: texto(row.observacao),
    nomeProduto,
    atualizadoEm,
  }
}

type BaixaJson =
  | { status: 'ok'; data: unknown }
  | { status: 'missing' }
  | { status: 'error'; error: string }

function erroStorageNaoEncontrado(error: {
  message?: string
  error?: string
  statusCode?: string | number
  status?: string | number
}) {
  const codigo = String(error.statusCode ?? error.status ?? '')
  const textoErro = `${error.message ?? ''} ${error.error ?? ''} ${codigo}`.toLowerCase()
  return (
    codigo === '404' ||
    textoErro.includes('not found') ||
    textoErro.includes('object not found') ||
    textoErro.includes('no such file')
  )
}

/** Distingue arquivo ausente de falha de rede — erro não pode virar “documento vazio”. */
async function baixarJson(path: string): Promise<BaixaJson> {
  const client = clienteLeitura()
  if (!client) return { status: 'error', error: 'Supabase não configurado para leitura.' }
  const { data, error } = await client.storage.from(CARGA_BUCKET).download(path)
  if (error) {
    if (erroStorageNaoEncontrado(error)) return { status: 'missing' }
    return { status: 'error', error: error.message || 'Falha ao baixar da nuvem.' }
  }
  if (!data) return { status: 'missing' }
  try {
    return { status: 'ok', data: JSON.parse(await data.text()) as unknown }
  } catch {
    return { status: 'error', error: 'JSON inválido na nuvem.' }
  }
}

function unirEntradas(
  base: ApontamentoNuvemEntrada[],
  extras: ApontamentoNuvemEntrada[],
): ApontamentoNuvemEntrada[] {
  const mapa = new Map<number, ApontamentoNuvemEntrada>()
  for (const row of [...base, ...extras]) {
    const atual = mapa.get(row.excelRow)
    if (!atual || row.atualizadoEm >= atual.atualizadoEm) {
      mapa.set(row.excelRow, row)
    }
  }
  return [...mapa.values()]
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
        const baixa = await baixarJson(`${prefixo}/${pedido}/${item.name}`)
        if (baixa.status !== 'ok') return
        const lancamento = lancamentoDe(baixa.data, codArquivo)
        if (lancamento) mapa.set(lancamento.codProduto, lancamento)
      }),
  )
  return mapa
}

export type ApontamentoNuvemComPedido = ApontamentoNuvem & {
  pedidoNorm: string
  excelRow: number
}

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
        for (const entrada of entradasDoLancamento(lancamento)) {
          out.push({
            ...lancamento,
            ...entrada,
            nomeProduto: lancamento.nomeProduto,
            pedidoNorm,
            excelRow: entrada.excelRow,
            entradas: undefined,
          })
        }
      }
    }
  }
  return out
}

export type ApontamentoNuvemGravacao = Omit<
  ApontamentoNuvem,
  'atualizadoEm' | 'avisoDataProducao' | 'entradas'
> & {
  avisoDataProducao?: string | null
  excelRow?: number
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
  const baixa = await baixarJson(path)
  if (baixa.status === 'error') {
    return { ok: false, error: `Não leu a nuvem antes de gravar (${baixa.error}).` }
  }
  const anterior = baixa.status === 'ok' ? lancamentoDe(baixa.data) : null
  const avisoInformado = Object.prototype.hasOwnProperty.call(
    lancamento,
    'avisoDataProducao',
  )
  const agora = new Date().toISOString()
  const avisoDataProducao: string | null = avisoInformado
    ? (lancamento.avisoDataProducao ?? null)
    : (anterior?.avisoDataProducao ?? null)
  const excelRow =
    typeof lancamento.excelRow === 'number' && Number.isInteger(lancamento.excelRow)
      ? lancamento.excelRow
      : 0
  const entradasAnteriores = anterior ? entradasDoLancamento(anterior) : []
  const demais = entradasAnteriores.filter((row) => row.excelRow !== excelRow)
  const entrada: ApontamentoNuvemEntrada = {
    excelRow,
    origem: lancamento.origem,
    oficina: lancamento.oficina ?? null,
    qtdPecas: lancamento.qtdPecas,
    dataProducao: lancamento.dataProducao,
    responsavel: lancamento.responsavel,
    avisoDataProducao,
    observacao: lancamento.observacao ?? null,
    atualizadoEm: agora,
  }
  const corpo = agregarEntradas(
    lancamento.codProduto,
    lancamento.nomeProduto ?? anterior?.nomeProduto ?? null,
    [...demais, entrada],
  )
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

/** Acrescenta uma entrada parcial (outra data / outra soma) sem apagar as anteriores. */
export async function somarEntradaApontamentoNuvem(
  etapa: EtapaApontamento,
  pedidoNorm: string,
  entrada: {
    excelRow: number
    codProduto: string
    origem: string | null
    oficina: string | null
    qtdPecas: number
    dataProducao: string
    responsavel: string
    observacao: string | null
    nomeProduto: string | null
  },
): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  const client = clienteEscrita()
  if (!client) {
    if (!isSupabaseConfigured()) {
      return { ok: true, total: entrada.qtdPecas }
    }
    return {
      ok: false,
      error: 'Falta SUPABASE_SERVICE_ROLE_KEY. Sem ela o lançamento some ao reabrir a tela.',
    }
  }

  const path = caminhoItem(etapa, pedidoNorm, entrada.codProduto)
  const baixa = await baixarJson(path)
  if (baixa.status === 'error') {
    return {
      ok: false,
      error: `Não leu a nuvem antes de somar (${baixa.error}). Tente de novo — o total na nuvem não foi alterado.`,
    }
  }
  const anterior = baixa.status === 'ok' ? lancamentoDe(baixa.data) : null
  const agora = new Date().toISOString()
  const entradas = anterior ? entradasDoLancamento(anterior) : []
  const nova: ApontamentoNuvemEntrada = {
    excelRow: entrada.excelRow,
    origem: entrada.origem,
    oficina: entrada.oficina,
    qtdPecas: entrada.qtdPecas,
    dataProducao: entrada.dataProducao,
    responsavel: entrada.responsavel,
    avisoDataProducao: null,
    observacao: entrada.observacao,
    atualizadoEm: agora,
  }
  const corpo = agregarEntradas(
    entrada.codProduto,
    entrada.nomeProduto ?? anterior?.nomeProduto ?? null,
    unirEntradas(entradas, [nova]),
  )
  const { error } = await client.storage
    .from(CARGA_BUCKET)
    .upload(path, JSON.stringify(corpo), {
      upsert: true,
      contentType: 'application/json',
      cacheControl: '0',
    })
  if (error) return { ok: false, error: error.message }
  return { ok: true, total: corpo.qtdPecas ?? entrada.qtdPecas }
}

export async function marcarAvisoApontamentoNuvem(
  etapa: EtapaApontamento,
  pedidoNorm: string,
  codProduto: string,
  dataProducao: string,
  fallback?: ApontamentoNuvemGravacao,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = clienteEscrita()
  if (!client) {
    if (!isSupabaseConfigured()) return { ok: true }
    return {
      ok: false,
      error: 'Falta SUPABASE_SERVICE_ROLE_KEY para marcar o aviso na nuvem.',
    }
  }
  const path = caminhoItem(etapa, pedidoNorm, codProduto)
  const baixa = await baixarJson(path)
  if (baixa.status === 'error') {
    return { ok: false, error: `Não leu a nuvem para marcar o aviso (${baixa.error}).` }
  }
  const atual = baixa.status === 'ok' ? lancamentoDe(baixa.data) : null
  const agora = new Date().toISOString()
  let entradas = atual ? entradasDoLancamento(atual) : []
  if (!entradas.length && fallback) {
    entradas = [
      {
        excelRow: 0,
        origem: fallback.origem,
        oficina: fallback.oficina ?? null,
        qtdPecas: fallback.qtdPecas,
        dataProducao: fallback.dataProducao,
        responsavel: fallback.responsavel,
        avisoDataProducao: null,
        observacao: fallback.observacao ?? null,
        atualizadoEm: agora,
      },
    ]
  }
  if (!entradas.length) return { ok: true }
  const marcadas = entradas.map((row) =>
    row.dataProducao === dataProducao
      ? { ...row, avisoDataProducao: dataProducao, atualizadoEm: agora }
      : row,
  )
  const corpo = agregarEntradas(
    codProduto,
    atual?.nomeProduto ?? fallback?.nomeProduto ?? null,
    marcadas,
  )
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
        const baixa = await baixarJson(caminhoAlerta(etapa, id))
        if (baixa.status !== 'ok') return null
        return alertaDe(baixa.data, id)
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
  const baixa = await baixarJson(caminhoAlerta(etapa, id))
  if (baixa.status === 'error') {
    return { ok: false as const, error: baixa.error }
  }
  if (baixa.status === 'missing') return { ok: true as const }
  const alerta = alertaDe(baixa.data, id)
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

/**
 * Une entradas locais com o JSON da nuvem (por excel_row, fica a mais nova).
 * Usado para o mobile publicar o que só existia no SQLite da instância.
 */
export async function mesclarEntradasApontamentoNuvem(
  etapa: EtapaApontamento,
  pedidoNorm: string,
  codProduto: string,
  entradasLocais: ApontamentoNuvemEntrada[],
  nomeProduto: string | null,
): Promise<{ ok: true; mudou: boolean } | { ok: false; error: string }> {
  if (!entradasLocais.length) return { ok: true, mudou: false }
  const client = clienteEscrita()
  if (!client) {
    if (!isSupabaseConfigured()) return { ok: true, mudou: false }
    return {
      ok: false,
      error: 'Falta SUPABASE_SERVICE_ROLE_KEY para publicar lançamentos na nuvem.',
    }
  }

  const path = caminhoItem(etapa, pedidoNorm, codProduto)
  const baixa = await baixarJson(path)
  if (baixa.status === 'error') {
    return { ok: false, error: baixa.error }
  }
  const anterior = baixa.status === 'ok' ? lancamentoDe(baixa.data, trechoSeguro(codProduto)) : null
  const entradasNuvem = anterior ? entradasDoLancamento(anterior) : []
  const unidas = unirEntradas(entradasNuvem, entradasLocais)
  const mudou =
    unidas.length !== entradasNuvem.length ||
    unidas.some((row) => {
      const remoto = entradasNuvem.find((item) => item.excelRow === row.excelRow)
      return !remoto || remoto.atualizadoEm < row.atualizadoEm
    })
  if (!mudou) return { ok: true, mudou: false }

  const corpo = agregarEntradas(
    codProduto,
    nomeProduto ?? anterior?.nomeProduto ?? null,
    unidas,
  )
  const { error } = await client.storage
    .from(CARGA_BUCKET)
    .upload(path, JSON.stringify(corpo), {
      upsert: true,
      contentType: 'application/json',
      cacheControl: '0',
    })
  if (error) return { ok: false, error: error.message }
  return { ok: true, mudou: true }
}
