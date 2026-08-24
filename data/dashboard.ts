import 'server-only'

import { cache } from 'react'
import { getSqlite } from '@/db'
import type { DashFilters, FilterOptions } from '@/lib/filters'
import { isProducaoOrigem } from '@/lib/keys'
import { YEAR } from '@/lib/paths'
import type { FunilKpis, HeaderKpis, SerieMensal } from '@/lib/etl/types'

export type CargaInfo = {
  id: number
  lidaEm: string
  cortePath: string
  oficinasPath: string
  signusPath: string | null
  corteLastWrite: string | null
  oficinasLastWrite: string | null
  signusLastWrite: string | null
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
}

export type QualidadeRow = {
  tipo: string
  pedidoNorm: string | null
  detalhe: string | null
  excelRow: number | null
  valor: number | null
  count: number
}

function sqlite() {
  return getSqlite()
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

export const getFilterOptions = cache(async (): Promise<FilterOptions> => {
  const db = sqlite()
  const mesesRows = db
    .prepare(
      `SELECT DISTINCT CAST(substr(data, 6, 2) as INTEGER) as mes
       FROM (
         SELECT data FROM fato_corte_pedido
         UNION SELECT data_producao FROM fato_costura
         UNION SELECT data_producao FROM fato_revisao
         UNION SELECT data_envio FROM fato_oficinas
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
  }
})

export const getLatestCarga = cache(async (): Promise<CargaInfo | null> => {
  const row = sqlite()
    .prepare(
      `SELECT id, lida_em as lidaEm, corte_path as cortePath, oficinas_path as oficinasPath,
              signus_path as signusPath,
              corte_last_write as corteLastWrite, oficinas_last_write as oficinasLastWrite,
              signus_last_write as signusLastWrite,
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
      .prepare("SELECT COUNT(*) as v FROM fato_corte_pedido WHERE status_vigente = 'EM PRODUÇÃO'")
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
        "SELECT COUNT(DISTINCT pedido_norm) as v FROM fato_corte_linha WHERE status = 'AGUARDANDO TECIDO'",
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
    db.prepare('SELECT COALESCE(SUM(qtd_pendentes), 0) as v FROM fato_oficinas').get() as { v: number }
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
    `SELECT p.pedido_norm as pedidoNorm, p.data, p.status_vigente as statusVigente, p.pecas, p.canal, p.cliente, p.responsavel
     FROM fato_corte_pedido p WHERE ${where} AND p.status_vigente = 'EM PRODUÇÃO' ORDER BY p.pecas DESC`,
    params,
  )
  const tecido = runAll<TecidoPendenteRow>(
    `SELECT l.pedido_norm as pedidoNorm, MAX(p.data) as data, MAX(p.cliente) as cliente,
            l.status as statusVigente,
            COALESCE(SUM(l.qtd_pecas), 0) as pecas,
            COALESCE(SUM(l.metros), 0) as metros,
            MAX(l.tecido) as tecido,
            MAX(l.cod_tecido) as codTecido
     FROM fato_corte_linha l
     LEFT JOIN fato_corte_pedido p ON p.pedido_norm = l.pedido_norm
     WHERE ${where} AND l.status = 'AGUARDANDO TECIDO'
     GROUP BY l.pedido_norm, l.status, COALESCE(l.cod_tecido, l.tecido)
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
  const resumo = runGet<{ pecas: number; pedidos: number; wipPedidos: number; wipPecas: number }>(
    `SELECT COALESCE(SUM(p.pecas), 0) as pecas,
            COUNT(*) as pedidos,
            COALESCE(SUM(CASE WHEN p.status_vigente = 'EM PRODUÇÃO' THEN 1 ELSE 0 END), 0) as wipPedidos,
            COALESCE(SUM(CASE WHEN p.status_vigente = 'EM PRODUÇÃO' THEN p.pecas ELSE 0 END), 0) as wipPecas
     FROM fato_corte_pedido p WHERE ${where}`,
    params,
  )
  const ocs = runGet<{ v: number }>(
    `SELECT COUNT(*) as v
     FROM fato_corte_linha l
     LEFT JOIN fato_corte_pedido p ON p.pedido_norm = l.pedido_norm
     WHERE ${where} AND l.is_header = 1`,
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
    resumo: { ...resumo, ocs: ocs.v },
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

export type TecidoCruzadoRow = {
  cod: string
  nome: string | null
  corteMetros: number
  signusMetros: number
  cortePedidos: number
  signusPedidos: number
}

export const getTecidos = cache(async (filters: DashFilters = {}) => {
  const db = sqlite()
  const pendingFilter = emptyFilter()
  applyPedidoFilters(pendingFilter, 'p', filters, {
    date: 'data',
    canal: true,
    cliente: true,
    pedido: true,
  })
  const pendingWhere = whereSql(pendingFilter)
  const hasSignus = Boolean(
    db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fato_tecido_signus'`,
      )
      .get(),
  )
  const metrosCorte = (
    db
      .prepare('SELECT COALESCE(SUM(metros), 0) as v FROM fato_corte_pedido')
      .get() as { v: number }
  ).v
  const metrosEconomia = (
    db
      .prepare('SELECT COALESCE(SUM(economia), 0) as v FROM fato_corte_pedido')
      .get() as { v: number }
  ).v
  const metrosSignus = hasSignus
    ? (
        db
          .prepare(
            'SELECT COALESCE(SUM(metros), 0) as v FROM fato_tecido_signus WHERE is_baixa = 1',
          )
          .get() as { v: number }
      ).v
    : 0
  const movimentosBaixa = hasSignus
    ? (
        db
          .prepare('SELECT COUNT(*) as v FROM fato_tecido_signus WHERE is_baixa = 1')
          .get() as { v: number }
      ).v
    : 0
  const pedidosComBaixa = hasSignus
    ? (
        db
          .prepare(
            `SELECT COUNT(DISTINCT pedido_norm) as v FROM fato_tecido_signus
             WHERE is_baixa = 1 AND pedido_norm IS NOT NULL`,
          )
          .get() as { v: number }
      ).v
    : 0
  const baixasSemPedido = hasSignus
    ? (
        db
          .prepare(
            `SELECT COUNT(*) as v FROM fato_tecido_signus
             WHERE is_baixa = 1 AND (pedido_norm IS NULL OR trim(pedido_norm) = '')`,
          )
          .get() as { v: number }
      ).v
    : 0
  const retornoCorte = hasSignus
    ? (
        db
          .prepare(
            `SELECT COALESCE(SUM(metros), 0) as v FROM fato_tecido_signus
             WHERE tipo_norm = 'retorno_corte'`,
          )
          .get() as { v: number }
      ).v
    : 0

  const corteMes = db
    .prepare(
      `SELECT CAST(substr(data, 6, 2) as INTEGER) as mes, COALESCE(SUM(metros), 0) as metros
       FROM fato_corte_linha WHERE data IS NOT NULL GROUP BY mes`,
    )
    .all() as { mes: number; metros: number }[]
  const signusMes = hasSignus
    ? (db
        .prepare(
          `SELECT CAST(substr(data, 6, 2) as INTEGER) as mes, COALESCE(SUM(metros), 0) as metros
           FROM fato_tecido_signus WHERE is_baixa = 1 GROUP BY mes`,
        )
        .all() as { mes: number; metros: number }[])
    : []

  const months: TecidoMesRow[] = Array.from({ length: 12 }, (_, index) => ({
    mes: index + 1,
    corte: 0,
    signus: 0,
  }))
  for (const row of corteMes) months[row.mes - 1].corte = row.metros
  for (const row of signusMes) months[row.mes - 1].signus = row.metros
  const porMes = months.filter((row) => row.corte || row.signus)

  const porTecido = db
    .prepare(
      hasSignus
        ? `SELECT COALESCE(NULLIF(trim(l.cod_tecido), ''), '(sem código)') as cod,
              MAX(l.tecido) as nome,
              COALESCE(SUM(l.metros), 0) as metros,
              COALESCE(SUM(l.economia), 0) as economia,
              COUNT(DISTINCT l.pedido_norm) as pedidos,
              COALESCE((
                SELECT SUM(s.metros) FROM fato_tecido_signus s
                WHERE s.is_baixa = 1
                  AND replace(trim(s.cod_produto), ' ', '') = replace(trim(COALESCE(l.cod_tecido, '')), ' ', '')
              ), 0) as signusMetros
       FROM fato_corte_linha l
       WHERE l.tecido IS NOT NULL AND trim(l.tecido) != ''
       GROUP BY COALESCE(NULLIF(trim(l.cod_tecido), ''), trim(l.tecido))
       ORDER BY metros DESC
       LIMIT 15`
        : `SELECT COALESCE(NULLIF(trim(cod_tecido), ''), '(sem código)') as cod,
              MAX(tecido) as nome,
              COALESCE(SUM(metros), 0) as metros,
              COALESCE(SUM(economia), 0) as economia,
              COUNT(DISTINCT pedido_norm) as pedidos,
              0 as signusMetros
       FROM fato_corte_linha
       WHERE tecido IS NOT NULL AND trim(tecido) != ''
       GROUP BY COALESCE(NULLIF(trim(cod_tecido), ''), trim(tecido))
       ORDER BY metros DESC
       LIMIT 15`,
    )
    .all() as (TecidoUsoRow & { signusMetros: number })[]

  const porTipo = hasSignus
    ? (db
        .prepare(
          `SELECT tipo_norm as tipoNorm, COUNT(*) as movimentos,
              COALESCE(SUM(metros), 0) as metros,
              COUNT(DISTINCT pedido_norm) as pedidos
       FROM fato_tecido_signus
       GROUP BY tipo_norm
       ORDER BY metros DESC`,
        )
        .all() as TecidoTipoRow[])
    : []

  const cruzados = db
    .prepare(
      hasSignus
        ? `SELECT COALESCE(NULLIF(trim(l.cod_tecido), ''), '(sem código)') as cod,
              MAX(l.tecido) as nome,
              COALESCE(SUM(l.metros), 0) as corteMetros,
              COUNT(DISTINCT l.pedido_norm) as cortePedidos,
              COALESCE((
                SELECT SUM(s.metros) FROM fato_tecido_signus s
                WHERE s.is_baixa = 1
                  AND replace(trim(s.cod_produto), ' ', '') = replace(trim(COALESCE(l.cod_tecido, '')), ' ', '')
              ), 0) as signusMetros,
              COALESCE((
                SELECT COUNT(DISTINCT s.pedido_norm) FROM fato_tecido_signus s
                WHERE s.is_baixa = 1
                  AND replace(trim(s.cod_produto), ' ', '') = replace(trim(COALESCE(l.cod_tecido, '')), ' ', '')
              ), 0) as signusPedidos
       FROM fato_corte_linha l
       WHERE l.tecido IS NOT NULL AND trim(l.tecido) != ''
       GROUP BY COALESCE(NULLIF(trim(l.cod_tecido), ''), trim(l.tecido))
       ORDER BY corteMetros DESC
       LIMIT 20`
        : `SELECT COALESCE(NULLIF(trim(cod_tecido), ''), '(sem código)') as cod,
              MAX(tecido) as nome,
              COALESCE(SUM(metros), 0) as corteMetros,
              COUNT(DISTINCT pedido_norm) as cortePedidos,
              0 as signusMetros,
              0 as signusPedidos
       FROM fato_corte_linha
       WHERE tecido IS NOT NULL AND trim(tecido) != ''
       GROUP BY COALESCE(NULLIF(trim(cod_tecido), ''), trim(tecido))
       ORDER BY corteMetros DESC
       LIMIT 20`,
    )
    .all() as TecidoCruzadoRow[]

  const signusSemCorte = hasSignus
    ? (db
        .prepare(
          `SELECT s.cod_produto as cod, MAX(s.nome_produto) as nome,
              COALESCE(SUM(s.metros), 0) as signusMetros,
              COUNT(DISTINCT s.pedido_norm) as signusPedidos
       FROM fato_tecido_signus s
       WHERE s.is_baixa = 1
         AND NOT EXISTS (
           SELECT 1 FROM fato_corte_linha l
           WHERE replace(trim(l.cod_tecido), ' ', '') = replace(trim(s.cod_produto), ' ', '')
         )
       GROUP BY s.cod_produto
       ORDER BY signusMetros DESC
       LIMIT 12`,
        )
        .all() as {
        cod: string
        nome: string | null
        signusMetros: number
        signusPedidos: number
      }[])
    : []

  const tecido = runAll<TecidoPendenteRow>(
    `SELECT l.pedido_norm as pedidoNorm, MAX(p.data) as data, MAX(p.cliente) as cliente,
            l.status as statusVigente,
            COALESCE(SUM(l.qtd_pecas), 0) as pecas,
            COALESCE(SUM(l.metros), 0) as metros,
            MAX(l.tecido) as tecido,
            MAX(l.cod_tecido) as codTecido
     FROM fato_corte_linha l
     LEFT JOIN fato_corte_pedido p ON p.pedido_norm = l.pedido_norm
     WHERE ${pendingWhere} AND l.status = 'AGUARDANDO TECIDO'
     GROUP BY l.pedido_norm, l.status, COALESCE(l.cod_tecido, l.tecido)
     ORDER BY metros DESC`,
    pendingFilter.params,
  )

  const porCanalSignus = hasSignus
    ? (db
        .prepare(
          `SELECT COALESCE(canal_norm, '(sem canal)') as nome,
              COALESCE(SUM(metros), 0) as metros,
              COUNT(*) as movimentos
       FROM fato_tecido_signus
       WHERE is_baixa = 1
       GROUP BY canal_norm
       ORDER BY metros DESC`,
        )
        .all() as { nome: string; metros: number; movimentos: number }[])
    : []

  return {
    metrosCorte,
    metrosEconomia,
    metrosSignus,
    movimentosBaixa,
    pedidosComBaixa,
    baixasSemPedido,
    retornoCorte,
    porMes,
    porTecido,
    porTipo,
    cruzados,
    signusSemCorte,
    tecido,
    porCanalSignus,
  }
})

function todayIso() {
  const db = sqlite()
  return (db.prepare(`SELECT date('now', 'localtime') as v`).get() as { v: string }).v
}

export const getCosturas = cache(async (filters: DashFilters = {}) => {
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
    `SELECT COALESCE(c.responsavel, '(sem)') as nome, COALESCE(SUM(c.qtd_pecas), 0) as pecas, COUNT(*) as pedidos
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
  }>(
    `SELECT c.pedido_norm as pedido, c.qtd_pecas as pecas, c.responsavel, c.produto, c.origem
     FROM fato_costura c
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
    `SELECT COALESCE(r.responsavel, '(sem)') as nome, COALESCE(SUM(r.qtd_pecas), 0) as pecas, COUNT(*) as pedidos
     FROM fato_revisao r WHERE ${where} GROUP BY r.responsavel ORDER BY pecas DESC`,
    params,
  )
  const hoje = todayIso()
  const doDia = runAll<{
    pedido: string
    pecas: number
    responsavel: string | null
    produto: string | null
  }>(
    `SELECT r.pedido_norm as pedido, r.qtd_pecas as pecas, r.responsavel, r.produto
     FROM fato_revisao r WHERE ${where} AND r.data_producao = @hoje ORDER BY r.excel_row DESC`,
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
  const filter = emptyFilter()
  applyPedidoFilters(filter, 'o', filters, {
    date: 'data_envio',
    oficina: true,
    pedido: true,
  })
  const where = whereSql(filter)
  const { params } = filter
  const ranking = runAll<{
    nome: string
    pecas: number
    pedidos: number
    enviadas: number
    retornadas: number
    defeitos: number
    valor: number
  }>(
    `SELECT o.oficina as nome, COALESCE(SUM(o.qtd_pendentes), 0) as pecas,
            COUNT(*) as pedidos, COALESCE(SUM(o.qtd_enviadas), 0) as enviadas,
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
       SUM(CASE WHEN o.qtd_pendentes > 0 THEN 1 ELSE 0 END) as abertos,
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
    `SELECT COALESCE(SUM(o.qtd_pendentes), 0) as v FROM fato_oficinas o WHERE ${where}`,
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
  }>(
    `SELECT o.oficina, o.pedido_norm as pedido, o.qtd_enviadas as enviadas, o.data_envio as data
     FROM fato_oficinas o
     WHERE ${where} AND o.qtd_enviadas > 0 AND o.qtd_retornadas = 0 AND o.qtd_pendentes = 0
     ORDER BY o.qtd_enviadas DESC LIMIT 20`,
    params,
  )
  const porMes = runAll<{ mes: number; enviadas: number; pendentes: number }>(
    `SELECT CAST(substr(o.data_envio, 6, 2) as INTEGER) as mes,
            COALESCE(SUM(o.qtd_enviadas), 0) as enviadas,
            COALESCE(SUM(o.qtd_pendentes), 0) as pendentes
     FROM fato_oficinas o WHERE ${where} GROUP BY mes ORDER BY mes`,
    params,
  )
  return {
    ranking,
    sla,
    enviadas,
    retornadas,
    pendentes,
    defeitos,
    semRetorno,
    porMes,
  }
})

export const getQualidade = cache(async () => {
  const db = sqlite()
  const resumo = db
    .prepare(
      `SELECT tipo, COUNT(*) as count, COALESCE(SUM(valor), 0) as valor
       FROM qualidade_evento GROUP BY tipo ORDER BY count DESC`,
    )
    .all() as { tipo: string; count: number; valor: number }[]
  const eventos = db
    .prepare(
      `SELECT tipo, pedido_norm as pedidoNorm, detalhe, excel_row as excelRow, valor
       FROM qualidade_evento ORDER BY tipo, excel_row LIMIT 200`,
    )
    .all() as QualidadeRow[]
  return { resumo, eventos }
})

export { isProducaoOrigem }
