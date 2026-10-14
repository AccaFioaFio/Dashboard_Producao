import { getSqlite } from '@/db'
import {
  apagarPedidoProgramacaoNuvem,
  gravarPedidoProgramacaoNuvem,
  listarPedidosProgramacaoNuvem,
  type ProgramacaoNuvemPedido,
} from '@/lib/programacao-nuvem'
import type { LinhaProgramacao } from '@/lib/programacao'
import { isSupabaseConfigured } from '@/lib/supabase/admin'

const TTL_MS = 15_000
let inFlight: Promise<number> | null = null
let lastAt = 0
let lastMerged = 0

function tabelaExiste() {
  return Boolean(
    getSqlite()
      .prepare(
        `SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = 'programacao_linha'`,
      )
      .get(),
  )
}

function chavePedido(pedido: string, pedidoNorm: string | null) {
  return (pedidoNorm ?? pedido).trim()
}

function upsertLinha(row: LinhaProgramacao) {
  getSqlite()
    .prepare(
      `INSERT INTO programacao_linha (
         key, pedido, pedido_norm, cliente, item_id, cod_produto, nome,
         qtd_pedido, quantidade_producao, data_inicio, data_fim, saved_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         pedido = excluded.pedido,
         pedido_norm = excluded.pedido_norm,
         cliente = excluded.cliente,
         item_id = excluded.item_id,
         cod_produto = excluded.cod_produto,
         nome = excluded.nome,
         qtd_pedido = excluded.qtd_pedido,
         quantidade_producao = excluded.quantidade_producao,
         data_inicio = excluded.data_inicio,
         data_fim = excluded.data_fim,
         saved_at = excluded.saved_at
       WHERE excluded.saved_at >= programacao_linha.saved_at`,
    )
    .run(
      row.key,
      row.pedido,
      row.pedidoNorm,
      row.cliente,
      row.itemId,
      row.codProduto,
      row.nome,
      row.qtdPedido,
      row.quantidadeProducao,
      row.dataInicio,
      row.dataFim,
      row.savedAt,
    )
}

function aplicarPedidoNuvem(pedido: ProgramacaoNuvemPedido) {
  const db = getSqlite()
  const chave = chavePedido(pedido.pedido, pedido.pedidoNorm)
  const localMax = db
    .prepare(
      `SELECT MAX(saved_at) as m FROM programacao_linha
       WHERE TRIM(COALESCE(pedido_norm, pedido)) = ?`,
    )
    .get(chave) as { m: string | null }

  // Nuvem mais nova (ou igual): substitui o pedido local pelo arquivo remoto.
  if (!localMax?.m || pedido.savedAt >= localMax.m) {
    const gravar = db.transaction(() => {
      db.prepare(
        `DELETE FROM programacao_linha
         WHERE TRIM(COALESCE(pedido_norm, pedido)) = ?`,
      ).run(chave)
      for (const linha of pedido.linhas) upsertLinha(linha)
    })
    gravar()
    return pedido.linhas.length
  }
  return 0
}

function pedidosLocais(): ProgramacaoNuvemPedido[] {
  if (!tabelaExiste()) return []
  const rows = getSqlite()
    .prepare(
      `SELECT key, pedido, pedido_norm as pedidoNorm, cliente,
              item_id as itemId, cod_produto as codProduto, nome,
              qtd_pedido as qtdPedido, quantidade_producao as quantidadeProducao,
              data_inicio as dataInicio, data_fim as dataFim, saved_at as savedAt
       FROM programacao_linha
       ORDER BY saved_at DESC`,
    )
    .all() as LinhaProgramacao[]

  const mapa = new Map<string, ProgramacaoNuvemPedido>()
  for (const row of rows) {
    const chave = chavePedido(row.pedido, row.pedidoNorm)
    const atual = mapa.get(chave)
    if (!atual) {
      mapa.set(chave, {
        pedido: row.pedido,
        pedidoNorm: row.pedidoNorm,
        cliente: row.cliente,
        linhas: [row],
        savedAt: row.savedAt,
      })
      continue
    }
    atual.linhas.push(row)
    if (row.savedAt > atual.savedAt) {
      atual.savedAt = row.savedAt
      atual.cliente = row.cliente ?? atual.cliente
      atual.pedido = row.pedido
      atual.pedidoNorm = row.pedidoNorm
    }
  }
  return [...mapa.values()]
}

async function syncOnce(): Promise<number> {
  if (!isSupabaseConfigured() || !tabelaExiste()) return lastMerged

  try {
    const nuvem = await listarPedidosProgramacaoNuvem()
    let merged = 0
    const nuvemPorChave = new Map<string, ProgramacaoNuvemPedido>()
    for (const pedido of nuvem) {
      const chave = chavePedido(pedido.pedido, pedido.pedidoNorm)
      nuvemPorChave.set(chave, pedido)
      merged += aplicarPedidoNuvem(pedido)
    }

    // Repara: o que só existe (ou é mais novo) neste SQLite sobe para a nuvem.
    for (const local of pedidosLocais()) {
      const chave = chavePedido(local.pedido, local.pedidoNorm)
      const remoto = nuvemPorChave.get(chave)
      if (remoto && remoto.savedAt >= local.savedAt) continue
      const gravado = await gravarPedidoProgramacaoNuvem(local)
      if (!gravado.ok) {
        console.error('push programação → nuvem falhou', chave, gravado.error)
      }
    }

    lastMerged = merged
    lastAt = Date.now()
    return merged
  } catch (error) {
    console.error('sync programação nuvem → sqlite falhou', error)
    lastAt = Date.now()
    return lastMerged
  }
}

/** Baixa programação da nuvem para o SQLite (desktop ↔ mobile / Vercel). */
export async function ensureProgramacaoNuvemNoSqlite(options?: {
  force?: boolean
}): Promise<number> {
  if (!options?.force && lastAt && Date.now() - lastAt < TTL_MS) {
    return lastMerged
  }
  if (!inFlight) {
    inFlight = syncOnce().finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

export async function publicarPedidoProgramacaoNuvem(
  pedido: ProgramacaoNuvemPedido,
) {
  return gravarPedidoProgramacaoNuvem(pedido)
}

export async function removerPedidoProgramacaoNuvem(
  pedido: string,
  pedidoNorm: string | null,
) {
  return apagarPedidoProgramacaoNuvem(pedido, pedidoNorm)
}
