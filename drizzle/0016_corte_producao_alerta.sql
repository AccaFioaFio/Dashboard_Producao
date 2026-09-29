CREATE TABLE IF NOT EXISTS corte_producao_alerta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_norm TEXT NOT NULL,
  cliente TEXT,
  enviado_em TEXT NOT NULL,
  visto_em TEXT
);

CREATE INDEX IF NOT EXISTS idx_corte_alerta_aberto
  ON corte_producao_alerta (visto_em, enviado_em);

CREATE TABLE IF NOT EXISTS corte_producao_alerta_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alerta_id INTEGER NOT NULL REFERENCES corte_producao_alerta(id),
  cod_produto TEXT NOT NULL,
  nome_produto TEXT,
  qtd_real REAL,
  data_inicio TEXT,
  data_final TEXT NOT NULL,
  responsavel TEXT
);

CREATE INDEX IF NOT EXISTS idx_corte_alerta_item
  ON corte_producao_alerta_item (alerta_id);
