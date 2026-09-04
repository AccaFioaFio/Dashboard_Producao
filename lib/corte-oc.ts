/** Peças da ordem de corte = cabeçalho + linhas * até o próximo cabeçalho. */
export function ocPecasExpr(headerAlias = 'h') {
  return `COALESCE((
    SELECT SUM(l.qtd_pecas)
    FROM fato_corte_linha l
    WHERE l.pedido_norm = ${headerAlias}.pedido_norm
      AND l.excel_row >= ${headerAlias}.excel_row
      AND l.excel_row < ${ocNextHeaderExpr(headerAlias)}
  ), 0)`
}

export function ocNextHeaderExpr(headerAlias = 'h') {
  return `COALESCE(
    (SELECT MIN(h2.excel_row) FROM fato_corte_linha h2
     WHERE h2.is_header = 1 AND h2.excel_row > ${headerAlias}.excel_row),
    1000000000
  )`
}

export function ocJoinLinhas(headerAlias = 'h', lineAlias = 'l') {
  return `${lineAlias}.pedido_norm = ${headerAlias}.pedido_norm
      AND ${lineAlias}.excel_row >= ${headerAlias}.excel_row
      AND ${lineAlias}.excel_row < ${ocNextHeaderExpr(headerAlias)}`
}
