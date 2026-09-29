CREATE TABLE IF NOT EXISTS corte_producao_lancamento (
  pedido_norm TEXT NOT NULL,
  cod_produto TEXT NOT NULL,
  excel_row INTEGER NOT NULL,
  qtd_real REAL,
  data_inicio TEXT,
  data_final TEXT,
  atualizado_em TEXT NOT NULL,
  PRIMARY KEY (pedido_norm, cod_produto, excel_row)
);

CREATE INDEX IF NOT EXISTS idx_corte_producao_pedido
  ON corte_producao_lancamento (pedido_norm);
