ALTER TABLE fato_tecido_signus ADD COLUMN valor_unitario REAL;
ALTER TABLE fato_tecido_signus ADD COLUMN valor_total REAL;
ALTER TABLE fato_tecido_signus ADD COLUMN valor_unitario_liq REAL;
ALTER TABLE fato_tecido_signus ADD COLUMN valor_total_liq REAL;
ALTER TABLE fato_tecido_signus ADD COLUMN tipo_documento TEXT;
ALTER TABLE fato_tecido_signus ADD COLUMN tipo_documento_sigla TEXT;
CREATE INDEX IF NOT EXISTS idx_signus_documento ON fato_tecido_signus (tipo_documento);
