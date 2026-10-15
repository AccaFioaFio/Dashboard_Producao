import { getSqlite } from '@/db'
import {
  gravarHistoricoProgramacaoNuvem,
  listarHistoricoProgramacaoNuvem,
} from '@/lib/programacao-historico-nuvem'
import type { ProgramacaoHistoricoEvento } from '@/lib/programacao-historico'
import { isSupabaseConfigured } from '@/lib/supabase/admin'

const TTL_MS = 15_000
let inFlight: Promise<number> | null = null
let lastAt = 0

function tabelaExiste() {
  return Boolean(
    getSqlite()
      .prepare(
        `SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = 'programacao_historico'`,
      )
      .get(),
  )
}

function upsertEvento(row: ProgramacaoHistoricoEvento) {
  getSqlite()
    .prepare(
      `INSERT INTO programacao_historico (
         id, ocorrido_em, usuario_login, acao, pedido, pedido_norm, cliente,
         item_key, item_nome, detalhe
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .run(
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

export async function ensureProgramacaoHistoricoNuvemNoSqlite(options?: {
  force?: boolean
}) {
  if (!tabelaExiste()) return 0
  if (!isSupabaseConfigured()) return 0
  const agora = Date.now()
  if (!options?.force && agora - lastAt < TTL_MS) return 0
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const remotos = await listarHistoricoProgramacaoNuvem()
      const gravar = getSqlite().transaction(() => {
        let merged = 0
        for (const evento of remotos) {
          const antes = getSqlite()
            .prepare(`SELECT 1 as v FROM programacao_historico WHERE id = ?`)
            .get(evento.id)
          if (!antes) {
            upsertEvento(evento)
            merged += 1
          }
        }
        return merged
      })
      const merged = gravar()
      lastAt = Date.now()
      return merged
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

export async function publicarHistoricoProgramacaoNuvem(
  evento: ProgramacaoHistoricoEvento,
) {
  return gravarHistoricoProgramacaoNuvem(evento)
}
