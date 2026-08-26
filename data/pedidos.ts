import 'server-only'

import { cache } from 'react'
import { getSqlite } from '@/db'
import { ensureCloudDatabase } from '@/lib/cloud/carga'
import { leadTimeDays } from '@/lib/dates'
import type { DashFilters } from '@/lib/filters'
import { funilSliceWhere, type FunilSlice } from '@/lib/funil'
import { pedidoDigits, parsePedidoParam } from '@/lib/pedido'

export type PedidoListaRow = {
  pedidoNorm: string
  cliente: string | null
  canal: string | null
  statusVigente: string | null
  data: string | null
  pecas: number
  pecasCosturaProd: number
  pecasRevisao: number
  oficinasPendentes: number
  noCorte: boolean
  noCosturaProd: boolean
  noRevisao: boolean
  noOficinas: boolean
  noSignus: boolean
  responsavel: string | null
}

export type PedidoFicha = {
  pedidoNorm: string
  flags: {
    corte: boolean
    costuraProd: boolean
    revisao: boolean
    oficinas: boolean
    signus: boolean
  }
  corte: {
    data: string | null
    statusVigente: string | null
    pecas: number
    terceiros: number
    estoque: number
    metros: number
    economia: number
    cliente: string | null
    canal: string | null
    responsavel: string | null
    inicioCorte: string | null
    finalCorte: string | null
    pcpProntas: string | null
    observacao: string | null
    leadTimeDias: number | null
    statusDuplo: boolean
  } | null
  linhas: {
    tecido: string | null
    codTecido: string | null
    metros: number | null
    economia: number | null
    pecas: number | null
    status: string | null
  }[]
  costura: {
    dataProducao: string
    origem: string
    origemNorm: string
    pecas: number
    responsavel: string | null
    produto: string | null
  }[]
  revisao: {
    dataProducao: string
    pecas: number
    responsavel: string | null
    produto: string | null
  }[]
  oficinas: {
    oficina: string
    dataEnvio: string
    dataPrometida: string | null
    dataRetorno: string | null
    enviadas: number
    retornadas: number
    pendentes: number
    defeitos: number
    statusEntrega: string | null
    produto: string | null
    valorTotal: number | null
  }[]
  signus: {
    data: string
    metros: number
    codProduto: string
    nomeProduto: string | null
    tipoNorm: string
    isBaixa: boolean
    origemMov: string | null
  }[]
  qualidade: { tipo: string; detalhe: string; valor: number | null }[]
  datas: {
    pcpProntas: string | null
    inicioCorte: string | null
    finalCorte: string | null
    primeiraCosturaProd: string | null
    ultimoEnvio: string | null
    ultimoRetorno: string | null
    primeiraRevisao: string | null
    ultimaRevisao: string | null
  }
  totais: {
    pecasCorte: number
    metrosCorte: number
    pecasCosturaProd: number
    pecasCosturaServico: number
    pecasRevisao: number
    enviadas: number
    retornadas: number
    pendentes: number
    defeitos: number
    metrosSignusBaixa: number
    diasCiclo: number | null
  }
}

export type QualidadeGrupo = {
  tipo: string
  eventos: {
    pedidoNorm: string | null
    detalhe: string
    excelRow: number | null
    valor: number | null
  }[]
}

export type SerieDiariaRow = {
  data: string
  cortadas: number
  costura: number
  revisao: number
}

function sqlite() {
  return getSqlite()
}

function likeContains(value: string) {
  return `%${value.replaceAll('%', '').replaceAll('_', '')}%`
}

function hasObservacaoColumn() {
  return Boolean(
    sqlite()
      .prepare(
        `SELECT 1 as v FROM pragma_table_info('fato_corte_pedido') WHERE name = 'observacao'`,
      )
      .get(),
  )
}

function sliceDateExpr(fatia: FunilSlice) {
  if (fatia === 'costuraSemCorte') {
    return `(SELECT MIN(c.data_producao) FROM fato_costura c
      WHERE c.pedido_norm = d.pedido_norm AND c.origem_norm = 'Producao')`
  }
  if (fatia === 'revisaoSemCorte') {
    return `(SELECT MIN(r.data_producao) FROM fato_revisao r WHERE r.pedido_norm = d.pedido_norm)`
  }
  if (fatia === 'oficinas' || fatia === 'oficinasOrfas') {
    return `(SELECT MIN(o.data_envio) FROM fato_oficinas o WHERE o.pedido_norm = d.pedido_norm)`
  }
  return 'p.data'
}

export const getPedidosLista = cache(async (filters: DashFilters = {}) => {
  await ensureCloudDatabase()
  const fatia: FunilSlice = filters.fatia ?? 'corte'
  const clauses = [funilSliceWhere('d')[fatia]]
  const params: Record<string, unknown> = {}
  if (filters.q) {
    clauses.push('d.pedido_norm LIKE @q')
    params.q = likeContains(filters.q)
  }
  if (filters.canal) {
    clauses.push('COALESCE(p.canal, d.canal) = @canal')
    params.canal = filters.canal
  }
  if (filters.cliente) {
    clauses.push('COALESCE(p.cliente, d.cliente) = @cliente')
    params.cliente = filters.cliente
  }
  if (filters.responsavel) {
    clauses.push('p.responsavel = @responsavel')
    params.responsavel = filters.responsavel
  }
  if (filters.mes) {
    clauses.push(`CAST(substr(${sliceDateExpr(fatia)}, 6, 2) as INTEGER) = @mes`)
    params.mes = filters.mes
  }
  const where = clauses.join(' AND ')
  const stmt = sqlite().prepare(
    `SELECT d.pedido_norm as pedidoNorm,
              COALESCE(p.cliente, d.cliente) as cliente,
              COALESCE(p.canal, d.canal) as canal,
              p.status_vigente as statusVigente,
              p.data as data,
              COALESCE(p.pecas, 0) as pecas,
              COALESCE(cs.pecas, 0) as pecasCosturaProd,
              COALESCE(rv.pecas, 0) as pecasRevisao,
              COALESCE(ofc.pendentes, 0) as oficinasPendentes,
              d.no_corte as noCorte,
              d.no_costura_prod as noCosturaProd,
              d.no_revisao as noRevisao,
              d.no_oficinas as noOficinas,
              d.no_signus as noSignus,
              p.responsavel as responsavel
       FROM dim_pedido d
       LEFT JOIN fato_corte_pedido p ON p.pedido_norm = d.pedido_norm
       LEFT JOIN (
         SELECT pedido_norm, SUM(qtd_pecas) as pecas
         FROM fato_costura WHERE origem_norm = 'Producao' GROUP BY pedido_norm
       ) cs ON cs.pedido_norm = d.pedido_norm
       LEFT JOIN (
         SELECT pedido_norm, SUM(qtd_pecas) as pecas
         FROM fato_revisao GROUP BY pedido_norm
       ) rv ON rv.pedido_norm = d.pedido_norm
       LEFT JOIN (
         SELECT pedido_norm, SUM(qtd_pendentes) as pendentes
         FROM fato_oficinas GROUP BY pedido_norm
       ) ofc ON ofc.pedido_norm = d.pedido_norm
       WHERE ${where}
       ORDER BY COALESCE(p.data, '0000-00-00') DESC, d.pedido_norm
       LIMIT 800`,
  )
  const rows = (
    Object.keys(params).length ? stmt.all(params) : stmt.all()
  ) as PedidoListaRow[]

  const countStmt = sqlite().prepare(
    `SELECT COUNT(*) as v
         FROM dim_pedido d
         LEFT JOIN fato_corte_pedido p ON p.pedido_norm = d.pedido_norm
         WHERE ${where}`,
  )
  const total = (
    (Object.keys(params).length ? countStmt.get(params) : countStmt.get()) as { v: number }
  ).v

  return {
    fatia,
    total,
    rows: rows.map((row) => ({
      ...row,
      noCorte: Boolean(row.noCorte),
      noCosturaProd: Boolean(row.noCosturaProd),
      noRevisao: Boolean(row.noRevisao),
      noOficinas: Boolean(row.noOficinas),
      noSignus: Boolean(row.noSignus),
    })),
  }
})

function resolvePedidoNorm(raw: string) {
  const parsed = parsePedidoParam(raw)
  if (!parsed) return null
  const db = sqlite()
  const exact = db
    .prepare('SELECT pedido_norm as v FROM dim_pedido WHERE pedido_norm = ?')
    .get(parsed) as { v: string } | undefined
  if (exact) return exact.v
  const digits = pedidoDigits(parsed)
  if (!digits) return null
  const byDigits = db
    .prepare(
      `SELECT pedido_norm as v FROM dim_pedido
       WHERE pedido_norm = @digits
          OR replace(replace(pedido_norm, ' ', ''), '.', '') = @digits
       LIMIT 1`,
    )
    .get({ digits }) as { v: string } | undefined
  return byDigits?.v ?? null
}

export const getPedidoFicha = cache(async (raw: string): Promise<PedidoFicha | null> => {
  await ensureCloudDatabase()
  const pedidoNorm = resolvePedidoNorm(raw)
  if (!pedidoNorm) return null
  const db = sqlite()
  const flags = db
    .prepare(
      `SELECT no_corte as corte, no_costura_prod as costuraProd, no_revisao as revisao,
              no_oficinas as oficinas, no_signus as signus
       FROM dim_pedido WHERE pedido_norm = ?`,
    )
    .get(pedidoNorm) as
    | {
        corte: number
        costuraProd: number
        revisao: number
        oficinas: number
        signus: number
      }
    | undefined
  if (!flags) return null

  const obs = hasObservacaoColumn() ? 'observacao' : 'NULL as observacao'
  const corte = db
    .prepare(
      `SELECT data, status_vigente as statusVigente, pecas, terceiros, estoque, metros, economia,
              cliente, canal, responsavel, inicio_corte as inicioCorte, final_corte as finalCorte,
              pcp_prontas as pcpProntas, ${obs}, lead_time_dias as leadTimeDias,
              status_duplo as statusDuplo
       FROM fato_corte_pedido WHERE pedido_norm = ?`,
    )
    .get(pedidoNorm) as PedidoFicha['corte'] | undefined

  const linhas = db
    .prepare(
      `SELECT tecido, cod_tecido as codTecido, metros, economia, qtd_pecas as pecas, status
       FROM fato_corte_linha
       WHERE pedido_norm = ? AND (metros IS NOT NULL OR qtd_pecas IS NOT NULL OR tecido IS NOT NULL)
       ORDER BY excel_row`,
    )
    .all(pedidoNorm) as PedidoFicha['linhas']

  const costura = db
    .prepare(
      `SELECT data_producao as dataProducao, origem, origem_norm as origemNorm,
              qtd_pecas as pecas, responsavel, produto
       FROM fato_costura WHERE pedido_norm = ? ORDER BY data_producao, excel_row`,
    )
    .all(pedidoNorm) as PedidoFicha['costura']

  const revisao = db
    .prepare(
      `SELECT data_producao as dataProducao, qtd_pecas as pecas, responsavel, produto
       FROM fato_revisao WHERE pedido_norm = ? ORDER BY data_producao, excel_row`,
    )
    .all(pedidoNorm) as PedidoFicha['revisao']

  const oficinas = db
    .prepare(
      `SELECT oficina, data_envio as dataEnvio, data_prometida as dataPrometida,
              data_retorno as dataRetorno, qtd_enviadas as enviadas, qtd_retornadas as retornadas,
              qtd_pendentes as pendentes, qtd_defeitos as defeitos, status_entrega as statusEntrega,
              produto, valor_total as valorTotal
       FROM fato_oficinas WHERE pedido_norm = ? ORDER BY data_envio, excel_row`,
    )
    .all(pedidoNorm) as PedidoFicha['oficinas']

  const signus = db
    .prepare(
      `SELECT data, metros, cod_produto as codProduto, nome_produto as nomeProduto,
              tipo_norm as tipoNorm, is_baixa as isBaixa, origem_mov as origemMov
       FROM fato_tecido_signus WHERE pedido_norm = ? ORDER BY data, excel_row`,
    )
    .all(pedidoNorm) as PedidoFicha['signus']

  const qualidade = db
    .prepare(
      `SELECT tipo, detalhe, valor FROM qualidade_evento WHERE pedido_norm = ? ORDER BY tipo`,
    )
    .all(pedidoNorm) as PedidoFicha['qualidade']

  const pecasCosturaProd = costura
    .filter((row) => row.origemNorm === 'Producao')
    .reduce((sum, row) => sum + row.pecas, 0)
  const pecasCosturaServico = costura
    .filter((row) => row.origemNorm !== 'Producao')
    .reduce((sum, row) => sum + row.pecas, 0)
  const pecasRevisao = revisao.reduce((sum, row) => sum + row.pecas, 0)
  const primeiraCosturaProd =
    costura.find((row) => row.origemNorm === 'Producao')?.dataProducao ?? null
  const primeiraRevisao = revisao[0]?.dataProducao ?? null
  const ultimaRevisao = revisao.at(-1)?.dataProducao ?? null
  const pcpProntas = corte?.pcpProntas ?? null

  return {
    pedidoNorm,
    flags: {
      corte: Boolean(flags.corte),
      costuraProd: Boolean(flags.costuraProd),
      revisao: Boolean(flags.revisao),
      oficinas: Boolean(flags.oficinas),
      signus: Boolean(flags.signus),
    },
    corte: corte
      ? { ...corte, statusDuplo: Boolean(corte.statusDuplo) }
      : null,
    linhas,
    costura,
    revisao,
    oficinas,
    signus: signus.map((row) => ({ ...row, isBaixa: Boolean(row.isBaixa) })),
    qualidade,
    datas: {
      pcpProntas,
      inicioCorte: corte?.inicioCorte ?? null,
      finalCorte: corte?.finalCorte ?? null,
      primeiraCosturaProd,
      ultimoEnvio: oficinas.at(-1)?.dataEnvio ?? null,
      ultimoRetorno:
        [...oficinas].reverse().find((row) => row.dataRetorno)?.dataRetorno ?? null,
      primeiraRevisao,
      ultimaRevisao,
    },
    totais: {
      pecasCorte: corte?.pecas ?? 0,
      metrosCorte: corte?.metros ?? 0,
      pecasCosturaProd,
      pecasCosturaServico,
      pecasRevisao,
      enviadas: oficinas.reduce((sum, row) => sum + row.enviadas, 0),
      retornadas: oficinas.reduce((sum, row) => sum + row.retornadas, 0),
      pendentes: oficinas.reduce((sum, row) => sum + row.pendentes, 0),
      defeitos: oficinas.reduce((sum, row) => sum + row.defeitos, 0),
      metrosSignusBaixa: signus
        .filter((row) => row.isBaixa)
        .reduce((sum, row) => sum + row.metros, 0),
      diasCiclo: leadTimeDays(pcpProntas, ultimaRevisao),
    },
  }
})

export const getQualidadeEventos = cache(async (): Promise<QualidadeGrupo[]> => {
  await ensureCloudDatabase()
  const rows = sqlite()
    .prepare(
      `SELECT tipo, pedido_norm as pedidoNorm, detalhe, excel_row as excelRow, valor
       FROM qualidade_evento
       ORDER BY tipo, pedido_norm`,
    )
    .all() as {
    tipo: string
    pedidoNorm: string | null
    detalhe: string
    excelRow: number | null
    valor: number | null
  }[]

  const groups = new Map<string, QualidadeGrupo['eventos']>()
  for (const row of rows) {
    const list = groups.get(row.tipo) ?? []
    list.push({
      pedidoNorm: row.pedidoNorm,
      detalhe: row.detalhe,
      excelRow: row.excelRow,
      valor: row.valor,
    })
    groups.set(row.tipo, list)
  }
  return [...groups.entries()].map(([tipo, eventos]) => ({ tipo, eventos }))
})

export const getSerieDiaria = cache(async (dias = 30): Promise<SerieDiariaRow[]> => {
  await ensureCloudDatabase()
  const db = sqlite()
  const hoje = (db.prepare(`SELECT date('now', 'localtime') as v`).get() as { v: string }).v
  const inicio = (
    db
      .prepare(`SELECT date(?, '-' || ? || ' days') as v`)
      .get(hoje, dias - 1) as { v: string }
  ).v

  const cortadas = db
    .prepare(
      `SELECT data, COALESCE(SUM(qtd_pecas), 0) as pecas
       FROM fato_corte_linha
       WHERE data >= @inicio AND data <= @hoje
       GROUP BY data`,
    )
    .all({ inicio, hoje }) as { data: string; pecas: number }[]
  const costura = db
    .prepare(
      `SELECT data_producao as data, COALESCE(SUM(qtd_pecas), 0) as pecas
       FROM fato_costura
       WHERE origem_norm = 'Producao' AND data_producao >= @inicio AND data_producao <= @hoje
       GROUP BY data_producao`,
    )
    .all({ inicio, hoje }) as { data: string; pecas: number }[]
  const revisao = db
    .prepare(
      `SELECT data_producao as data, COALESCE(SUM(qtd_pecas), 0) as pecas
       FROM fato_revisao
       WHERE data_producao >= @inicio AND data_producao <= @hoje
       GROUP BY data_producao`,
    )
    .all({ inicio, hoje }) as { data: string; pecas: number }[]

  const byDay = new Map<string, SerieDiariaRow>()
  const start = Date.parse(`${inicio}T00:00:00Z`)
  for (let i = 0; i < dias; i++) {
    const iso = new Date(start + i * 86400000).toISOString().slice(0, 10)
    byDay.set(iso, { data: iso, cortadas: 0, costura: 0, revisao: 0 })
  }
  for (const row of cortadas) {
    const item = byDay.get(row.data)
    if (item) item.cortadas = row.pecas
  }
  for (const row of costura) {
    const item = byDay.get(row.data)
    if (item) item.costura = row.pecas
  }
  for (const row of revisao) {
    const item = byDay.get(row.data)
    if (item) item.revisao = row.pecas
  }
  return [...byDay.values()]
})
