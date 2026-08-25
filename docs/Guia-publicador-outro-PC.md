# Guia do publicador — outro PC

Dashboard Produção. Como a planilha chega no site **sem** enviar ficheiro no navegador.

No Cursor, peça: *“leia docs/Guia-publicador-outro-PC.md e me ajude neste PC”*.

Há um PDF irmão: `docs/Guia-publicador-outro-PC.pdf`.

---

## 1. Em uma frase

O site na Vercel **não lê o Excel**. Um programa neste computador (o **publicador / vigia**) lê as três planilhas, monta um SQLite e envia para o Blob. Quem abre o dashboard só recarrega a página.

```
Excel salvo neste PC  →  terminal com o vigia  →  Blob na Vercel  →  o site mostra os números
```

## 2. As três peças (não misture)

| Peça | O que é | O que você faz |
|---|---|---|
| Código (GitHub) | O programa do dashboard e do vigia | Clone ou `git pull` uma vez. Não é a planilha. |
| Números (Blob) | Arquivo `dashboard/producao.sqlite` na nuvem | O vigia atualiza sozinho quando o Excel é salvo. |
| Segredos e caminhos (`.env.local`) | Token do Blob + pastas das planilhas **deste** PC | Criar de novo em cada máquina. **Não vai no Git**. |

Se o PC desligar ou o terminal fechar: o site continua no ar, com a **última carga boa**. Só para de atualizar até o vigia voltar em algum PC.

Só **um** computador deve ter o vigia ligado. Notebook e PC do trabalho ao mesmo tempo brigam para publicar.

## 3. O que você NÃO precisa fazer de novo

- Criar outro Blob na Vercel (já existe: `dashboard-producao1-blob`, Private, GRU1).
- Colocar o token outra vez em Environment Variables da Vercel (já está no projeto para o **site** ler o Blob).
- Escolher / enviar planilha no navegador.
- **Fazer deploy a cada atualização de Excel.** Deploy reconstrói o *código* do site. Salvar a planilha é só *dado*: o vigia manda para o Blob; ninguém precisa de `git push` nem Redeploy.

## 4. Passo a passo no PC novo

Pasta do projeto = a pasta que contém `package.json`.

### Passo A — Trazer o código

Repositório: `https://github.com/AccaFioaFio/Dashboard_Producao`

- Se a pasta **não existe**: clone (GitHub Desktop ou `git clone`).
- Se a pasta **já existe**: abra o terminal nela e rode `git pull`.

O `.env.local` **não** vem no clone/pull. É normal. Você cria no passo C.

### Passo B — Instalar pacotes (uma vez nesta máquina)

No terminal, **dentro da pasta do projeto**:

```powershell
pnpm install
```

Espere `Done in …`, **sem** `ERR_` no final.

Não rode `pnpm dev` / `npm run dev` ao mesmo tempo que o install. Isso trava o `better-sqlite3` e aparece `EPERM`. Feche o site local, depois instale de novo.

Evite `pnpm carga:watch` se o pnpm 11 disparar install sozinho. Use o comando do passo E.

### Passo C — Criar o ficheiro `.env.local`

Na raiz do projeto (junto do `package.json`). **Não** cole nada no `package.json`.

```
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_COLE_AQUI
BLOB_STORE_ID=store_qviaeEZFcFgswkZZ
CORTE_XLSX="C:/Users/SEU_USUARIO/OneDrive/.../PROGRAMAÇÃO CORTE E COSTURA .xlsx"
OFICINAS_XLSX="C:/Users/SEU_USUARIO/OneDrive/.../Produção Oficinas.xlsx"
SIGNUS_XLS="C:/Users/SEU_USUARIO/OneDrive/.../Movimentação Tecidos.xls"
```

- Caminhos **absolutos deste PC**, com aspas e barras `/` (não `\`).
- Os caminhos do notebook **não servem** no PC do trabalho.
- O token da Vercel é o **mesmo** em todos os PCs (é o mesmo Blob).

### Passo D — Copiar o token (sem errar o campo)

1. Vercel → projeto `dashboard-producao1` → Storage → Blob `dashboard-producao1-blob`.
2. Aba **.env.local** (não “Create Private Blob”).
3. Olho / Show secrets. Ícone de copiar.
4. Se estiver a *adicionar variável* na Vercel: a Key já é `BLOB_READ_WRITE_TOKEN`; o Value é **só** `vercel_blob_rw_...`, sem `BLOB_READ_WRITE_TOKEN=` e sem aspas.
5. No `.env.local` deste PC: `BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...`

Não cole o token no chat nem no Git. Se vazar, gere outro no Blob e atualize o `.env.local`.

### Passo E — Ligar o vigia (o “ponto 4” do dia a dia)

Isso **não** é deploy. É deixar um programa **acordado** o expediente todo, olhando as três planilhas.

```powershell
npx tsx scripts/publish-carga.ts --watch
```

Tem que aparecer:

```
watcher no ar. Ctrl+C para parar. Este PC precisa ficar ligado.
corte    C:/Users/.../PROGRAMAÇÃO CORTE E COSTURA .xlsx
oficinas C:/Users/.../Produção Oficinas.xlsx
signus   C:/Users/.../Movimentação Tecidos.xls
```

A janela fica **ocupada**: o prompt `PS C:\...>` **não** volta. Não feche, não dê Ctrl+C, não desligue o PC no meio do dia.

Se os três caminhos ainda forem os do notebook, o `.env.local` deste PC está errado. Se o prompt voltar na hora, o vigia **morreu** — rode o mesmo comando de novo. **Não cole** a mensagem de erro de volta no terminal.

Quem aponta no Excel só precisa **salvar**. Em até ~2 minutos, recarregue o site (Ctrl+Shift+R). Não escolha ficheiro no navegador.

### Passo F — Conferir no site

Abra `https://dashboard-producao1.vercel.app/configuracoes`.

- **Última leitura** deve ter data/hora, não `—`.
- Caminhos `/var/task/Arquivos do Excel/...` na nuvem são **normais**: o site não tem o Excel; lê o Blob.

## 5. Rotina

| Quando | O que fazer |
|---|---|
| Começo do expediente (PC já configurado) | Só o passo E: `--watch` e deixar a janela aberta. |
| Alguém salvou o Excel | Nada no Git. Recarregar o site depois de 1–2 min. |
| Fim do expediente | Pode fechar o terminal e desligar. O site fica na última carga. |
| Trocar de máquina | No PC que for usar: passo E. Não ligue o vigia nos dois. |
| Mudou o código (bug, tela) | Aí sim: commit, push, esperar Deploy **Ready**. |

## 6. Problemas comuns

| O que aparece | Significado | O que fazer |
|---|---|---|
| `Cannot find module 'better-sqlite3'` | Pacotes em falta | Fechar o `dev`. `pnpm install` até `Done`. Depois passo E. |
| `EPERM` no `better-sqlite3` | `next dev` com o ficheiro aberto | Ctrl+C no `dev`. Instalar de novo. |
| Site com Última leitura `—` | Site não leu o Blob | Env vars Production + Redeploy. Não é o Excel. |
| Token no `package.json` | Ficheiro errado | Apagar a linha. Colar só no `.env.local`. |

## 7. Para o assistente no Cursor (não apagar)

Quando o utilizador pedir ajuda noutra máquina: ler este ficheiro.

- Repo: `AccaFioaFio/Dashboard_Producao` · site: `https://dashboard-producao1.vercel.app`
- Blob: `dashboard-producao1-blob`, private, região gru1. Path da carga: `dashboard/producao.sqlite` (`lib/cloud/constants.ts`).
- Publicar neste PC: `npx tsx scripts/publish-carga.ts --watch` (preferir isto a `pnpm carga:watch` se o pnpm 11 disparar install). Env: `lib/load-env.ts` lê `.env` e `.env.local`.
- Variáveis: `BLOB_READ_WRITE_TOKEN` (obrigatório para publicar), `BLOB_STORE_ID`, `CORTE_XLSX`, `OFICINAS_XLSX`, `SIGNUS_XLS` — `lib/paths.ts`. Relativos resolvem na raiz; OneDrive = absoluto com `/`.
- Site na Vercel: `ensureCloudDatabase` em `lib/cloud/carga.ts` (só se `VERCEL=1`). Precisa token ou OIDC + `BLOB_STORE_ID`. Caminhos `/var/task/...` no ecrã Configurações são o filesystem serverless, não a origem.
- pnpm 11: `overrides.hono` está em `pnpm-workspace.yaml`, não no `package.json`.
- Não reintroduzir upload de Excel como fluxo feliz. Não commitar `.env.local`. Um watcher por vez.

Não inclui o valor do token.
