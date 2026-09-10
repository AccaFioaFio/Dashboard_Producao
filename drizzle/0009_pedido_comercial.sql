CREATE TABLE IF NOT EXISTS fato_pedido_comercial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_norm TEXT NOT NULL,
  pedido_raw TEXT NOT NULL,
  unidade_negocio TEXT,
  canal TEXT,
  parceiro_codigo TEXT,
  parceiro_cnpj TEXT,
  cliente TEXT,
  razao_social TEXT,
  tipo_comercializacao TEXT,
  status TEXT,
  valor_total REAL NOT NULL DEFAULT 0,
  valor_faturado REAL NOT NULL DEFAULT 0,
  data_cadastro TEXT,
  data_venda TEXT,
  data_faturamento TEXT,
  data_cancelamento TEXT,
  vendedor TEXT,
  excel_row INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pedido_comercial_norm ON fato_pedido_comercial (pedido_norm);
CREATE INDEX IF NOT EXISTS idx_pedido_comercial_cliente ON fato_pedido_comercial (cliente);
CREATE INDEX IF NOT EXISTS idx_pedido_comercial_venda ON fato_pedido_comercial (data_venda);
CREATE INDEX IF NOT EXISTS idx_pedido_comercial_canal ON fato_pedido_comercial (canal);

ALTER TABLE carga ADD COLUMN pedidos_path TEXT;
ALTER TABLE carga ADD COLUMN pedidos_last_write TEXT;
