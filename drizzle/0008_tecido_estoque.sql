CREATE TABLE IF NOT EXISTS fato_tecido_estoque (
  cod_produto TEXT PRIMARY KEY NOT NULL,
  nome_produto TEXT,
  categoria TEXT,
  unidade TEXT,
  saldo_atual REAL NOT NULL DEFAULT 0,
  saldo_reservado REAL NOT NULL DEFAULT 0,
  em_metros INTEGER NOT NULL DEFAULT 0,
  excel_row INTEGER NOT NULL
);

ALTER TABLE carga ADD COLUMN estoque_path TEXT;
ALTER TABLE carga ADD COLUMN estoque_last_write TEXT;
