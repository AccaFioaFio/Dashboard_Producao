# PDR — Dashboard de Apontamento da Produção (somente 2026)

**Este arquivo é o contrato dos números** (KPI, funil, invariantes).  
**Como o leitor recebe a carga:** `PRD.md` e `PLAN.md`. Se a UX de atualização conflitar, o `PRD.md` prevalece.

**Produto:** Dashboard de acompanhamento e apontamento (corte, costura, revisão e oficinas)  
**Período oficial:** **01/01/2026 a 24/08/2026** (agosto ainda em curso)  
**Regra de recorte:** 2024 e 2025 saem da carga analítica. O dashboard v1 não mostra, não soma e não cruza outros anos.

| Arquivo | Tabela | Filtro de ano |
|---|---|---|
| `Arquivos do Excel/PROGRAMAÇÃO CORTE E COSTURA .xlsx` | `DADOS_PRODUÇÃOFATO` (aba CORTE) | `DATA` ∈ 2026 (com `*` herdando a data do cabeçalho) |
| Idem, aba oculta **RELATORIO COSTURA** | `RELATORIO_COSTURA` | `Data Produção` ∈ 2026 |
| Idem, aba oculta **RELATORIO REVISÃO** | `RELATORIO_REVISÃO` | `Data Produção` ∈ 2026 |
| `Arquivos do Excel/Produção Oficinas.xlsx` | `TAB_OFICINAS` | `Data Envio` ∈ 2026 |
| `Arquivos do Excel/Movimentação Tecidos.xls` | `FatoTecidoSignus` (aba Movimentação Tecidos) | `Data de movimentação` ∈ 2026 e Linha = TECIDO |

Os arquivos ficam na pasta `Arquivos do Excel` na raiz do projeto e mudam o dia inteiro. O usuário entra e clica em **Atualizar dados** (reflash). Depois do refresh, o recorte continua sendo só 2026.

---

## 1. Por que só 2026

Misturar anos inflava peça, pedido e funil:

- Corte histórico tinha 214 mil peças e 1.257 pedidos; **2026 tem 71.887 peças e 625 pedidos**.
- Costura e revisão só existem como apontamento desde novembro/2025. Comparar com corte de 2024/2025 inventa backlog falso.
- Revisão de 2026 inclui pedido cortado em 2025. Por isso revisão **não** pode ser fechada contra corte do mesmo mês, e menos ainda contra o histórico.

O dashboard responde, no ano corrente:

1. Quanto entrou no corte, na costura (produção) e na revisão.
2. O que está parado agora (WIP, tecido, oficina).
3. Onde o funil 2026 quebra.
4. Produção do dia, por responsável, canal e produto.

---

## 2. Regras de ouro (números de 2026)

### 2.1 Corte — nunca contar linha como pedido

Na carga 24/08, o fato 2026 tem **8.010 linhas**, não 8.010 pedidos:

| | Quantidade |
|---|---|
| Linhas 2026 | 8.010 |
| Continuação com `*` | 4.753 |
| Linhas de cabeçalho (Nº PEDIDO preenchido) | 755 |
| Linhas com quantidade cortada | 505 (6,3%) |
| **Pedidos distintos** | **625** |
| **Peças cortadas** | **71.887** |

**Regra:**

- Ano = ano da `DATA` do cabeçalho. `*` herda pedido, data, status, cliente e canal.
- Peças = `SUM(QTD. PÇS CORTADAS)` só onde há número.
- Pedidos = `DISTINCT` do Nº PEDIDO normalizado (`*` não conta).
- Agosto tem 7.311 linhas e só 1.393 peças: o WIP de poucos pedidos explode linha de tecido. Visual de volume usa peça/pedido, nunca `COUNTROWS`.

Status 2026 (a soma das peças fecha 71.887):

| Status | Pedidos | Peças | Linhas |
|---|---|---|---|
| CORTADO | 614 | 68.831 | 742 |
| EM PRODUÇÃO | 10 | 2.262 | 7.264 |
| AGUARDANDO TECIDO | 4 | 794 | 4 |

Três pedidos aparecem com status em mais de uma linha de cabeçalho (614+10+4 = 628 vs 625 distintos). O dashboard usa o **último cabeçalho** como status vigente e lista os 3 na tela de qualidade.

### 2.2 `FATURAMENTO` é canal, não dinheiro

Em 2026 o volume está assim:

| Canal | Peças | Pedidos |
|---|---|---|
| FAF | 28.168 | 127 |
| ACCA | 24.425 | 49 |
| TC | 16.369 | 101 |
| ESTOQUE | 1.718 | 44 |
| AMOSTRA | 363 | 104 |
| Demais (brinde, conserto, baby site, desenvolvimento…) | ~1.244 | — |

Não existe receita nessa tabela.

### 2.3 Lead time

`DIAS DE CORTE` em 2026 tem **238** valores serial (lixo de fórmula quando `INICIO CORTE` está vazio).

Lead time oficial = `FINAL CORTE − INICIO CORTE` só com as duas datas. Na amostra válida o corte é majoritariamente no mesmo dia (~0,2 dia). Não publicar média do campo `DIAS DE CORTE`.

### 2.4 Costura 2026 — só Origem = Produção entra no funil

| Origem | Lançamentos | Peças | Pedidos | Uso |
|---|---|---|---|---|
| **Produção** | 768 | **25.162** | 344 | KPI do funil |
| Troca de Etiqueta | 170 | 21.330 | 98 | Serviço / acabamento |
| Aplicação de Festonê | 25 | 8.975 | 15 | Serviço / acabamento |
| Conserto | 9 | 991 | 7 | Retrabalho |

Bruto 2026 (56.458 pçs) **não** é costura de produção. Quase a metade é etiqueta + festonê.

Responsáveis (somente Produção): Luiz Eduardo 11.620 · Miriam 10.540 · Elaine 3.002.

### 2.5 Revisão 2026 — tirar total e erro de digitação

Descartes obrigatórios nesta carga:

| Problema | Efeito se não limpar |
|---|---|
| Linha de total da tabela (100.012, sem pedido) | Dobra o ano |
| Pedido 24178 em 14/08/2026 com Qtd = 24.178 | Infla agosto |

Depois da limpeza: **75.834 peças · 945 lançamentos · 642 pedidos**. Último dia apontado: **18/08/2026**.

Revisão 2026 > corte 2026 em peça (75.834 vs 71.887) e em pedido (642 vs 625) porque **169 pedidos revisados em 2026 não estão no corte 2026** (cortados em 2025). Isso não é falha de soma; é recorte de ano. O funil confiável é pedido 2026, não peça do mês.

### 2.6 Oficinas com envio em 2026

| KPI | Valor |
|---|---|
| Lotes | 785 |
| Enviadas | 71.103 |
| Retornadas | 63.964 |
| **Pendentes** | **4.060** |
| Defeitos | 479 |
| Retorno | 90,0% |
| Pedidos | 160 |
| Lotes abertos | 15 |
| No prazo / atraso (lote) | 674 / 111 |
| Valor lançado | R$ 403.578 |
| Último envio na base | 09/07/2026 |

Pendente por oficina: Nildes 1.706 · Keyborder 785 · Ana Lucia 763 · Leuzania 400 · Lidiane 150 · Kátia 150 · Cristiane 100.

Lilica: 708 enviadas, 0 retornadas e 0 pendentes — quebra de cadastro, vai para qualidade.

### 2.7 Funil 2026 (chave = Nº pedido)

| Cruza | Pedidos |
|---|---|
| Corte 2026 | 625 |
| Com costura Produção 2026 | 297 |
| Sem costura Produção 2026 | 328 |
| Com revisão 2026 | 473 |
| Sem revisão 2026 | 152 |
| Costura Produção sem corte 2026 | 47 |
| Revisão 2026 sem corte 2026 | 169 |
| Oficinas 2026 | 160 (134 também no corte; 26 órfãos) |

328 cortados sem costura interna não são todos atraso: parte foi para oficina (134 pedidos).

---

## 3. Modelo de dados

```
Excel (pasta Arquivos do Excel)  →  cópia cache  →  filtro ano = 2026  →  fatos/dims  →  KPIs
```

Filtro de ano na transformação, não só no visual. Linha 2024/2025 nem entra no modelo da v1.

**DimPedido** (só pedidos com fato 2026) · **DimData** · **DimProduto** · **DimOficina** · **DimResponsavel** · **DimCanal** (`FATURAMENTO`)

| Fato | Medidas |
|---|---|
| FatoCortePedido | peças, terceiros, estoque, status, lead time |
| FatoCorteLinha | metros, economia, tecido (não peça, salvo se a qtd estiver na linha) |
| FatoCostura | peças/lançamentos com filtro Origem |
| FatoRevisao | peças/lançamentos após limpeza |
| FatoOficinas | enviadas, retornadas, pendentes, defeitos, atraso |
| FatoTecidoSignus | metros baixados no ERP, tipo de movimento, canal FF/AC/TC, pedido em Orig. Mov. |

### 3.1 Signus — baixa real de tecido

O `.xls` mistura produto acabado, etiqueta e matéria-prima. **Só Linha = TECIDO entra no fato.** Inventário, transferência, compra e amostra ficam classificados, mas **não** somam o KPI de baixa.

| Tipo no Signus | Papel no dashboard |
|---|---|
| `PRODUÇÃO: MATÉRIA-PRIMA/INSUMOS (SAÍDA)` | Baixa de produção (BOM) |
| `SAIDA FF` / `SAIDA AC` / `SAIDA TC` | Baixa operacional por canal (FAF / ACCA / TC) |
| `ENTRADA DE RETORNO DO CORTE` | Retorno de tecido, não é consumo |
| Inventário, ajuste, transferência, compra | Apoio; fora do KPI de baixa |

**Chaves de cruzamento com o Corte:**

- `Código produto` (Signus) = `COD TECIDO` (programação).
- `Orig. Mov.` no formato `PED 23456` / `PEDZ 23138` = Nº pedido. Textos soltos (`ESTOQUE`, `JLJLJ`, `PED 3`) não viram pedido.

Unidade `MT`/`M` entra em metros. KG, fardo e peça não misturam no KPI.

Na carga inspecionada, a baixa oficial (produção + canal) fica perto de **95 mil m** contra **104 mil m** apontados no Corte. O gap é esperado: o Signus não cobre janeiro–agosto inteiro no mesmo ritmo, e Orig. Mov. nem sempre traz o pedido.

---

## 4. KPIs oficiais (cabeçalho 2026)

| KPI | Fórmula | Referência 24/08/2026 |
|---|---|---|
| Peças cortadas | `SUM(QTD. PÇS CORTADAS)` | **71.887** |
| Pedidos no corte | distinct pedido | **625** |
| Peças costuradas | `SUM(Qtd. Peças)` Origem=Produção | **25.162** |
| Peças revisadas | soma limpa | **75.834** |
| WIP corte | status EM PRODUÇÃO | **10 pedidos / 2.262 pçs** |
| Aguardando tecido | status AGUARDANDO TECIDO | **4 pedidos / 794 pçs** |
| Pendente oficinas | `SUM(Qtd pçs Pendetente)` envio 2026 | **4.060** |
| Defeitos oficinas | soma | **479** |
| Costura hoje | Data Produção = hoje, Origem=Produção | 1 (24/08) |
| Revisão hoje | idem | 0 (último 18/08) |

### 4.1 Série mensal 2026 (peças)

| Mês | Cortadas | Costura Produção | Revisão limpa |
|---|---|---|---|
| Jan | 7.803 | 5.386 | 8.772 |
| Fev | 13.208 | 2.710 | 7.267 |
| Mar | 14.568 | 4.963 | 6.275 |
| Abr | 7.059 | 2.936 | 8.877 |
| Mai | 5.696 | 2.228 | 8.127 |
| Jun | 8.236 | 3.666 | 13.021 |
| Jul | 13.924 | 2.161 | 17.435 |
| Ago (até 24) | 1.393 | 1.112 | 6.060 |

O gráfico mensal é **acompanhamento**, não prova de fechamento. Revisão sobe em jun–jul com pedido de ano anterior; costura Produção é bem menor que o bruto (etiqueta/festonê).

Apoio de corte 2026: terceiros 6.817 · estoque 3.624 · 104.087 m de tecido · economia 3.159 m.  
João: 67.109 pçs (608 pedidos). Edgar: 4.778 (22).  
Maiores clientes em peça: Copa Star, Vila Nova Star, DF Star, Maternidade São Luiz, Hospital Aliança.

### 4.2 Telas da v1

1. **Visão geral** — cabeçalho, funil de pedido 2026, série jan–ago, alertas (WIP, tecido, oficina, defasagem).
2. **Corte** — mês, canal, responsável, cliente, lista EM PRODUÇÃO.
3. **Tecidos** — consumo do Corte, baixa Signus, ranking, série mensal em metros, AGUARDANDO TECIDO, cruzamento código/pedido.
4. **Apontamento** — costura vs revisão do dia; Origem obrigatória; mix produção/serviço.
5. **Oficinas** — pendente, ranking, SLA, Lilica e lotes sem retorno.
6. **Qualidade** — órfãos 2026 (inclui baixa Signus sem corte), Qtd=Pedido, total da revisão, `DIAS DE CORTE` serial, status duplo, oficina vazia.

Filtros: mês 2026, canal, cliente, responsável, produto, oficina. Sem seletor de ano na v1.

---

## 5. Carga (transporte) — ver `PRD.md`

O recorte **ano = 2026** e as regras do §2 e §3.1 valem em qualquer transporte.

O leitor **não** envia planilha e **não** depende do botão Atualizar. Publicação: processo neste PC observa os arquivos, copia para cache (Excel aberto não lê in-place), valida invariantes e publica a carga pronta na nuvem. Falha mantém a carga anterior. Abas ocultas de costura/revisão e Signus entram na leitura.

Caminhos: origem real dos três arquivos (`CORTE_XLSX`, `OFICINAS_XLSX`, `SIGNUS_XLS`). Blob Store na Vercel (private) para o site **consumir** a carga já pronta. Cadastro completo de clientes e **saldo atual** de estoque de tecido fora da v1.

---

## 6. O que fazer de melhor

1. Recorte 2026 na transformação — não deixar 2024/2025 no modelo.
2. Origem obrigatória na costura; separar produção de etiqueta/festonê/conserto.
3. Tirar a linha de total da tabela de revisão; bloquear Qtd = número do pedido.
4. Corrigir `DIAS DE CORTE`: `=SE(OU(INICIO="";FINAL="");"";FINAL-INICIO)`.
5. Pedido único entre corte, costura, revisão, oficinas e baixa Signus (47 + 169 + 26 órfãos em 2026; Signus adiciona baixa sem corte quando Orig. Mov. traz PED).
6. Não usar `COUNTROWS` do corte (agosto: 7.311 linhas vs 1.393 peças).
7. Banner se revisão parar (>18/08) ou envio a oficina parar (>09/07).
8. Tratar Lilica (708 enviadas sem retorno e sem pendente) e 769 linhas sem oficina no Excel (linhas mortas, não entram no fato 2026).
9. Não misturar produto acabado do Signus com metro de tecido. KPI de baixa = insumos de produção + SAIDA FF/AC/TC, só Linha = TECIDO.

---

## 7. Fora de escopo (v1)

- Qualquer KPI ou gráfico de 2024/2025.
- Saldo atual de estoque de tecido (o Signus entra como **movimento/baixa**, não como inventário vigente).
- Cadastro completo de clientes (só lookup).
- Receita (não há valor de pedido no corte).
- `CONTROLE OFICINAS 2026` (abas por oficina) — não é o fato.

---

## 8. Aceite (carga 24/08/2026)

- Dashboard e refresh devolvem **somente 2026**.
- Peças cortadas = **71.887** (`SUM` da quantidade, não contagem de linha).
- Pedidos corte = **625**.
- Costura do funil = **25.162** (Origem = Produção). Ligar etiqueta/festonê muda o número.
- Revisão = **75.834** (sem 100.012 e sem 24.178).
- WIP = 10 pedidos / 2.262 pçs · tecido = 4 / 794 · oficinas pendentes = **4.060**.
- Série mensal começa em janeiro/2026, não em 2025.
- Fechar o Excel no refresh não apaga a última carga boa.
- Aba Tecidos mostra consumo do Corte, baixa Signus (produção + canal) e o cruzamento por código de tecido.
