import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const dimPedido = sqliteTable('dim_pedido', {
  pedidoNorm: text('pedido_norm').primaryKey(),
  pedidoRaw: text('pedido_raw').notNull(),
  cliente: text('cliente'),
  canal: text('canal'),
  noCorte: integer('no_corte', { mode: 'boolean' }).notNull().default(false),
  noCosturaProd: integer('no_costura_prod', { mode: 'boolean' }).notNull().default(false),
  noRevisao: integer('no_revisao', { mode: 'boolean' }).notNull().default(false),
  noOficinas: integer('no_oficinas', { mode: 'boolean' }).notNull().default(false),
  noSignus: integer('no_signus', { mode: 'boolean' }).notNull().default(false),
})

export const dimData = sqliteTable('dim_data', {
  data: text('data').primaryKey(),
  ano: integer('ano').notNull(),
  mes: integer('mes').notNull(),
  dia: integer('dia').notNull(),
})

export const dimCanal = sqliteTable('dim_canal', {
  canal: text('canal').primaryKey(),
})

export const dimResponsavel = sqliteTable('dim_responsavel', {
  responsavel: text('responsavel').primaryKey(),
})

export const dimOficina = sqliteTable('dim_oficina', {
  oficina: text('oficina').primaryKey(),
})

export const dimProduto = sqliteTable('dim_produto', {
  produto: text('produto').primaryKey(),
})

export const fatoCorteLinha = sqliteTable(
  'fato_corte_linha',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    pedidoNorm: text('pedido_norm').notNull(),
    data: text('data'),
    isHeader: integer('is_header', { mode: 'boolean' }).notNull(),
    isStar: integer('is_star', { mode: 'boolean' }).notNull(),
    qtdPecas: real('qtd_pecas'),
    qtdTerceiros: real('qtd_terceiros'),
    qtdEstoque: real('qtd_estoque'),
    metros: real('metros'),
    economia: real('economia'),
    tecido: text('tecido'),
    codTecido: text('cod_tecido'),
    status: text('status'),
    responsavel: text('responsavel'),
    canal: text('canal'),
    cliente: text('cliente'),
    inicioCorte: text('inicio_corte'),
    finalCorte: text('final_corte'),
    pcpProntas: text('pcp_prontas'),
    diasDeCorteRaw: real('dias_de_corte_raw'),
    excelRow: integer('excel_row').notNull(),
  },
  (table) => [
    index('idx_corte_linha_pedido').on(table.pedidoNorm),
    index('idx_corte_linha_data').on(table.data),
  ],
)

export const fatoCortePedido = sqliteTable(
  'fato_corte_pedido',
  {
    pedidoNorm: text('pedido_norm').primaryKey(),
    data: text('data'),
    statusVigente: text('status_vigente'),
    pecas: real('pecas').notNull().default(0),
    terceiros: real('terceiros').notNull().default(0),
    estoque: real('estoque').notNull().default(0),
    metros: real('metros').notNull().default(0),
    economia: real('economia').notNull().default(0),
    responsavel: text('responsavel'),
    canal: text('canal'),
    cliente: text('cliente'),
    inicioCorte: text('inicio_corte'),
    finalCorte: text('final_corte'),
    pcpProntas: text('pcp_prontas'),
    observacao: text('observacao'),
    leadTimeDias: real('lead_time_dias'),
    statusDuplo: integer('status_duplo', { mode: 'boolean' }).notNull().default(false),
    headersCount: integer('headers_count').notNull().default(1),
  },
  (table) => [
    index('idx_corte_pedido_status').on(table.statusVigente),
    index('idx_corte_pedido_data').on(table.data),
    index('idx_corte_pedido_canal').on(table.canal),
  ],
)

export const fatoCostura = sqliteTable(
  'fato_costura',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    pedidoNorm: text('pedido_norm').notNull(),
    dataProducao: text('data_producao').notNull(),
    origem: text('origem').notNull(),
    origemNorm: text('origem_norm').notNull(),
    qtdPecas: real('qtd_pecas').notNull().default(0),
    responsavel: text('responsavel'),
    produto: text('produto'),
    excelRow: integer('excel_row').notNull(),
  },
  (table) => [
    index('idx_costura_pedido').on(table.pedidoNorm),
    index('idx_costura_origem').on(table.origemNorm),
    index('idx_costura_data').on(table.dataProducao),
  ],
)

export const fatoRevisao = sqliteTable(
  'fato_revisao',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    pedidoNorm: text('pedido_norm').notNull(),
    dataProducao: text('data_producao').notNull(),
    qtdPecas: real('qtd_pecas').notNull(),
    responsavel: text('responsavel'),
    produto: text('produto'),
    excelRow: integer('excel_row').notNull(),
  },
  (table) => [
    index('idx_revisao_pedido').on(table.pedidoNorm),
    index('idx_revisao_data').on(table.dataProducao),
  ],
)

export const fatoOficinas = sqliteTable(
  'fato_oficinas',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    pedidoNorm: text('pedido_norm'),
    oficina: text('oficina').notNull(),
    dataEnvio: text('data_envio').notNull(),
    qtdEnviadas: real('qtd_enviadas').notNull().default(0),
    qtdRetornadas: real('qtd_retornadas').notNull().default(0),
    qtdPendentes: real('qtd_pendentes').notNull().default(0),
    qtdDefeitos: real('qtd_defeitos').notNull().default(0),
    statusEntrega: text('status_entrega'),
    dataPrometida: text('data_prometida'),
    dataRetorno: text('data_retorno'),
    produto: text('produto'),
    valorTotal: real('valor_total'),
    excelRow: integer('excel_row').notNull(),
  },
  (table) => [
    index('idx_oficinas_pedido').on(table.pedidoNorm),
    index('idx_oficinas_oficina').on(table.oficina),
    index('idx_oficinas_data').on(table.dataEnvio),
  ],
)

export const fatoTecidoSignus = sqliteTable(
  'fato_tecido_signus',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    movimentoId: text('movimento_id'),
    data: text('data').notNull(),
    es: text('es').notNull(),
    qtd: real('qtd').notNull().default(0),
    metros: real('metros').notNull().default(0),
    codProduto: text('cod_produto').notNull(),
    nomeProduto: text('nome_produto'),
    almox: text('almox'),
    categoria: text('categoria'),
    linha: text('linha'),
    unidade: text('unidade'),
    tipoMovimento: text('tipo_movimento').notNull(),
    tipoNorm: text('tipo_norm').notNull(),
    canalNorm: text('canal_norm'),
    pedidoNorm: text('pedido_norm'),
    origemMov: text('origem_mov'),
    isBaixa: integer('is_baixa', { mode: 'boolean' }).notNull().default(false),
    valorUnitario: real('valor_unitario'),
    valorTotal: real('valor_total'),
    valorUnitarioLiq: real('valor_unitario_liq'),
    valorTotalLiq: real('valor_total_liq'),
    tipoDocumento: text('tipo_documento'),
    tipoDocumentoSigla: text('tipo_documento_sigla'),
    excelRow: integer('excel_row').notNull(),
  },
  (table) => [
    index('idx_signus_pedido').on(table.pedidoNorm),
    index('idx_signus_cod').on(table.codProduto),
    index('idx_signus_data').on(table.data),
    index('idx_signus_tipo').on(table.tipoNorm),
    index('idx_signus_documento').on(table.tipoDocumento),
  ],
)

export const qualidadeEvento = sqliteTable('qualidade_evento', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tipo: text('tipo').notNull(),
  pedidoNorm: text('pedido_norm'),
  detalhe: text('detalhe'),
  excelRow: integer('excel_row'),
  valor: real('valor'),
})

export const carga = sqliteTable('carga', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lidaEm: text('lida_em').notNull(),
  cortePath: text('corte_path').notNull(),
  oficinasPath: text('oficinas_path').notNull(),
  signusPath: text('signus_path'),
  corteLastWrite: text('corte_last_write'),
  oficinasLastWrite: text('oficinas_last_write'),
  signusLastWrite: text('signus_last_write'),
  pecasCortadas: real('pecas_cortadas'),
  pedidosCorte: integer('pedidos_corte'),
  pecasCosturaProd: real('pecas_costura_prod'),
  pecasRevisao: real('pecas_revisao'),
  wipPedidos: integer('wip_pedidos'),
  wipPecas: real('wip_pecas'),
  tecidoPedidos: integer('tecido_pedidos'),
  tecidoPecas: real('tecido_pecas'),
  oficinasPendentes: real('oficinas_pendentes'),
  ok: integer('ok', { mode: 'boolean' }).notNull(),
  erro: text('erro'),
})
