import { getSqlite } from '@/db'
import type { ProgramacaoHistoricoEvento } from '@/lib/programacao-historico'

export type ProgramacaoHistoricoBackup = {
  eventos: ProgramacaoHistoricoEvento[]
}

function tabelaExiste() {
  return Boolean(
    getSqlite()
      .prepare(
        `SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = 'programacao_historico'`,
      )
      .get(),
  )
}

/** Copia o histórico antes de o SQLite da carga ser substituído. */
export function captureProgramacaoHistorico(): ProgramacaoHistoricoBackup | null {
  try {
    if (!tabelaExiste()) return null
    const eventos = getSqlite()
      .prepare(
        `SELECT id, ocorrido_em as ocorridoEm, usuario_login as usuarioLogin,
                acao, pedido, pedido_norm as pedidoNorm, cliente,
                item_key as itemKey, item_nome as itemNome, detalhe
         FROM programacao_historico`,
      )
      .all() as ProgramacaoHistoricoEvento[]
    if (!eventos.length) return null
    return { eventos }
  } catch {
    return null
  }
}

/** Recoloca eventos (append-only por id). */
export function mergeProgramacaoHistorico(
  backup: ProgramacaoHistoricoBackup | null,
) {
  if (!backup?.eventos.length) return
  const db = getSqlite()
  if (!tabelaExiste()) return

  const upsert = db.prepare(
    `INSERT INTO programacao_historico (
       id, ocorrido_em, usuario_login, acao, pedido, pedido_norm, cliente,
       item_key, item_nome, detalhe
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  )

  const gravar = db.transaction(() => {
    for (const row of backup.eventos) {
      upsert.run(
        row.id,
        row.ocorridoEm,
        row.usuarioLogin,
        row.acao,
        row.pedido,
        row.pedidoNorm,
        row.cliente,
        row.itemKey,
        row.itemNome,
        row.detalhe,
      )
    }
  })
  gravar()
}
