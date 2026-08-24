ALTER TABLE dim_pedido ADD COLUMN no_signus INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS fato_tecido_signus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movimento_id TEXT,
  data TEXT NOT NULL,
  es TEXT NOT NULL,
  qtd REAL NOT NULL DEFAULT 0,
  metros REAL NOT NULL DEFAULT 0,
  cod_produto TEXT NOT NULL,
  nome_produto TEXT,
  almox TEXT,
  categoria TEXT,
  linha TEXT,
  unidade TEXT,
  tipo_movimento TEXT NOT NULL,
  tipo_norm TEXT NOT NULL,
  canal_norm TEXT,
  pedido_norm TEXT,
  origem_mov TEXT,
  is_baixa INTEGER NOT NULL DEFAULT 0,
  excel_row INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_signus_pedido ON fato_tecido_signus (pedido_norm);
CREATE INDEX IF NOT EXISTS idx_signus_cod ON fato_tecido_signus (cod_produto);
CREATE INDEX IF NOT EXISTS idx_signus_data ON fato_tecido_signus (data);
CREATE INDEX IF NOT EXISTS idx_signus_tipo ON fato_tecido_signus (tipo_norm);

ALTER TABLE carga ADD COLUMN signus_path TEXT;
ALTER TABLE carga ADD COLUMN signus_last_write TEXT;
