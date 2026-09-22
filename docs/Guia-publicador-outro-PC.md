# Carga via Supabase (igual Orçamentos)

```
Excel → sinc (Arquivos do Excel) → botão / vigia → Supabase → site Vercel
```

Sem Vercel Blob. Sem push de SQLite no dia a dia.

## 1. Criar projeto Supabase (só deste dashboard)

1. https://supabase.com/dashboard → New project  
2. Settings → API: copie URL, `anon` key e `service_role` key  
3. SQL Editor: cole e rode o arquivo  
   `supabase/migrations/20260921183000_carga_storage.sql`  
   (cria `public.carga` + bucket `dashboard-carga`)

## 2. Variáveis

### Neste PC (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### Na Vercel (Production)

As mesmas três (service role só no servidor — não expor no client).

Redeploy depois de salvar.

## 3. Rotina

1. `pnpm carga:sync:watch` — mantém `Arquivos do Excel`  
2. Com `pnpm dev` (ou o site local): **Atualização de dados**  
   → lê Excel → SQLite → Storage + linha em `carga`  
3. Abra o `vercel.app` e atualize a página (ou clique no botão lá para **puxar** a carga já publicada)

Opcional: `pnpm carga:watch` / `pnpm carga:publish` também publicam no Supabase.

## 4. Papéis

| Quem | Faz |
|---|---|
| Sinc | Copia OneDrive/Q: → `Arquivos do Excel` |
| Botão neste PC | Processa Excel e publica (precisa da pasta + service role) |
| Botão no vercel.app | Só baixa a última carga do Storage (não vê o OneDrive) |
| Leitor | Só abre o link |

## 5. Problemas

| Sintoma | Ação |
|---|---|
| Falta SERVICE_ROLE | Preencher `.env.local` / Vercel |
| Bucket/policy | Rodar de novo a migration SQL |
| Pasta Excel incompleta | Conferir a sinc |
| Site velho | Publicar neste PC; no site, refresh ou botão (pull) |
