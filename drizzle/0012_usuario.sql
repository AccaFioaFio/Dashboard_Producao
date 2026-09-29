CREATE TABLE IF NOT EXISTS usuario (
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  login_norm TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  acessos TEXT NOT NULL
);

INSERT INTO usuario (id, login, login_norm, senha_hash, acessos) VALUES
  (
    1,
    'geral@fioafio',
    'geral@fioafio',
    'scrypt:1776f96f9bd29e1916f0647cb9f1c3b0:c375e9dea5c6986aaa7e20a2592987152495a6a3adc683efa9a9edc0d2565368',
    '["*"]'
  ),
  (
    2,
    'corte@fioafio',
    'corte@fioafio',
    'scrypt:557faafa92b9edc18a5b344967724cee:9ad47f1ce4c32f4f7848c78ab925d15f2358678f5b64b5a5629b64bb61825418',
    '["/corte"]'
  ),
  (
    3,
    'costura#fioafio',
    'costura#fioafio',
    'scrypt:cbfb2285b2859a23e07020b9325649c0:00030ad548a1db833ca9563f16029384a6f3d817ecbc8fadb52389572c3794ad',
    '["/costuras"]'
  ),
  (
    4,
    'Revisão_fioafio',
    'revisão_fioafio',
    'scrypt:90c529308d22619a263d714f2261b9d4:64fa4ede33fe6260b3779e4521571ae8c0d502dc2a5a952eb9d5c85babb38085',
    '["/revisao"]'
  )
ON CONFLICT(id) DO NOTHING;
