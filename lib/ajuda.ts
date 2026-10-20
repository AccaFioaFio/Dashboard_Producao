import { YEAR } from '@/lib/year'

export type AjudaSecao = {
  id: string
  /** Prefixo de rota para o atalho “?” da tela. */
  href: string
  titulo: string
  resumo: string
  escopo: string[]
  foraEscopo: string[]
  fontes: string[]
  kpis: string[]
  daPra: string[]
  naoDa: string[]
}

/** Visão geral do sistema — topo da aba Ajuda. */
export const ajudaGeral = {
  titulo: 'Como funciona o dashboard',
  resumo: `Painel de produção e comercial da Fio a Fio, com foco no ano ${YEAR}. Os números vêm dos arquivos Parquet; o site online usa a última carga publicada.`,
  regras: [
    `Só entra o ano ${YEAR} (exceto quando a própria tela avisa o contrário).`,
    'Pedido = número do pedido. Ordem de corte (OC) pode haver mais de uma no mesmo pedido.',
    'Não conte linhas da planilha de Corte: o volume certo é soma de peças / pedidos distintos.',
    'Costura no funil = só Origem Produção. Etiqueta, festonê e conserto são serviço.',
    'Atualizar dados: neste PC, pasta Parquet + botão Atualização. No site, só puxa o que já foi publicado.',
  ],
  fontes: [
    'PROGRAMAÇÃO CORTE E COSTURA - *.parquet — Corte, Costura, Revisão, Aproveitamento',
    'Produção Oficinas - TABELA OFICINAS.parquet — Oficinas',
    'Movimentacao Tecidos.parquet — baixas Signus',
    'Saldo do Estoque Geral.parquet — saldo (snapshot)',
    'Pedidos / Itens / Parceiro Comercial.parquet — vendas e clientes',
  ],
}

export const ajudaSecoes: AjudaSecao[] = [
  {
    id: 'visao-geral',
    href: '/',
    titulo: 'Visão Geral',
    resumo: 'Resumo do ano: KPIs, funil do pedido, alertas e gráficos.',
    escopo: [
      'Peças cortadas, costura produção, revisão e WIP do Corte',
      'Funil: Corte → Costura Produção → Revisão',
      'Alertas de corte finalizado e apontamentos (costura/revisão)',
    ],
    foraEscopo: [
      'Fechamento financeiro ou estoque contábil',
      'Comparar mês a mês como se revisão = corte do mesmo mês',
    ],
    fontes: [
      'Planilha de Corte / Costura / Revisão / Oficinas (carga Excel)',
      'Lançamentos feitos no próprio dashboard (apontamento e corte produção)',
    ],
    kpis: [
      'Peças cortadas = soma das quantidades do Corte (não é contagem de linha).',
      'Total de pedidos = nº de pedido distinto no Corte.',
      'Costura Produção = só Origem = Produção.',
      'WIP / Aguardando tecido = status da ordem de corte (cabeçalho).',
      'Oficinas pendentes = enviadas ainda sem retorno.',
    ],
    daPra: [
      'Clicar nos cartões, funil e alertas para ver a lista de pedidos',
      'Ver ritmo dos últimos 30 dias e mês a mês',
    ],
    naoDa: [
      'Editar planilha por aqui',
      'Usar o gráfico diário como fechamento do funil',
    ],
  },
  {
    id: 'programacao',
    href: '/programacao',
    titulo: 'Programação de Produção',
    resumo: 'Montar e consultar a programação por pedido, dia, semana ou mês.',
    escopo: [
      'Programar quantidade e período por pedido',
      'Pedido fora da carga: informar fantasia e produtos manualmente',
      'Consulta por período (corte / costura / revisão)',
    ],
    foraEscopo: [
      'Substituir a planilha oficial de Corte como fonte de KPI',
      'Qualquer login pode montar/excluir (só o editor autorizado)',
    ],
    fontes: ['Carga de pedidos/itens + o que você grava na tela de programação'],
    kpis: [
      'Aqui não há KPI de funil — é operação de agenda.',
      'O volume oficial de peças continua vindo da planilha na carga.',
    ],
    daPra: [
      'Montar programação e consultar por período',
      'Imprimir / consultar o que já foi programado',
    ],
    naoDa: [
      'Alterar o funil ou os totais da Visão Geral só com a programação',
    ],
  },
  {
    id: 'acao-comercial',
    href: '/corte/acao-comercial',
    titulo: 'Ação Comercial',
    resumo: 'Saldo de aproveitamento: peças cortadas menos as já aproveitadas.',
    escopo: [
      'TAB_ENTRADA (QTD CORTADO) e TAB_SAIDA (QTD APROVEITAMENTO)',
      'Saldo = cortadas − aproveitadas (lista completa, sem recorte de mês no saldo)',
    ],
    foraEscopo: [
      'Venda comercial ou ranking de clientes',
      'Consumo de metros de tecido',
    ],
    fontes: ['Aba Aproveitamento da planilha de Corte'],
    kpis: [
      'Entrada = QTD CORTADO.',
      'Saída = QTD APROVEITAMENTO.',
      'Saldo positivo = ainda há sobra para aproveitar.',
    ],
    daPra: ['Ver saldo por código/produto e evolução mensal de entrada/saída'],
    naoDa: ['Lançar aproveitamento por esta tela (isso fica na planilha)'],
  },
  {
    id: 'corte',
    href: '/corte',
    titulo: 'Corte',
    resumo: 'Volume em peças e pedidos, canal, responsável e filas paradas.',
    escopo: [
      'Peças e pedidos do Corte no ano',
      'EM PRODUÇÃO e AGUARDANDO TECIDO',
      'Tela Corte Produção (apontamento do cortador) e WhatsApp de finalização',
    ],
    foraEscopo: [
      'Consumo/baixa de tecido em metros (vá em Tecidos)',
      'Contagem de linhas da planilha (Agosto explode linha de tecido)',
    ],
    fontes: [
      'Planilha PROGRAMAÇÃO CORTE E COSTURA',
      'Itens lançados em Corte Produção (somam com a planilha nos KPIs)',
    ],
    kpis: [
      'Volume = soma de peças / pedidos distintos.',
      'Mesmo pedido com outro status entra em outra fila.',
      'Metros e economia de tecido: aba Tecidos.',
    ],
    daPra: [
      'Filtrar por canal/responsável e abrir listas de WIP',
      'Registrar produção do cortador e avisar no WhatsApp',
    ],
    naoDa: [
      'Usar contagem de linha como volume',
      'E-mail de finalização (pausado; WhatsApp ativo)',
    ],
  },
  {
    id: 'costuras',
    href: '/costuras',
    titulo: 'Costura',
    resumo: 'Origem, mix Produção/serviço e lançamentos do dia.',
    escopo: [
      'Costura Produção (entra no funil)',
      'Serviços: etiqueta, festonê, conserto (mix, fora do funil)',
      'Apontamento no dashboard (soma com a planilha)',
    ],
    foraEscopo: [
      'Oficinas externas (aba Oficinas)',
      'Tratar serviço como Produção no funil',
    ],
    fontes: ['Relatório de Costura na planilha + lançamentos da tela'],
    kpis: [
      'Funil e KPIs oficiais = só Origem Produção.',
      'Lançamento do dia = peças apontadas na data corrente.',
    ],
    daPra: ['Ver origem, ranking e apontar produção/revisão'],
    naoDa: ['Misturar serviço no funil da Visão Geral'],
  },
  {
    id: 'revisao',
    href: '/revisao',
    titulo: 'Revisão',
    resumo: 'Peças revisadas (limpas), responsável e lançamentos do dia.',
    escopo: [
      'Revisão limpa do ano',
      'Apontamento no dashboard',
      'Pode incluir pedido cortado em outro ano',
    ],
    foraEscopo: [
      'Linha de total da tabela Excel',
      'Qtd igual ao número do pedido (sujeira filtrada)',
      'Fechar revisão contra o corte do mesmo mês',
    ],
    fontes: ['Relatório de Revisão na planilha + lançamentos da tela'],
    kpis: [
      'Soma de peças limpas (sem totais e sem Qtd = nº pedido).',
      '“Revisão sem Corte” no funil = revisado em 2026, cortado noutro ano — não é erro de soma.',
    ],
    daPra: ['Ver responsável, mês a mês e apontar o dia'],
    naoDa: ['Exigir que revisão do mês = corte do mês'],
  },
  {
    id: 'oficinas',
    href: '/oficinas',
    titulo: 'Oficinas',
    resumo: 'Pendentes, envios, retorno e remessas para industrialização.',
    escopo: [
      'Lotes com Data Envio no ano e oficina preenchida',
      'Pendentes = enviadas − retornadas',
      'Remessas p/ industrialização do Pedidos.xlsx (por nº do pedido)',
    ],
    foraEscopo: [
      'Remessa no Top Clientes (lá só entra venda final)',
      'Cadastro incompleto que “some” o lote (ex.: enviadas sem retorno e sem pendente)',
    ],
    fontes: ['Produção Oficinas.xlsx + Pedidos.xlsx (remessas)'],
    kpis: [
      'Pendentes = saldo do lote.',
      'Defeitos = qtd defeitos da planilha.',
      'Órfão = oficina sem pedido no Corte do ano — pode ser corte de outro ano.',
    ],
    daPra: ['Ranking por oficina, SLA e lotes sem retorno'],
    naoDa: ['Contar remessa industrial como venda no Top Clientes'],
  },
  {
    id: 'tempo',
    href: '/qualidade',
    titulo: 'Tempo de produção',
    resumo: 'Dias entre PCP prontas e a Data Produção da Revisão.',
    escopo: [
      'Início = PCP prontas no Corte',
      'Fim = última Data Produção da Revisão',
      'Média de dias no mês de fechamento',
    ],
    foraEscopo: [
      'Pedidos sem PCP prontas ou sem revisão',
      'SLA de oficina (isso fica em Oficinas)',
    ],
    fontes: ['Datas do Corte + Data Produção da Revisão'],
    kpis: [
      'Ciclo = fim − início em dias.',
      'Média mensal usa o mês da última Data Produção.',
    ],
    daPra: ['Ver ciclo por pedido e média no fechamento'],
    naoDa: ['Medir tempo só com status EM PRODUÇÃO, sem revisão'],
  },
  {
    id: 'tecidos',
    href: '/tecidos',
    titulo: 'Tecidos',
    resumo: 'Consumo do Corte × baixa Signus e saldo dos almox principais.',
    escopo: [
      'Corte = metros apontados (MTS) na programação',
      'Signus = baixa real (produção + SAIDA FF/AC/TC) nos almox principais',
      'Saldo = snapshot do estoque (não filtra mês/ano)',
      'Subtelas: Valores e Rastreio',
    ],
    foraEscopo: [
      'Inventário, transferência e ajuste no KPI oficial de baixa',
      'Igualar Corte e Signus 1:1 (datas e tipos de movimento diferem)',
    ],
    fontes: [
      'Corte (metros) + Movimentacao Tecidos.xlsx + Saldo do Estoque Geral.xlsx',
    ],
    kpis: [
      'Diferença Corte − Signus usa baixas com nº de pedido.',
      'Baixa sem pedido fica em card separado.',
      'Valor = VU Signus × quantidade baixada.',
    ],
    daPra: [
      'Comparar consumo × baixa, ver ranking e rastrear movimento',
      'Abrir valores por tecido e pedido',
    ],
    naoDa: [
      'Tratar saldo de estoque como série mensal',
      'Incluir inventário/transferência no KPI de baixa de produção',
    ],
  },
  {
    id: 'top-clientes',
    href: '/top-clientes',
    titulo: 'Top Clientes',
    resumo: 'Ranking comercial (venda final), mix de tecidos e previsão de compra.',
    escopo: [
      'Só venda final do ano',
      'Metros = baixas Signus por nº de pedido (venda + OC do mesmo cliente)',
      'Resumo, mix e previsão de compra',
    ],
    foraEscopo: [
      'Remessa p/ industrialização e oficinas (vão para Oficinas)',
      'Rateio de metros entre clientes',
    ],
    fontes: [
      'Pedidos.xlsx / Itens.xlsx / Parceiro Comercial.xlsx + baixas Signus',
    ],
    kpis: [
      'Ranking por valor de venda final.',
      'Previsão de metros = (metros ÷ pedidos) × ritmo recente; a comprar = previsão − saldo.',
    ],
    daPra: [
      'Abrir produtos do cliente, ver mix e previsão',
    ],
    naoDa: [
      'Somar remessa industrial no ranking',
      'Esperar rateio de tecido entre clientes',
    ],
  },
  {
    id: 'vendas',
    href: '/vendas',
    titulo: 'Venda por estado',
    resumo: 'Faturamento por UF, distância no ranking e projeção.',
    escopo: [
      'Venda final do ano por UF do endereço principal do parceiro',
      'Subtela de representantes',
      'Projeção = mesmo mês do ano anterior × ritmo, repartida pela fatia',
    ],
    foraEscopo: [
      'Produção (peças/metros)',
      'Remessa industrial como venda',
    ],
    fontes: ['Pedidos.xlsx + Parceiro Comercial.xlsx'],
    kpis: [
      'Diferença = distância para quem está imediatamente acima no ranking.',
      'Projeção da empresa e fatias por UF/representante (regras na própria tela).',
    ],
    daPra: ['Ver mapa/ranking e trocar para representantes'],
    naoDa: ['Usar a projeção como pedido já fechado'],
  },
  {
    id: 'pedidos',
    href: '/pedidos',
    titulo: 'Pedidos',
    resumo: 'Lista e ficha do pedido no funil 2026.',
    escopo: [
      'Listas por fatia do funil (corte, WIP, sem costura, etc.)',
      'Ficha do pedido com etapas e observações',
    ],
    foraEscopo: [
      'Editar o Excel do pedido por aqui',
      'Histórico completo de anos anteriores',
    ],
    fontes: ['Mesmas fontes da carga + busca por nº do pedido'],
    kpis: [
      'A lista mostra o recorte da fatia escolhida (pedido ou OC, conforme o filtro).',
    ],
    daPra: [
      'Buscar pedido (quem tem acesso) e abrir a ficha',
      'Navegar a partir dos cartões da Visão Geral',
    ],
    naoDa: ['Alterar status oficial da planilha só pela ficha'],
  },
  {
    id: 'qualidade-dados',
    href: '/inconsistencias',
    titulo: 'Qualidade dos dados',
    resumo: 'Inconsistências que a carga já detecta (órfãos, sujeira do Excel).',
    escopo: [
      'Órfãos 2026, Lilica e linhas suspeitas',
      'Avisos gerados na carga ETL',
    ],
    foraEscopo: [
      'Tratar todo órfão como erro (revisão/oficina podem ser de corte 2025)',
    ],
    fontes: ['Detecção automática na carga das planilhas'],
    kpis: [
      'Não são KPIs de produção — são alertas de cadastro/qualidade.',
    ],
    daPra: ['Priorizar limpeza do Excel com base na lista'],
    naoDa: ['Apagar o alerta sem corrigir a origem na planilha'],
  },
  {
    id: 'configuracoes',
    href: '/configuracoes',
    titulo: 'Configuração',
    resumo: 'Onde estão os Excel, última carga e como atualizar.',
    escopo: [
      'Caminhos dos parquet (pasta Parquet)',
      'Horário da última leitura e LastWriteTime de cada arquivo',
    ],
    foraEscopo: [
      'Vigia automática contínua (a atualização é sob demanda)',
    ],
    fontes: ['Pasta do projeto + publicação no Supabase (ambiente online)'],
    kpis: ['Total de pedidos da última carga (referência, não ranking).'],
    daPra: [
      'Neste PC: sincronizar Excel e publicar carga',
      'No site: puxar a última carga publicada',
    ],
    naoDa: [
      'Esperar atualização online sem publicar neste PC antes',
    ],
  },
]

export function findAjudaSecao(pathname: string): AjudaSecao | undefined {
  if (pathname === '/ajuda' || pathname.startsWith('/ajuda/')) return undefined
  if (pathname === '/' || pathname === '') {
    return ajudaSecoes.find((s) => s.id === 'visao-geral')
  }
  // Subrotas especiais que herdam a seção pai
  if (pathname.startsWith('/apontamento')) {
    return ajudaSecoes.find((s) => s.id === 'costuras')
  }
  if (pathname.startsWith('/corte/acao-comercial')) {
    return ajudaSecoes.find((s) => s.id === 'acao-comercial')
  }
  if (pathname.startsWith('/corte')) {
    return ajudaSecoes.find((s) => s.id === 'corte')
  }
  return (
    ajudaSecoes
      .filter((s) => s.href !== '/' && pathname.startsWith(s.href))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? undefined
  )
}
