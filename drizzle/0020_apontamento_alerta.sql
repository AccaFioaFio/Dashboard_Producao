ALTER TABLE costura_lancamento ADD COLUMN aviso_data_producao TEXT;
ALTER TABLE revisao_lancamento ADD COLUMN aviso_data_producao TEXT;

CREATE TABLE IF NOT EXISTS costura_producao_alerta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_norm TEXT NOT NULL,
  cliente TEXT,
  enviado_em TEXT NOT NULL,
  visto_em TEXT
);

CREATE INDEX IF NOT EXISTS idx_costura_alerta_aberto
  ON costura_producao_alerta (visto_em, enviado_em);

CREATE TABLE IF NOT EXISTS costura_producao_alerta_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alerta_id INTEGER NOT NULL REFERENCES costura_producao_alerta(id),
  cod_produto TEXT NOT NULL,
  nome_produto TEXT,
  qtd_pecas REAL,
  data_producao TEXT NOT NULL,
  responsavel TEXT,
  origem TEXT
);

CREATE INDEX IF NOT EXISTS idx_costura_alerta_item
  ON costura_producao_alerta_item (alerta_id);

CREATE TABLE IF NOT EXISTS revisao_alerta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_norm TEXT NOT NULL,
  cliente TEXT,
  enviado_em TEXT NOT NULL,
  visto_em TEXT
);

CREATE INDEX IF NOT EXISTS idx_revisao_alerta_aberto
  ON revisao_alerta (visto_em, enviado_em);

CREATE TABLE IF NOT EXISTS revisao_alerta_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alerta_id INTEGER NOT NULL REFERENCES revisao_alerta(id),
  cod_produto TEXT NOT NULL,
  nome_produto TEXT,
  qtd_pecas REAL,
  data_producao TEXT NOT NULL,
  responsavel TEXT
);

CREATE INDEX IF NOT EXISTS idx_revisao_alerta_item
  ON revisao_alerta_item (alerta_id);
