CREATE TABLE IF NOT EXISTS fato_parceiro (
  codigo TEXT PRIMARY KEY,
  uf TEXT NOT NULL,
  estado TEXT,
  municipio TEXT,
  regiao TEXT
);

CREATE INDEX IF NOT EXISTS idx_parceiro_uf ON fato_parceiro (uf);

ALTER TABLE carga ADD COLUMN parceiros_path TEXT;
ALTER TABLE carga ADD COLUMN parceiros_last_write TEXT;
