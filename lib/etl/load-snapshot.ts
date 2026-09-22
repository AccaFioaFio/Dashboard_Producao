import { getSqlite } from '@/db'
import type {
  AproveitamentoMovimento,
  CorteLinha,
  CortePedido,
  CosturaLancamento,
  EstoqueTecidoSaldo,
  OficinaLote,
  PedidoComercial,
  PedidoItem,
  QualidadeEvento,
  RevisaoLancamento,
  SignusTecidoMovimento,
  Snapshot,
  TipoTecidoNorm,
} from '@/lib/etl/types'

/** Monta o Snapshot a partir do SQLite já gravado (base para ETL incremental). */
export function loadSnapshotFromSqlite(): Snapshot | null {
  try {
    const db = getSqlite()
    const hasCarga = db
      .prepare(`SELECT 1 as ok FROM carga WHERE ok = 1 ORDER BY id DESC LIMIT 1`)
      .get() as { ok: number } | undefined
    if (!hasCarga) return null

    const cortePedidos = db
      .prepare(
        `SELECT pedido_norm as pedidoNorm, data, status_vigente as statusVigente,
                pecas, terceiros, estoque, metros, economia, responsavel, canal, cliente,
                inicio_corte as inicioCorte, final_corte as finalCorte,
                pcp_prontas as pcpProntas, observacao, lead_time_dias as leadTimeDias,
                status_duplo as statusDuplo, headers_count as headersCount
         FROM fato_corte_pedido`,
      )
      .all() as CortePedido[]

    if (!cortePedidos.length) return null

    const corteLinhas = db
      .prepare(
        `SELECT pedido_norm as pedidoNorm, data, is_header as isHeader, is_star as isStar,
                qtd_pecas as qtdPecas, qtd_terceiros as qtdTerceiros, qtd_estoque as qtdEstoque,
                metros, economia, tecido, cod_tecido as codTecido, status, responsavel, canal,
                cliente, inicio_corte as inicioCorte, final_corte as finalCorte,
                pcp_prontas as pcpProntas, observacao, dias_de_corte_raw as diasDeCorteRaw,
                excel_row as excelRow
         FROM fato_corte_linha`,
      )
      .all()
      .map((row) => ({
        ...(row as CorteLinha),
        isHeader: Boolean((row as { isHeader: number }).isHeader),
        isStar: Boolean((row as { isStar: number }).isStar),
      }))

    const costura = db
      .prepare(
        `SELECT pedido_norm as pedidoNorm, data_producao as dataProducao, origem,
                origem_norm as origemNorm, qtd_pecas as qtdPecas, responsavel, produto,
                excel_row as excelRow
         FROM fato_costura`,
      )
      .all() as CosturaLancamento[]

    const revisao = db
      .prepare(
        `SELECT pedido_norm as pedidoNorm, data_producao as dataProducao,
                qtd_pecas as qtdPecas, responsavel, produto, excel_row as excelRow
         FROM fato_revisao`,
      )
      .all() as RevisaoLancamento[]

    const oficinas = db
      .prepare(
        `SELECT pedido_norm as pedidoNorm, oficina, data_envio as dataEnvio,
                qtd_enviadas as qtdEnviadas, qtd_retornadas as qtdRetornadas,
                qtd_pendentes as qtdPendentes, qtd_defeitos as qtdDefeitos,
                status_entrega as statusEntrega, data_prometida as dataPrometida,
                data_retorno as dataRetorno, produto, valor_total as valorTotal,
                excel_row as excelRow
         FROM fato_oficinas`,
      )
      .all() as OficinaLote[]

    const tecidosSignus = db
      .prepare(
        `SELECT movimento_id as movimentoId, data, es, qtd, metros,
                cod_produto as codProduto, nome_produto as nomeProduto, almox, categoria,
                linha, unidade, tipo_movimento as tipoMovimento, tipo_norm as tipoNorm,
                canal_norm as canalNorm, pedido_norm as pedidoNorm, origem_mov as origemMov,
                is_baixa as isBaixa, valor_unitario as valorUnitario, valor_total as valorTotal,
                valor_unitario_liq as valorUnitarioLiq, valor_total_liq as valorTotalLiq,
                tipo_documento as tipoDocumento, tipo_documento_sigla as tipoDocumentoSigla,
                excel_row as excelRow
         FROM fato_tecido_signus`,
      )
      .all()
      .map((row) => ({
        ...(row as SignusTecidoMovimento),
        tipoNorm: (row as { tipoNorm: string }).tipoNorm as TipoTecidoNorm,
        isBaixa: Boolean((row as { isBaixa: number }).isBaixa),
      }))

    const tecidosEstoque = db
      .prepare(
        `SELECT cod_produto as codProduto, nome_produto as nomeProduto, categoria, unidade,
                saldo_atual as saldoAtual, saldo_reservado as saldoReservado,
                em_metros as emMetros, excel_row as excelRow
         FROM fato_tecido_estoque`,
      )
      .all()
      .map((row) => ({
        ...(row as EstoqueTecidoSaldo),
        emMetros: Boolean((row as { emMetros: number }).emMetros),
      }))

    const pedidosComerciais = db
      .prepare(
        `SELECT pedido_norm as pedidoNorm, pedido_raw as pedidoRaw,
                unidade_negocio as unidadeNegocio, canal, parceiro_codigo as parceiroCodigo,
                parceiro_cnpj as parceiroCnpj, cliente, razao_social as razaoSocial,
                tipo_comercializacao as tipoComercializacao, status,
                valor_total as valorTotal, valor_faturado as valorFaturado,
                data_cadastro as dataCadastro, data_venda as dataVenda,
                data_faturamento as dataFaturamento, data_cancelamento as dataCancelamento,
                vendedor, excel_row as excelRow
         FROM fato_pedido_comercial`,
      )
      .all() as PedidoComercial[]

    const pedidosItens = db
      .prepare(
        `SELECT pedido_norm as pedidoNorm, pedido_raw as pedidoRaw,
                unidade_negocio as unidadeNegocio, canal, parceiro_codigo as parceiroCodigo,
                parceiro_cnpj as parceiroCnpj, cliente, razao_social as razaoSocial,
                tipo_comercializacao as tipoComercializacao, status,
                valor_pedido_total as valorPedidoTotal, valor_pedido_faturado as valorPedidoFaturado,
                cod_produto as codProduto, nome_produto as nomeProduto,
                categoria_produto as categoriaProduto, pedido_cliente as pedidoCliente,
                qtd_pedida as qtdPedida, qtd_faturada as qtdFaturada,
                preco_bruto as precoBruto, preco_liquido as precoLiquido,
                valor_bruto as valorBruto, valor_liquido as valorLiquido,
                desconto_total as descontoTotal, data_venda as dataVenda,
                data_entrega as dataEntrega, data_cadastro as dataCadastro,
                excel_row as excelRow
         FROM fato_pedido_item`,
      )
      .all() as PedidoItem[]

    const aproveitamento = db
      .prepare(
        `SELECT tipo, pedido, cliente, data, cod_produto as codProduto, tecido, modelo, qtd,
                excel_row as excelRow
         FROM fato_aproveitamento`,
      )
      .all() as AproveitamentoMovimento[]

    const qualidade = db
      .prepare(
        `SELECT tipo, pedido_norm as pedidoNorm, detalhe, excel_row as excelRow, valor
         FROM qualidade_evento`,
      )
      .all() as QualidadeEvento[]

    for (const row of cortePedidos) {
      row.statusDuplo = Boolean(row.statusDuplo)
    }

    return {
      corteLinhas,
      cortePedidos,
      costura,
      revisao,
      oficinas,
      tecidosSignus,
      tecidosEstoque,
      pedidosComerciais,
      pedidosItens,
      qualidade,
      aproveitamento,
    }
  } catch {
    return null
  }
}
