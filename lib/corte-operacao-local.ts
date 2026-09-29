import { getSqlite } from '@/db'

type LancamentoLocal = {
  pedidoNorm: string
  codProduto: string
  excelRow: number
  qtdReal: number | null
  dataInicio: string | null
  dataFinal: string | null
  responsavel: string | null
  avisoDataFinal: string | null
  atualizadoEm: string
}

type AlertaLocal = {
  id: number
  pedidoNorm: string
  cliente: string | null
  enviadoEm: string
  vistoEm: string | null
}

type AlertaItemLocal = {
  alertaId: number
  codProduto: string
  nomeProduto: string | null
  qtdReal: number | null
  dataInicio: string | null
  dataFinal: string
  responsavel: string | null
}

export type CorteOperacaoBackup = {
  lancamentos: LancamentoLocal[]
  alertas: AlertaLocal[]
  itens: AlertaItemLocal[]
}

function tabelaExiste(nome: string) {
  return Boolean(
    getSqlite()
      .prepare(`SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(nome),
  )
}

/** Copia o que o usuário lançou antes de o SQLite da carga ser substituído. */
export function captureCorteOperacao(): CorteOperacaoBackup | null {
  try {
    if (!tabelaExiste('corte_producao_lancamento')) return null
    const db = getSqlite()
    const lancamentos = db
      .prepare(
        `SELECT pedido_norm as pedidoNorm, cod_produto as codProduto,
                excel_row as excelRow, qtd_real as qtdReal,
                data_inicio as dataInicio, data_final as dataFinal,
                responsavel, aviso_data_final as avisoDataFinal,
                atualizado_em as atualizadoEm
         FROM corte_producao_lancamento`,
      )
      .all() as LancamentoLocal[]
    const alertas = tabelaExiste('corte_producao_alerta')
      ? (db
          .prepare(
            `SELECT id, pedido_norm as pedidoNorm, cliente,
                    enviado_em as enviadoEm, visto_em as vistoEm
             FROM corte_producao_alerta`,
          )
          .all() as AlertaLocal[])
      : []
    const itens = tabelaExiste('corte_producao_alerta_item')
      ? (db
          .prepare(
            `SELECT alerta_id as alertaId, cod_produto as codProduto,
                    nome_produto as nomeProduto, qtd_real as qtdReal,
                    data_inicio as dataInicio, data_final as dataFinal, responsavel
             FROM corte_producao_alerta_item`,
          )
          .all() as AlertaItemLocal[])
      : []
    if (!lancamentos.length && !alertas.length) return null
    return { lancamentos, alertas, itens }
  } catch {
    return null
  }
}

/** Recoloca lançamentos mais novos do que os que vieram no SQLite publicado. */
export function mergeCorteOperacao(backup: CorteOperacaoBackup | null) {
  if (!backup) return
  const db = getSqlite()
  const upsert = db.prepare(
    `INSERT INTO corte_producao_lancamento (
       pedido_norm, cod_produto, excel_row, qtd_real, data_inicio, data_final,
       responsavel, aviso_data_final, atualizado_em
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(pedido_norm, cod_produto, excel_row) DO UPDATE SET
       qtd_real = excluded.qtd_real,
       data_inicio = excluded.data_inicio,
       data_final = excluded.data_final,
       responsavel = excluded.responsavel,
       aviso_data_final = excluded.aviso_data_final,
       atualizado_em = excluded.atualizado_em
     WHERE excluded.atualizado_em >= corte_producao_lancamento.atualizado_em`,
  )
  const alertaExiste = db.prepare(
    `SELECT id FROM corte_producao_alerta
     WHERE pedido_norm = ? AND enviado_em = ?`,
  )
  const criarAlerta = db.prepare(
    `INSERT INTO corte_producao_alerta (pedido_norm, cliente, enviado_em, visto_em)
     VALUES (?, ?, ?, ?)`,
  )
  const criarItem = db.prepare(
    `INSERT INTO corte_producao_alerta_item (
       alerta_id, cod_produto, nome_produto, qtd_real, data_inicio, data_final, responsavel
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )

  const gravar = db.transaction(() => {
    for (const row of backup.lancamentos) {
      upsert.run(
        row.pedidoNorm,
        row.codProduto,
        row.excelRow,
        row.qtdReal,
        row.dataInicio,
        row.dataFinal,
        row.responsavel,
        row.avisoDataFinal,
        row.atualizadoEm,
      )
    }
    for (const alerta of backup.alertas) {
      const ja = alertaExiste.get(alerta.pedidoNorm, alerta.enviadoEm) as
        | { id: number }
        | undefined
      if (ja) continue
      const criado = criarAlerta.run(
        alerta.pedidoNorm,
        alerta.cliente,
        alerta.enviadoEm,
        alerta.vistoEm,
      )
      const novoId = Number(criado.lastInsertRowid)
      for (const item of backup.itens) {
        if (item.alertaId !== alerta.id) continue
        criarItem.run(
          novoId,
          item.codProduto,
          item.nomeProduto,
          item.qtdReal,
          item.dataInicio,
          item.dataFinal,
          item.responsavel,
        )
      }
    }
  })
  gravar()
}
