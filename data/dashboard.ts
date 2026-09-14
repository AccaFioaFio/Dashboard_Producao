import 'server-only'

import { cache } from 'react'
import { getSqlite } from '@/db'
import type { DashFilters, FilterOptions } from '@/lib/filters'
import { isProducaoOrigem, splitCodigoDescricao } from '@/lib/keys'
import { ensureCloudDatabase } from '@/lib/cloud/carga'
import { YEAR } from '@/lib/year'
import type { FunilKpis, HeaderKpis, SerieMensal } from '@/lib/etl/types'
import { ocJoinLinhas, ocPecasExpr } from '@/lib/corte-oc'
import { analyzeTempoProducao, type TempoPedidoRow } from '@/lib/etl/tempo'
import { sqlPendentesOficina } from '@/lib/oficinas-qty'
import { TIPO_TECIDO_LABEL } from '@/lib/format'
import { sqlAlmoxPrincipais } from '@/lib/almox-principais'
import { sqlCategoriaFilter } from '@/lib/tecido-categoria'

export type CargaInfo = {
  id: number
  lidaEm: string
  cortePath: string
  oficinasPath: string
  signusPath: string | null
  estoquePath: string | null
  pedidosPath: string | null
  itensPath: string | null
  corteLastWrite: string | null
  oficinasLastWrite: string | null
  signusLastWrite: string | null
  estoqueLastWrite: string | null
  pedidosLastWrite: string | null
  itensLastWrite: string | null
  pecasCortadas: number | null
  pedidosCorte: number | null
  pecasCosturaProd: number | null
  pecasRevisao: number | null
  wipPedidos: number | null
  wipPecas: number | null
  tecidoPedidos: number | null
  tecidoPecas: number | null
  oficinasPendentes: number | null
}

export type TecidoUsoRow = {
  cod: string
  nome: string
  metros: number
  economia: number
  pedidos: number
}

export type TecidoPendenteRow = {
  pedidoNorm: string
  data: string | null
  cliente: string | null
  statusVigente: string | null
  pecas: number
  metros: number
  tecido: string | null
  codTecido: string | null
  responsavel: string | null
  observacao: string | null
  excelRow: number
}

export type NamedTotal = {
  nome: string
  pecas: number
  pedidos: number
}

export type CortePedidoRow = {
  pedidoNorm: string
  data: string | null
  statusVigente: string | null
  pecas: number
  canal: string | null
  cliente: string | null
  responsavel: string | null
  observacao: string | null
  tecido: string | null
  codTecido: string | null
  diasParado: number | null
  excelRow: number
}

function sqlite() {
  return getSqlite()
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

function hasCorteLinhaObservacaoColumn() {
  return Boolean(
    sqlite()
      .prepare(
        `SELECT 1 as v FROM pragma_table_info('fato_corte_linha') WHERE name = 'observacao'`,
      )
      .get(),
  )
}

function observacaoExpr(alias = 'p') {
  return hasObservacaoColumn() ? `${alias}.observacao` : 'NULL as observacao'
}

function ocObservacaoExpr() {
  if (hasCorteLinhaObservacaoColumn()) return 'h.observacao as observacao'
  return observacaoExpr()
}

type SqlFilter = {
  clauses: string[]
  params: Record<string, unknown>
}

function emptyFilter(): SqlFilter {
  return { clauses: ['1=1'], params: {} }
}

function likeContains(value: string) {
  return `%${value.replaceAll('%', '').replaceAll('_', '')}%`
}

function applyPedidoFilters(
  filter: SqlFilter,
  alias: string,
  filters: DashFilters,
  cols: {
    date?: string
    canal?: boolean
    cliente?: boolean
    responsavel?: boolean
    produto?: boolean
    oficina?: boolean
    pedido?: boolean
  },
) {
  if (filters.mes && cols.date) {
    filter.clauses.push(`CAST(substr(${alias}.${cols.date}, 6, 2) as INTEGER) = @mes`)
    filter.params.mes = filters.mes
  }
  if (filters.canal && cols.canal) {
    filter.clauses.push(`${alias}.canal = @canal`)
    filter.params.canal = filters.canal
  }
  if (filters.cliente && cols.cliente) {
    filter.clauses.push(`${alias}.cliente = @cliente`)
    filter.params.cliente = filters.cliente
  }
  if (filters.responsavel && cols.responsavel) {
    filter.clauses.push(`${alias}.responsavel = @responsavel`)
    filter.params.responsavel = filters.responsavel
  }
  if (filters.produto && cols.produto) {
    filter.clauses.push(`${alias}.produto = @produto`)
    filter.params.produto = filters.produto
  }
  if (filters.oficina && cols.oficina) {
    filter.clauses.push(`${alias}.oficina = @oficina`)
    filter.params.oficina = filters.oficina
  }
  if (filters.q && cols.pedido) {
    filter.clauses.push(`${alias}.pedido_norm LIKE @q`)
    filter.params.q = likeContains(filters.q)
  }
}

function applySignusFilters(filter: SqlFilter, alias: string, filters: DashFilters) {
  filter.clauses.push(sqlAlmoxPrincipais(alias))
  const categoriaSql = sqlCategoriaFilter(alias, filters.categoria)
  if (categoriaSql) {
    filter.clauses.push(categoriaSql)
    filter.params.categoria = filters.categoria
  }
  if (filters.mes) {
    filter.clauses.push(`CAST(substr(${alias}.data, 6, 2) as INTEGER) = @mes`)
    filter.params.mes = filters.mes
  }
  if (filters.q) {
    filter.clauses.push(`${alias}.pedido_norm LIKE @q`)
    filter.params.q = likeContains(filters.q)
  }
  if (filters.canal || filters.cliente) {
    const pedidoClauses = [`sp.pedido_norm = ${alias}.pedido_norm`]
    if (filters.canal) {
      pedidoClauses.push('sp.canal = @canal')
      filter.params.canal = filters.canal
    }
    if (filters.cliente) {
      pedidoClauses.push('sp.cliente = @cliente')
      filter.params.cliente = filters.cliente
    }
    filter.clauses.push(
      `EXISTS (SELECT 1 FROM fato_corte_pedido sp WHERE ${pedidoClauses.join(' AND ')})`,
    )
  }
}

/** Filtros da aba rastreio: q busca pedido, código, nome ou Orig. Mov.; tipo_norm opcional. */
function applySignusRastreioFilters(
  filter: SqlFilter,
  alias: string,
  filters: DashFilters,
) {
  filter.clauses.push(sqlAlmoxPrincipais(alias))
  const categoriaSql = sqlCategoriaFilter(alias, filters.categoria)
  if (categoriaSql) {
    filter.clauses.push(categoriaSql)
    filter.params.categoria = filters.categoria
  }
  if (filters.mes) {
    filter.clauses.push(`CAST(substr(${alias}.data, 6, 2) as INTEGER) = @mes`)
    filter.params.mes = filters.mes
  }
  if (filters.tipo) {
    filter.clauses.push(`${alias}.tipo_norm = @tipo`)
    filter.params.tipo = filters.tipo
  }
  if (filters.q) {
    filter.clauses.push(
      `(${alias}.pedido_norm LIKE @q
        OR ${alias}.cod_produto LIKE @q
        OR COALESCE(${alias}.nome_produto, '') LIKE @q
        OR COALESCE(${alias}.origem_mov, '') LIKE @q)`,
    )
    filter.params.q = likeContains(filters.q)
  }
  if (filters.canal || filters.cliente) {
    const pedidoClauses = [`sp.pedido_norm = ${alias}.pedido_norm`]
    if (filters.canal) {
      pedidoClauses.push('sp.canal = @canal')
      filter.params.canal = filters.canal
    }
    if (filters.cliente) {
      pedidoClauses.push('sp.cliente = @cliente')
      filter.params.cliente = filters.cliente
    }
    filter.clauses.push(
      `EXISTS (SELECT 1 FROM fato_corte_pedido sp WHERE ${pedidoClauses.join(' AND ')})`,
    )
  }
}

function applyEstoqueCategoria(
  filter: SqlFilter,
  alias: string,
  filters: DashFilters,
) {
  const categoriaSql = sqlCategoriaFilter(alias, filters.categoria)
  if (!categoriaSql) return
  filter.clauses.push(categoriaSql)
  filter.params.categoria = filters.categoria
}

function whereSql(filter: SqlFilter) {
  return filter.clauses.join(' AND ')
}

function runAll<T>(sql: string, params: Record<string, unknown>) {
  const stmt = sqlite().prepare(sql)
  return (Object.keys(params).length ? stmt.all(params) : stmt.all()) as T[]
}

function runGet<T>(sql: string, params: Record<string, unknown>) {
  const stmt = sqlite().prepare(sql)
  return (Object.keys(params).length ? stmt.get(params) : stmt.get()) as T
}

function hasAproveitamentoTable() {
  return Boolean(
    sqlite()
      .prepare(
        `SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = 'fato_aproveitamento'`,
      )
      .get(),
  )
}

export const getFilterOptions = cache(async (): Promise<FilterOptions> => {
  await ensureCloudDatabase()
  const db = sqlite()
  const aproveitamentoUnion = hasAproveitamentoTable()
    ? 'UNION SELECT data FROM fato_aproveitamento'
    : ''
  const mesesRows = db
    .prepare(
      `SELECT DISTINCT CAST(substr(data, 6, 2) as INTEGER) as mes
       FROM (
         SELECT data FROM fato_corte_pedido
         UNION SELECT data_producao FROM fato_costura
         UNION SELECT data_producao FROM fato_revisao
         UNION SELECT data_envio FROM fato_oficinas
         ${aproveitamentoUnion}
       )
       WHERE data IS NOT NULL
       ORDER BY mes`,
    )
    .all() as { mes: number }[]
  const meses = mesesRows.map((row) => row.mes).filter((mes) => mes >= 1 && mes <= 12)
  return {
    meses: meses.length ? meses : [1, 2, 3, 4, 5, 6, 7, 8],
    canais: (db.prepare('SELECT canal FROM dim_canal ORDER BY canal').all() as { canal: string }[])
      .map((row) => row.canal)
      .filter(Boolean),
    clientes: (
      db
        .prepare(
          `SELECT cliente FROM fato_corte_pedido
           WHERE cliente IS NOT NULL AND trim(cliente) != ''
           GROUP BY cliente ORDER BY SUM(pecas) DESC LIMIT 80`,
        )
        .all() as { cliente: string }[]
    ).map((row) => row.cliente),
    responsaveis: (
      db
        .prepare('SELECT responsavel FROM dim_responsavel ORDER BY responsavel')
        .all() as { responsavel: string }[]
    )
      .map((row) => row.responsavel)
      .filter(Boolean),
    produtos: (
      db
        .prepare(
          `SELECT produto FROM dim_produto
           WHERE produto IS NOT NULL AND trim(produto) != ''
           ORDER BY produto LIMIT 80`,
        )
        .all() as { produto: string }[]
    ).map((row) => row.produto),
    oficinas: (
      db.prepare('SELECT oficina FROM dim_oficina ORDER BY oficina').all() as { oficina: string }[]
    )
      .map((row) => row.oficina)
      .filter(Boolean),
    tipos: Object.entries(TIPO_TECIDO_LABEL).map(([value, label]) => ({ value, label })),
    categorias: (
      db
        .prepare(
          `SELECT categoria FROM (
             SELECT s.categoria as categoria FROM fato_tecido_signus s
             WHERE s.categoria IS NOT NULL AND trim(s.categoria) != ''
             UNION
             SELECT e.categoria as categoria FROM fato_tecido_estoque e
             WHERE e.categoria IS NOT NULL AND trim(e.categoria) != ''
           )
           ORDER BY categoria`,
        )
        .all() as { categoria: string }[]
    ).map((row) => row.categoria),
  }
})

export const getLatestCarga = cache(async (): Promise<CargaInfo | null> => {
  await ensureCloudDatabase()
  const row = sqlite()
    .prepare(
      `SELECT id, lida_em as lidaEm, corte_path as cortePath, oficinas_path as oficinasPath,
              signus_path as signusPath, estoque_path as estoquePath, pedidos_path as pedidosPath,
              itens_path as itensPath,
              corte_last_write as corteLastWrite, oficinas_last_write as oficinasLastWrite,
              signus_last_write as signusLastWrite, estoque_last_write as estoqueLastWrite,
              pedidos_last_write as pedidosLastWrite, itens_last_write as itensLastWrite,
              pecas_cortadas as pecasCortadas, pedidos_corte as pedidosCorte,
              pecas_costura_prod as pecasCosturaProd, pecas_revisao as pecasRevisao,
              wip_pedidos as wipPedidos, wip_pecas as wipPecas,
              tecido_pedidos as tecidoPedidos, tecido_pecas as tecidoPecas,
              oficinas_pendentes as oficinasPendentes
       FROM carga WHERE ok = 1 ORDER BY id DESC LIMIT 1`,
    )
    .get() as CargaInfo | undefined
  return row ?? null
})

export const getHeaderKpis = cache(async (): Promise<HeaderKpis | null> => {
  try {
    await ensureCloudDatabase()
    const db = sqlite()
  const pecasCortadas =
    (db.prepare('SELECT COALESCE(SUM(pecas), 0) as v FROM fato_corte_pedido').get() as { v: number }).v
  const pedidosCorte =
    (db.prepare('SELECT COUNT(*) as v FROM fato_corte_pedido').get() as { v: number }).v
  const ocsCorte =
    (db.prepare('SELECT COUNT(*) as v FROM fato_corte_linha WHERE is_header = 1').get() as { v: number }).v
  const pecasCosturaProd = (
    db
      .prepare(
        "SELECT COALESCE(SUM(qtd_pecas), 0) as v FROM fato_costura WHERE origem_norm = 'Producao'",
      )
      .get() as { v: number }
  ).v
  const pecasRevisao = (
    db.prepare('SELECT COALESCE(SUM(qtd_pecas), 0) as v FROM fato_revisao').get() as { v: number }
  ).v
  const wipPedidos = (
    db
      .prepare(
        "SELECT COUNT(*) as v FROM fato_corte_linha WHERE is_header = 1 AND status = 'EM PRODUÇÃO'",
      )
      .get() as { v: number }
  ).v
  const wipPecas = (
    db
      .prepare("SELECT COALESCE(SUM(qtd_pecas), 0) as v FROM fato_corte_linha WHERE status = 'EM PRODUÇÃO'")
      .get() as { v: number }
  ).v
  const tecidoPedidos = (
    db
      .prepare(
        "SELECT COUNT(*) as v FROM fato_corte_linha WHERE is_header = 1 AND status = 'AGUARDANDO TECIDO'",
      )
      .get() as { v: number }
  ).v
  const tecidoPecas = (
    db
      .prepare("SELECT COALESCE(SUM(qtd_pecas), 0) as v FROM fato_corte_linha WHERE status = 'AGUARDANDO TECIDO'")
      .get() as { v: number }
  ).v
  const tecidoMetros = (
    db
      .prepare(
        "SELECT COALESCE(SUM(metros), 0) as v FROM fato_corte_linha WHERE status = 'AGUARDANDO TECIDO'",
      )
      .get() as { v: number }
  ).v
  const metrosRow = db
    .prepare(
      'SELECT COALESCE(SUM(metros), 0) as metros, COALESCE(SUM(economia), 0) as economia FROM fato_corte_pedido',
    )
    .get() as { metros: number; economia: number }
  const oficinasPendentes = (
    db
      .prepare(`SELECT COALESCE(SUM(${sqlPendentesOficina()}), 0) as v FROM fato_oficinas`)
      .get() as { v: number }
  ).v
  const oficinasDefeitos = (
    db.prepare('SELECT COALESCE(SUM(qtd_defeitos), 0) as v FROM fato_oficinas').get() as { v: number }
  ).v
  if (!pedidosCorte) return null
  return {
    pecasCortadas,
    pedidosCorte,
    ocsCorte,
    pecasCosturaProd,
    pecasRevisao,
    wipPedidos,
    wipPecas,
    tecidoPedidos,
    tecidoPecas,
    tecidoMetros,
    metrosConsumo: metrosRow.metros,
    metrosEconomia: metrosRow.economia,
    oficinasPendentes,
    oficinasDefeitos,
  }
  } catch {
    return null
  }
})

export const getFunil = cache(async (): Promise<FunilKpis | null> => {
  await ensureCloudDatabase()
  const db = sqlite()
  const corte = (
    db.prepare('SELECT COUNT(*) as v FROM dim_pedido WHERE no_corte = 1').get() as { v: number }
  ).v
  if (!corte) return null
  const comCostura = (
    db
      .prepare('SELECT COUNT(*) as v FROM dim_pedido WHERE no_corte = 1 AND no_costura_prod = 1')
      .get() as { v: number }
  ).v
  const comRevisao = (
    db
      .prepare('SELECT COUNT(*) as v FROM dim_pedido WHERE no_corte = 1 AND no_revisao = 1')
      .get() as { v: number }
  ).v
  const costuraSemCorte = (
    db
      .prepare('SELECT COUNT(*) as v FROM dim_pedido WHERE no_costura_prod = 1 AND no_corte = 0')
      .get() as { v: number }
  ).v
  const revisaoSemCorte = (
    db
      .prepare('SELECT COUNT(*) as v FROM dim_pedido WHERE no_revisao = 1 AND no_corte = 0')
      .get() as { v: number }
  ).v
  const oficinas = (
    db.prepare('SELECT COUNT(*) as v FROM dim_pedido WHERE no_oficinas = 1').get() as { v: number }
  ).v
  const oficinasNoCorte = (
    db
      .prepare('SELECT COUNT(*) as v FROM dim_pedido WHERE no_oficinas = 1 AND no_corte = 1')
      .get() as { v: number }
  ).v
  return {
    corte,
    comCostura,
    semCostura: corte - comCostura,
    comRevisao,
    semRevisao: corte - comRevisao,
    costuraSemCorte,
    revisaoSemCorte,
    oficinas,
    oficinasNoCorte,
    oficinasOrfas: oficinas - oficinasNoCorte,
  }
})

export const getSerieMensal = cache(async (): Promise<SerieMensal[]> => {
  await ensureCloudDatabase()
  const db = sqlite()
  const cortadas = db
    .prepare(
      `SELECT CAST(substr(data, 6, 2) as INTEGER) as mes, COALESCE(SUM(qtd_pecas), 0) as pecas
       FROM fato_corte_linha WHERE data IS NOT NULL GROUP BY mes`,
    )
    .all() as { mes: number; pecas: number }[]
  const costura = db
    .prepare(
      `SELECT CAST(substr(data_producao, 6, 2) as INTEGER) as mes, COALESCE(SUM(qtd_pecas), 0) as pecas
       FROM fato_costura WHERE origem_norm = 'Producao' GROUP BY mes`,
    )
    .all() as { mes: number; pecas: number }[]
  const revisao = db
    .prepare(
      `SELECT CAST(substr(data_producao, 6, 2) as INTEGER) as mes, COALESCE(SUM(qtd_pecas), 0) as pecas
       FROM fato_revisao GROUP BY mes`,
    )
    .all() as { mes: number; pecas: number }[]

  const months = Array.from({ length: 12 }, (_, index) => ({
    mes: index + 1,
    cortadas: 0,
    costura: 0,
    revisao: 0,
  }))
  for (const row of cortadas) months[row.mes - 1].cortadas = row.pecas
  for (const row of costura) months[row.mes - 1].costura = row.pecas
  for (const row of revisao) months[row.mes - 1].revisao = row.pecas
  return months.filter((row) => row.cortadas || row.costura || row.revisao)
})

export const getAlertas = cache(async () => {
  await ensureCloudDatabase()
  const db = sqlite()
  const ultimaRevisao = (
    db.prepare('SELECT MAX(data_producao) as v FROM fato_revisao').get() as { v: string | null }
  ).v
  const ultimoEnvio = (
    db.prepare('SELECT MAX(data_envio) as v FROM fato_oficinas').get() as { v: string | null }
  ).v
  const costuraHoje = (
    db
      .prepare(
        `SELECT COALESCE(SUM(qtd_pecas), 0) as v FROM fato_costura
         WHERE origem_norm = 'Producao' AND data_producao = date('now', 'localtime')`,
      )
      .get() as { v: number }
  ).v
  const revisaoHoje = (
    db
      .prepare(
        `SELECT COALESCE(SUM(qtd_pecas), 0) as v FROM fato_revisao
         WHERE data_producao = date('now', 'localtime')`,
      )
      .get() as { v: number }
  ).v
  return { ultimaRevisao, ultimoEnvio, costuraHoje, revisaoHoje, year: YEAR }
})

export const getCorteBreakdown = cache(async (filters: DashFilters = {}) => {
  await ensureCloudDatabase()
  const filter = emptyFilter()
  applyPedidoFilters(filter, 'p', filters, {
    date: 'data',
    canal: true,
    cliente: true,
    responsavel: true,
    pedido: true,
  })
  const where = whereSql(filter)
  const { params } = filter

  const porMes = runAll<{ nome: number; pecas: number; pedidos: number }>(
    `SELECT CAST(substr(p.data, 6, 2) as INTEGER) as nome, COALESCE(SUM(p.pecas), 0) as pecas, COUNT(*) as pedidos
     FROM fato_corte_pedido p WHERE ${where} AND p.data IS NOT NULL GROUP BY nome ORDER BY nome`,
    params,
  )
  const porCanal = runAll<NamedTotal>(
    `SELECT COALESCE(p.canal, '(sem canal)') as nome, COALESCE(SUM(p.pecas), 0) as pecas, COUNT(*) as pedidos
     FROM fato_corte_pedido p WHERE ${where} GROUP BY p.canal ORDER BY pecas DESC`,
    params,
  )
  const porResponsavel = runAll<NamedTotal>(
    `SELECT COALESCE(p.responsavel, '(sem responsável)') as nome, COALESCE(SUM(p.pecas), 0) as pecas, COUNT(*) as pedidos
     FROM fato_corte_pedido p WHERE ${where} GROUP BY p.responsavel ORDER BY pecas DESC`,
    params,
  )
  const porCliente = runAll<NamedTotal>(
    `SELECT COALESCE(p.cliente, '(sem cliente)') as nome, COALESCE(SUM(p.pecas), 0) as pecas, COUNT(*) as pedidos
     FROM fato_corte_pedido p WHERE ${where} GROUP BY p.cliente ORDER BY pecas DESC LIMIT 12`,
    params,
  )

  const wip = runAll<CortePedidoRow>(
    `SELECT h.pedido_norm as pedidoNorm, h.data, h.status as statusVigente,
            ${ocPecasExpr('h')} as pecas, h.canal, h.cliente, h.responsavel,
            ${ocObservacaoExpr()},
            COALESCE(NULLIF(trim(h.tecido), ''), (
              SELECT l.tecido FROM fato_corte_linha l
              WHERE ${ocJoinLinhas('h', 'l')} AND l.tecido IS NOT NULL AND trim(l.tecido) != ''
              ORDER BY l.excel_row LIMIT 1
            )) as tecido,
            COALESCE(NULLIF(trim(h.cod_tecido), ''), (
              SELECT l.cod_tecido FROM fato_corte_linha l
              WHERE ${ocJoinLinhas('h', 'l')} AND l.cod_tecido IS NOT NULL AND trim(l.cod_tecido) != ''
              ORDER BY l.excel_row LIMIT 1
            )) as codTecido,
            CAST(julianday('now', 'localtime') - julianday(COALESCE(h.data, h.inicio_corte, h.pcp_prontas)) AS INTEGER) as diasParado,
            h.excel_row as excelRow
     FROM fato_corte_linha h
     LEFT JOIN fato_corte_pedido p ON p.pedido_norm = h.pedido_norm
     WHERE ${where} AND h.is_header = 1 AND h.status = 'EM PRODUÇÃO'
     ORDER BY diasParado DESC, pecas DESC`,
    params,
  )
  const tecido = runAll<TecidoPendenteRow>(
    `SELECT h.pedido_norm as pedidoNorm, h.data, h.cliente,
            h.status as statusVigente,
            COALESCE(SUM(l.qtd_pecas), 0) as pecas,
            COALESCE(SUM(l.metros), 0) as metros,
            MAX(l.tecido) as tecido,
            MAX(l.cod_tecido) as codTecido,
            h.responsavel as responsavel,
            ${hasObservacaoColumn() ? 'MAX(p.observacao)' : 'NULL'} as observacao,
            h.excel_row as excelRow
     FROM fato_corte_linha h
     JOIN fato_corte_linha l ON ${ocJoinLinhas('h', 'l')}
     LEFT JOIN fato_corte_pedido p ON p.pedido_norm = h.pedido_norm
     WHERE ${where} AND h.is_header = 1 AND h.status = 'AGUARDANDO TECIDO'
     GROUP BY h.excel_row, COALESCE(l.cod_tecido, l.tecido)
     ORDER BY metros DESC`,
    params,
  )
  const porTecido = runAll<TecidoUsoRow>(
    `SELECT COALESCE(NULLIF(trim(l.cod_tecido), ''), '(sem código)') as cod,
            MAX(l.tecido) as nome,
            COALESCE(SUM(l.metros), 0) as metros,
            COALESCE(SUM(l.economia), 0) as economia,
            COUNT(DISTINCT l.pedido_norm) as pedidos
     FROM fato_corte_linha l
     LEFT JOIN fato_corte_pedido p ON p.pedido_norm = l.pedido_norm
     WHERE ${where} AND l.tecido IS NOT NULL AND trim(l.tecido) != ''
     GROUP BY COALESCE(NULLIF(trim(l.cod_tecido), ''), trim(l.tecido))
     ORDER BY metros DESC
     LIMIT 12`,
    params,
  )
  const resumo = runGet<{ pecas: number; pedidos: number }>(
    `SELECT COALESCE(SUM(p.pecas), 0) as pecas,
            COUNT(*) as pedidos
     FROM fato_corte_pedido p WHERE ${where}`,
    params,
  )
  const wipResumo = runGet<{ wipPedidos: number; wipPecas: number }>(
    `SELECT COALESCE(SUM(CASE WHEN h.is_header = 1 AND h.status = 'EM PRODUÇÃO' THEN 1 ELSE 0 END), 0) as wipPedidos,
            COALESCE(SUM(CASE WHEN h.status = 'EM PRODUÇÃO' THEN h.qtd_pecas ELSE 0 END), 0) as wipPecas
     FROM fato_corte_linha h
     LEFT JOIN fato_corte_pedido p ON p.pedido_norm = h.pedido_norm
     WHERE ${where}`,
    params,
  )
  const ocs = runGet<{ v: number }>(
    `SELECT COUNT(*) as v
     FROM fato_corte_linha l
     LEFT JOIN fato_corte_pedido p ON p.pedido_norm = l.pedido_norm
     WHERE ${where} AND l.is_header = 1`,
    params,
  )
  const aguardando = runGet<{ pedidos: number; pecas: number; metros: number }>(
    `SELECT COALESCE(SUM(CASE WHEN h.is_header = 1 AND h.status = 'AGUARDANDO TECIDO' THEN 1 ELSE 0 END), 0) as pedidos,
            COALESCE(SUM(CASE WHEN h.status = 'AGUARDANDO TECIDO' THEN h.qtd_pecas ELSE 0 END), 0) as pecas,
            COALESCE(SUM(CASE WHEN h.status = 'AGUARDANDO TECIDO' THEN h.metros ELSE 0 END), 0) as metros
     FROM fato_corte_linha h
     LEFT JOIN fato_corte_pedido p ON p.pedido_norm = h.pedido_norm
     WHERE ${where}`,
    params,
  )

  return {
    porMes,
    porCanal,
    porResponsavel,
    porCliente,
    wip,
    tecido,
    porTecido,
    resumo: {
      ...resumo,
      ...wipResumo,
      ocs: ocs.v,
      tecidoPedidos: aguardando.pedidos,
      tecidoPecas: aguardando.pecas,
      tecidoMetros: aguardando.metros,
    },
  }
})

export type TecidoMesRow = {
  mes: number
  corte: number
  signus: number
}

export type TecidoTipoRow = {
  tipoNorm: string
  movimentos: number
  metros: number
  pedidos: number
}

export type TecidoProdutoAggRow = {
  cod: string
  nome: string | null
  movimentos: number
  metros: number
  pedidos: number
}

export type TecidoCruzadoRow = {
  cod: string
  nome: string | null
  corteMetros: number
  signusMetros: number
  saldoAtual: number
  saldoReservado: number
  cortePedidos: number
  signusPedidos: number
}

export const getTecidos = cache(async (filters: DashFilters = {}) => {
  await ensureCloudDatabase()
  const db = sqlite()
  const corteFilter = emptyFilter()
  applyPedidoFilters(corteFilter, 'p', filters, {
    date: 'data',
    canal: true,
    cliente: true,
    pedido: true,
  })
  const corteWhere = whereSql(corteFilter)
  const signusFilter = emptyFilter()
  applySignusFilters(signusFilter, 's', filters)
  const signusWhere = whereSql(signusFilter)
  const estoqueFilter = emptyFilter()
  applyEstoqueCategoria(estoqueFilter, 'e', filters)
  const estoqueCategoriaWhere =
    estoqueFilter.clauses.length > 0 ? whereSql(estoqueFilter) : '1=1'
  const params = {
    ...corteFilter.params,
    ...signusFilter.params,
    ...estoqueFilter.params,
  }
  const hasSignus = Boolean(
    db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fato_tecido_signus'`,
      )
      .get(),
  )
  const hasEstoque = Boolean(
    db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fato_tecido_estoque'`,
      )
      .get(),
  )
  const estoqueJoin = (codExpr: string) =>
    `replace(trim(e.cod_produto), ' ', '') = replace(trim(COALESCE(${codExpr}, '')), ' ', '')
     AND ${estoqueCategoriaWhere}`
  const metrosCorte = runGet<{ v: number }>(
    `SELECT COALESCE(SUM(p.metros), 0) as v FROM fato_corte_pedido p WHERE ${corteWhere}`,
    params,
  ).v
  const metrosEconomia = runGet<{ v: number }>(
    `SELECT COALESCE(SUM(p.economia), 0) as v FROM fato_corte_pedido p WHERE ${corteWhere}`,
    params,
  ).v
  const metrosSignus = hasSignus
    ? runGet<{ v: number }>(
        `SELECT COALESCE(SUM(s.metros), 0) as v FROM fato_tecido_signus s
         WHERE ${signusWhere} AND s.is_baixa = 1`,
        params,
      ).v
    : 0
  const movimentosBaixa = hasSignus
    ? runGet<{ v: number }>(
        `SELECT COUNT(*) as v FROM fato_tecido_signus s
         WHERE ${signusWhere} AND s.is_baixa = 1`,
        params,
      ).v
    : 0
  const metrosSignusComPedido = hasSignus
    ? runGet<{ v: number }>(
        `SELECT COALESCE(SUM(s.metros), 0) as v FROM fato_tecido_signus s
         WHERE ${signusWhere} AND s.is_baixa = 1
           AND s.pedido_norm IS NOT NULL AND trim(s.pedido_norm) != ''`,
        params,
      ).v
    : 0
  const movimentosBaixaComPedido = hasSignus
    ? runGet<{ v: number }>(
        `SELECT COUNT(*) as v FROM fato_tecido_signus s
         WHERE ${signusWhere} AND s.is_baixa = 1
           AND s.pedido_norm IS NOT NULL AND trim(s.pedido_norm) != ''`,
        params,
      ).v
    : 0
  const pedidosComBaixa = hasSignus
    ? runGet<{ v: number }>(
        `SELECT COUNT(DISTINCT s.pedido_norm) as v FROM fato_tecido_signus s
         WHERE ${signusWhere} AND s.is_baixa = 1 AND s.pedido_norm IS NOT NULL`,
        params,
      ).v
    : 0
  const baixasSemPedido = hasSignus
    ? runGet<{ v: number }>(
        `SELECT COUNT(*) as v FROM fato_tecido_signus s
         WHERE ${signusWhere} AND s.is_baixa = 1
           AND (s.pedido_norm IS NULL OR trim(s.pedido_norm) = '')`,
        params,
      ).v
    : 0
  const baixaPorTipoOficial = hasSignus
    ? runAll<{
        tipoNorm: string
        metros: number
        movimentos: number
        pedidos: number
      }>(
        `SELECT s.tipo_norm as tipoNorm,
              COALESCE(SUM(s.metros), 0) as metros,
              COUNT(*) as movimentos,
              COUNT(DISTINCT s.pedido_norm) as pedidos
         FROM fato_tecido_signus s
         WHERE ${signusWhere} AND s.is_baixa = 1
         GROUP BY s.tipo_norm
         ORDER BY metros DESC`,
        params,
      )
    : []
  const retornoCorte = hasSignus
    ? runGet<{ v: number }>(
        `SELECT COALESCE(SUM(s.metros), 0) as v FROM fato_tecido_signus s
         WHERE ${signusWhere} AND s.tipo_norm = 'retorno_corte'`,
        params,
      ).v
    : 0
  const saldoAtualMetros = hasEstoque
    ? runGet<{ v: number }>(
        `SELECT COALESCE(SUM(e.saldo_atual), 0) as v FROM fato_tecido_estoque e
         WHERE e.em_metros = 1 AND ${estoqueCategoriaWhere}`,
        params,
      ).v
    : 0
  const saldoReservadoMetros = hasEstoque
    ? runGet<{ v: number }>(
        `SELECT COALESCE(SUM(e.saldo_reservado), 0) as v FROM fato_tecido_estoque e
         WHERE e.em_metros = 1 AND ${estoqueCategoriaWhere}`,
        params,
      ).v
    : 0
  const estoqueCodigos = hasEstoque
    ? runGet<{ v: number }>(
        `SELECT COUNT(*) as v FROM fato_tecido_estoque e
         WHERE ${estoqueCategoriaWhere}`,
        params,
      ).v
    : 0
  const aguardando = runGet<{ pedidos: number; pecas: number; metros: number }>(
    `SELECT (
              SELECT COUNT(*) FROM fato_corte_linha h
              LEFT JOIN fato_corte_pedido p ON p.pedido_norm = h.pedido_norm
              WHERE ${corteWhere} AND h.is_header = 1 AND h.status = 'AGUARDANDO TECIDO'
            ) as pedidos,
            COALESCE(SUM(l.qtd_pecas), 0) as pecas,
            COALESCE(SUM(l.metros), 0) as metros
     FROM fato_corte_linha l
     LEFT JOIN fato_corte_pedido p ON p.pedido_norm = l.pedido_norm
     WHERE ${corteWhere} AND l.status = 'AGUARDANDO TECIDO'`,
    params,
  )

  const corteMes = runAll<{ mes: number; metros: number }>(
    `SELECT CAST(substr(p.data, 6, 2) as INTEGER) as mes, COALESCE(SUM(l.metros), 0) as metros
     FROM fato_corte_linha l
     LEFT JOIN fato_corte_pedido p ON p.pedido_norm = l.pedido_norm
     WHERE ${corteWhere} AND p.data IS NOT NULL
     GROUP BY mes`,
    params,
  )
  const signusMes = hasSignus
    ? runAll<{ mes: number; metros: number }>(
        `SELECT CAST(substr(s.data, 6, 2) as INTEGER) as mes, COALESCE(SUM(s.metros), 0) as metros
         FROM fato_tecido_signus s
         WHERE ${signusWhere} AND s.is_baixa = 1
         GROUP BY mes`,
        params,
      )
    : []

  const months: TecidoMesRow[] = Array.from({ length: 12 }, (_, index) => ({
    mes: index + 1,
    corte: 0,
    signus: 0,
  }))
  for (const row of corteMes) months[row.mes - 1].corte = row.metros
  for (const row of signusMes) months[row.mes - 1].signus = row.metros
  const porMes = months.filter((row) => row.corte || row.signus)

  const estoqueSelect = hasEstoque
    ? `COALESCE((
                SELECT e.saldo_atual FROM fato_tecido_estoque e
                WHERE ${estoqueJoin('l.cod_tecido')}
              ), 0) as saldoAtual,
              COALESCE((
                SELECT e.saldo_reservado FROM fato_tecido_estoque e
                WHERE ${estoqueJoin('l.cod_tecido')}
              ), 0) as saldoReservado`
    : `0 as saldoAtual, 0 as saldoReservado`

  const porTecido = runAll<
    TecidoUsoRow & { signusMetros: number; saldoAtual: number; saldoReservado: number }
  >(
    hasSignus
      ? `SELECT COALESCE(NULLIF(trim(l.cod_tecido), ''), '(sem código)') as cod,
              MAX(l.tecido) as nome,
              COALESCE(SUM(l.metros), 0) as metros,
              COALESCE(SUM(l.economia), 0) as economia,
              COUNT(DISTINCT l.pedido_norm) as pedidos,
              COALESCE((
                SELECT SUM(s.metros) FROM fato_tecido_signus s
                WHERE ${signusWhere} AND s.is_baixa = 1
                  AND replace(trim(s.cod_produto), ' ', '') = replace(trim(COALESCE(l.cod_tecido, '')), ' ', '')
              ), 0) as signusMetros,
              ${estoqueSelect}
       FROM fato_corte_linha l
       LEFT JOIN fato_corte_pedido p ON p.pedido_norm = l.pedido_norm
       WHERE ${corteWhere} AND l.tecido IS NOT NULL AND trim(l.tecido) != ''
       GROUP BY COALESCE(NULLIF(trim(l.cod_tecido), ''), trim(l.tecido))
       ORDER BY metros DESC
       LIMIT 15`
      : `SELECT COALESCE(NULLIF(trim(l.cod_tecido), ''), '(sem código)') as cod,
              MAX(l.tecido) as nome,
              COALESCE(SUM(l.metros), 0) as metros,
              COALESCE(SUM(l.economia), 0) as economia,
              COUNT(DISTINCT l.pedido_norm) as pedidos,
              0 as signusMetros,
              ${estoqueSelect}
       FROM fato_corte_linha l
       LEFT JOIN fato_corte_pedido p ON p.pedido_norm = l.pedido_norm
       WHERE ${corteWhere} AND l.tecido IS NOT NULL AND trim(l.tecido) != ''
       GROUP BY COALESCE(NULLIF(trim(l.cod_tecido), ''), trim(l.tecido))
       ORDER BY metros DESC
       LIMIT 15`,
    params,
  )

  const porTipo = hasSignus
    ? runAll<TecidoTipoRow>(
        `SELECT s.tipo_norm as tipoNorm, COUNT(*) as movimentos,
              COALESCE(SUM(s.metros), 0) as metros,
              COUNT(DISTINCT s.pedido_norm) as pedidos
         FROM fato_tecido_signus s
         WHERE ${signusWhere}
         GROUP BY s.tipo_norm
         ORDER BY metros DESC`,
        params,
      )
    : []

  const cruzados = runAll<TecidoCruzadoRow>(
    hasSignus
      ? `SELECT COALESCE(NULLIF(trim(l.cod_tecido), ''), '(sem código)') as cod,
              MAX(l.tecido) as nome,
              COALESCE(SUM(l.metros), 0) as corteMetros,
              COUNT(DISTINCT l.pedido_norm) as cortePedidos,
              COALESCE((
                SELECT SUM(s.metros) FROM fato_tecido_signus s
                WHERE ${signusWhere} AND s.is_baixa = 1
                  AND replace(trim(s.cod_produto), ' ', '') = replace(trim(COALESCE(l.cod_tecido, '')), ' ', '')
              ), 0) as signusMetros,
              COALESCE((
                SELECT COUNT(DISTINCT s.pedido_norm) FROM fato_tecido_signus s
                WHERE ${signusWhere} AND s.is_baixa = 1
                  AND replace(trim(s.cod_produto), ' ', '') = replace(trim(COALESCE(l.cod_tecido, '')), ' ', '')
              ), 0) as signusPedidos,
              ${estoqueSelect}
       FROM fato_corte_linha l
       LEFT JOIN fato_corte_pedido p ON p.pedido_norm = l.pedido_norm
       WHERE ${corteWhere} AND l.tecido IS NOT NULL AND trim(l.tecido) != ''
       GROUP BY COALESCE(NULLIF(trim(l.cod_tecido), ''), trim(l.tecido))
       ORDER BY corteMetros DESC
       LIMIT 20`
      : `SELECT COALESCE(NULLIF(trim(l.cod_tecido), ''), '(sem código)') as cod,
              MAX(l.tecido) as nome,
              COALESCE(SUM(l.metros), 0) as corteMetros,
              COUNT(DISTINCT l.pedido_norm) as cortePedidos,
              0 as signusMetros,
              0 as signusPedidos,
              ${estoqueSelect}
       FROM fato_corte_linha l
       LEFT JOIN fato_corte_pedido p ON p.pedido_norm = l.pedido_norm
       WHERE ${corteWhere} AND l.tecido IS NOT NULL AND trim(l.tecido) != ''
       GROUP BY COALESCE(NULLIF(trim(l.cod_tecido), ''), trim(l.tecido))
       ORDER BY corteMetros DESC
       LIMIT 20`,
    params,
  )

  const signusSemCorte = hasSignus
    ? runAll<{
        cod: string
        nome: string | null
        signusMetros: number
        signusPedidos: number
      }>(
        `SELECT s.cod_produto as cod, MAX(s.nome_produto) as nome,
              COALESCE(SUM(s.metros), 0) as signusMetros,
              COUNT(DISTINCT s.pedido_norm) as signusPedidos
         FROM fato_tecido_signus s
         WHERE ${signusWhere} AND s.is_baixa = 1
           AND NOT EXISTS (
             SELECT 1 FROM fato_corte_linha l
             WHERE replace(trim(l.cod_tecido), ' ', '') = replace(trim(s.cod_produto), ' ', '')
           )
         GROUP BY s.cod_produto
         ORDER BY signusMetros DESC
         LIMIT 12`,
        params,
      )
    : []

  const estoqueSemCorte = hasEstoque
    ? runAll<{
        cod: string
        nome: string | null
        saldoAtual: number
        saldoReservado: number
      }>(
        `SELECT e.cod_produto as cod, e.nome_produto as nome,
              e.saldo_atual as saldoAtual, e.saldo_reservado as saldoReservado
         FROM fato_tecido_estoque e
         WHERE e.em_metros = 1 AND e.saldo_atual != 0
           AND ${estoqueCategoriaWhere}
           AND NOT EXISTS (
             SELECT 1 FROM fato_corte_linha l
             WHERE replace(trim(l.cod_tecido), ' ', '') = replace(trim(e.cod_produto), ' ', '')
           )
         ORDER BY e.saldo_atual DESC
         LIMIT 12`,
        params,
      )
    : []

  const tecido = runAll<TecidoPendenteRow & { saldoAtual: number; saldoReservado: number }>(
    `SELECT h.pedido_norm as pedidoNorm, h.data, h.cliente,
            h.status as statusVigente,
            COALESCE(SUM(l.qtd_pecas), 0) as pecas,
            COALESCE(SUM(l.metros), 0) as metros,
            MAX(l.tecido) as tecido,
            MAX(l.cod_tecido) as codTecido,
            h.responsavel as responsavel,
            ${hasObservacaoColumn() ? 'MAX(p.observacao)' : 'NULL'} as observacao,
            h.excel_row as excelRow,
            ${hasEstoque ? 'COALESCE(MAX(e.saldo_atual), 0)' : '0'} as saldoAtual,
            ${hasEstoque ? 'COALESCE(MAX(e.saldo_reservado), 0)' : '0'} as saldoReservado
     FROM fato_corte_linha h
     JOIN fato_corte_linha l ON ${ocJoinLinhas('h', 'l')}
     LEFT JOIN fato_corte_pedido p ON p.pedido_norm = h.pedido_norm
     ${
       hasEstoque
         ? `LEFT JOIN fato_tecido_estoque e
            ON replace(trim(e.cod_produto), ' ', '') = replace(trim(COALESCE(l.cod_tecido, '')), ' ', '')
            AND ${estoqueCategoriaWhere}`
         : ''
     }
     WHERE ${corteWhere} AND h.is_header = 1 AND h.status = 'AGUARDANDO TECIDO'
     GROUP BY h.excel_row, COALESCE(l.cod_tecido, l.tecido)
     ORDER BY metros DESC`,
    params,
  )

  const porCanalSignus = hasSignus
    ? runAll<{ nome: string; metros: number; movimentos: number }>(
        `SELECT COALESCE(s.canal_norm, '(sem canal)') as nome,
              COALESCE(SUM(s.metros), 0) as metros,
              COUNT(*) as movimentos
         FROM fato_tecido_signus s
         WHERE ${signusWhere} AND s.is_baixa = 1
         GROUP BY s.canal_norm
         ORDER BY metros DESC`,
        params,
      )
    : []

  return {
    metrosCorte,
    metrosEconomia,
    metrosSignus,
    metrosSignusComPedido,
    movimentosBaixa,
    movimentosBaixaComPedido,
    pedidosComBaixa,
    baixasSemPedido,
    baixaPorTipoOficial,
    retornoCorte,
    saldoAtualMetros,
    saldoReservadoMetros,
    estoqueCodigos,
    tecidoPedidos: aguardando.pedidos,
    tecidoPecas: aguardando.pecas,
    tecidoMetros: aguardando.metros,
    porMes,
    porTecido,
    porTipo,
    cruzados,
    signusSemCorte,
    estoqueSemCorte,
    tecido,
    porCanalSignus,
  }
})

const RASTREIO_ROW_LIMIT = 300

export type TecidoRastreioRow = {
  data: string
  movimentoId: string | null
  cod: string
  nome: string | null
  tipoNorm: string
  tipoMovimento: string
  metros: number
  pedidoNorm: string | null
  origemMov: string | null
  almox: string | null
  isBaixa: boolean
}

export const getTecidosRastreio = cache(async (filters: DashFilters = {}) => {
  await ensureCloudDatabase()
  const db = sqlite()
  const hasSignus = Boolean(
    db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fato_tecido_signus'`,
      )
      .get(),
  )
  if (!hasSignus) {
    return {
      metrosTotal: 0,
      metrosBaixaOficial: 0,
      comPedido: 0,
      semPedido: 0,
      movimentos: 0,
      truncated: false,
      porTipo: [] as TecidoTipoRow[],
      porTecido: [] as TecidoProdutoAggRow[],
      rows: [] as TecidoRastreioRow[],
    }
  }

  const signusFilter = emptyFilter()
  applySignusRastreioFilters(signusFilter, 's', filters)
  const signusWhere = whereSql(signusFilter)
  const params = { ...signusFilter.params }

  // Lista de tipos ignora o filtro de tipo para permitir trocar o recorte na própria tabela.
  const tipoListFilter = emptyFilter()
  applySignusRastreioFilters(tipoListFilter, 's', { ...filters, tipo: undefined })
  const tipoListWhere = whereSql(tipoListFilter)
  const tipoListParams = { ...tipoListFilter.params }

  const totals = runGet<{
    metrosTotal: number
    metrosBaixaOficial: number
    movimentos: number
    comPedido: number
    semPedido: number
  }>(
    `SELECT COALESCE(SUM(s.metros), 0) as metrosTotal,
            COALESCE(SUM(CASE WHEN s.is_baixa = 1 THEN s.metros ELSE 0 END), 0) as metrosBaixaOficial,
            COUNT(*) as movimentos,
            COALESCE(SUM(CASE
              WHEN s.pedido_norm IS NOT NULL AND trim(s.pedido_norm) != '' THEN s.metros
              ELSE 0 END), 0) as comPedido,
            COALESCE(SUM(CASE
              WHEN s.pedido_norm IS NULL OR trim(s.pedido_norm) = '' THEN s.metros
              ELSE 0 END), 0) as semPedido
     FROM fato_tecido_signus s
     WHERE ${signusWhere}`,
    params,
  )

  const porTipo = runAll<TecidoTipoRow>(
    `SELECT s.tipo_norm as tipoNorm, COUNT(*) as movimentos,
            COALESCE(SUM(s.metros), 0) as metros,
            COUNT(DISTINCT s.pedido_norm) as pedidos
     FROM fato_tecido_signus s
     WHERE ${tipoListWhere}
     GROUP BY s.tipo_norm
     ORDER BY metros DESC`,
    tipoListParams,
  )

  const porTecido = runAll<TecidoProdutoAggRow>(
    `SELECT s.cod_produto as cod, MAX(s.nome_produto) as nome,
            COUNT(*) as movimentos,
            COALESCE(SUM(s.metros), 0) as metros,
            COUNT(DISTINCT CASE
              WHEN s.pedido_norm IS NOT NULL AND trim(s.pedido_norm) != '' THEN s.pedido_norm
              END) as pedidos
     FROM fato_tecido_signus s
     WHERE ${signusWhere}
     GROUP BY s.cod_produto
     ORDER BY metros DESC
     LIMIT ${RASTREIO_ROW_LIMIT}`,
    params,
  )

  const rowsRaw = runAll<{
    data: string
    movimentoId: string | null
    cod: string
    nome: string | null
    tipoNorm: string
    tipoMovimento: string
    metros: number
    pedidoNorm: string | null
    origemMov: string | null
    almox: string | null
    isBaixaFlag: number
  }>(
    `SELECT s.data,
            s.movimento_id as movimentoId,
            s.cod_produto as cod,
            s.nome_produto as nome,
            s.tipo_norm as tipoNorm,
            s.tipo_movimento as tipoMovimento,
            s.metros,
            s.pedido_norm as pedidoNorm,
            s.origem_mov as origemMov,
            s.almox,
            s.is_baixa as isBaixaFlag
     FROM fato_tecido_signus s
     WHERE ${signusWhere}
     ORDER BY s.data DESC, s.excel_row DESC
     LIMIT ${RASTREIO_ROW_LIMIT}`,
    params,
  )
  const rows: TecidoRastreioRow[] = rowsRaw.map((row) => ({
    data: row.data,
    movimentoId: row.movimentoId,
    cod: row.cod,
    nome: row.nome,
    tipoNorm: row.tipoNorm,
    tipoMovimento: row.tipoMovimento,
    metros: row.metros,
    pedidoNorm: row.pedidoNorm,
    origemMov: row.origemMov,
    almox: row.almox,
    isBaixa: Boolean(row.isBaixaFlag),
  }))

  return {
    metrosTotal: totals.metrosTotal,
    metrosBaixaOficial: totals.metrosBaixaOficial,
    comPedido: totals.comPedido,
    semPedido: totals.semPedido,
    movimentos: totals.movimentos,
    truncated: totals.movimentos > RASTREIO_ROW_LIMIT,
    porTipo,
    porTecido,
    rows,
  }
})

export type PedidoTecidoRow = {
  pedidoNorm: string
  cliente: string | null
  canal: string | null
  consumo: number
  baixa: number
  pecas: number
  valorBaixa: number
  valorUnitario: number | null
  documentos: string | null
  movimentos: number
  observacao: string | null
}

export type TecidoValorRow = {
  cod: string
  nome: string | null
  valorUnitario: number | null
  consumo: number
  baixa: number
  valorBaixa: number
  valorConsumoEst: number
  pedidos: number
  pedidoRows: PedidoTecidoRow[]
}

export type TecidoDocumentoRow = {
  tipoDocumento: string | null
  movimentos: number
  metros: number
  valor: number
  pedidos: number
}

export const getTecidosValores = cache(async (filters: DashFilters = {}) => {
  await ensureCloudDatabase()
  const db = sqlite()
  const corteFilter = emptyFilter()
  applyPedidoFilters(corteFilter, 'p', filters, {
    date: 'data',
    canal: true,
    cliente: true,
    pedido: true,
  })
  const corteWhere = whereSql(corteFilter)
  const signusFilter = emptyFilter()
  applySignusFilters(signusFilter, 's', filters)
  const signusWhere = whereSql(signusFilter)
  const params = { ...corteFilter.params, ...signusFilter.params }
  const hasSignus = Boolean(
    db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fato_tecido_signus'`,
      )
      .get(),
  )
  const hasValores =
    hasSignus &&
    Boolean(
      (
        db.prepare(`PRAGMA table_info(fato_tecido_signus)`).all() as {
          name: string
        }[]
      ).some((col) => col.name === 'valor_unitario'),
    )

  const metrosCorte = runGet<{ v: number }>(
    `SELECT COALESCE(SUM(p.metros), 0) as v FROM fato_corte_pedido p WHERE ${corteWhere}`,
    params,
  ).v
  const pecasCorte = runGet<{ v: number }>(
    `SELECT COALESCE(SUM(p.pecas), 0) as v FROM fato_corte_pedido p WHERE ${corteWhere}`,
    params,
  ).v
  const empty = {
    metrosCorte,
    pecasCorte,
    metrosBaixa: 0,
    valorBaixa: 0,
    valorUnitarioMedio: 0,
    valorConsumoEst: 0,
    valorInventario: 0,
    valorCompras: 0,
    pedidosCorte: 0,
    pedidosComBaixa: 0,
    pedidosSemBaixa: 0,
    movimentosComValor: 0,
    hasValores,
    porTecido: [] as TecidoValorRow[],
    porDocumento: [] as TecidoDocumentoRow[],
  }
  if (!hasSignus || !hasValores) return empty

  const valorExpr =
    'COALESCE(s.valor_total, CASE WHEN s.valor_unitario IS NOT NULL THEN s.valor_unitario * s.qtd ELSE 0 END, 0)'

  const kpis = runGet<{
    metrosBaixa: number
    valorBaixa: number
    vu: number | null
    valorInventario: number
    valorCompras: number
    pedidosComBaixa: number
    movimentosComValor: number
  }>(
    `SELECT
        COALESCE(SUM(CASE WHEN s.is_baixa = 1 THEN s.metros ELSE 0 END), 0) as metrosBaixa,
        COALESCE(SUM(CASE WHEN s.is_baixa = 1 THEN ${valorExpr} ELSE 0 END), 0) as valorBaixa,
        SUM(CASE WHEN s.is_baixa = 1 THEN ${valorExpr} ELSE 0 END)
          / NULLIF(SUM(CASE WHEN s.is_baixa = 1 THEN s.qtd ELSE 0 END), 0) as vu,
        COALESCE(SUM(CASE WHEN s.tipo_documento LIKE '%INVENT%' THEN ${valorExpr} ELSE 0 END), 0) as valorInventario,
        COALESCE(SUM(CASE
          WHEN s.tipo_documento LIKE '%NOTA FISCAL%' AND s.tipo_documento LIKE '%ENTRADA%'
          THEN ${valorExpr} ELSE 0 END), 0) as valorCompras,
        COUNT(DISTINCT CASE WHEN s.is_baixa = 1 AND s.pedido_norm IS NOT NULL THEN s.pedido_norm END) as pedidosComBaixa,
        SUM(CASE WHEN s.valor_unitario IS NOT NULL AND s.valor_unitario != 0 THEN 1 ELSE 0 END) as movimentosComValor
     FROM fato_tecido_signus s
     WHERE ${signusWhere}`,
    params,
  )

  const corteTecidos = runAll<{
    cod: string
    nome: string | null
    consumo: number
    pedidos: number
  }>(
    `SELECT COALESCE(NULLIF(trim(l.cod_tecido), ''), '(sem código)') as cod,
            MAX(l.tecido) as nome,
            COALESCE(SUM(l.metros), 0) as consumo,
            COUNT(DISTINCT l.pedido_norm) as pedidos
     FROM fato_corte_linha l
     LEFT JOIN fato_corte_pedido p ON p.pedido_norm = l.pedido_norm
     WHERE ${corteWhere} AND l.tecido IS NOT NULL AND trim(l.tecido) != ''
     GROUP BY COALESCE(NULLIF(trim(l.cod_tecido), ''), trim(l.tecido))`,
    params,
  )
  const signusTecidos = runAll<{
    cod: string
    nome: string | null
    baixa: number
    valorBaixa: number
    valorUnitario: number | null
  }>(
    `SELECT s.cod_produto as cod, MAX(s.nome_produto) as nome,
            COALESCE(SUM(CASE WHEN s.is_baixa = 1 THEN s.metros ELSE 0 END), 0) as baixa,
            COALESCE(SUM(CASE WHEN s.is_baixa = 1 THEN ${valorExpr} ELSE 0 END), 0) as valorBaixa,
            SUM(CASE WHEN s.valor_unitario IS NOT NULL AND s.qtd != 0 THEN s.valor_unitario * s.qtd END)
              / NULLIF(SUM(CASE WHEN s.valor_unitario IS NOT NULL AND s.qtd != 0 THEN s.qtd END), 0) as valorUnitario
     FROM fato_tecido_signus s
     WHERE ${signusWhere}
     GROUP BY s.cod_produto`,
    params,
  )

  const tecidoMap = new Map<string, TecidoValorRow>()
  const normCod = (cod: string) => cod.replace(/\s+/g, '')
  for (const row of corteTecidos) {
    tecidoMap.set(normCod(row.cod), {
      cod: row.cod,
      nome: row.nome,
      valorUnitario: null,
      consumo: row.consumo,
      baixa: 0,
      valorBaixa: 0,
      valorConsumoEst: 0,
      pedidos: row.pedidos,
      pedidoRows: [],
    })
  }
  for (const row of signusTecidos) {
    const key = normCod(row.cod)
    const current = tecidoMap.get(key) ?? {
      cod: row.cod,
      nome: row.nome,
      valorUnitario: null,
      consumo: 0,
      baixa: 0,
      valorBaixa: 0,
      valorConsumoEst: 0,
      pedidos: 0,
      pedidoRows: [],
    }
    current.nome = current.nome || row.nome
    current.baixa = row.baixa
    current.valorBaixa = row.valorBaixa
    current.valorUnitario = row.valorUnitario
    current.valorConsumoEst =
      row.valorUnitario != null ? row.valorUnitario * current.consumo : 0
    tecidoMap.set(key, current)
  }
  const cortePedidoTecido = runAll<{
    cod: string
    pedidoNorm: string
    cliente: string | null
    canal: string | null
    consumo: number
    observacao: string | null
  }>(
    `SELECT COALESCE(NULLIF(trim(l.cod_tecido), ''), '(sem código)') as cod,
            l.pedido_norm as pedidoNorm,
            MAX(p.cliente) as cliente,
            MAX(p.canal) as canal,
            COALESCE(SUM(l.metros), 0) as consumo,
            ${hasObservacaoColumn() ? 'MAX(p.observacao)' : 'NULL'} as observacao
     FROM fato_corte_linha l
     LEFT JOIN fato_corte_pedido p ON p.pedido_norm = l.pedido_norm
     WHERE ${corteWhere} AND l.tecido IS NOT NULL AND trim(l.tecido) != ''
     GROUP BY COALESCE(NULLIF(trim(l.cod_tecido), ''), trim(l.tecido)), l.pedido_norm`,
    params,
  )
  const signusPedidoTecido = runAll<{
    cod: string
    pedidoNorm: string
    baixa: number
    valorBaixa: number
    valorUnitario: number | null
    documentos: string | null
    movimentos: number
  }>(
    `SELECT s.cod_produto as cod, s.pedido_norm as pedidoNorm,
            COALESCE(SUM(CASE WHEN s.is_baixa = 1 THEN s.metros ELSE 0 END), 0) as baixa,
            COALESCE(SUM(CASE WHEN s.is_baixa = 1 THEN ${valorExpr} ELSE 0 END), 0) as valorBaixa,
            SUM(CASE WHEN s.is_baixa = 1 AND s.valor_unitario IS NOT NULL AND s.qtd != 0 THEN s.valor_unitario * s.qtd END)
              / NULLIF(SUM(CASE WHEN s.is_baixa = 1 AND s.valor_unitario IS NOT NULL AND s.qtd != 0 THEN s.qtd END), 0) as valorUnitario,
            GROUP_CONCAT(DISTINCT s.tipo_documento) as documentos,
            COUNT(*) as movimentos
     FROM fato_tecido_signus s
     WHERE ${signusWhere} AND s.pedido_norm IS NOT NULL AND trim(s.pedido_norm) != ''
     GROUP BY s.cod_produto, s.pedido_norm`,
    params,
  )
  const pedidoByTecido = new Map<string, Map<string, PedidoTecidoRow>>()
  const emptyPedido = (pedidoNorm: string): PedidoTecidoRow => ({
    pedidoNorm,
    cliente: null,
    canal: null,
    consumo: 0,
    baixa: 0,
    pecas: 0,
    valorBaixa: 0,
    valorUnitario: null,
    documentos: null,
    movimentos: 0,
    observacao: null,
  })
  function ensurePedido(cod: string, pedidoNorm: string) {
    const tKey = normCod(cod)
    let inner = pedidoByTecido.get(tKey)
    if (!inner) {
      inner = new Map()
      pedidoByTecido.set(tKey, inner)
    }
    let row = inner.get(pedidoNorm)
    if (!row) {
      row = emptyPedido(pedidoNorm)
      inner.set(pedidoNorm, row)
    }
    return row
  }
  for (const row of cortePedidoTecido) {
    const current = ensurePedido(row.cod, row.pedidoNorm)
    current.cliente = row.cliente
    current.canal = row.canal
    current.consumo = row.consumo
    current.observacao = row.observacao
  }
  for (const row of signusPedidoTecido) {
    const current = ensurePedido(row.cod, row.pedidoNorm)
    current.baixa = row.baixa
    current.valorBaixa = row.valorBaixa
    current.valorUnitario = row.valorUnitario
    current.documentos = row.documentos
    current.movimentos = row.movimentos
  }

  const porTecido = [...tecidoMap.values()]
    .map((row) => {
      const inner = pedidoByTecido.get(normCod(row.cod))
      const pedidoRows = inner
        ? [...inner.values()].sort(
            (a, b) => b.valorBaixa - a.valorBaixa || b.consumo - a.consumo,
          )
        : []
      return {
        ...row,
        valorConsumoEst:
          row.valorUnitario != null ? row.valorUnitario * row.consumo : row.valorConsumoEst,
        pedidoRows,
        pedidos: pedidoRows.length || row.pedidos,
      }
    })
    .sort((a, b) => b.valorBaixa - a.valorBaixa || b.consumo - a.consumo)
    .slice(0, 40)
  const valorConsumoEst = porTecido.reduce((sum, row) => sum + row.valorConsumoEst, 0)

  const cortePedidos = runAll<{
    pedidoNorm: string
  }>(
    `SELECT p.pedido_norm as pedidoNorm FROM fato_corte_pedido p WHERE ${corteWhere}`,
    params,
  )
  const signusPedidos = runAll<{
    pedidoNorm: string
    baixa: number
  }>(
    `SELECT s.pedido_norm as pedidoNorm,
            COALESCE(SUM(CASE WHEN s.is_baixa = 1 THEN s.metros ELSE 0 END), 0) as baixa
     FROM fato_tecido_signus s
     WHERE ${signusWhere} AND s.pedido_norm IS NOT NULL AND trim(s.pedido_norm) != ''
     GROUP BY s.pedido_norm`,
    params,
  )
  const pedidosCorte = cortePedidos.length
  const pedidosComBaixaSet = new Set(
    signusPedidos.filter((row) => row.baixa > 0).map((row) => row.pedidoNorm),
  )
  const pedidosSemBaixa = cortePedidos.filter(
    (row) => !pedidosComBaixaSet.has(row.pedidoNorm),
  ).length

  const porDocumento = runAll<TecidoDocumentoRow>(
    `SELECT s.tipo_documento as tipoDocumento, COUNT(*) as movimentos,
            COALESCE(SUM(s.metros), 0) as metros,
            COALESCE(SUM(${valorExpr}), 0) as valor,
            COUNT(DISTINCT s.pedido_norm) as pedidos
     FROM fato_tecido_signus s
     WHERE ${signusWhere}
     GROUP BY s.tipo_documento
     ORDER BY valor DESC`,
    params,
  )

  return {
    metrosCorte,
    pecasCorte,
    metrosBaixa: kpis.metrosBaixa,
    valorBaixa: kpis.valorBaixa,
    valorUnitarioMedio: kpis.vu ?? 0,
    valorConsumoEst,
    valorInventario: kpis.valorInventario,
    valorCompras: kpis.valorCompras,
    pedidosCorte,
    pedidosComBaixa: kpis.pedidosComBaixa,
    pedidosSemBaixa,
    movimentosComValor: kpis.movimentosComValor ?? 0,
    hasValores,
    porTecido,
    porDocumento,
  }
})

function todayIso() {
  const db = sqlite()
  return (db.prepare(`SELECT date('now', 'localtime') as v`).get() as { v: string }).v
}

export const getCosturas = cache(async (filters: DashFilters = {}) => {
  await ensureCloudDatabase()
  const filter = emptyFilter()
  applyPedidoFilters(filter, 'c', filters, {
    date: 'data_producao',
    responsavel: true,
    produto: true,
    pedido: true,
  })
  const where = whereSql(filter)
  const { params } = filter
  const mix = runAll<{
    origem: string
    origemNorm: string
    lancamentos: number
    pecas: number
    pedidos: number
  }>(
    `SELECT c.origem, c.origem_norm as origemNorm, COUNT(*) as lancamentos,
            COALESCE(SUM(c.qtd_pecas), 0) as pecas, COUNT(DISTINCT c.pedido_norm) as pedidos
     FROM fato_costura c WHERE ${where} GROUP BY c.origem_norm ORDER BY pecas DESC`,
    params,
  )
  const porResponsavel = runAll<NamedTotal>(
    `SELECT COALESCE(c.responsavel, '(sem)') as nome, COALESCE(SUM(c.qtd_pecas), 0) as pecas,
            COUNT(DISTINCT c.pedido_norm) as pedidos
     FROM fato_costura c WHERE ${where} AND c.origem_norm = 'Producao'
     GROUP BY c.responsavel ORDER BY pecas DESC`,
    params,
  )
  const hoje = todayIso()
  const doDia = runAll<{
    pedido: string
    pecas: number
    responsavel: string | null
    produto: string | null
    origem: string
    observacao: string | null
  }>(
    `SELECT c.pedido_norm as pedido, c.qtd_pecas as pecas, c.responsavel, c.produto, c.origem,
            ${observacaoExpr()}
     FROM fato_costura c
     LEFT JOIN fato_corte_pedido p ON p.pedido_norm = c.pedido_norm
     WHERE ${where} AND c.data_producao = @hoje AND c.origem_norm = 'Producao'
     ORDER BY c.excel_row DESC`,
    { ...params, hoje },
  )
  const producao = runGet<{ pecas: number; pedidos: number }>(
    `SELECT COALESCE(SUM(c.qtd_pecas), 0) as pecas, COUNT(DISTINCT c.pedido_norm) as pedidos
     FROM fato_costura c WHERE ${where} AND c.origem_norm = 'Producao'`,
    params,
  )
  return { mix, porResponsavel, doDia, hoje, producao }
})

export const getRevisao = cache(async (filters: DashFilters = {}) => {
  await ensureCloudDatabase()
  const filter = emptyFilter()
  applyPedidoFilters(filter, 'r', filters, {
    date: 'data_producao',
    responsavel: true,
    produto: true,
    pedido: true,
  })
  const where = whereSql(filter)
  const { params } = filter
  const porResponsavel = runAll<NamedTotal>(
    `SELECT COALESCE(r.responsavel, '(sem)') as nome, COALESCE(SUM(r.qtd_pecas), 0) as pecas,
            COUNT(DISTINCT r.pedido_norm) as pedidos
     FROM fato_revisao r WHERE ${where} GROUP BY r.responsavel ORDER BY pecas DESC`,
    params,
  )
  const hoje = todayIso()
  const doDia = runAll<{
    pedido: string
    pecas: number
    responsavel: string | null
    produto: string | null
    observacao: string | null
  }>(
    `SELECT r.pedido_norm as pedido, r.qtd_pecas as pecas, r.responsavel, r.produto,
            ${observacaoExpr()}
     FROM fato_revisao r
     LEFT JOIN fato_corte_pedido p ON p.pedido_norm = r.pedido_norm
     WHERE ${where} AND r.data_producao = @hoje ORDER BY r.excel_row DESC`,
    { ...params, hoje },
  )
  const resumo = runGet<{ pecas: number; pedidos: number }>(
    `SELECT COALESCE(SUM(r.qtd_pecas), 0) as pecas, COUNT(DISTINCT r.pedido_norm) as pedidos
     FROM fato_revisao r WHERE ${where}`,
    params,
  )
  return { porResponsavel, doDia, hoje, resumo }
})

export const getOficinas = cache(async (filters: DashFilters = {}) => {
  await ensureCloudDatabase()
  const filter = emptyFilter()
  applyPedidoFilters(filter, 'o', filters, {
    date: 'data_envio',
    oficina: true,
    pedido: true,
  })
  const where = whereSql(filter)
  const { params } = filter
  const rankingBase = runAll<{
    nome: string
    pecas: number
    lotes: number
    enviadas: number
    retornadas: number
    defeitos: number
    valor: number
  }>(
    `SELECT o.oficina as nome, COALESCE(SUM(${sqlPendentesOficina('o')}), 0) as pecas,
            COUNT(*) as lotes, COALESCE(SUM(o.qtd_enviadas), 0) as enviadas,
            COALESCE(SUM(o.qtd_retornadas), 0) as retornadas,
            COALESCE(SUM(o.qtd_defeitos), 0) as defeitos,
            COALESCE(SUM(o.valor_total), 0) as valor
     FROM fato_oficinas o WHERE ${where} GROUP BY o.oficina ORDER BY valor DESC, pecas DESC`,
    params,
  )
  const sla = runGet<{
    noPrazo: number
    atraso: number
    lotes: number
    abertos: number
    valor: number
  }>(
    `SELECT
       SUM(CASE WHEN o.status_entrega LIKE 'Em dia%' THEN 1 ELSE 0 END) as noPrazo,
       SUM(CASE WHEN o.status_entrega LIKE '%Atrasad%' THEN 1 ELSE 0 END) as atraso,
       COUNT(*) as lotes,
       SUM(CASE WHEN ${sqlPendentesOficina('o')} > 0 THEN 1 ELSE 0 END) as abertos,
       COALESCE(SUM(o.valor_total), 0) as valor
     FROM fato_oficinas o WHERE ${where}`,
    params,
  )
  const enviadas = runGet<{ v: number }>(
    `SELECT COALESCE(SUM(o.qtd_enviadas), 0) as v FROM fato_oficinas o WHERE ${where}`,
    params,
  ).v
  const retornadas = runGet<{ v: number }>(
    `SELECT COALESCE(SUM(o.qtd_retornadas), 0) as v FROM fato_oficinas o WHERE ${where}`,
    params,
  ).v
  const pendentes = runGet<{ v: number }>(
    `SELECT COALESCE(SUM(${sqlPendentesOficina('o')}), 0) as v FROM fato_oficinas o WHERE ${where}`,
    params,
  ).v
  const defeitos = runGet<{ v: number }>(
    `SELECT COALESCE(SUM(o.qtd_defeitos), 0) as v FROM fato_oficinas o WHERE ${where}`,
    params,
  ).v
  const semRetorno = runAll<{
    oficina: string
    pedido: string | null
    enviadas: number
    data: string
    produto: string | null
    observacao: string | null
  }>(
    `SELECT o.oficina, o.pedido_norm as pedido, o.qtd_enviadas as enviadas, o.data_envio as data,
            o.produto, ${observacaoExpr()}
     FROM fato_oficinas o
     LEFT JOIN fato_corte_pedido p ON p.pedido_norm = o.pedido_norm
     WHERE ${where} AND o.qtd_enviadas > 0 AND o.qtd_retornadas = 0 AND o.qtd_pendentes = 0
     ORDER BY o.qtd_enviadas DESC LIMIT 20`,
    params,
  )
  const pendentesAging = runAll<{
    oficina: string
    pedido: string | null
    pendentes: number
    data: string
    prometida: string | null
    diasParado: number | null
    produto: string | null
  }>(
    `SELECT o.oficina, o.pedido_norm as pedido, ${sqlPendentesOficina('o')} as pendentes, o.data_envio as data,
            o.data_prometida as prometida,
            CAST(julianday('now', 'localtime') - julianday(o.data_envio) AS INTEGER) as diasParado,
            o.produto
     FROM fato_oficinas o
     WHERE ${where} AND ${sqlPendentesOficina('o')} > 0
     ORDER BY diasParado DESC, pendentes DESC
     LIMIT 40`,
    params,
  )
  const porMes = runAll<{ mes: number; enviadas: number; pendentes: number }>(
    `SELECT CAST(substr(o.data_envio, 6, 2) as INTEGER) as mes,
            COALESCE(SUM(o.qtd_enviadas), 0) as enviadas,
            COALESCE(SUM(${sqlPendentesOficina('o')}), 0) as pendentes
     FROM fato_oficinas o WHERE ${where} GROUP BY mes ORDER BY mes`,
    params,
  )

  const hasComercial = hasPedidoComercialTable()
  const remessaPorPedido = hasComercial
    ? runAll<{
        nome: string
        pedidoNorm: string
        cliente: string | null
        valorRemessa: number
        canal: string | null
      }>(
        `SELECT o.oficina as nome,
                r.pedido_norm as pedidoNorm,
                r.cliente,
                r.canal,
                r.valorRemessa
         FROM (
           SELECT p.pedido_norm,
                  MAX(p.cliente) as cliente,
                  MAX(p.canal) as canal,
                  SUM(p.valor_faturado) as valorRemessa
           FROM fato_pedido_comercial p
           WHERE CAST(substr(COALESCE(p.data_venda, p.data_cadastro), 1, 4) as INTEGER) = @anoComercial
             AND ${sqlRemessaIndust('p')}
           GROUP BY p.pedido_norm
         ) r
         JOIN fato_oficinas o ON o.pedido_norm = r.pedido_norm
         WHERE ${where}
         GROUP BY o.oficina, r.pedido_norm`,
        { ...params, anoComercial: YEAR },
      )
    : []

  const remessaMap = new Map<
    string,
    { remessas: number; valorRemessa: number; clienteSignus: string | null }
  >()
  for (const row of remessaPorPedido) {
    const current = remessaMap.get(row.nome) ?? {
      remessas: 0,
      valorRemessa: 0,
      clienteSignus: null as string | null,
    }
    current.remessas += 1
    current.valorRemessa += row.valorRemessa
    current.clienteSignus = current.clienteSignus ?? row.cliente
    remessaMap.set(row.nome, current)
  }

  const ranking = rankingBase.map((row) => {
    const rem = remessaMap.get(row.nome)
    return {
      ...row,
      remessas: rem?.remessas ?? 0,
      valorRemessa: rem?.valorRemessa ?? 0,
      clienteSignus: rem?.clienteSignus ?? null,
    }
  })

  const remessasPedidos = remessaPorPedido.length
  const valorRemessa = remessaPorPedido.reduce(
    (sum, row) => sum + row.valorRemessa,
    0,
  )
  const oficinasComRemessa = remessaMap.size

  const remessasDetalhe = hasComercial
    ? runAll<{
        oficina: string
        pedido: string
        cliente: string | null
        canal: string | null
        valor: number
        tipo: string | null
        data: string | null
        enviadas: number
        retornadas: number
        pendentes: number
      }>(
        `SELECT o.oficina,
                r.pedido_norm as pedido,
                r.cliente,
                r.canal,
                r.valor,
                r.tipo,
                r.data,
                COALESCE(SUM(o.qtd_enviadas), 0) as enviadas,
                COALESCE(SUM(o.qtd_retornadas), 0) as retornadas,
                COALESCE(SUM(${sqlPendentesOficina('o')}), 0) as pendentes
         FROM (
           SELECT p.pedido_norm,
                  MAX(p.cliente) as cliente,
                  MAX(p.canal) as canal,
                  SUM(p.valor_faturado) as valor,
                  MAX(p.tipo_comercializacao) as tipo,
                  MAX(COALESCE(p.data_venda, p.data_cadastro)) as data
           FROM fato_pedido_comercial p
           WHERE CAST(substr(COALESCE(p.data_venda, p.data_cadastro), 1, 4) as INTEGER) = @anoComercial
             AND ${sqlRemessaIndust('p')}
           GROUP BY p.pedido_norm
         ) r
         JOIN fato_oficinas o ON o.pedido_norm = r.pedido_norm
         WHERE ${where}
         GROUP BY o.oficina, r.pedido_norm
         ORDER BY r.valor DESC
         LIMIT 40`,
        { ...params, anoComercial: YEAR },
      )
    : []

  return {
    ranking,
    sla,
    enviadas,
    retornadas,
    pendentes,
    defeitos,
    semRetorno,
    pendentesAging,
    porMes,
    remessasPedidos,
    valorRemessa,
    oficinasComRemessa,
    remessasDetalhe,
    comercialLoaded: hasComercial,
  }
})

export const getTempoProducao = cache(async (filters: DashFilters = {}) => {
  await ensureCloudDatabase()
  const filter = emptyFilter()
  applyPedidoFilters(filter, 'p', { ...filters, mes: undefined }, {
    canal: true,
    cliente: true,
    responsavel: true,
    pedido: true,
  })
  const where = whereSql(filter)
  const pedidos = runAll<TempoPedidoRow>(
    `SELECT p.pedido_norm as pedidoNorm,
            p.pecas,
            p.canal,
            p.cliente,
            p.responsavel,
            p.status_vigente as statusVigente,
            p.data,
            p.pcp_prontas as pcpProntas,
            p.inicio_corte as inicioCorte,
            p.final_corte as finalCorte,
            ${observacaoExpr()},
            (SELECT l.tecido FROM fato_corte_linha l
             WHERE l.pedido_norm = p.pedido_norm AND l.is_header = 1
             ORDER BY l.excel_row LIMIT 1) as tecido,
            (SELECT l.cod_tecido FROM fato_corte_linha l
             WHERE l.pedido_norm = p.pedido_norm AND l.is_header = 1
             ORDER BY l.excel_row LIMIT 1) as codTecido,
            MIN(r.data_producao) as dataRevisaoPrimeira,
            MAX(r.data_producao) as dataRevisaoUltima,
            COALESCE(SUM(r.qtd_pecas), 0) as pecasRevisao
     FROM fato_corte_pedido p
     LEFT JOIN fato_revisao r ON r.pedido_norm = p.pedido_norm
     WHERE ${where}
     GROUP BY p.pedido_norm`,
    filter.params,
  )
  return analyzeTempoProducao(pedidos, {
    mes: filters.mes,
    hoje: todayIso(),
  })
})

export type AcaoMesRow = {
  mes: number
  cortadas: number
  aproveitadas: number
}

export type AcaoProdutoRow = {
  codigo: string
  descricao: string
  modelo: string
  entrada: number
  saida: number
  saldo: number
}

/** Separa código e descrição quando vêm grudados (ex.: "1107…_TECIDO…" ou "1107… - TECIDO…"). */
function resolveAcaoCodigoDescricao(
  codProduto: string | null,
  tecido: string | null,
): { codigo: string; descricao: string } {
  const fromCod = splitCodigoDescricao(codProduto)
  const fromTec = splitCodigoDescricao(tecido)

  if (fromCod.cod && fromCod.nome) {
    return {
      codigo: fromCod.cod,
      descricao: fromTec.nome ?? fromCod.nome,
    }
  }
  if (fromTec.cod && fromTec.nome) {
    return {
      codigo: fromCod.cod ?? fromTec.cod,
      descricao: fromTec.nome,
    }
  }
  return {
    codigo: fromCod.cod ?? fromTec.cod ?? '—',
    descricao: fromTec.nome ?? fromCod.nome ?? '(sem descrição)',
  }
}

export const getAcaoComercial = cache(async (filters: DashFilters = {}) => {
  await ensureCloudDatabase()
  const empty = {
    loaded: false,
    pecasCortadas: 0,
    pecasAproveitadas: 0,
    saldo: 0,
    pctAproveitamento: 0,
    porMes: [] as AcaoMesRow[],
    produtos: [] as AcaoProdutoRow[],
  }
  if (!hasAproveitamentoTable()) return empty

  const filter = emptyFilter()
  if (filters.mes) {
    filter.clauses.push(`CAST(substr(a.data, 6, 2) as INTEGER) = @mes`)
    filter.params.mes = filters.mes
  }
  if (filters.q) {
    filter.clauses.push(
      `(COALESCE(a.pedido, '') LIKE @q OR COALESCE(a.cliente, '') LIKE @q OR COALESCE(a.modelo, '') LIKE @q OR COALESCE(a.cod_produto, '') LIKE @q OR COALESCE(a.tecido, '') LIKE @q)`,
    )
    filter.params.q = likeContains(filters.q)
  }
  const where = whereSql(filter)
  const { params } = filter

  const totais = runGet<{ cortadas: number; aproveitadas: number }>(
    `SELECT
        COALESCE(SUM(CASE WHEN a.tipo = 'entrada' THEN a.qtd ELSE 0 END), 0) as cortadas,
        COALESCE(SUM(CASE WHEN a.tipo = 'saida' THEN a.qtd ELSE 0 END), 0) as aproveitadas
     FROM fato_aproveitamento a
     WHERE ${where}`,
    params,
  )
  const pecasCortadas = totais.cortadas
  const pecasAproveitadas = totais.aproveitadas
  const saldo = pecasCortadas - pecasAproveitadas
  const pctAproveitamento = pecasCortadas > 0 ? (pecasAproveitadas / pecasCortadas) * 100 : 0

  const mesRows = runAll<{ mes: number; cortadas: number; aproveitadas: number }>(
    `SELECT CAST(substr(a.data, 6, 2) as INTEGER) as mes,
            COALESCE(SUM(CASE WHEN a.tipo = 'entrada' THEN a.qtd ELSE 0 END), 0) as cortadas,
            COALESCE(SUM(CASE WHEN a.tipo = 'saida' THEN a.qtd ELSE 0 END), 0) as aproveitadas
     FROM fato_aproveitamento a
     WHERE ${where} AND a.data IS NOT NULL
     GROUP BY mes
     ORDER BY mes`,
    params,
  )
  const porMes: AcaoMesRow[] = mesRows.filter((row) => row.mes >= 1 && row.mes <= 12)

  const rawProdutos = runAll<{
    codProduto: string | null
    tecido: string | null
    modelo: string | null
    entrada: number
    saida: number
  }>(
    `SELECT
        a.cod_produto as codProduto,
        a.tecido,
        a.modelo,
        COALESCE(SUM(CASE WHEN a.tipo = 'entrada' THEN a.qtd ELSE 0 END), 0) as entrada,
        COALESCE(SUM(CASE WHEN a.tipo = 'saida' THEN a.qtd ELSE 0 END), 0) as saida
     FROM fato_aproveitamento a
     GROUP BY a.cod_produto, a.tecido, a.modelo`,
    {},
  )

  const byKey = new Map<string, AcaoProdutoRow>()
  for (const row of rawProdutos) {
    const { codigo, descricao } = resolveAcaoCodigoDescricao(
      row.codProduto,
      row.tecido,
    )
    const modelo = row.modelo?.replace(/\s+/g, ' ').trim() || '—'
    const key = `${codigo}||${descricao}||${modelo}`
    const current = byKey.get(key) ?? {
      codigo,
      descricao,
      modelo,
      entrada: 0,
      saida: 0,
      saldo: 0,
    }
    current.entrada += row.entrada
    current.saida += row.saida
    current.saldo = current.entrada - current.saida
    byKey.set(key, current)
  }

  const produtos = [...byKey.values()].sort(
    (a, b) =>
      b.saldo - a.saldo ||
      a.codigo.localeCompare(b.codigo, 'pt-BR') ||
      a.descricao.localeCompare(b.descricao, 'pt-BR') ||
      a.modelo.localeCompare(b.modelo, 'pt-BR'),
  )

  return {
    loaded: true,
    pecasCortadas,
    pecasAproveitadas,
    saldo,
    pctAproveitamento,
    porMes,
    produtos,
  }
})

function hasPedidoComercialTable() {
  return Boolean(
    sqlite()
      .prepare(
        `SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = 'fato_pedido_comercial'`,
      )
      .get(),
  )
}

function hasPedidoItemTable() {
  return Boolean(
    sqlite()
      .prepare(
        `SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = 'fato_pedido_item'`,
      )
      .get(),
  )
}

/** Venda final no Signus (exclui remessa p/ industrialização e similares). */
function sqlVendaFinal(alias: string) {
  const t = `upper(COALESCE(${alias}.tipo_comercializacao, ''))`
  const c = `upper(COALESCE(${alias}.cliente, ''))`
  return `(${t} LIKE '%VENDA%' AND ${t} NOT LIKE '%INDUST%' AND ${c} NOT LIKE 'OFICINA%')`
}

/** Remessa p/ industrialização — típico de oficina no Pedidos.xlsx. */
function sqlRemessaIndust(alias: string) {
  const t = `upper(COALESCE(${alias}.tipo_comercializacao, ''))`
  const c = `upper(COALESCE(${alias}.cliente, ''))`
  return `(${t} LIKE '%REM P/ INDUST%' OR ${t} LIKE '%INDUSTRIALIZA%' OR ${c} LIKE 'OFICINA%')`
}

function applyComercialFilters(
  filter: SqlFilter,
  alias: string,
  filters: DashFilters,
  opts: { vendaFinal?: boolean } = {},
) {
  filter.clauses.push(`CAST(substr(COALESCE(${alias}.data_venda, ${alias}.data_cadastro), 1, 4) as INTEGER) = @ano`)
  filter.params.ano = YEAR
  if (opts.vendaFinal) {
    filter.clauses.push(sqlVendaFinal(alias))
  }
  if (filters.mes) {
    filter.clauses.push(
      `CAST(substr(COALESCE(${alias}.data_venda, ${alias}.data_cadastro), 6, 2) as INTEGER) = @mes`,
    )
    filter.params.mes = filters.mes
  }
  if (filters.canal) {
    filter.clauses.push(`${alias}.canal = @canal`)
    filter.params.canal = filters.canal
  }
  if (filters.cliente) {
    filter.clauses.push(`${alias}.cliente = @cliente`)
    filter.params.cliente = filters.cliente
  }
  if (filters.q) {
    filter.clauses.push(
      `(${alias}.pedido_norm LIKE @q OR COALESCE(${alias}.cliente, '') LIKE @q OR COALESCE(${alias}.razao_social, '') LIKE @q)`,
    )
    filter.params.q = likeContains(filters.q)
  }
}

/** Pedidos comerciais 1:1 por pedido_norm — evita multiplicar metros no join com Signus. */
function sqlPedidoComercialDistinto(where: string) {
  return `SELECT p.pedido_norm as pedido_norm,
                 MAX(p.cliente) as cliente,
                 MAX(p.canal) as canal
          FROM fato_pedido_comercial p
          WHERE ${where}
          GROUP BY p.pedido_norm`
}

/**
 * Pedidos atribuíveis aos clientes do recorte comercial:
 * venda do filtro + produção (dim/corte) do mesmo cliente.
 * A baixa Signus costuma ir no OC de produção, não no pedido de faturamento.
 */
function sqlPedidoClienteAtributo(comercialWhere: string) {
  const cli = (alias: string) =>
    `COALESCE(NULLIF(trim(${alias}.cliente), ''), '(sem cliente)')`
  const clientesRecorte = `
    SELECT DISTINCT ${cli('p')} as cliente
    FROM fato_pedido_comercial p
    WHERE ${comercialWhere}`

  return `SELECT pedido_norm,
                 MAX(cliente) as cliente,
                 MAX(canal) as canal
          FROM (
            SELECT ped.pedido_norm as pedido_norm,
                   ped.cliente as cliente,
                   ped.canal as canal
            FROM (${sqlPedidoComercialDistinto(comercialWhere)}) ped
            UNION ALL
            SELECT d.pedido_norm,
                   ${cli('d')} as cliente,
                   d.canal as canal
            FROM dim_pedido d
            WHERE NULLIF(trim(d.cliente), '') IS NOT NULL
              AND ${cli('d')} IN (${clientesRecorte})
            UNION ALL
            SELECT c.pedido_norm,
                   ${cli('c')} as cliente,
                   c.canal as canal
            FROM fato_corte_pedido c
            WHERE NULLIF(trim(c.cliente), '') IS NOT NULL
              AND ${cli('c')} IN (${clientesRecorte})
          )
          GROUP BY pedido_norm`
}

/** Baixa Signus em pedido de venda ou de produção do cliente do recorte. */
function sqlExistsPedidoClienteAtributo(
  signusAlias: string,
  comercialWhere: string,
) {
  return `EXISTS (
    SELECT 1 FROM (${sqlPedidoClienteAtributo(comercialWhere)}) ped
    WHERE ped.pedido_norm = ${signusAlias}.pedido_norm
  )`
}

export type TopClienteRow = {
  cliente: string
  codCliente: string | null
  pedidos: number
  valorTotal: number
  valorFaturado: number
  ticketMedio: number
  metros: number
  tecidos: number
  pedidosComTecido: number
  /** Pedidos no canal TERCEIROS (unidade 9-7 / faturamento externo). */
  pedidosTerceiros: number
  /** Faturado sem baixa Signus — produto de terceiros (sem tecido nosso). */
  produtoTerceiros: boolean
  topTecido: string | null
  topTecidoNome: string | null
  topTecidoMetros: number
}

export type TopClienteTecidoRow = {
  cod: string
  nome: string | null
  metros: number
  pedidos: number
  movimentos: number
  clientes: number
  saldoAtual: number
}

export type TopClienteMesRow = {
  mes: number
  pedidos: number
  valor: number
  metros: number
}

/** Previsão de compra por tecido, estudando baixas dos meses anteriores. */
export type TopClientePrevisaoTecidoRow = {
  cod: string
  nome: string | null
  metrosHistorico: number
  mesesComConsumo: number
  mediaMensal: number
  mediaRecente: number
  previsaoProximoMes: number
  saldoAtual: number
  aComprar: number
  tendenciaPct: number | null
}

export type TopClienteProdutoRow = {
  cod: string
  nome: string | null
  categoria: string | null
  qtd: number
  valor: number
  pedidos: number
}

function mesCalendarioNoAno() {
  const now = new Date()
  if (now.getFullYear() === YEAR) return now.getMonth() + 1
  if (now.getFullYear() > YEAR) return 12
  return 0
}

/** Média dos últimos N meses com consumo; se faltar histórico, cai na média geral. */
function mediaRecenteDeMeses(
  porMes: Map<number, number>,
  ateMes: number,
  janela = 3,
) {
  const recent: number[] = []
  for (let m = ateMes; m >= 1 && recent.length < janela; m--) {
    const v = porMes.get(m) ?? 0
    if (v > 0) recent.push(v)
  }
  if (!recent.length) return 0
  return recent.reduce((sum, v) => sum + v, 0) / recent.length
}

/** Média dos últimos N meses de calendário (inclui zeros). */
function mediaCalendarioUltimosMeses(
  porMes: Map<number, number>,
  ateMes: number,
  janela = 3,
) {
  if (ateMes < 1) return 0
  const inicio = Math.max(1, ateMes - janela + 1)
  let sum = 0
  let n = 0
  for (let m = inicio; m <= ateMes; m++) {
    sum += porMes.get(m) ?? 0
    n += 1
  }
  return n ? sum / n : 0
}

export const getTopClientes = cache(async (filters: DashFilters = {}) => {
  await ensureCloudDatabase()
  const empty = {
    loaded: false as const,
    clientesAtivos: 0,
    pedidos: 0,
    valorTotal: 0,
    valorFaturado: 0,
    ticketMedio: 0,
    metrosSignus: 0,
    pedidosComTecido: 0,
    coberturaTecidoPct: 0,
    concentracaoTop5Pct: 0,
    previsaoValorAno: 0,
    previsaoMetrosAno: 0,
    previsaoProximoMesMetros: 0,
    previsaoCompraProximoMes: 0,
    mediaMensalValor: 0,
    mediaMensalMetros: 0,
    mesesComVenda: 0,
    mesReferencia: 0,
    ranking: [] as TopClienteRow[],
    tecidos: [] as TopClienteTecidoRow[],
    previsaoTecidos: [] as TopClientePrevisaoTecidoRow[],
    porMes: [] as TopClienteMesRow[],
    porMesHistorico: [] as TopClienteMesRow[],
    porMesPrevisao: [] as (number | null)[],
    porCanal: [] as { nome: string; pedidos: number; valor: number; metros: number }[],
    produtos: [] as TopClienteProdutoRow[],
    options: {
      meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      canais: [] as string[],
      clientes: [] as string[],
      responsaveis: [] as string[],
      produtos: [] as string[],
      oficinas: [] as string[],
      categorias: [] as string[],
    } satisfies FilterOptions,
  }

  if (!hasPedidoComercialTable()) return empty

  const filter = emptyFilter()
  applyComercialFilters(filter, 'p', filters, { vendaFinal: true })
  const where = whereSql(filter)
  const { params } = filter

  const hasSignus = Boolean(
    sqlite()
      .prepare(
        `SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = 'fato_tecido_signus'`,
      )
      .get(),
  )
  const hasEstoque = Boolean(
    sqlite()
      .prepare(
        `SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = 'fato_tecido_estoque'`,
      )
      .get(),
  )
  const almoxSql = sqlAlmoxPrincipais('s')
  const categoriaSqlSignus = sqlCategoriaFilter('s', filters.categoria)
  const categoriaSql = categoriaSqlSignus ?? '1=1'
  const categoriaSqlEstoque = sqlCategoriaFilter('e', filters.categoria) ?? '1=1'
  if (filters.categoria) {
    params.categoria = filters.categoria
  }

  const resumo = runGet<{
    clientes: number
    pedidos: number
    valorTotal: number
    valorFaturado: number
  }>(
    `SELECT COUNT(DISTINCT p.cliente) as clientes,
            COUNT(*) as pedidos,
            COALESCE(SUM(p.valor_total), 0) as valorTotal,
            COALESCE(SUM(p.valor_faturado), 0) as valorFaturado
     FROM fato_pedido_comercial p
     WHERE ${where}`,
    params,
  )

  // "CONSUMIDOR FINAL" costuma ser placeholder/erro de cadastro — fora do ranking.
  const rankingWhere = `${where} AND UPPER(TRIM(COALESCE(p.cliente, ''))) != 'CONSUMIDOR FINAL'`

  const ranking = runAll<{
    cliente: string
    codCliente: string | null
    pedidos: number
    pedidosTerceiros: number
    valorTotal: number
    valorFaturado: number
  }>(
    `SELECT COALESCE(NULLIF(trim(p.cliente), ''), '(sem cliente)') as cliente,
            MAX(NULLIF(trim(p.parceiro_codigo), '')) as codCliente,
            COUNT(*) as pedidos,
            SUM(CASE WHEN p.canal = 'TERCEIROS' THEN 1 ELSE 0 END) as pedidosTerceiros,
            COALESCE(SUM(p.valor_total), 0) as valorTotal,
            COALESCE(SUM(p.valor_faturado), 0) as valorFaturado
     FROM fato_pedido_comercial p
     WHERE ${rankingWhere}
     GROUP BY COALESCE(NULLIF(trim(p.cliente), ''), '(sem cliente)')
     ORDER BY valorFaturado DESC, pedidos DESC
     LIMIT 40`,
    params,
  )

  const tecidoPorCliente = hasSignus
    ? runAll<{
        cliente: string
        metros: number
        tecidos: number
        pedidosComTecido: number
      }>(
        `SELECT COALESCE(NULLIF(trim(ped.cliente), ''), '(sem cliente)') as cliente,
                COALESCE(SUM(s.metros), 0) as metros,
                COUNT(DISTINCT s.cod_produto) as tecidos,
                COUNT(DISTINCT s.pedido_norm) as pedidosComTecido
         FROM fato_tecido_signus s
         JOIN (${sqlPedidoClienteAtributo(rankingWhere)}) ped
           ON ped.pedido_norm = s.pedido_norm
         WHERE s.is_baixa = 1 AND ${almoxSql} AND ${categoriaSql}
         GROUP BY COALESCE(NULLIF(trim(ped.cliente), ''), '(sem cliente)')`,
        params,
      )
    : []

  const topTecidoPorClienteRaw = hasSignus
    ? runAll<{
        cliente: string
        cod: string
        nome: string | null
        metros: number
      }>(
        `SELECT COALESCE(NULLIF(trim(ped.cliente), ''), '(sem cliente)') as cliente,
                s.cod_produto as cod,
                MAX(s.nome_produto) as nome,
                COALESCE(SUM(s.metros), 0) as metros
         FROM fato_tecido_signus s
         JOIN (${sqlPedidoClienteAtributo(rankingWhere)}) ped
           ON ped.pedido_norm = s.pedido_norm
         WHERE s.is_baixa = 1 AND ${almoxSql} AND ${categoriaSql}
         GROUP BY COALESCE(NULLIF(trim(ped.cliente), ''), '(sem cliente)'), s.cod_produto
         ORDER BY metros DESC`,
        params,
      )
    : []

  const topTecidoMap = new Map<
    string,
    { cod: string; nome: string | null; metros: number }
  >()
  for (const row of topTecidoPorClienteRaw) {
    if (!topTecidoMap.has(row.cliente)) {
      topTecidoMap.set(row.cliente, {
        cod: row.cod,
        nome: row.nome,
        metros: row.metros,
      })
    }
  }

  const tecidoMap = new Map(
    tecidoPorCliente.map((row) => [row.cliente, row]),
  )

  const rankingFull: TopClienteRow[] = ranking.map((row) => {
    const tecido = tecidoMap.get(row.cliente)
    const top = topTecidoMap.get(row.cliente)
    const metros = tecido?.metros ?? 0
    const topTecido = top?.cod ?? null
    const pedidosTerceiros = row.pedidosTerceiros ?? 0
    // Faturado sem baixa Signus = produto de terceiros (não há tecido nosso).
    const produtoTerceiros =
      metros === 0 &&
      !topTecido &&
      (pedidosTerceiros > 0 || row.valorFaturado > 0)
    return {
      cliente: row.cliente,
      codCliente: row.codCliente,
      pedidos: row.pedidos,
      valorTotal: row.valorTotal,
      valorFaturado: row.valorFaturado,
      ticketMedio: row.pedidos ? row.valorFaturado / row.pedidos : 0,
      metros,
      tecidos: tecido?.tecidos ?? 0,
      pedidosComTecido: tecido?.pedidosComTecido ?? 0,
      pedidosTerceiros,
      produtoTerceiros,
      topTecido,
      topTecidoNome: top?.nome ?? null,
      topTecidoMetros: top?.metros ?? 0,
    }
  })

  const estoqueSelect = hasEstoque
    ? `COALESCE((
         SELECT e.saldo_atual FROM fato_tecido_estoque e
         WHERE replace(trim(e.cod_produto), ' ', '') = replace(trim(s.cod_produto), ' ', '')
           AND ${categoriaSqlEstoque}
         LIMIT 1
       ), 0)`
    : '0'

  const tecidos = hasSignus
    ? runAll<TopClienteTecidoRow>(
        `SELECT s.cod_produto as cod,
                MAX(s.nome_produto) as nome,
                COALESCE(SUM(s.metros), 0) as metros,
                COUNT(DISTINCT s.pedido_norm) as pedidos,
                COUNT(*) as movimentos,
                COUNT(DISTINCT ped.cliente) as clientes,
                ${estoqueSelect} as saldoAtual
         FROM fato_tecido_signus s
         JOIN (${sqlPedidoClienteAtributo(where)}) ped
           ON ped.pedido_norm = s.pedido_norm
         WHERE s.is_baixa = 1 AND ${almoxSql} AND ${categoriaSql}
         GROUP BY s.cod_produto
         ORDER BY metros DESC
         LIMIT 25`,
        params,
      )
    : []

  const porMesBase = runAll<{
    mes: number
    pedidos: number
    valor: number
    pedidoNorm: string
  }>(
    `SELECT CAST(substr(COALESCE(p.data_venda, p.data_cadastro), 6, 2) as INTEGER) as mes,
            p.pedido_norm as pedidoNorm,
            p.valor_faturado as valor,
            1 as pedidos
     FROM fato_pedido_comercial p
     WHERE ${where} AND COALESCE(p.data_venda, p.data_cadastro) IS NOT NULL`,
    params,
  )

  const metrosPorPedido = hasSignus
    ? new Map(
        runAll<{ pedidoNorm: string; metros: number }>(
          `SELECT s.pedido_norm as pedidoNorm, COALESCE(SUM(s.metros), 0) as metros
           FROM fato_tecido_signus s
           WHERE s.is_baixa = 1 AND ${almoxSql} AND ${categoriaSql}
             AND ${sqlExistsPedidoClienteAtributo('s', where)}
           GROUP BY s.pedido_norm`,
          params,
        ).map((row) => [row.pedidoNorm, row.metros]),
      )
    : new Map<string, number>()

  const mesAgg = new Map<number, TopClienteMesRow>()
  const metrosPedidosVistos = new Set<string>()
  for (const row of porMesBase) {
    if (row.mes < 1 || row.mes > 12) continue
    const current = mesAgg.get(row.mes) ?? {
      mes: row.mes,
      pedidos: 0,
      valor: 0,
      metros: 0,
    }
    current.pedidos += 1
    current.valor += row.valor
    // Metros no gráfico comercial: 1× por pedido (não por linha duplicada).
    if (!metrosPedidosVistos.has(row.pedidoNorm)) {
      metrosPedidosVistos.add(row.pedidoNorm)
      current.metros += metrosPorPedido.get(row.pedidoNorm) ?? 0
    }
    mesAgg.set(row.mes, current)
  }
  const porMes = [...mesAgg.values()].sort((a, b) => a.mes - b.mes)

  const porCanal = runAll<{
    nome: string
    pedidos: number
    valor: number
  }>(
    `SELECT COALESCE(p.canal, '(sem canal)') as nome,
            COUNT(*) as pedidos,
            COALESCE(SUM(p.valor_faturado), 0) as valor
     FROM fato_pedido_comercial p
     WHERE ${where}
     GROUP BY p.canal
     ORDER BY valor DESC, pedidos DESC`,
    params,
  ).map((row) => ({
    ...row,
    metros: 0,
  }))

  if (hasSignus) {
    const metrosCanal = runAll<{ nome: string; metros: number }>(
      `SELECT COALESCE(ped.canal, '(sem canal)') as nome,
              COALESCE(SUM(s.metros), 0) as metros
       FROM fato_tecido_signus s
       JOIN (${sqlPedidoClienteAtributo(where)}) ped
         ON ped.pedido_norm = s.pedido_norm
       WHERE s.is_baixa = 1 AND ${almoxSql} AND ${categoriaSql}
       GROUP BY ped.canal`,
      params,
    )
    const canalMap = new Map(metrosCanal.map((row) => [row.nome, row.metros]))
    for (const row of porCanal) {
      row.metros = canalMap.get(row.nome) ?? 0
    }
  }

  const metrosSignus = hasSignus
    ? runGet<{ v: number }>(
        `SELECT COALESCE(SUM(s.metros), 0) as v
         FROM fato_tecido_signus s
         WHERE s.is_baixa = 1 AND ${almoxSql} AND ${categoriaSql}
           AND ${sqlExistsPedidoClienteAtributo('s', where)}`,
        params,
      ).v
    : 0

  const pedidosComTecido = hasSignus
    ? runGet<{ v: number }>(
        `SELECT COUNT(DISTINCT s.pedido_norm) as v
         FROM fato_tecido_signus s
         WHERE s.is_baixa = 1 AND ${almoxSql} AND ${categoriaSql}
           AND ${sqlExistsPedidoClienteAtributo('s', where)}`,
        params,
      ).v
    : 0

  const top5Pedidos = rankingFull
    .slice(0, 5)
    .reduce((sum, row) => sum + row.pedidos, 0)
  const concentracaoTop5Pct = resumo.pedidos
    ? (top5Pedidos / resumo.pedidos) * 100
    : 0

  const mesesComVenda = porMes.filter((row) => row.pedidos > 0).length
  const mediaMensalValor = mesesComVenda
    ? resumo.valorFaturado / mesesComVenda
    : 0
  const mediaMensalMetros = mesesComVenda ? metrosSignus / mesesComVenda : 0
  const previsaoValorAno = mediaMensalValor * 12
  const previsaoMetrosAno = mediaMensalMetros * 12

  // Histórico sem filtro de mês: a previsão estuda os meses anteriores mesmo
  // quando a tela está recortada num mês específico.
  const histFilter = emptyFilter()
  applyComercialFilters(
    histFilter,
    'p',
    { ...filters, mes: undefined },
    { vendaFinal: true },
  )
  const histWhere = whereSql(histFilter)
  const histParams = { ...histFilter.params }
  if (filters.categoria) {
    histParams.categoria = filters.categoria
  }
  const mesRef = mesCalendarioNoAno()
  const mesEstudo = mesRef > 0 ? mesRef : 12

  const porMesHistoricoBase = runAll<{
    mes: number
    pedidos: number
    valor: number
    pedidoNorm: string
  }>(
    `SELECT CAST(substr(COALESCE(p.data_venda, p.data_cadastro), 6, 2) as INTEGER) as mes,
            p.pedido_norm as pedidoNorm,
            p.valor_faturado as valor,
            1 as pedidos
     FROM fato_pedido_comercial p
     WHERE ${histWhere} AND COALESCE(p.data_venda, p.data_cadastro) IS NOT NULL`,
    histParams,
  )

  const histMesAgg = new Map<number, TopClienteMesRow>()
  for (let m = 1; m <= 12; m++) {
    histMesAgg.set(m, { mes: m, pedidos: 0, valor: 0, metros: 0 })
  }
  for (const row of porMesHistoricoBase) {
    if (row.mes < 1 || row.mes > 12) continue
    const current = histMesAgg.get(row.mes)!
    current.pedidos += 1
    current.valor += row.valor
  }

  // Metros do histórico/previsão: mês = data do movimento Signus (como Tecidos).
  if (hasSignus) {
    for (const row of runAll<{ mes: number; metros: number }>(
      `SELECT CAST(substr(s.data, 6, 2) as INTEGER) as mes,
              COALESCE(SUM(s.metros), 0) as metros
       FROM fato_tecido_signus s
       WHERE s.is_baixa = 1 AND ${almoxSql} AND ${categoriaSql}
         AND s.data IS NOT NULL
         AND ${sqlExistsPedidoClienteAtributo('s', histWhere)}
       GROUP BY CAST(substr(s.data, 6, 2) as INTEGER)`,
      histParams,
    )) {
      if (row.mes < 1 || row.mes > 12) continue
      histMesAgg.get(row.mes)!.metros = row.metros
    }
  }
  const porMesHistorico = [...histMesAgg.values()]

  const metrosPorMesHist = new Map(
    porMesHistorico.map((row) => [row.mes, row.metros]),
  )
  const mesesComMetros = porMesHistorico.filter(
    (row) => row.mes < mesEstudo && row.metros > 0,
  )
  const mediaMetrosEstudo = mesesComMetros.length
    ? mesesComMetros.reduce((sum, row) => sum + row.metros, 0) /
      mesesComMetros.length
    : mediaMensalMetros
  const previsaoProximoMesMetros =
    mediaRecenteDeMeses(metrosPorMesHist, mesEstudo - 1) || mediaMetrosEstudo

  // Previsão só no mês atual em diante — não repetir o histórico nos meses fechados.
  const porMesPrevisao = Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1
    if (mes < mesEstudo) return null
    return previsaoProximoMesMetros
  })

  const tecidoMesRows = hasSignus
    ? runAll<{
        mes: number
        cod: string
        nome: string | null
        metros: number
        pedidos: number
      }>(
        `SELECT CAST(substr(s.data, 6, 2) as INTEGER) as mes,
                s.cod_produto as cod,
                MAX(s.nome_produto) as nome,
                COALESCE(SUM(s.metros), 0) as metros,
                COUNT(DISTINCT s.pedido_norm) as pedidos
         FROM fato_tecido_signus s
         WHERE s.is_baixa = 1 AND ${almoxSql} AND ${categoriaSql}
           AND s.data IS NOT NULL
           AND ${sqlExistsPedidoClienteAtributo('s', histWhere)}
         GROUP BY CAST(substr(s.data, 6, 2) as INTEGER),
                  s.cod_produto`,
        histParams,
      )
    : []

  type TecidoHist = {
    cod: string
    nome: string | null
    porMes: Map<number, number>
    pedidosPorMes: Map<number, number>
    metrosHistorico: number
    pedidosHistorico: number
  }
  const tecidoHistMap = new Map<string, TecidoHist>()
  for (const row of tecidoMesRows) {
    if (row.mes < 1 || row.mes > 12) continue
    const current = tecidoHistMap.get(row.cod) ?? {
      cod: row.cod,
      nome: row.nome,
      porMes: new Map<number, number>(),
      pedidosPorMes: new Map<number, number>(),
      metrosHistorico: 0,
      pedidosHistorico: 0,
    }
    current.nome = current.nome || row.nome
    current.porMes.set(row.mes, (current.porMes.get(row.mes) ?? 0) + row.metros)
    current.pedidosPorMes.set(
      row.mes,
      (current.pedidosPorMes.get(row.mes) ?? 0) + row.pedidos,
    )
    if (row.mes < mesEstudo) {
      current.metrosHistorico += row.metros
      current.pedidosHistorico += row.pedidos
    }
    tecidoHistMap.set(row.cod, current)
  }

  const estoquePorCod = new Map<string, number>()
  if (hasEstoque) {
    for (const row of runAll<{ cod: string; saldo: number }>(
      `SELECT trim(cod_produto) as cod, COALESCE(saldo_atual, 0) as saldo
       FROM fato_tecido_estoque e
       WHERE ${categoriaSqlEstoque}`,
      filters.categoria ? { categoria: filters.categoria } : {},
    )) {
      estoquePorCod.set(row.cod.replace(/\s+/g, ''), row.saldo)
    }
  }

  const mesesNoPeriodo = Math.max(0, mesEstudo - 1)
  const previsaoTecidos: TopClientePrevisaoTecidoRow[] = [...tecidoHistMap.values()]
    .map((item) => {
      const mesesAnt = [...item.porMes.entries()].filter(
        ([mes, metros]) => mes < mesEstudo && metros > 0,
      )
      const mesesComConsumo = mesesAnt.length
      // Média do período inteiro (jan → mês anterior), incluindo meses sem baixa.
      const mediaMensal =
        mesesNoPeriodo > 0 ? item.metrosHistorico / mesesNoPeriodo : 0
      const mediaRecente =
        mediaRecenteDeMeses(item.porMes, mesEstudo - 1) || mediaMensal
      // Previsão = (metros ÷ pedidos) × ritmo médio de pedidos dos últimos 3 meses.
      const metrosPorPedido =
        item.pedidosHistorico > 0
          ? item.metrosHistorico / item.pedidosHistorico
          : 0
      const pedidosMesPrevistos = mediaCalendarioUltimosMeses(
        item.pedidosPorMes,
        mesEstudo - 1,
      )
      const previsaoProximoMes =
        metrosPorPedido > 0
          ? metrosPorPedido * pedidosMesPrevistos
          : mediaMensal
      const saldoAtual =
        estoquePorCod.get(item.cod.replace(/\s+/g, '')) ?? 0
      const aComprar = Math.max(0, previsaoProximoMes - Math.max(0, saldoAtual))
      const tendenciaPct =
        mediaMensal > 0
          ? ((mediaRecente - mediaMensal) / mediaMensal) * 100
          : null
      return {
        cod: item.cod,
        nome: item.nome,
        metrosHistorico: item.metrosHistorico,
        mesesComConsumo,
        mediaMensal,
        mediaRecente,
        previsaoProximoMes,
        saldoAtual,
        aComprar,
        tendenciaPct,
      }
    })
    .filter((row) => row.previsaoProximoMes > 0 || row.metrosHistorico > 0)
    .sort(
      (a, b) =>
        b.mediaMensal - a.mediaMensal ||
        b.previsaoProximoMes - a.previsaoProximoMes ||
        b.aComprar - a.aComprar,
    )
    .slice(0, 25)

  const previsaoCompraProximoMes = previsaoTecidos.reduce(
    (sum, row) => sum + row.aComprar,
    0,
  )

  const options: FilterOptions = {
    meses: porMes.map((row) => row.mes),
    canais: (
      runAll<{ canal: string }>(
        `SELECT DISTINCT canal FROM fato_pedido_comercial p
         WHERE ${sqlVendaFinal('p')}
           AND canal IS NOT NULL AND trim(canal) != ''
         ORDER BY canal`,
        {},
      )
    ).map((row) => row.canal),
    clientes: rankingFull.slice(0, 80).map((row) => row.cliente),
    responsaveis: [],
    produtos: [],
    oficinas: [],
    categorias: (
      runAll<{ categoria: string }>(
        `SELECT categoria FROM (
           SELECT s.categoria as categoria FROM fato_tecido_signus s
           WHERE s.categoria IS NOT NULL AND trim(s.categoria) != ''
           UNION
           SELECT e.categoria as categoria FROM fato_tecido_estoque e
           WHERE e.categoria IS NOT NULL AND trim(e.categoria) != ''
         )
         ORDER BY categoria`,
        {},
      )
    ).map((row) => row.categoria),
  }
  if (!options.meses.length) {
    options.meses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  }

  let produtos: TopClienteProdutoRow[] = []
  if (filters.cliente && hasPedidoItemTable()) {
    const filtersSemCliente = { ...filters, cliente: undefined }
    const itemFilter = emptyFilter()
    applyComercialFilters(itemFilter, 'i', filtersSemCliente, { vendaFinal: true })
    const codCliente =
      rankingFull.find((row) => row.cliente === filters.cliente)?.codCliente ??
      null
    itemFilter.params.cliente = filters.cliente
    if (codCliente) {
      itemFilter.clauses.push(
        `(i.cliente = @cliente OR trim(COALESCE(i.parceiro_codigo, '')) = @codParceiro)`,
      )
      itemFilter.params.codParceiro = codCliente
    } else {
      itemFilter.clauses.push(`i.cliente = @cliente`)
    }
    itemFilter.clauses.push(
      `upper(COALESCE(i.categoria_produto, '')) LIKE '%PRODUTO%ACABAD%'`,
    )
    const itemWhere = whereSql(itemFilter)

    produtos = runAll<{
      cod: string
      nome: string | null
      categoria: string | null
      qtd: number
      valor: number
      pedidos: number
    }>(
      `SELECT i.cod_produto as cod,
              MAX(i.nome_produto) as nome,
              MAX(i.categoria_produto) as categoria,
              COALESCE(SUM(CASE WHEN i.qtd_faturada > 0 THEN i.qtd_faturada ELSE i.qtd_pedida END), 0) as qtd,
              COALESCE(SUM(CASE WHEN i.valor_liquido > 0 THEN i.valor_liquido ELSE i.valor_bruto END), 0) as valor,
              COUNT(DISTINCT i.pedido_norm) as pedidos
       FROM fato_pedido_item i
       WHERE ${itemWhere}
       GROUP BY i.cod_produto
       ORDER BY valor DESC, qtd DESC
       LIMIT 80`,
      itemFilter.params,
    )
  }

  return {
    loaded: true as const,
    clientesAtivos: resumo.clientes,
    pedidos: resumo.pedidos,
    valorTotal: resumo.valorTotal,
    valorFaturado: resumo.valorFaturado,
    ticketMedio: resumo.pedidos ? resumo.valorFaturado / resumo.pedidos : 0,
    metrosSignus,
    pedidosComTecido,
    coberturaTecidoPct: resumo.pedidos
      ? (pedidosComTecido / resumo.pedidos) * 100
      : 0,
    concentracaoTop5Pct,
    previsaoValorAno,
    previsaoMetrosAno,
    previsaoProximoMesMetros,
    previsaoCompraProximoMes,
    mediaMensalValor,
    mediaMensalMetros,
    mesesComVenda,
    mesReferencia: mesEstudo,
    ranking: rankingFull,
    tecidos,
    previsaoTecidos,
    porMes,
    porMesHistorico,
    porMesPrevisao,
    porCanal,
    produtos,
    options,
  }
})

export { isProducaoOrigem }
