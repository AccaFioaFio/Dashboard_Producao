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

function upsertLote(etapa: EtapaApontamento, rows: ApontamentoNuvemComPedido[]) {
  const tabela = ETAPAS_APONTAMENTO[etapa].tabela
  if (!tabelaExiste(tabela) || !rows.length) {
    return { n: 0, pecas: 0, porDia: {} as Record<string, number> }
  }

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
  const porProduto = new Map<string, { pedidoNorm: string; codProduto: string; rows: number[] }>()

  const gravar = db.transaction(() => {
    for (const row of rows) {
      const excelRow =
        Number.isInteger(row.excelRow) ? row.excelRow : EXCEL_ROW_FORA_DA_CARGA
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
      const chave = `${row.pedidoNorm}\0${row.codProduto}`
      const grupo = porProduto.get(chave) ?? {
        pedidoNorm: row.pedidoNorm,
        codProduto: row.codProduto,
        rows: [] as number[],
      }
      grupo.rows.push(excelRow)
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

    // Mantém só as entradas que vieram da nuvem (várias datas do mesmo produto).
    for (const grupo of porProduto.values()) {
      const unicos = [...new Set(grupo.rows)]
      const placeholders = unicos.map(() => '?').join(', ')
      db.prepare(
        `DELETE FROM ${tabela}
         WHERE pedido_norm = ? AND cod_produto = ? AND excel_row NOT IN (${placeholders})`,
      ).run(grupo.pedidoNorm, grupo.codProduto, ...unicos)
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
