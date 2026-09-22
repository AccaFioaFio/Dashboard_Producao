-- Espelho Postgres do modelo analítico (db/schema.ts).
-- A carga operacional atual publica o SQLite no Storage; estas tabelas
-- ficam prontas para migração futura linha-a-linha (estilo Orçamentos).

create table if not exists public.dim_pedido (
  pedido_norm text primary key,
  pedido_raw text not null,
  cliente text,
  canal text,
  no_corte boolean not null default false,
  no_costura_prod boolean not null default false,
  no_revisao boolean not null default false,
  no_oficinas boolean not null default false,
  no_signus boolean not null default false
);

create table if not exists public.dim_data (
  data text primary key,
  ano integer not null,
  mes integer not null,
  dia integer not null
);

create table if not exists public.dim_canal (
  canal text primary key
);

create table if not exists public.dim_responsavel (
  responsavel text primary key
);

create table if not exists public.dim_oficina (
  oficina text primary key
);

create table if not exists public.dim_produto (
  produto text primary key
);

create table if not exists public.fato_corte_linha (
  id bigserial primary key,
  pedido_norm text not null,
  data text,
  is_header boolean not null,
  is_star boolean not null,
  qtd_pecas double precision,
  qtd_terceiros double precision,
  qtd_estoque double precision,
  metros double precision,
  economia double precision,
  tecido text,
  cod_tecido text,
  status text,
  responsavel text,
  canal text,
  cliente text,
  inicio_corte text,
  final_corte text,
  pcp_prontas text,
  observacao text,
  dias_de_corte_raw double precision,
  excel_row integer not null
);
create index if not exists idx_pg_corte_linha_pedido on public.fato_corte_linha (pedido_norm);
create index if not exists idx_pg_corte_linha_data on public.fato_corte_linha (data);

create table if not exists public.fato_corte_pedido (
  pedido_norm text primary key,
  data text,
  status_vigente text,
  pecas double precision not null default 0,
  terceiros double precision not null default 0,
  estoque double precision not null default 0,
  metros double precision not null default 0,
  economia double precision not null default 0,
  responsavel text,
  canal text,
  cliente text,
  inicio_corte text,
  final_corte text,
  pcp_prontas text,
  observacao text,
  lead_time_dias double precision,
  status_duplo boolean not null default false,
  headers_count integer not null default 1
);

create table if not exists public.fato_costura (
  id bigserial primary key,
  pedido_norm text not null,
  data_producao text not null,
  origem text not null,
  origem_norm text not null,
  qtd_pecas double precision not null default 0,
  responsavel text,
  produto text,
  excel_row integer not null
);

create table if not exists public.fato_revisao (
  id bigserial primary key,
  pedido_norm text not null,
  data_producao text not null,
  qtd_pecas double precision not null,
  responsavel text,
  produto text,
  excel_row integer not null
);

create table if not exists public.fato_oficinas (
  id bigserial primary key,
  pedido_norm text,
  oficina text not null,
  data_envio text not null,
  qtd_enviadas double precision not null default 0,
  qtd_retornadas double precision not null default 0,
  qtd_pendentes double precision not null default 0,
  qtd_defeitos double precision not null default 0,
  status_entrega text,
  data_prometida text,
  data_retorno text,
  produto text,
  valor_total double precision,
  excel_row integer not null
);

create table if not exists public.fato_tecido_signus (
  id bigserial primary key,
  movimento_id text,
  data text not null,
  es text not null,
  qtd double precision not null default 0,
  metros double precision not null default 0,
  cod_produto text not null,
  nome_produto text,
  almox text,
  categoria text,
  linha text,
  unidade text,
  tipo_movimento text not null,
  tipo_norm text not null,
  canal_norm text,
  pedido_norm text,
  origem_mov text,
  is_baixa boolean not null default false,
  valor_unitario double precision,
  valor_total double precision,
  valor_unitario_liq double precision,
  valor_total_liq double precision,
  tipo_documento text,
  tipo_documento_sigla text,
  excel_row integer not null
);

create table if not exists public.fato_tecido_estoque (
  cod_produto text primary key,
  nome_produto text,
  categoria text,
  unidade text,
  saldo_atual double precision not null default 0,
  saldo_reservado double precision not null default 0,
  em_metros boolean not null default false,
  excel_row integer not null
);

create table if not exists public.fato_pedido_comercial (
  id bigserial primary key,
  pedido_norm text not null,
  pedido_raw text not null,
  unidade_negocio text,
  canal text,
  parceiro_codigo text,
  parceiro_cnpj text,
  cliente text,
  razao_social text,
  tipo_comercializacao text,
  status text,
  valor_total double precision not null default 0,
  valor_faturado double precision not null default 0,
  data_cadastro text,
  data_venda text,
  data_faturamento text,
  data_cancelamento text,
  vendedor text,
  excel_row integer not null
);

create table if not exists public.fato_pedido_item (
  id bigserial primary key,
  pedido_norm text not null,
  pedido_raw text not null,
  unidade_negocio text,
  canal text,
  parceiro_codigo text,
  parceiro_cnpj text,
  cliente text,
  razao_social text,
  tipo_comercializacao text,
  status text,
  valor_pedido_total double precision not null default 0,
  valor_pedido_faturado double precision not null default 0,
  cod_produto text not null,
  nome_produto text,
  categoria_produto text,
  pedido_cliente text,
  qtd_pedida double precision not null default 0,
  qtd_faturada double precision not null default 0,
  preco_bruto double precision,
  preco_liquido double precision,
  valor_bruto double precision not null default 0,
  valor_liquido double precision not null default 0,
  desconto_total double precision not null default 0,
  data_venda text,
  data_entrega text,
  data_cadastro text,
  excel_row integer not null
);

create table if not exists public.fato_aproveitamento (
  id bigserial primary key,
  tipo text not null,
  pedido text,
  cliente text,
  data text,
  cod_produto text,
  tecido text,
  modelo text,
  qtd double precision not null default 0,
  excel_row integer not null
);

create table if not exists public.qualidade_evento (
  id bigserial primary key,
  tipo text not null,
  pedido_norm text,
  detalhe text,
  excel_row integer,
  valor double precision
);
