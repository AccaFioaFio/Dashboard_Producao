CREATE TABLE IF NOT EXISTS programacao_linha (
  key TEXT PRIMARY KEY NOT NULL,
  pedido TEXT NOT NULL,
  pedido_norm TEXT,
  cliente TEXT,
  item_id TEXT NOT NULL,
  cod_produto TEXT NOT NULL DEFAULT '',
  nome TEXT NOT NULL,
  qtd_pedido REAL,
  quantidade_producao TEXT NOT NULL,
  data_inicio TEXT NOT NULL,
  data_fim TEXT NOT NULL,
  saved_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_programacao_linha_pedido_norm
  ON programacao_linha (pedido_norm);

CREATE INDEX IF NOT EXISTS idx_programacao_linha_pedido
  ON programacao_linha (pedido);

CREATE INDEX IF NOT EXISTS idx_programacao_linha_periodo
  ON programacao_linha (data_inicio, data_fim);
