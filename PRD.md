# PRD — Dashboard de Produção 2026 (carga independente)

**Produto:** dashboard de acompanhamento da produção (corte, costura, revisão, oficinas, tecidos).  
**Período:** somente 2026.  
**Contrato dos números:** `PDR-Dashboard-Apontamento.md` (regras de KPI, funil, invariantes, aceite dourado). Este PRD não muda fórmula. Ele muda **como a informação chega na tela**.

---

## 1. O que eu quero

Quem abre o dashboard — neste PC, no celular, no escritório, no link da Vercel — **já vê os números novos**.

Independente de:

- estar no computador da fábrica
- clicar em **Atualizar dados**
- escolher ou enviar planilha
- saber senha, Blob, ETL ou pasta do Excel
- outra pessoa ter “publicado” na hora

A operação do Excel continua na fábrica. O **leitor** não opera carga. Ele só consulta.

---

## 2. Problema atual

As planilhas mudam o dia inteiro. O dashboard hoje tem dois mundos:

| Onde | O que acontece | Por que falha o objetivo |
|---|---|---|
| Este PC (`localhost`) | O clique lê `Arquivos do Excel` e reprocessa | Só quem está neste PC atualiza |
| Site (Vercel) | A nuvem **não vê** a pasta do PC. O fluxo pede upload dos três Excel no navegador | O leitor vira operador. A leitura é lenta (~1–2 min). Se ninguém enviar, o site fica velho |

Resultado: a informação nova **não é independente**. Ela depende de um humano no meio.

Isso não é limitação inventada: a Vercel não acessa `C:\...`. O erro foi transformar essa restrição no produto (formulário de upload).

---

## 3. Papéis (separar de propósito)

| Papel | Quem | O que faz | O que **não** faz |
|---|---|---|---|
| **Leitor** | Qualquer um com o link | Abre o site e lê os números | Não escolhe arquivo, não espera parse, não precisa de senha |
| **Fonte** | Quem aponta no Excel | Salva Corte, Oficinas e Signus | Não abre o dashboard para “mandar” dados |
| **Publicador** | Processo neste PC | Detecta arquivo novo, lê, valida, publica a carga na nuvem | Não é tela. Não pede clique do leitor |

Se a fonte gravar e o publicador estiver no ar, **todo leitor** passa a ver a carga nova na próxima abertura (ou recarregamento) da página.

---

## 4. Experiência desejada

### 4.1 Leitor

1. Abre qualquer tela (visão geral, corte, tecidos, …).
2. Vê os números da **última carga boa**, com horário visível (“Atualizado em …”).
3. Se a fábrica acabou de salvar o Excel, em poucos minutos o site já mostra esses números — **sem botão de carga**.
4. Se a publicação falhar, o site **mantém a carga anterior** e avisa que os dados estão atrasados. Nunca tela vazia por causa de um Excel ruim.

### 4.2 Fonte (fábrica)

1. Trabalha nos três arquivos de sempre.
2. Salva. Nada além disso.
3. Não copia para outra pasta, não abre o site, não anexa arquivo.

A pasta vigiada é **onde o Excel é gravado de verdade**. Se a origem for OneDrive, o publicador aponta para esses caminhos. Copiar para `Arquivos do Excel` não pode ser passo obrigatório do dia a dia.

### 4.3 Configurações

Tela de **diagnóstico**, não de operação do leitor:

- horário da última carga aplicada no site
- `LastWriteTime` de cada arquivo na origem
- se o publicador está atrasado
- caminho da origem (só para quem mantém o PC)

Sem formulário de três arquivos nas páginas do dashboard.

---

## 5. Arquitetura alvo (obrigatória)

```
Excel (origem real neste PC / OneDrive)
    → publicador local (observa mudança, copia para cache, ETL, invariantes)
    → nuvem (carga já pronta: SQLite + snapshot)
    → site na Vercel (ao abrir a página, puxa a carga nova)
    → leitor vê os números
```

Regras:

1. **Parse pesado só neste PC.** Nunca no navegador do leitor. Nunca no timeout curto da Vercel Hobby.
2. **O site só consome** o que já foi publicado. Abrir a página = ver a carga vigente na nuvem.
3. **Carga ruim não substitui carga boa** (invariantes do PDR analítico).
4. **Excel aberto não pode corromper leitura** — copiar para cache; se o arquivo estiver travado, esperar e tentar de novo; não apagar a carga publicada.
5. O publicador precisa deste PC **ligado** (ou de outro processo equivalente). Sem máquina na origem, a nuvem não adivinha o Excel. Isso é restrição física, não é clique do leitor.

Fora de escopo desta v1: a Vercel ler a pasta do Windows sozinha; o leitor mandar `.xlsx`.

---

## 6. Fonte dos arquivos

Três arquivos, os mesmos de sempre:

- Programação corte e costura (`.xlsx`) — abas CORTE, RELATORIO COSTURA, RELATORIO REVISÃO
- Produção oficinas (`.xlsx`) — aba TABELA OFICINAS
- Movimentação tecidos Signus (`.xls`)

Override por `CORTE_XLSX`, `OFICINAS_XLSX`, `SIGNUS_XLS`.  
Recorte analítico: ano = 2026, regras em `PDR-Dashboard-Apontamento.md`.

---

## 7. Atualidade

- **Frescor alvo:** depois que o Excel é salvo e o arquivo destrava, a carga nova fica no site em **até 2 minutos**.
- **Leitor:** não espera o ETL. Quem espera é o publicador, neste PC.
- **Atraso visível:** se `lidaEm` (ou o last write publicado) passar de **30 minutos** atrás da hora atual em dia útil de produção, o site mostra aviso. O número antigo continua na tela.

“Independente” não significa tempo real de segundo. Significa: **ninguém no meio do caminho além do salvamento do Excel**.

---

## 8. Não objetivos

- Upload de planilha no site como fluxo normal
- Parse SheetJS no Chrome do usuário
- Misturar 2024/2025
- O leitor autenticar para *ver* (senha, se existir, é só para manutenção excepcional — não para consulta)
- Cadastro completo de clientes, saldo de estoque, receita (já fora da v1 analítica)

Manutenção excepcional (PC desligado, Blob vazio na primeira vez) pode existir **fora** das telas do dia a dia. Não é o produto.

---

## 9. Aceite

- [ ] Um leitor em outro dispositivo abre o site e vê a última carga boa **sem enviar arquivo e sem senha**.
- [ ] A fonte salva um dos três Excel neste PC; em até 2 minutos, o mesmo leitor **recarrega** e vê números novos (ou o horário de atualização muda).
- [ ] Nenhuma tela operacional do dashboard pede `.xlsx` / `.xls`.
- [ ] ETL com invariante quebrada: carga anterior permanece; há erro no diagnóstico.
- [ ] Excel aberto na hora da leitura: publicador não derruba a carga publicada; tenta de novo.
- [ ] KPIs da carga dourada em `PDR-Dashboard-Apontamento.md` continuam iguais depois da mudança de transporte.
- [ ] Horário da carga visível no header (ou equivalente) em todas as telas.

---

## 10. Relação com o PDR antigo

`PDR-Dashboard-Apontamento.md` permanece o contrato de **o que contar**.  
Este arquivo é o contrato de **como o usuário recebe o que foi contado**.

Se os dois conflitarem na UX de carga, **este PRD prevalece**.
