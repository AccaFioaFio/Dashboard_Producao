import { getSqlite } from '@/db'
import { ensureCloudDatabase } from '@/lib/cloud/carga'
import {
  itemProntoParaSalvar,
  linhaKey,
  periodoValido,
  type ItemProgramacao,
  type LinhaProgramacao,
  type ProgramacaoBanco,
} from '@/lib/programacao'

type RowDb = {
  key: string
  pedido: string
  pedidoNorm: string | null
  cliente: string | null
  itemId: string
  codProduto: string
  nome: string
  qtdPedido: number | null
  quantidadeProducao: string
  dataInicio: string
  dataFim: string
  savedAt: string
}

function chavePedido(pedido: string, pedidoNorm: string | null) {
  return (pedidoNorm ?? pedido).trim()
}

function rowToLinha(row: RowDb): LinhaProgramacao {
  return {
    key: row.key,
    pedido: row.pedido,
    pedidoNorm: row.pedidoNorm,
    cliente: row.cliente,
    itemId: row.itemId,
    codProduto: row.codProduto,
    nome: row.nome,
    qtdPedido: row.qtdPedido,
    quantidadeProducao: row.quantidadeProducao,
    dataInicio: row.dataInicio,
    dataFim: row.dataFim,
    savedAt: row.savedAt,
  }
}

function tabelaExiste() {
  return Boolean(
    getSqlite()
      .prepare(
        `SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = 'programacao_linha'`,
      )
      .get(),
  )
}

export async function listarProgramacao(): Promise<ProgramacaoBanco> {
  await ensureCloudDatabase()
  if (!tabelaExiste()) return { version: 2, linhas: [] }
  const rows = getSqlite()
    .prepare(
      `SELECT key, pedido, pedido_norm as pedidoNorm, cliente,
              item_id as itemId, cod_produto as codProduto, nome,
              qtd_pedido as qtdPedido, quantidade_producao as quantidadeProducao,
              data_inicio as dataInicio, data_fim as dataFim, saved_at as savedAt
       FROM programacao_linha
       ORDER BY data_inicio, pedido, nome`,
    )
    .all() as RowDb[]
  return { version: 2, linhas: rows.map(rowToLinha) }
}

function upsertLinhaStmt() {
  return getSqlite().prepare(
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
       saved_at = excluded.saved_at`,
  )
}

function runUpsert(stmt: ReturnType<typeof upsertLinhaStmt>, row: LinhaProgramacao) {
  stmt.run(
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

export async function substituirPedidoProgramacao(input: {
  pedido: string
  pedidoNorm: string | null
  cliente: string | null
  itens: ItemProgramacao[]
}): Promise<{ banco: ProgramacaoBanco; gravados: number; removidosAnteriores: number }> {
  await ensureCloudDatabase()
  const chave = chavePedido(input.pedido, input.pedidoNorm)
  const savedAt = new Date().toISOString()
  const novas = input.itens.filter(itemProntoParaSalvar).map((item) => ({
    key: linhaKey(
      input.pedidoNorm,
      input.pedido,
      item.id,
      item.dataInicio,
      item.dataFim,
    ),
    pedido: input.pedido,
    pedidoNorm: input.pedidoNorm,
    cliente: input.cliente,
    itemId: item.id,
    codProduto: item.codProduto,
    nome: item.nome,
    qtdPedido: item.qtdPedido,
    quantidadeProducao: item.quantidadeProducao,
    dataInicio: item.dataInicio,
    dataFim: item.dataFim,
    savedAt,
  }))

  const db = getSqlite()
  const countAnteriores = db
    .prepare(
      `SELECT COUNT(*) as n FROM programacao_linha
       WHERE TRIM(COALESCE(pedido_norm, pedido)) = ?`,
    )
    .get(chave) as { n: number }
  const upsert = upsertLinhaStmt()
  const gravar = db.transaction(() => {
    db.prepare(
      `DELETE FROM programacao_linha
       WHERE TRIM(COALESCE(pedido_norm, pedido)) = ?`,
    ).run(chave)
    for (const row of novas) runUpsert(upsert, row)
  })
  gravar()

  return {
    banco: await listarProgramacao(),
    gravados: novas.length,
    removidosAnteriores: countAnteriores.n,
  }
}

export async function excluirPedidoProgramacao(
  pedido: string,
  pedidoNorm: string | null,
): Promise<{ banco: ProgramacaoBanco; removidos: number }> {
  await ensureCloudDatabase()
  const chave = chavePedido(pedido, pedidoNorm)
  const result = getSqlite()
    .prepare(
      `DELETE FROM programacao_linha
       WHERE TRIM(COALESCE(pedido_norm, pedido)) = ?`,
    )
    .run(chave)
  return {
    banco: await listarProgramacao(),
    removidos: result.changes,
  }
}

export async function excluirLinhasProgramacao(
  keys: string[],
): Promise<{ banco: ProgramacaoBanco; removidos: number }> {
  await ensureCloudDatabase()
  const unicas = [...new Set(keys.map((k) => k.trim()).filter(Boolean))]
  if (unicas.length === 0) {
    return { banco: await listarProgramacao(), removidos: 0 }
  }
  const db = getSqlite()
  const del = db.prepare(`DELETE FROM programacao_linha WHERE key = ?`)
  const gravar = db.transaction(() => {
    let removidos = 0
    for (const key of unicas) {
      removidos += del.run(key).changes
    }
    return removidos
  })
  const removidos = gravar()
  return { banco: await listarProgramacao(), removidos }
}

/** Importa linhas (ex.: migração do localStorage). Não apaga o que já existe com outra key. */
export async function importarLinhasProgramacao(
  linhas: LinhaProgramacao[],
): Promise<{ banco: ProgramacaoBanco; gravados: number }> {
  await ensureCloudDatabase()
  const validas = linhas.filter(
    (row) =>
      row.key.trim() &&
      row.pedido.trim() &&
      row.nome.trim() &&
      row.quantidadeProducao.trim() &&
      periodoValido(row.dataInicio, row.dataFim),
  )
  if (validas.length === 0) {
    return { banco: await listarProgramacao(), gravados: 0 }
  }
  const upsert = upsertLinhaStmt()
  const gravar = getSqlite().transaction(() => {
    for (const row of validas) {
      runUpsert(upsert, {
        ...row,
        savedAt: row.savedAt || new Date().toISOString(),
      })
    }
  })
  gravar()
  return { banco: await listarProgramacao(), gravados: validas.length }
}
