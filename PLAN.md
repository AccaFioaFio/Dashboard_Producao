# Plano — carga independente (site sempre com os números novos)

Implementação do `PRD.md`. Não altera regras de KPI (`PDR-Dashboard-Apontamento.md`).  
Não executar o publicador em produção até a Fase 1 estar testada neste PC.

---

## Princípio

O trabalho pesado (ler Excel) fica **neste computador**.  
O site **só aplica** o que já foi publicado.  
O leitor **não opera** carga.

O app já tem metade disso:

- Local: `refreshFromExcel` copia, parseia, grava SQLite (`lib/etl/refresh.ts`).
- Nuvem: `persistCloudDb` sobe `dashboard/producao.sqlite`; `ensureCloudDatabase` baixa se o etag mudou (`lib/cloud/carga.ts`).
- Toda consulta em `data/dashboard.ts` já chama `ensureCloudDatabase`.

O que falta é **tirar o humano do meio** (upload no navegador / clique no site) e **disparar a publicação quando o Excel muda**.

---

## Fase 0 — Contrato (feito neste passo)

- [x] `PRD.md` com o objetivo do leitor independente
- [x] Este plano
- [ ] Nas próximas sessões: seguir este PRD; não reintroduzir upload de Excel nas telas do leitor

---

## Fase 1 — Publicador neste PC

Objetivo: salvar o Excel → carga pronta na nuvem, sem abrir o site.

1. [x] **Script de publicação** — `pnpm carga:publish` (`scripts/publish-carga.ts`). Reusa `refreshFromExcel` + `persistCloudDb`. Exige `BLOB_READ_WRITE_TOKEN`. Log com last write / `lidaEm` / erro; não imprime o token.
2. [x] **Watcher** — `pnpm carga:watch`. Debounce 8 s, poll 30 s, retry com backoff se o Excel estiver aberto, ignora o mesmo mtime da última publicação ok, um publish por vez.
3. [x] **Origem real** — `CORTE_XLSX` / `OFICINAS_XLSX` / `SIGNUS_XLS` (absolutos no OneDrive, se for o caso). Relativos resolvem na raiz do projeto.
4. [x] **Como deixar ligado** — `PRD.md` §11 e tela Configurações.

**Fora desta fase:** parse mais rápido, UI nova, Graph/Power Automate.

**Verificação:** alterar (ou tocar) um arquivo de teste / last write; conferir Blob `dashboard/producao.sqlite` novo; abrir o site em janela anônima e ver `lidaEm` novo **sem** enviar planilha.

---

## Fase 2 — Site só consome (leitor independente)

Objetivo: quem abre o `.vercel.app` nunca opera Excel.

1. **Remover o fluxo de upload** das telas do dashboard (`RefreshForm` em visão geral, corte, tecidos, etc.).
2. **Header (ou faixa única):** “Atualizado em {lidaEm}”. Todas as rotas.
3. **Aviso de atraso** se a carga passar do limiar do PRD (30 min em dia de produção) — banner, não some com os KPIs.
4. **Configurações:** só diagnóstico (caminhos, last write, última carga, estado do Blob). Sem `<input type="file">` como caminho feliz.
5. **Confirmar** que `ensureCloudDatabase` roda em todo GET de página (já está em `data/dashboard.ts`). Ajustar se alguma rota não passar por ali.
6. **Manutenção excepcional** (primeiro deploy, Blob vazio): fica fora do leitor — script local da Fase 1, não o Chrome.

**Verificação no navegador:** site na Vercel, sem escolher arquivo, números iguais à última publicação; depois de um `carga:publish`, recarregar e ver horário/números novos; checar uma segunda rota (corte, oficinas) para não ficar estado velho.

---

## Fase 3 — Leitura mais rápida (neste PC)

Não muda o produto para o leitor. Deixa o publicador caber no alvo de 2 minutos.

1. `XLSX.readFile` / `XLSX.read` com `sheets:` só das abas usadas (CORTE, RELATORIO COSTURA, RELATORIO REVISÃO, TABELA OFICINAS, movimentação Signus).
2. Trocar `sheetRows` célula a célula por extração em lote (`sheet_to_json` / range real), sem mudar regras de parse.
3. Ler os três workbooks em paralelo.
4. Se só um `mtime` mudou, reparsear só esse arquivo e reusar fatos dos outros (cuidado: funil/qualidade cruzam as três fontes — o *cruzamento* sempre roda; o *I/O Excel* é que pode pular).

**Verificação:** `pnpm test:kpis` / golden do PDR analítico intacto; tempo de `carga:publish` anotado antes/depois.

---

## Fase 4 — Endurecer (se a Fase 1–2 já atender o aceite)

- Log rotativo da última publicação (`data/publish.log` ou tabela `carga`).
- Não publicar se os três arquivos desaparecerem.
- Documentar `.env.example`: token Blob local, caminhos OneDrive, `pnpm carga:watch`.
- Opcional: atalho na área de trabalho / tarefa agendada “iniciar com o Windows”.

Só então avaliar Graph/Power Automate. Não substitui o publicador local na v1 (timeout e 16 MB na Vercel).

---

## O que não fazer

- Não voltar o upload de `.xlsx` no site como solução.
- Não parsear Excel numa Server Action da Vercel.
- Não pedir ao leitor que clique para “buscar a carga” se ela já está no Blob — o GET da página busca.
- Não apagar SQLite publicado em falha de leitura.
- Não alterar fórmulas 2026 para “facilitar” o transporte.

---

## Ordem de execução

```
Fase 1 (publicador) → Fase 2 (site sem upload) → Fase 3 (parse mais rápido) → Fase 4
```

Fase 1 sozinha já deixa o leitor independente **se** o PC estiver com o watcher (ou um publish manual depois de salvar).  
Fase 2 só então alinha a UI com o PRD.  
Fase 3 é desempenho, não requisito de independência.
