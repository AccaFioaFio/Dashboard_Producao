CREATE TABLE IF NOT EXISTS programacao_historico (
  id TEXT PRIMARY KEY NOT NULL,
  ocorrido_em TEXT NOT NULL,
  usuario_login TEXT NOT NULL,
  acao TEXT NOT NULL,
  pedido TEXT,
  pedido_norm TEXT,
  cliente TEXT,
  item_key TEXT,
  item_nome TEXT,
  detalhe TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_programacao_historico_ocorrido
  ON programacao_historico (ocorrido_em DESC);

CREATE INDEX IF NOT EXISTS idx_programacao_historico_pedido
  ON programacao_historico (pedido_norm, pedido);

CREATE INDEX IF NOT EXISTS idx_programacao_historico_usuario
  ON programacao_historico (usuario_login);
