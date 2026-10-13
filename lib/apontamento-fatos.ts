import { getSqlite } from '@/db'

/**
 * Costura/revisão no painel = planilha (fato_*) + lançamentos da tela (*_lancamento).
 * Corte continua só na planilha.
 */

/** Origem Produção no formulário de Costura Produção. */
export const SQL_ORIGEM_PRODUCAO_LANC = `origem = 'Produção'`

function tabelaExiste(nome: string) {
  return Boolean(
    getSqlite()
      .prepare(`SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(nome),
  )
}

/** Planilha + lançamentos de costura (todas as origens). */
export function sqlCosturaUnion(alias = 'c') {
  return `(
    SELECT pedido_norm, data_producao, qtd_pecas, responsavel, produto,
           origem, origem_norm, excel_row
    FROM fato_costura
    UNION ALL
    SELECT pedido_norm, data_producao, qtd_pecas, responsavel,
           COALESCE(nome_produto, cod_produto) as produto,
           COALESCE(origem, 'Sem origem') as origem,
           CASE
             WHEN origem = 'Produção' THEN 'Producao'
             WHEN origem LIKE '%Etiqueta%' THEN 'Troca de Etiqueta'
             WHEN origem LIKE '%Feston%' THEN 'Aplicacao de Festone'
             WHEN origem LIKE '%Conserto%' THEN 'Conserto'
             ELSE COALESCE(origem, 'Sem origem')
           END as origem_norm,
           excel_row
    FROM costura_lancamento
    WHERE qtd_pecas IS NOT NULL AND origem IS NOT NULL
  ) ${alias}`
}

/** Só Costura Produção (planilha + tela). */
export function sqlCosturaProducaoUnion(alias = 'c') {
  return `(
    SELECT pedido_norm, data_producao, qtd_pecas, responsavel, produto,
           origem, origem_norm, excel_row
    FROM fato_costura
    WHERE origem_norm = 'Producao'
    UNION ALL
    SELECT pedido_norm, data_producao, qtd_pecas, responsavel,
           COALESCE(nome_produto, cod_produto) as produto,
           origem, 'Producao' as origem_norm, excel_row
    FROM costura_lancamento
    WHERE qtd_pecas IS NOT NULL AND ${SQL_ORIGEM_PRODUCAO_LANC}
  ) ${alias}`
}

/** Planilha + lançamentos de revisão. */
export function sqlRevisaoUnion(alias = 'r') {
  return `(
    SELECT pedido_norm, data_producao, qtd_pecas, responsavel, produto, excel_row
    FROM fato_revisao
    UNION ALL
    SELECT pedido_norm, data_producao, qtd_pecas, responsavel,
           COALESCE(nome_produto, cod_produto) as produto, excel_row
    FROM revisao_lancamento
    WHERE qtd_pecas IS NOT NULL
  ) ${alias}`
}

/**
 * Marca no dim_pedido quem já tem costura produção / revisão na tela.
 * Soma com a planilha (OR); não apaga flag que veio do Excel.
 */
export function syncDimPedidoApontamento(pedidoNorm?: string) {
  const db = getSqlite()
  if (!tabelaExiste('dim_pedido')) return

  const filtroPedido = pedidoNorm ? 'AND pedido_norm = ?' : ''
  const params = pedidoNorm ? [pedidoNorm] : []

  if (tabelaExiste('costura_lancamento')) {
    const pedidos = db
      .prepare(
        `SELECT DISTINCT pedido_norm as pedidoNorm
         FROM costura_lancamento
         WHERE qtd_pecas IS NOT NULL AND ${SQL_ORIGEM_PRODUCAO_LANC} ${filtroPedido}`,
      )
      .all(...params) as { pedidoNorm: string }[]

    const upsert = db.prepare(
      `INSERT INTO dim_pedido (
         pedido_norm, pedido_raw, cliente, canal,
         no_corte, no_costura_prod, no_revisao, no_oficinas, no_signus
       ) VALUES (?, ?, NULL, NULL, 0, 1, 0, 0, 0)
       ON CONFLICT(pedido_norm) DO UPDATE SET no_costura_prod = 1`,
    )
    for (const row of pedidos) upsert.run(row.pedidoNorm, row.pedidoNorm)
  }

  if (tabelaExiste('revisao_lancamento')) {
    const pedidos = db
      .prepare(
        `SELECT DISTINCT pedido_norm as pedidoNorm
         FROM revisao_lancamento
         WHERE qtd_pecas IS NOT NULL ${filtroPedido}`,
      )
      .all(...params) as { pedidoNorm: string }[]

    const upsert = db.prepare(
      `INSERT INTO dim_pedido (
         pedido_norm, pedido_raw, cliente, canal,
         no_corte, no_costura_prod, no_revisao, no_oficinas, no_signus
       ) VALUES (?, ?, NULL, NULL, 0, 0, 1, 0, 0)
       ON CONFLICT(pedido_norm) DO UPDATE SET no_revisao = 1`,
    )
    for (const row of pedidos) upsert.run(row.pedidoNorm, row.pedidoNorm)
  }

  if (!pedidoNorm) return

  // Ao limpar lançamento, recalcula a flag (planilha OR tela).
  if (tabelaExiste('costura_lancamento') && tabelaExiste('fato_costura')) {
    const tem =
      Boolean(
        db
          .prepare(
            `SELECT 1 as v FROM fato_costura
             WHERE pedido_norm = ? AND origem_norm = 'Producao' LIMIT 1`,
          )
          .get(pedidoNorm),
      ) ||
      Boolean(
        db
          .prepare(
            `SELECT 1 as v FROM costura_lancamento
             WHERE pedido_norm = ? AND qtd_pecas IS NOT NULL AND ${SQL_ORIGEM_PRODUCAO_LANC}
             LIMIT 1`,
          )
          .get(pedidoNorm),
      )
    db.prepare(`UPDATE dim_pedido SET no_costura_prod = ? WHERE pedido_norm = ?`).run(
      tem ? 1 : 0,
      pedidoNorm,
    )
  }

  if (tabelaExiste('revisao_lancamento') && tabelaExiste('fato_revisao')) {
    const tem =
      Boolean(
        db
          .prepare(`SELECT 1 as v FROM fato_revisao WHERE pedido_norm = ? LIMIT 1`)
          .get(pedidoNorm),
      ) ||
      Boolean(
        db
          .prepare(
            `SELECT 1 as v FROM revisao_lancamento
             WHERE pedido_norm = ? AND qtd_pecas IS NOT NULL LIMIT 1`,
          )
          .get(pedidoNorm),
      )
    db.prepare(`UPDATE dim_pedido SET no_revisao = ? WHERE pedido_norm = ?`).run(
      tem ? 1 : 0,
      pedidoNorm,
    )
  }
}

/** Soma auxiliar (testes / refresh). */
export function somarPecasCosturaProducao() {
  if (!tabelaExiste('fato_costura')) return 0
  const temLanc = tabelaExiste('costura_lancamento')
  const row = getSqlite()
    .prepare(
      temLanc
        ? `SELECT COALESCE(SUM(qtd_pecas), 0) as v FROM ${sqlCosturaProducaoUnion('c')}`
        : `SELECT COALESCE(SUM(qtd_pecas), 0) as v FROM fato_costura WHERE origem_norm = 'Producao'`,
    )
    .get() as { v: number }
  return row.v
}

export function somarPecasRevisao() {
  if (!tabelaExiste('fato_revisao')) return 0
  const temLanc = tabelaExiste('revisao_lancamento')
  const row = getSqlite()
    .prepare(
      temLanc
        ? `SELECT COALESCE(SUM(qtd_pecas), 0) as v FROM ${sqlRevisaoUnion('r')}`
        : `SELECT COALESCE(SUM(qtd_pecas), 0) as v FROM fato_revisao`,
    )
    .get() as { v: number }
  return row.v
}
