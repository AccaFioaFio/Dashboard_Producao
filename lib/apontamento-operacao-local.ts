import { getSqlite } from '@/db'
import { ETAPAS_APONTAMENTO, type EtapaApontamento } from '@/lib/apontamento'

type LinhaLocal = {
  pedidoNorm: string
  codProduto: string
  excelRow: number
  origem: string | null
  qtdPecas: number | null
  dataProducao: string | null
  responsavel: string | null
  nomeProduto: string | null
  atualizadoEm: string
}

export type ApontamentoOperacaoBackup = Record<EtapaApontamento, LinhaLocal[]>

function tabelaExiste(nome: string) {
  return Boolean(
    getSqlite()
      .prepare(`SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(nome),
  )
}

function ler(etapa: EtapaApontamento): LinhaLocal[] {
  const tabela = ETAPAS_APONTAMENTO[etapa].tabela
  if (!tabelaExiste(tabela)) return []
  const origem =
    etapa === 'costura' ? 'origem' : 'NULL as origem'
  return getSqlite()
    .prepare(
      `SELECT pedido_norm as pedidoNorm, cod_produto as codProduto,
              excel_row as excelRow, ${origem}, qtd_pecas as qtdPecas,
              data_producao as dataProducao, responsavel,
              nome_produto as nomeProduto,
              atualizado_em as atualizadoEm
       FROM ${tabela}`,
    )
    .all() as LinhaLocal[]
}

/** Copia costura e revisão lançadas na tela antes de o SQLite da carga ser substituído. */
export function captureApontamentoOperacao(): ApontamentoOperacaoBackup | null {
  try {
    const backup: ApontamentoOperacaoBackup = {
      costura: ler('costura'),
      revisao: ler('revisao'),
    }
    if (!backup.costura.length && !backup.revisao.length) return null
    return backup
  } catch {
    return null
  }
}

/** Recoloca lançamentos mais novos do que os que vieram no SQLite publicado. */
export function mergeApontamentoOperacao(backup: ApontamentoOperacaoBackup | null) {
  if (!backup) return
  const db = getSqlite()

  const gravar = db.transaction(() => {
    for (const etapa of ['costura', 'revisao'] as const) {
      const tabela = ETAPAS_APONTAMENTO[etapa].tabela
      const colunasOrigem = etapa === 'costura' ? 'origem, ' : ''
      const valoresOrigem = etapa === 'costura' ? '?, ' : ''
      const atualizaOrigem = etapa === 'costura' ? 'origem = excluded.origem,' : ''
      const upsert = db.prepare(
        `INSERT INTO ${tabela} (
           pedido_norm, cod_produto, excel_row, ${colunasOrigem}qtd_pecas, data_producao,
           responsavel, nome_produto, atualizado_em
         ) VALUES (?, ?, ?, ${valoresOrigem}?, ?, ?, ?, ?)
         ON CONFLICT(pedido_norm, cod_produto, excel_row) DO UPDATE SET
           ${atualizaOrigem}
           qtd_pecas = excluded.qtd_pecas,
           data_producao = excluded.data_producao,
           responsavel = excluded.responsavel,
           nome_produto = COALESCE(excluded.nome_produto, ${tabela}.nome_produto),
           atualizado_em = excluded.atualizado_em
         WHERE excluded.atualizado_em >= ${tabela}.atualizado_em`,
      )
      for (const row of backup[etapa]) {
        const comuns = [
          row.pedidoNorm,
          row.codProduto,
          row.excelRow,
          ...(etapa === 'costura' ? [row.origem] : []),
          row.qtdPecas,
          row.dataProducao,
          row.responsavel,
          row.nomeProduto,
          row.atualizadoEm,
        ]
        upsert.run(...comuns)
      }
    }
  })
  gravar()
}
