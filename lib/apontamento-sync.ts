import { getSqlite } from '@/db'
import { ETAPAS_APONTAMENTO, type EtapaApontamento } from '@/lib/apontamento'
import { syncDimPedidoApontamento } from '@/lib/apontamento-fatos'
import {
  entradasDoLancamento,
  lerApontamentoNuvem,
  listarTodosApontamentosNuvem,
  mesclarEntradasApontamentoNuvem,
  type ApontamentoNuvemComPedido,
  type ApontamentoNuvemEntrada,
} from '@/lib/apontamento-nuvem'
import { EXCEL_ROW_FORA_DA_CARGA } from '@/lib/corte-producao'
import { setDataHealthWarning } from '@/lib/cloud/data-health'
import { isSupabaseConfigured, isSupabaseWriteConfigured } from '@/lib/supabase/admin'

export type ApontamentoSyncResult = {
  costura: number
  revisao: number
  costuraPecas: number
  revisaoPecas: number
  costuraDia: Record<string, number>
  revisaoDia: Record<string, number>
}

const TTL_MS = 60_000
const TTL_PUSH_MS = 45_000
let inFlight: Promise<ApontamentoSyncResult> | null = null
let lastAt = 0
let lastOk = false
let lastResult: ApontamentoSyncResult = {
  costura: 0,
  revisao: 0,
  costuraPecas: 0,
  revisaoPecas: 0,
  costuraDia: {},
  revisaoDia: {},
}
let lastPushAt = 0

function tabelaExiste(nome: string) {
  return Boolean(
    getSqlite()
      .prepare(`SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(nome),
  )
}

function upsertLote(
  etapa: EtapaApontamento,
  rows: ApontamentoNuvemComPedido[],
  options?: { limparOrfaos?: boolean },
) {
  const limparOrfaos = options?.limparOrfaos !== false
  const tabela = ETAPAS_APONTAMENTO[etapa].tabela
  if (!tabelaExiste(tabela) || !rows.length) {
    return { n: 0, pecas: 0, porDia: {} as Record<string, number> }
  }

  const db = getSqlite()
  const temOficina = etapa === 'costura'
  const colunasOrigem = temOficina ? 'origem, oficina, ' : ''
  const valoresOrigem = temOficina ? '?, ?, ' : ''
  const atualizaOrigem = temOficina
    ? 'origem = excluded.origem, oficina = excluded.oficina,'
    : ''
  const upsert = db.prepare(
    `INSERT INTO ${tabela} (
       pedido_norm, cod_produto, excel_row, ${colunasOrigem}qtd_pecas, data_inicio, data_producao,
       responsavel, aviso_data_producao, observacao, nome_produto, atualizado_em
     ) VALUES (?, ?, ?, ${valoresOrigem}?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(pedido_norm, cod_produto, excel_row) DO UPDATE SET
       ${atualizaOrigem}
       qtd_pecas = excluded.qtd_pecas,
       data_inicio = excluded.data_inicio,
       data_producao = excluded.data_producao,
       responsavel = excluded.responsavel,
       aviso_data_producao = excluded.aviso_data_producao,
       observacao = excluded.observacao,
       nome_produto = COALESCE(excluded.nome_produto, ${tabela}.nome_produto),
       atualizado_em = excluded.atualizado_em
     WHERE excluded.atualizado_em >= ${tabela}.atualizado_em`,
  )

  let n = 0
  let pecas = 0
  const porDia: Record<string, number> = {}
  const porProduto = new Map<
    string,
    { pedidoNorm: string; codProduto: string; rows: number[]; maxAtualizado: string }
  >()

  const gravar = db.transaction(() => {
    for (const row of rows) {
      const excelRow = Number.isInteger(row.excelRow)
        ? row.excelRow
        : EXCEL_ROW_FORA_DA_CARGA
      const args = [
        row.pedidoNorm,
        row.codProduto,
        excelRow,
        ...(temOficina ? [row.origem, row.oficina ?? null] : []),
        row.qtdPecas,
        row.dataInicio,
        row.dataProducao,
        row.responsavel,
        row.avisoDataProducao,
        row.observacao,
        row.nomeProduto,
        row.atualizadoEm,
      ]
      upsert.run(...args)
      const chave = `${row.pedidoNorm}\0${row.codProduto}`
      const grupo = porProduto.get(chave) ?? {
        pedidoNorm: row.pedidoNorm,
        codProduto: row.codProduto,
        rows: [] as number[],
        maxAtualizado: row.atualizadoEm,
      }
      grupo.rows.push(excelRow)
      if (row.atualizadoEm > grupo.maxAtualizado) {
        grupo.maxAtualizado = row.atualizadoEm
      }
      porProduto.set(chave, grupo)
      n += 1
      if (row.qtdPecas != null) {
        const entraCostura = etapa !== 'costura' || row.origem === 'Produção'
        if (entraCostura) {
          pecas += row.qtdPecas
          if (row.dataProducao) {
            porDia[row.dataProducao] = (porDia[row.dataProducao] ?? 0) + row.qtdPecas
          }
        }
      }
    }

    // Só no sync global: remove órfãos locais mais antigos que a nuvem.
    // No sync por pedido/produto não apaga — evita perder soma local se o push falhou.
    if (limparOrfaos) {
      for (const grupo of porProduto.values()) {
        const unicos = [...new Set(grupo.rows)]
        const placeholders = unicos.map(() => '?').join(', ')
        // Só remove órfãos estritamente mais antigos que a nuvem — nunca
        // apaga lançamento local ainda não publicado (mesmo timestamp ou mais novo).
        db.prepare(
          `DELETE FROM ${tabela}
           WHERE pedido_norm = ? AND cod_produto = ?
             AND excel_row NOT IN (${placeholders})
             AND atualizado_em < ?`,
        ).run(grupo.pedidoNorm, grupo.codProduto, ...unicos, grupo.maxAtualizado)
      }
    }
  })
  gravar()
  return { n, pecas, porDia }
}

let syncLimparOrfaos = true

async function syncOnce(): Promise<ApontamentoSyncResult> {
  if (!isSupabaseConfigured()) return lastResult

  try {
    const [costuraRows, revisaoRows] = await Promise.all([
      listarTodosApontamentosNuvem('costura'),
      listarTodosApontamentosNuvem('revisao'),
    ])

    const limparOrfaos = syncLimparOrfaos
    const costura = upsertLote(
      'costura',
      costuraRows.filter(
        (row) =>
          !apontamentoFoiSubstituidoRecentemente('costura', row.pedidoNorm, row.codProduto),
      ),
      { limparOrfaos },
    )
    const revisao = upsertLote(
      'revisao',
      revisaoRows.filter(
        (row) =>
          !apontamentoFoiSubstituidoRecentemente('revisao', row.pedidoNorm, row.codProduto),
      ),
      { limparOrfaos },
    )
    syncDimPedidoApontamento()

    lastResult = {
      costura: costura.n,
      revisao: revisao.n,
      costuraPecas: costura.pecas,
      revisaoPecas: revisao.pecas,
      costuraDia: costura.porDia,
      revisaoDia: revisao.porDia,
    }
    lastAt = Date.now()
    lastOk = true
    return lastResult
  } catch (error) {
    console.error('sync apontamento nuvem → sqlite falhou', error)
    setDataHealthWarning(
      'Não foi possível sincronizar lançamentos da nuvem. Costura/revisão podem estar incompletos.',
    )
    // Não congela o TTL: a próxima abertura tenta de novo.
    lastOk = false
    lastAt = 0
    return lastResult
  }
}

/** Último pull global concluiu sem erro (para o desktop não marcar “já sincronizou” cedo). */
export function apontamentoNuvemSyncOk() {
  return lastOk
}

/**
 * Baixa lançamentos da nuvem (Costura Produção / Lançar revisão) para o SQLite
 * usado nos KPIs: planilha (fato_*) + tela (*_lancamento).
 */
export async function ensureApontamentosNuvemNoSqlite(options?: {
  force?: boolean
  /** Se false, não apaga excel_rows locais ausentes na nuvem (após push com falha). */
  limparOrfaos?: boolean
}): Promise<ApontamentoSyncResult> {
  if (!options?.force && lastOk && lastAt && Date.now() - lastAt < TTL_MS) {
    return lastResult
  }
  syncLimparOrfaos = options?.limparOrfaos !== false
  if (!inFlight) {
    inFlight = syncOnce().finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

type LinhaLocalPush = {
  pedidoNorm: string
  codProduto: string
  excelRow: number
  origem: string | null
  oficina: string | null
  qtdPecas: number | null
  dataInicio: string | null
  dataProducao: string | null
  responsavel: string | null
  avisoDataProducao: string | null
  observacao: string | null
  nomeProduto: string | null
  atualizadoEm: string
}

function lerLocaisParaPush(etapa: EtapaApontamento): LinhaLocalPush[] {
  const tabela = ETAPAS_APONTAMENTO[etapa].tabela
  if (!tabelaExiste(tabela)) return []
  const origem = etapa === 'costura' ? 'origem' : 'NULL as origem'
  const oficina = etapa === 'costura' ? 'oficina' : 'NULL as oficina'
  return getSqlite()
    .prepare(
      `SELECT pedido_norm as pedidoNorm, cod_produto as codProduto,
              excel_row as excelRow, ${origem}, ${oficina}, qtd_pecas as qtdPecas,
              data_inicio as dataInicio, data_producao as dataProducao, responsavel,
              aviso_data_producao as avisoDataProducao,
              observacao, nome_produto as nomeProduto,
              atualizado_em as atualizadoEm
       FROM ${tabela}
       WHERE qtd_pecas IS NOT NULL OR data_inicio IS NOT NULL OR data_producao IS NOT NULL OR responsavel IS NOT NULL`,
    )
    .all() as LinhaLocalPush[]
}

type PushEtapaResult = { publicados: number; falhas: number }

async function pushEtapa(etapa: EtapaApontamento): Promise<PushEtapaResult> {
  const linhas = lerLocaisParaPush(etapa)
  if (!linhas.length) return { publicados: 0, falhas: 0 }

  const grupos = new Map<
    string,
    { pedidoNorm: string; codProduto: string; nomeProduto: string | null; entradas: ApontamentoNuvemEntrada[] }
  >()
  for (const row of linhas) {
    const chave = `${row.pedidoNorm}\0${row.codProduto}`
    const grupo = grupos.get(chave) ?? {
      pedidoNorm: row.pedidoNorm,
      codProduto: row.codProduto,
      nomeProduto: row.nomeProduto,
      entradas: [] as ApontamentoNuvemEntrada[],
    }
    grupo.nomeProduto = grupo.nomeProduto ?? row.nomeProduto
    grupo.entradas.push({
      excelRow: Number.isInteger(row.excelRow) ? row.excelRow : EXCEL_ROW_FORA_DA_CARGA,
      origem: row.origem,
      oficina: row.oficina,
      qtdPecas: row.qtdPecas,
      dataInicio: row.dataInicio,
      dataProducao: row.dataProducao,
      responsavel: row.responsavel,
      avisoDataProducao: row.avisoDataProducao,
      observacao: row.observacao,
      atualizadoEm: row.atualizadoEm,
    })
    grupos.set(chave, grupo)
  }

  let publicados = 0
  let falhas = 0
  const lista = [...grupos.values()]
  const batchSize = 6
  for (let i = 0; i < lista.length; i += batchSize) {
    const batch = lista.slice(i, i + batchSize)
    const resultados = await Promise.all(
      batch.map((grupo) => {
        if (
          apontamentoFoiSubstituidoRecentemente(
            etapa,
            grupo.pedidoNorm,
            grupo.codProduto,
          )
        ) {
          return Promise.resolve({ ok: true as const, mudou: false })
        }
        return mesclarEntradasApontamentoNuvem(
          etapa,
          grupo.pedidoNorm,
          grupo.codProduto,
          grupo.entradas,
          grupo.nomeProduto,
        )
      }),
    )
    for (const result of resultados) {
      if (result.ok && result.mudou) publicados += 1
      else if (!result.ok) {
        falhas += 1
        console.error('publicar apontamento local → nuvem falhou', etapa, result.error)
      }
    }
  }
  return { publicados, falhas }
}

export type PublicarApontamentosResult = { publicados: number; falhas: number }

let lastPushFalhas = 0
let pushInFlightResult: Promise<PublicarApontamentosResult> | null = null

async function pushOnce(): Promise<PublicarApontamentosResult> {
  if (!isSupabaseWriteConfigured()) return { publicados: 0, falhas: 0 }
  try {
    const [costura, revisao] = await Promise.all([
      pushEtapa('costura'),
      pushEtapa('revisao'),
    ])
    const publicados = costura.publicados + revisao.publicados
    const falhas = costura.falhas + revisao.falhas
    lastPushFalhas = falhas
    // Só congela o TTL se tudo subiu — senão a próxima abertura tenta de novo.
    lastPushAt = falhas === 0 ? Date.now() : 0
    if (falhas > 0) {
      setDataHealthWarning(
        'Alguns lançamentos de costura/revisão não chegaram à nuvem. Abra de novo para sincronizar.',
      )
    }
    return { publicados, falhas }
  } catch (error) {
    console.error('publicar apontamentos locais na nuvem falhou', error)
    lastPushAt = 0
    lastPushFalhas = 1
    return { publicados: 0, falhas: 1 }
  }
}

/**
 * Publica lançamentos do SQLite local na nuvem (união por excel_row).
 * Recupera o que o mobile gravou só na instância e ainda não estava no Storage.
 */
export async function publicarApontamentosLocaisNaNuvem(options?: {
  force?: boolean
}): Promise<PublicarApontamentosResult> {
  if (!options?.force && lastPushAt && Date.now() - lastPushAt < TTL_PUSH_MS) {
    return { publicados: 0, falhas: lastPushFalhas }
  }
  if (!pushInFlightResult) {
    pushInFlightResult = pushOnce().finally(() => {
      pushInFlightResult = null
    })
  }
  return pushInFlightResult
}

function lerLocaisPedidoProduto(
  etapa: EtapaApontamento,
  pedidoNorm: string,
  codProduto?: string,
  incluirVazios = false,
): LinhaLocalPush[] {
  const tabela = ETAPAS_APONTAMENTO[etapa].tabela
  if (!tabelaExiste(tabela)) return []
  const origem = etapa === 'costura' ? 'origem' : 'NULL as origem'
  const oficina = etapa === 'costura' ? 'oficina' : 'NULL as oficina'
  if (codProduto) {
    return getSqlite()
      .prepare(
        `SELECT pedido_norm as pedidoNorm, cod_produto as codProduto,
                excel_row as excelRow, ${origem}, ${oficina}, qtd_pecas as qtdPecas,
                data_inicio as dataInicio, data_producao as dataProducao, responsavel,
                aviso_data_producao as avisoDataProducao,
                observacao, nome_produto as nomeProduto,
                atualizado_em as atualizadoEm
         FROM ${tabela}
         WHERE pedido_norm = ? AND cod_produto = ?
           AND (
             ? = 1
             OR qtd_pecas IS NOT NULL
             OR data_inicio IS NOT NULL
             OR data_producao IS NOT NULL
             OR responsavel IS NOT NULL
           )`,
      )
      .all(pedidoNorm, codProduto, incluirVazios ? 1 : 0) as LinhaLocalPush[]
  }
  return getSqlite()
    .prepare(
      `SELECT pedido_norm as pedidoNorm, cod_produto as codProduto,
              excel_row as excelRow, ${origem}, ${oficina}, qtd_pecas as qtdPecas,
              data_inicio as dataInicio, data_producao as dataProducao, responsavel,
              aviso_data_producao as avisoDataProducao,
              observacao, nome_produto as nomeProduto,
              atualizado_em as atualizadoEm
       FROM ${tabela}
       WHERE pedido_norm = ?
         AND (qtd_pecas IS NOT NULL OR data_inicio IS NOT NULL OR data_producao IS NOT NULL OR responsavel IS NOT NULL)`,
    )
    .all(pedidoNorm) as LinhaLocalPush[]
}

function totalPecasLocais(
  etapa: EtapaApontamento,
  pedidoNorm: string,
  codProduto: string,
): number {
  const tabela = ETAPAS_APONTAMENTO[etapa].tabela
  if (!tabelaExiste(tabela)) return 0
  const row = getSqlite()
    .prepare(
      `SELECT COALESCE(SUM(qtd_pecas), 0) as v FROM ${tabela}
       WHERE pedido_norm = ? AND cod_produto = ? AND qtd_pecas IS NOT NULL`,
    )
    .get(pedidoNorm, codProduto) as { v: number }
  return row.v
}

/**
 * Publica TODAS as entradas locais do produto na nuvem (união) e devolve o total.
 * Por padrão também puxa a nuvem de volta; em gravações quentes use `skipPull`
 * para responder mais rápido (o total já está no SQLite local).
 */
export async function sincronizarProdutoApontamento(
  etapa: EtapaApontamento,
  pedidoNorm: string,
  codProduto: string,
  options?: { skipPull?: boolean; incluirVazios?: boolean },
): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  const linhas = lerLocaisPedidoProduto(
    etapa,
    pedidoNorm,
    codProduto,
    options?.incluirVazios,
  )
  const entradas: ApontamentoNuvemEntrada[] = linhas.map((row) => ({
    excelRow: Number.isInteger(row.excelRow) ? row.excelRow : EXCEL_ROW_FORA_DA_CARGA,
    origem: row.origem,
    oficina: row.oficina,
    qtdPecas: row.qtdPecas,
    dataInicio: row.dataInicio,
    dataProducao: row.dataProducao,
    responsavel: row.responsavel,
    avisoDataProducao: row.avisoDataProducao,
    observacao: row.observacao,
    atualizadoEm: row.atualizadoEm,
  }))
  const nomeProduto = linhas.find((row) => row.nomeProduto)?.nomeProduto ?? null

  const substituido = apontamentoFoiSubstituidoRecentemente(etapa, pedidoNorm, codProduto)

  if (!substituido && entradas.length && isSupabaseWriteConfigured()) {
    const publicado = await mesclarEntradasApontamentoNuvem(
      etapa,
      pedidoNorm,
      codProduto,
      entradas,
      nomeProduto,
    )
    if (!publicado.ok) return publicado
  } else if (!substituido && entradas.length && isSupabaseConfigured()) {
    return {
      ok: false,
      error: 'Falta SUPABASE_SERVICE_ROLE_KEY. Sem ela o lançamento não chega no outro aparelho.',
    }
  }

  if (!substituido && !options?.skipPull && isSupabaseConfigured()) {
    try {
      const nuvem = await lerApontamentoNuvem(etapa, pedidoNorm)
      const doc = nuvem.get(codProduto)
      if (doc) {
        const rows: ApontamentoNuvemComPedido[] = entradasDoLancamento(doc).map((entrada) => ({
          ...doc,
          ...entrada,
          pedidoNorm,
          excelRow: entrada.excelRow,
          nomeProduto: doc.nomeProduto ?? nomeProduto,
          entradas: undefined,
        }))
        upsertLote(etapa, rows, { limparOrfaos: false })
      }
    } catch (error) {
      console.error('pull produto apontamento falhou', etapa, pedidoNorm, codProduto, error)
    }
  }

  marcarPedidoApontamentoSyncado(etapa, pedidoNorm)
  return { ok: true, total: totalPecasLocais(etapa, pedidoNorm, codProduto) }
}

const PEDIDO_SYNC_TTL_MS = 8_000
const pedidoSyncAt = new Map<string, number>()

/** Evita mesclar/puxar de novo um produto logo após Corrigir (substituir total). */
const SUBSTITUICAO_TTL_MS = 120_000
const substituicaoAte = new Map<string, number>()

function chavePedidoSync(etapa: EtapaApontamento, pedidoNorm: string) {
  return `${etapa}:${pedidoNorm}`
}

function chaveSubstituicao(
  etapa: EtapaApontamento,
  pedidoNorm: string,
  codProduto: string,
) {
  return `${etapa}:${pedidoNorm}:${codProduto}`
}

function marcarPedidoApontamentoSyncado(etapa: EtapaApontamento, pedidoNorm: string) {
  pedidoSyncAt.set(chavePedidoSync(etapa, pedidoNorm), Date.now())
}

/**
 * Após Corrigir/zerar: a nuvem já foi substituída. Por um tempo, não mesclar nem
 * puxar esse produto — uma leitura atrasada da nuvem recriaria o total antigo.
 */
export function marcarSubstituicaoApontamento(
  etapa: EtapaApontamento,
  pedidoNorm: string,
  codProduto: string,
) {
  substituicaoAte.set(
    chaveSubstituicao(etapa, pedidoNorm, codProduto),
    Date.now() + SUBSTITUICAO_TTL_MS,
  )
  marcarPedidoApontamentoSyncado(etapa, pedidoNorm)
}

export function apontamentoFoiSubstituidoRecentemente(
  etapa: EtapaApontamento,
  pedidoNorm: string,
  codProduto: string,
): boolean {
  const chave = chaveSubstituicao(etapa, pedidoNorm, codProduto)
  const ate = substituicaoAte.get(chave)
  if (ate == null) return false
  if (Date.now() > ate) {
    substituicaoAte.delete(chave)
    return false
  }
  return true
}

/**
 * Ao abrir o pedido: sobe o que só existia no SQLite local e baixa o que o outro
 * aparelho já publicou — costura e revisão (mobile ↔ desktop).
 * TTL curto evita re-sync pesado logo após um lançamento na mesma instância.
 */
export async function sincronizarPedidoApontamento(
  etapa: EtapaApontamento,
  pedidoNorm: string,
  options?: { force?: boolean },
): Promise<void> {
  if (!pedidoNorm || !isSupabaseConfigured()) return

  const chave = chavePedidoSync(etapa, pedidoNorm)
  const ultimo = pedidoSyncAt.get(chave) ?? 0
  if (!options?.force && ultimo && Date.now() - ultimo < PEDIDO_SYNC_TTL_MS) {
    return
  }

  const linhas = lerLocaisPedidoProduto(etapa, pedidoNorm)
  if (linhas.length && isSupabaseWriteConfigured()) {
    const porProduto = new Map<
      string,
      { nomeProduto: string | null; entradas: ApontamentoNuvemEntrada[] }
    >()
    for (const row of linhas) {
      const grupo = porProduto.get(row.codProduto) ?? {
        nomeProduto: row.nomeProduto,
        entradas: [] as ApontamentoNuvemEntrada[],
      }
      grupo.nomeProduto = grupo.nomeProduto ?? row.nomeProduto
      grupo.entradas.push({
        excelRow: Number.isInteger(row.excelRow) ? row.excelRow : EXCEL_ROW_FORA_DA_CARGA,
        origem: row.origem,
        oficina: row.oficina,
        qtdPecas: row.qtdPecas,
        dataInicio: row.dataInicio,
        dataProducao: row.dataProducao,
        responsavel: row.responsavel,
        avisoDataProducao: row.avisoDataProducao,
        observacao: row.observacao,
        atualizadoEm: row.atualizadoEm,
      })
      porProduto.set(row.codProduto, grupo)
    }
    const produtos = [...porProduto.entries()]
    const batchSize = 6
    for (let i = 0; i < produtos.length; i += batchSize) {
      const batch = produtos.slice(i, i + batchSize)
      await Promise.all(
        batch.map(([codProduto, grupo]) => {
          if (apontamentoFoiSubstituidoRecentemente(etapa, pedidoNorm, codProduto)) {
            return Promise.resolve()
          }
          return mesclarEntradasApontamentoNuvem(
            etapa,
            pedidoNorm,
            codProduto,
            grupo.entradas,
            grupo.nomeProduto,
          ).then((result) => {
            if (!result.ok) {
              console.error(
                'push pedido apontamento falhou',
                etapa,
                pedidoNorm,
                codProduto,
                result.error,
              )
            }
          })
        }),
      )
    }
  }

  try {
    const nuvem = await lerApontamentoNuvem(etapa, pedidoNorm)
    const rows: ApontamentoNuvemComPedido[] = []
    for (const doc of nuvem.values()) {
      if (apontamentoFoiSubstituidoRecentemente(etapa, pedidoNorm, doc.codProduto)) {
        continue
      }
      for (const entrada of entradasDoLancamento(doc)) {
        rows.push({
          ...doc,
          ...entrada,
          pedidoNorm,
          excelRow: entrada.excelRow,
          entradas: undefined,
        })
      }
    }
    if (rows.length) upsertLote(etapa, rows, { limparOrfaos: false })
  } catch (error) {
    console.error('pull pedido apontamento falhou', etapa, pedidoNorm, error)
  }
  marcarPedidoApontamentoSyncado(etapa, pedidoNorm)
}
