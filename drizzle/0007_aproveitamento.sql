CREATE TABLE IF NOT EXISTS fato_aproveitamento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  pedido TEXT,
  cliente TEXT,
  data TEXT,
  cod_produto TEXT,
  tecido TEXT,
  modelo TEXT,
  qtd REAL NOT NULL DEFAULT 0,
  excel_row INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aproveitamento_tipo ON fato_aproveitamento (tipo);
CREATE INDEX IF NOT EXISTS idx_aproveitamento_data ON fato_aproveitamento (data);
CREATE INDEX IF NOT EXISTS idx_aproveitamento_modelo ON fato_aproveitamento (modelo);
CREATE INDEX IF NOT EXISTS idx_aproveitamento_cod ON fato_aproveitamento (cod_produto);
