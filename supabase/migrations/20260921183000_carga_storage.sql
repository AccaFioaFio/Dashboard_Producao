-- Dashboard Produção: metadados de carga + bucket do SQLite publicado.
-- As telas leem o SQLite baixado do Storage (mesmas queries); o Postgres guarda o carimbo.

create table if not exists public.carga (
  id bigserial primary key,
  lida_em text not null,
  corte_path text not null,
  oficinas_path text not null,
  signus_path text,
  estoque_path text,
  pedidos_path text,
  itens_path text,
  corte_last_write text,
  oficinas_last_write text,
  signus_last_write text,
  estoque_last_write text,
  pedidos_last_write text,
  itens_last_write text,
  pecas_cortadas double precision,
  pedidos_corte integer,
  pecas_costura_prod double precision,
  pecas_revisao double precision,
  wip_pedidos integer,
  wip_pecas double precision,
  tecido_pedidos integer,
  tecido_pecas double precision,
  oficinas_pendentes double precision,
  ok boolean not null default true,
  erro text,
  storage_path text,
  created_at timestamptz not null default now()
);

create index if not exists idx_carga_lida_em on public.carga (lida_em desc);
create index if not exists idx_carga_ok on public.carga (ok);

alter table public.carga enable row level security;

create policy "carga_select_anon"
  on public.carga for select
  to anon, authenticated
  using (ok = true);

create policy "carga_all_service"
  on public.carga for all
  to service_role
  using (true)
  with check (true);

insert into storage.buckets (id, name, public, file_size_limit)
values ('dashboard-carga', 'dashboard-carga', false, 104857600)
on conflict (id) do nothing;

create policy "dashboard_carga_select_anon"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'dashboard-carga');

create policy "dashboard_carga_all_service"
  on storage.objects for all
  to service_role
  using (bucket_id = 'dashboard-carga')
  with check (bucket_id = 'dashboard-carga');
