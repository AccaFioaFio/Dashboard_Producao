CREATE TABLE IF NOT EXISTS fato_pedido_item (
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
  valor_pedido_total REAL NOT NULL DEFAULT 0,
  valor_pedido_faturado REAL NOT NULL DEFAULT 0,
  cod_produto TEXT NOT NULL,
  nome_produto TEXT,
  categoria_produto TEXT,
  pedido_cliente TEXT,
  qtd_pedida REAL NOT NULL DEFAULT 0,
  qtd_faturada REAL NOT NULL DEFAULT 0,
  preco_bruto REAL,
  preco_liquido REAL,
  valor_bruto REAL NOT NULL DEFAULT 0,
  valor_liquido REAL NOT NULL DEFAULT 0,
  desconto_total REAL NOT NULL DEFAULT 0,
  data_venda TEXT,
  data_entrega TEXT,
  data_cadastro TEXT,
  excel_row INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pedido_item_norm ON fato_pedido_item (pedido_norm);
CREATE INDEX IF NOT EXISTS idx_pedido_item_cliente ON fato_pedido_item (cliente);
CREATE INDEX IF NOT EXISTS idx_pedido_item_parceiro ON fato_pedido_item (parceiro_codigo);
CREATE INDEX IF NOT EXISTS idx_pedido_item_produto ON fato_pedido_item (cod_produto);
CREATE INDEX IF NOT EXISTS idx_pedido_item_venda ON fato_pedido_item (data_venda);

ALTER TABLE carga ADD COLUMN itens_path TEXT;
ALTER TABLE carga ADD COLUMN itens_last_write TEXT;
