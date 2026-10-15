import { getSqlite } from '@/db'
import type { LinhaProgramacao } from '@/lib/programacao'

export type ProgramacaoOperacaoBackup = {
  linhas: LinhaProgramacao[]
}

function tabelaExiste(nome: string) {
  return Boolean(
    getSqlite()
      .prepare(`SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(nome),
  )
}

/** Copia a programação antes de o SQLite da carga ser substituído. */
export function captureProgramacaoOperacao(): ProgramacaoOperacaoBackup | null {
  try {
    if (!tabelaExiste('programacao_linha')) return null
    const linhas = getSqlite()
      .prepare(
        `SELECT key, pedido, pedido_norm as pedidoNorm, cliente,
                item_id as itemId, cod_produto as codProduto, nome,
                qtd_pedido as qtdPedido, quantidade_producao as quantidadeProducao,
                data_inicio as dataInicio, data_fim as dataFim,
                observacoes, saved_at as savedAt
         FROM programacao_linha`,
      )
      .all() as LinhaProgramacao[]
    if (!linhas.length) return null
    return { linhas }
  } catch {
    return null
  }
}

/** Recoloca linhas mais novas do que as que vieram no SQLite publicado. */
export function mergeProgramacaoOperacao(backup: ProgramacaoOperacaoBackup | null) {
  if (!backup?.linhas.length) return
  const db = getSqlite()
  if (!tabelaExiste('programacao_linha')) return

  const upsert = db.prepare(
    `INSERT INTO programacao_linha (
       key, pedido, pedido_norm, cliente, item_id, cod_produto, nome,
       qtd_pedido, quantidade_producao, data_inicio, data_fim, observacoes, saved_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
       observacoes = excluded.observacoes,
       saved_at = excluded.saved_at
     WHERE excluded.saved_at >= programacao_linha.saved_at`,
  )

  const gravar = db.transaction(() => {
    for (const row of backup.linhas) {
      upsert.run(
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
        row.observacoes,
        row.savedAt,
      )
    }
  })
  gravar()
}
