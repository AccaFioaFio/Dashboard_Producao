import { getSqlite } from '@/db'
import { ETAPAS_APONTAMENTO, type EtapaApontamento } from '@/lib/apontamento'
import { syncDimPedidoApontamento } from '@/lib/apontamento-fatos'
import {
  listarTodosApontamentosNuvem,
  type ApontamentoNuvemComPedido,
} from '@/lib/apontamento-nuvem'
import { EXCEL_ROW_FORA_DA_CARGA } from '@/lib/corte-producao'
import { setDataHealthWarning } from '@/lib/cloud/data-health'
import { isSupabaseConfigured } from '@/lib/supabase/admin'

export type ApontamentoSyncResult = {
  costura: number
  revisao: number
  costuraPecas: number
  revisaoPecas: number
  costuraDia: Record<string, number>
  revisaoDia: Record<string, number>
}

const TTL_MS = 60_000
let inFlight: Promise<ApontamentoSyncResult> | null = null
let lastAt = 0
let lastResult: ApontamentoSyncResult = {
  costura: 0,
  revisao: 0,
  costuraPecas: 0,
  revisaoPecas: 0,
  costuraDia: {},
  revisaoDia: {},
}

function tabelaExiste(nome: string) {
  return Boolean(
    getSqlite()
      .prepare(`SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(nome),
  )
}

function excelRowLocal(tabela: string, pedidoNorm: string, codProduto: string) {
  const row = getSqlite()
    .prepare(
      `SELECT excel_row as excelRow FROM ${tabela}
       WHERE pedido_norm = ? AND cod_produto = ?
       ORDER BY atualizado_em DESC LIMIT 1`,
    )
    .get(pedidoNorm, codProduto) as { excelRow: number } | undefined
  return row?.excelRow ?? EXCEL_ROW_FORA_DA_CARGA
}

function upsertLote(etapa: EtapaApontamento, rows: ApontamentoNuvemComPedido[]) {
  const tabela = ETAPAS_APONTAMENTO[etapa].tabela
  if (!tabelaExiste(tabela) || !rows.length) return { n: 0, pecas: 0, porDia: {} as Record<string, number> }

  const db = getSqlite()
  const colunasOrigem = etapa === 'costura' ? 'origem, ' : ''
  const valoresOrigem = etapa === 'costura' ? '?, ' : ''
  const atualizaOrigem = etapa === 'costura' ? 'origem = excluded.origem,' : ''
  const upsert = db.prepare(
    `INSERT INTO ${tabela} (
       pedido_norm, cod_produto, excel_row, ${colunasOrigem}qtd_pecas, data_producao,
       responsavel, aviso_data_producao, observacao, nome_produto, atualizado_em
     ) VALUES (?, ?, ?, ${valoresOrigem}?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(pedido_norm, cod_produto, excel_row) DO UPDATE SET
       ${atualizaOrigem}
       qtd_pecas = excluded.qtd_pecas,
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
  const gravar = db.transaction(() => {
    for (const row of rows) {
      const excelRow = excelRowLocal(tabela, row.pedidoNorm, row.codProduto)
      const args = [
        row.pedidoNorm,
        row.codProduto,
        excelRow,
        ...(etapa === 'costura' ? [row.origem] : []),
        row.qtdPecas,
        row.dataProducao,
        row.responsavel,
        row.avisoDataProducao,
        row.observacao,
        row.nomeProduto,
        row.atualizadoEm,
      ]
      upsert.run(...args)
      // Uma linha por produto no pedido (igual à tela).
      db.prepare(
        `DELETE FROM ${tabela}
         WHERE pedido_norm = ? AND cod_produto = ? AND excel_row != ?`,
      ).run(row.pedidoNorm, row.codProduto, excelRow)
      n += 1
      if (row.qtdPecas != null) {
        const entraCostura =
          etapa !== 'costura' || row.origem === 'Produção'
        if (entraCostura) {
          pecas += row.qtdPecas
          if (row.dataProducao) {
            porDia[row.dataProducao] = (porDia[row.dataProducao] ?? 0) + row.qtdPecas
          }
        }
      }
    }
  })
  gravar()
  return { n, pecas, porDia }
}

async function syncOnce(): Promise<ApontamentoSyncResult> {
  if (!isSupabaseConfigured()) return lastResult

  try {
    const [costuraRows, revisaoRows] = await Promise.all([
      listarTodosApontamentosNuvem('costura'),
      listarTodosApontamentosNuvem('revisao'),
    ])

    const costura = upsertLote('costura', costuraRows)
    const revisao = upsertLote('revisao', revisaoRows)
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
    return lastResult
  } catch (error) {
    console.error('sync apontamento nuvem → sqlite falhou', error)
    setDataHealthWarning(
      'Não foi possível sincronizar lançamentos da nuvem. Costura/revisão podem estar incompletos.',
    )
    lastAt = Date.now()
    return lastResult
  }
}

/**
 * Baixa lançamentos da nuvem (Costura Produção / Lançar revisão) para o SQLite
 * usado nos KPIs: planilha (fato_*) + tela (*_lancamento).
 */
export async function ensureApontamentosNuvemNoSqlite(options?: {
  force?: boolean
}): Promise<ApontamentoSyncResult> {
  if (!options?.force && lastAt && Date.now() - lastAt < TTL_MS) {
    return lastResult
  }
  if (!inFlight) {
    inFlight = syncOnce().finally(() => {
      inFlight = null
    })
  }
  return inFlight
}
