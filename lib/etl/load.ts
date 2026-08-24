import { getSqlite } from '@/db'
import { yearOf } from '@/lib/dates'
import type { HeaderKpis, Snapshot } from '@/lib/etl/types'

function chunk<T>(rows: T[], size = 400) {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

export function replaceSnapshot(
  snapshot: Snapshot,
  meta: {
    cortePath: string
    oficinasPath: string
    signusPath: string
    corteLastWrite: string
    oficinasLastWrite: string
    signusLastWrite: string
    header: HeaderKpis
  },
) {
  const sqlite = getSqlite()
  const insertMany = sqlite.transaction(() => {
    sqlite.exec(`
      DELETE FROM qualidade_evento;
      DELETE FROM fato_tecido_signus;
      DELETE FROM fato_oficinas;
      DELETE FROM fato_revisao;
      DELETE FROM fato_costura;
      DELETE FROM fato_corte_linha;
      DELETE FROM fato_corte_pedido;
      DELETE FROM dim_pedido;
      DELETE FROM dim_data;
      DELETE FROM dim_canal;
      DELETE FROM dim_responsavel;
      DELETE FROM dim_oficina;
      DELETE FROM dim_produto;
    `)

    const pedidos = new Map<
      string,
      {
        pedidoNorm: string
        pedidoRaw: string
        cliente: string | null
        canal: string | null
        noCorte: boolean
        noCosturaProd: boolean
        noRevisao: boolean
        noOficinas: boolean
        noSignus: boolean
      }
    >()

    const upsertPedido = (
      pedidoNorm: string,
      extra: { cliente?: string | null; canal?: string | null },
    ) => {
      const current = pedidos.get(pedidoNorm) ?? {
        pedidoNorm,
        pedidoRaw: pedidoNorm,
        cliente: extra.cliente ?? null,
        canal: extra.canal ?? null,
        noCorte: false,
        noCosturaProd: false,
        noRevisao: false,
        noOficinas: false,
        noSignus: false,
      }
      current.cliente = current.cliente ?? extra.cliente ?? null
      current.canal = current.canal ?? extra.canal ?? null
      pedidos.set(pedidoNorm, current)
    }

    for (const row of snapshot.cortePedidos) {
      upsertPedido(row.pedidoNorm, { cliente: row.cliente, canal: row.canal })
      const item = pedidos.get(row.pedidoNorm)!
      item.noCorte = true
    }
    for (const row of snapshot.costura) {
      upsertPedido(row.pedidoNorm, {})
      if (row.origemNorm === 'Producao') {
        pedidos.get(row.pedidoNorm)!.noCosturaProd = true
      }
    }
    for (const row of snapshot.revisao) {
      upsertPedido(row.pedidoNorm, {})
      pedidos.get(row.pedidoNorm)!.noRevisao = true
    }
    for (const row of snapshot.oficinas) {
      if (!row.pedidoNorm) continue
      upsertPedido(row.pedidoNorm, {})
      pedidos.get(row.pedidoNorm)!.noOficinas = true
    }
    for (const row of snapshot.tecidosSignus) {
      if (!row.pedidoNorm) continue
      upsertPedido(row.pedidoNorm, {})
      pedidos.get(row.pedidoNorm)!.noSignus = true
    }

    const dates = new Set<string>()
    const canais = new Set<string>()
    const responsaveis = new Set<string>()
    const oficinas = new Set<string>()
    const produtos = new Set<string>()

    const addDate = (iso: string | null) => {
      if (!iso) return
      dates.add(iso)
    }

    for (const row of snapshot.cortePedidos) {
      addDate(row.data)
      if (row.canal) canais.add(row.canal)
      if (row.responsavel) responsaveis.add(row.responsavel)
    }
    for (const row of snapshot.corteLinhas) addDate(row.data)
    for (const row of snapshot.costura) {
      addDate(row.dataProducao)
      if (row.responsavel) responsaveis.add(row.responsavel)
      if (row.produto) produtos.add(row.produto)
    }
    for (const row of snapshot.revisao) {
      addDate(row.dataProducao)
      if (row.responsavel) responsaveis.add(row.responsavel)
      if (row.produto) produtos.add(row.produto)
    }
    for (const row of snapshot.oficinas) {
      addDate(row.dataEnvio)
      oficinas.add(row.oficina)
      if (row.produto) produtos.add(row.produto)
    }
    for (const row of snapshot.tecidosSignus) addDate(row.data)

    const insertDimPedido = sqlite.prepare(`
      INSERT INTO dim_pedido (
        pedido_norm, pedido_raw, cliente, canal,
        no_corte, no_costura_prod, no_revisao, no_oficinas, no_signus
      ) VALUES (@pedidoNorm, @pedidoRaw, @cliente, @canal, @noCorte, @noCosturaProd, @noRevisao, @noOficinas, @noSignus)
    `)
    for (const row of pedidos.values()) {
      insertDimPedido.run({
        ...row,
        noCorte: row.noCorte ? 1 : 0,
        noCosturaProd: row.noCosturaProd ? 1 : 0,
        noRevisao: row.noRevisao ? 1 : 0,
        noOficinas: row.noOficinas ? 1 : 0,
        noSignus: row.noSignus ? 1 : 0,
      })
    }

    const insertDate = sqlite.prepare(
      'INSERT OR IGNORE INTO dim_data (data, ano, mes, dia) VALUES (?, ?, ?, ?)',
    )
    for (const iso of dates) {
      insertDate.run(iso, yearOf(iso), Number(iso.slice(5, 7)), Number(iso.slice(8, 10)))
    }
    const insertCanal = sqlite.prepare('INSERT OR IGNORE INTO dim_canal (canal) VALUES (?)')
    for (const value of canais) insertCanal.run(value)
    const insertResp = sqlite.prepare(
      'INSERT OR IGNORE INTO dim_responsavel (responsavel) VALUES (?)',
    )
    for (const value of responsaveis) insertResp.run(value)
    const insertDimOficina = sqlite.prepare(
      'INSERT OR IGNORE INTO dim_oficina (oficina) VALUES (?)',
    )
    for (const value of oficinas) insertDimOficina.run(value)
    const insertProduto = sqlite.prepare(
      'INSERT OR IGNORE INTO dim_produto (produto) VALUES (?)',
    )
    for (const value of produtos) insertProduto.run(value)

    const insertCortePedido = sqlite.prepare(`
      INSERT INTO fato_corte_pedido (
        pedido_norm, data, status_vigente, pecas, terceiros, estoque,
        metros, economia, responsavel, canal, cliente, inicio_corte,
        final_corte, lead_time_dias, status_duplo, headers_count
      ) VALUES (
        @pedidoNorm, @data, @statusVigente, @pecas, @terceiros, @estoque,
        @metros, @economia, @responsavel, @canal, @cliente, @inicioCorte,
        @finalCorte, @leadTimeDias, @statusDuplo, @headersCount
      )
    `)
    for (const row of snapshot.cortePedidos) {
      insertCortePedido.run({
        ...row,
        statusDuplo: row.statusDuplo ? 1 : 0,
      })
    }

    const insertCorteLinha = sqlite.prepare(`
      INSERT INTO fato_corte_linha (
        pedido_norm, data, is_header, is_star, qtd_pecas, qtd_terceiros,
        qtd_estoque, metros, economia, tecido, cod_tecido, status, responsavel, canal,
        cliente, inicio_corte, final_corte, dias_de_corte_raw, excel_row
      ) VALUES (
        @pedidoNorm, @data, @isHeader, @isStar, @qtdPecas, @qtdTerceiros,
        @qtdEstoque, @metros, @economia, @tecido, @codTecido, @status, @responsavel, @canal,
        @cliente, @inicioCorte, @finalCorte, @diasDeCorteRaw, @excelRow
      )
    `)
    for (const group of chunk(snapshot.corteLinhas)) {
      for (const row of group) {
        insertCorteLinha.run({
          ...row,
          isHeader: row.isHeader ? 1 : 0,
          isStar: row.isStar ? 1 : 0,
        })
      }
    }

    const insertCostura = sqlite.prepare(`
      INSERT INTO fato_costura (
        pedido_norm, data_producao, origem, origem_norm, qtd_pecas,
        responsavel, produto, excel_row
      ) VALUES (
        @pedidoNorm, @dataProducao, @origem, @origemNorm, @qtdPecas,
        @responsavel, @produto, @excelRow
      )
    `)
    for (const row of snapshot.costura) insertCostura.run(row)

    const insertRevisao = sqlite.prepare(`
      INSERT INTO fato_revisao (
        pedido_norm, data_producao, qtd_pecas, responsavel, produto, excel_row
      ) VALUES (
        @pedidoNorm, @dataProducao, @qtdPecas, @responsavel, @produto, @excelRow
      )
    `)
    for (const row of snapshot.revisao) insertRevisao.run(row)

    const insertFatoOficina = sqlite.prepare(`
      INSERT INTO fato_oficinas (
        pedido_norm, oficina, data_envio, qtd_enviadas, qtd_retornadas,
        qtd_pendentes, qtd_defeitos, status_entrega, data_prometida,
        data_retorno, produto, valor_total, excel_row
      ) VALUES (
        @pedidoNorm, @oficina, @dataEnvio, @qtdEnviadas, @qtdRetornadas,
        @qtdPendentes, @qtdDefeitos, @statusEntrega, @dataPrometida,
        @dataRetorno, @produto, @valorTotal, @excelRow
      )
    `)
    for (const row of snapshot.oficinas) insertFatoOficina.run(row)

    const insertSignus = sqlite.prepare(`
      INSERT INTO fato_tecido_signus (
        movimento_id, data, es, qtd, metros, cod_produto, nome_produto,
        almox, categoria, linha, unidade, tipo_movimento, tipo_norm,
        canal_norm, pedido_norm, origem_mov, is_baixa, excel_row
      ) VALUES (
        @movimentoId, @data, @es, @qtd, @metros, @codProduto, @nomeProduto,
        @almox, @categoria, @linha, @unidade, @tipoMovimento, @tipoNorm,
        @canalNorm, @pedidoNorm, @origemMov, @isBaixa, @excelRow
      )
    `)
    for (const group of chunk(snapshot.tecidosSignus)) {
      for (const row of group) {
        insertSignus.run({
          ...row,
          isBaixa: row.isBaixa ? 1 : 0,
        })
      }
    }

    const insertQualidade = sqlite.prepare(`
      INSERT INTO qualidade_evento (tipo, pedido_norm, detalhe, excel_row, valor)
      VALUES (@tipo, @pedidoNorm, @detalhe, @excelRow, @valor)
    `)
    for (const row of snapshot.qualidade) insertQualidade.run(row)

    sqlite
      .prepare(
        `INSERT INTO carga (
          lida_em, corte_path, oficinas_path, signus_path,
          corte_last_write, oficinas_last_write, signus_last_write,
          pecas_cortadas, pedidos_corte, pecas_costura_prod, pecas_revisao,
          wip_pedidos, wip_pecas, tecido_pedidos, tecido_pecas, oficinas_pendentes,
          ok, erro
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL)`,
      )
      .run(
        new Date().toISOString(),
        meta.cortePath,
        meta.oficinasPath,
        meta.signusPath,
        meta.corteLastWrite,
        meta.oficinasLastWrite,
        meta.signusLastWrite,
        meta.header.pecasCortadas,
        meta.header.pedidosCorte,
        meta.header.pecasCosturaProd,
        meta.header.pecasRevisao,
        meta.header.wipPedidos,
        meta.header.wipPecas,
        meta.header.tecidoPedidos,
        meta.header.tecidoPecas,
        meta.header.oficinasPendentes,
      )
  })

  insertMany()
}
