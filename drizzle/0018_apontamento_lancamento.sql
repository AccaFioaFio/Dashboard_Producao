CREATE TABLE IF NOT EXISTS costura_lancamento (
  pedido_norm TEXT NOT NULL,
  cod_produto TEXT NOT NULL,
  excel_row INTEGER NOT NULL,
  origem TEXT,
  qtd_pecas REAL,
  data_producao TEXT,
  responsavel TEXT,
  atualizado_em TEXT NOT NULL,
  PRIMARY KEY (pedido_norm, cod_produto, excel_row)
);

CREATE INDEX IF NOT EXISTS idx_costura_lancamento_pedido
  ON costura_lancamento (pedido_norm);

CREATE TABLE IF NOT EXISTS revisao_lancamento (
  pedido_norm TEXT NOT NULL,
  cod_produto TEXT NOT NULL,
  excel_row INTEGER NOT NULL,
  qtd_pecas REAL,
  data_producao TEXT,
  responsavel TEXT,
  atualizado_em TEXT NOT NULL,
  PRIMARY KEY (pedido_norm, cod_produto, excel_row)
);

CREATE INDEX IF NOT EXISTS idx_revisao_lancamento_pedido
  ON revisao_lancamento (pedido_norm);
