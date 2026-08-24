CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_pedido (
  pedido_norm TEXT PRIMARY KEY,
  pedido_raw TEXT NOT NULL,
  cliente TEXT,
  canal TEXT,
  no_corte INTEGER NOT NULL DEFAULT 0,
  no_costura_prod INTEGER NOT NULL DEFAULT 0,
  no_revisao INTEGER NOT NULL DEFAULT 0,
  no_oficinas INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dim_data (
  data TEXT PRIMARY KEY,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  dia INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_canal (
  canal TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS dim_responsavel (
  responsavel TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS dim_oficina (
  oficina TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS dim_produto (
  produto TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS fato_corte_linha (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_norm TEXT NOT NULL,
  data TEXT,
  is_header INTEGER NOT NULL,
  is_star INTEGER NOT NULL,
  qtd_pecas REAL,
  qtd_terceiros REAL,
  qtd_estoque REAL,
  metros REAL,
  economia REAL,
  tecido TEXT,
  status TEXT,
  responsavel TEXT,
  canal TEXT,
  cliente TEXT,
  inicio_corte TEXT,
  final_corte TEXT,
  dias_de_corte_raw REAL,
  excel_row INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_corte_linha_pedido ON fato_corte_linha (pedido_norm);
CREATE INDEX IF NOT EXISTS idx_corte_linha_data ON fato_corte_linha (data);

CREATE TABLE IF NOT EXISTS fato_corte_pedido (
  pedido_norm TEXT PRIMARY KEY,
  data TEXT,
  status_vigente TEXT,
  pecas REAL NOT NULL DEFAULT 0,
  terceiros REAL NOT NULL DEFAULT 0,
  estoque REAL NOT NULL DEFAULT 0,
  metros REAL NOT NULL DEFAULT 0,
  economia REAL NOT NULL DEFAULT 0,
  responsavel TEXT,
  canal TEXT,
  cliente TEXT,
  inicio_corte TEXT,
  final_corte TEXT,
  lead_time_dias REAL,
  status_duplo INTEGER NOT NULL DEFAULT 0,
  headers_count INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_corte_pedido_status ON fato_corte_pedido (status_vigente);
CREATE INDEX IF NOT EXISTS idx_corte_pedido_data ON fato_corte_pedido (data);
CREATE INDEX IF NOT EXISTS idx_corte_pedido_canal ON fato_corte_pedido (canal);

CREATE TABLE IF NOT EXISTS fato_costura (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_norm TEXT NOT NULL,
  data_producao TEXT NOT NULL,
  origem TEXT NOT NULL,
  origem_norm TEXT NOT NULL,
  qtd_pecas REAL NOT NULL DEFAULT 0,
  responsavel TEXT,
  produto TEXT,
  excel_row INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_costura_pedido ON fato_costura (pedido_norm);
CREATE INDEX IF NOT EXISTS idx_costura_origem ON fato_costura (origem_norm);
CREATE INDEX IF NOT EXISTS idx_costura_data ON fato_costura (data_producao);

CREATE TABLE IF NOT EXISTS fato_revisao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_norm TEXT NOT NULL,
  data_producao TEXT NOT NULL,
  qtd_pecas REAL NOT NULL,
  responsavel TEXT,
  produto TEXT,
  excel_row INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revisao_pedido ON fato_revisao (pedido_norm);
CREATE INDEX IF NOT EXISTS idx_revisao_data ON fato_revisao (data_producao);

CREATE TABLE IF NOT EXISTS fato_oficinas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_norm TEXT,
  oficina TEXT NOT NULL,
  data_envio TEXT NOT NULL,
  qtd_enviadas REAL NOT NULL DEFAULT 0,
  qtd_retornadas REAL NOT NULL DEFAULT 0,
  qtd_pendentes REAL NOT NULL DEFAULT 0,
  qtd_defeitos REAL NOT NULL DEFAULT 0,
  status_entrega TEXT,
  data_prometida TEXT,
  data_retorno TEXT,
  produto TEXT,
  valor_total REAL,
  excel_row INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oficinas_pedido ON fato_oficinas (pedido_norm);
CREATE INDEX IF NOT EXISTS idx_oficinas_oficina ON fato_oficinas (oficina);
CREATE INDEX IF NOT EXISTS idx_oficinas_data ON fato_oficinas (data_envio);

CREATE TABLE IF NOT EXISTS qualidade_evento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  pedido_norm TEXT,
  detalhe TEXT,
  excel_row INTEGER,
  valor REAL
);

CREATE TABLE IF NOT EXISTS carga (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lida_em TEXT NOT NULL,
  corte_path TEXT NOT NULL,
  oficinas_path TEXT NOT NULL,
  corte_last_write TEXT,
  oficinas_last_write TEXT,
  pecas_cortadas REAL,
  pedidos_corte INTEGER,
  pecas_costura_prod REAL,
  pecas_revisao REAL,
  wip_pedidos INTEGER,
  wip_pecas REAL,
  tecido_pedidos INTEGER,
  tecido_pecas REAL,
  oficinas_pendentes REAL,
  ok INTEGER NOT NULL,
  erro TEXT
);
