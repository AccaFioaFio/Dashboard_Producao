import { getSqlite } from '@/db'
import { sqlAlmoxPrincipais } from '@/lib/almox-principais'
import { CATEGORIA_TECIDO_PADRAO, type DashFilters, type FilterOptions } from '@/lib/filters'
import { calcularProjecao } from '@/lib/projecao-venda'
import { isUfBrasil, ufNome } from '@/lib/uf'
import { YEAR } from '@/lib/year'

export type VendaEstadoCliente = {
  cliente: string
  codCliente: string | null
  pedidos: number
  valorFaturado: number
  ticketMedio: number
  participacaoPct: number
  metros: number
  produtoTerceiros: boolean
  topTecido: string | null
  topTecidoNome: string | null
  topTecidoMetros: number
}

export type VendaEstadoRow = {
  uf: string
  nome: string
  noMapa: boolean
  posicao: number
  faturado: number
  pedidos: number
  parceiros: number
  participacaoPct: number
  diferencaReais: number | null
  diferencaPp: number | null
  participacaoFechadaPct: number
  realizadoMesAberto: number
  projecaoMesAberto: number | null
  projecaoProximoMes: number | null
  clientes: VendaEstadoCliente[]
}

export type VendasEstadoData = {
  loaded: boolean
  parceiros: number
  mesAberto: number
  mesProximo: number | null
  mesesFechados: number
  ritmoGeral: number | null
  faturado: number
  faturadoExterior: number
  faturadoSemUf: number
  estadosComVenda: number
  ranking: VendaEstadoRow[]
  projecaoProximoMes: number
  projecaoMesAberto: number
  realizadoMesAberto: number
  options: FilterOptions
}

function mesCalendarioNoAno() {
  const now = new Date()
  if (now.getFullYear() === YEAR) return now.getMonth() + 1
  if (now.getFullYear() > YEAR) return 12
  return 0
}

function sqlVendaFinal(alias: string) {
  const t = `upper(COALESCE(${alias}.tipo_comercializacao, ''))`
  const c = `upper(COALESCE(${alias}.cliente, ''))`
  return `(${t} LIKE '%VENDA%' AND ${t} NOT LIKE '%INDUST%' AND ${c} NOT LIKE 'OFICINA%')`
}

type MesRow = { uf: string; ano: number; mes: number; fat: number }
type RankRow = { uf: string; fat: number; pedidos: number; parceiros: number }

type ClienteRankRow = {
  uf: string
  cliente: string
  cod: string | null
  pedidos: number
  pedidosTerceiros: number
  fat: number
}

type TecidoClienteRow = { cliente: string; metros: number }
type TopTecidoRow = {
  cliente: string
  cod: string
  nome: string | null
  metros: number
}

function tableExists(sqlite: ReturnType<typeof getSqlite>, name: string) {
  return Boolean(
    sqlite
      .prepare(
        `SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = ?`,
      )
      .get(name),
  )
}

/** Mesma base do Top Clientes, fatiada pela UF do endereço do parceiro. */
function clientesPorUf(
  sqlite: ReturnType<typeof getSqlite>,
  comercialWhere: string,
  params: Record<string, string | number>,
) {
  const rows = sqlite
    .prepare(
      `SELECT COALESCE(NULLIF(pa.uf, ''), 'SU') as uf,
              COALESCE(NULLIF(trim(p.cliente), ''), '(sem cliente)') as cliente,
              MAX(NULLIF(trim(p.parceiro_codigo), '')) as cod,
              COUNT(*) as pedidos,
              SUM(CASE WHEN p.canal = 'TERCEIROS' THEN 1 ELSE 0 END) as pedidosTerceiros,
              COALESCE(SUM(p.valor_faturado), 0) as fat
       FROM fato_pedido_comercial p
       LEFT JOIN fato_parceiro pa ON pa.codigo = trim(p.parceiro_codigo)
       WHERE ${comercialWhere}
       GROUP BY 1, 2`,
    )
    .all(params) as ClienteRankRow[]

  const metros = new Map<string, number>()
  const topTecido = new Map<string, TopTecidoRow>()
  const hasSignus = tableExists(sqlite, 'fato_tecido_signus')
  if (hasSignus && rows.length) {
    const cli = (alias: string) =>
      `COALESCE(NULLIF(trim(${alias}.cliente), ''), '(sem cliente)')`
    const clientesRecorte = `SELECT DISTINCT ${cli('p')} as cliente
         FROM fato_pedido_comercial p
         WHERE ${comercialWhere}`
    const partes = [
      `SELECT p.pedido_norm as pedido_norm, ${cli('p')} as cliente
       FROM fato_pedido_comercial p
       WHERE ${comercialWhere}`,
    ]
    if (tableExists(sqlite, 'dim_pedido')) {
      partes.push(
        `SELECT d.pedido_norm, ${cli('d')} as cliente
         FROM dim_pedido d
         WHERE NULLIF(trim(d.cliente), '') IS NOT NULL
           AND ${cli('d')} IN (${clientesRecorte})`,
      )
    }
    if (tableExists(sqlite, 'fato_corte_pedido')) {
      partes.push(
        `SELECT c.pedido_norm, ${cli('c')} as cliente
         FROM fato_corte_pedido c
         WHERE NULLIF(trim(c.cliente), '') IS NOT NULL
           AND ${cli('c')} IN (${clientesRecorte})`,
      )
    }
    const atributo = `SELECT pedido_norm, MAX(cliente) as cliente
       FROM (${partes.join(' UNION ALL ')})
       GROUP BY pedido_norm`
    const tecidoParams = { ...params, categoria: CATEGORIA_TECIDO_PADRAO }
    const tecidoWhere = `s.is_baixa = 1 AND ${sqlAlmoxPrincipais('s')} AND s.categoria = @categoria`
    for (const row of sqlite
      .prepare(
        `SELECT ped.cliente as cliente, COALESCE(SUM(s.metros), 0) as metros
         FROM fato_tecido_signus s
         JOIN (${atributo}) ped ON ped.pedido_norm = s.pedido_norm
         WHERE ${tecidoWhere}
         GROUP BY ped.cliente`,
      )
      .all(tecidoParams) as TecidoClienteRow[]) {
      metros.set(row.cliente, row.metros)
    }
    for (const row of sqlite
      .prepare(
        `SELECT cliente, cod, nome, metros
         FROM (
           SELECT cliente, cod, nome, metros,
                  ROW_NUMBER() OVER (
                    PARTITION BY cliente
                    ORDER BY metros DESC, cod
                  ) as rn
           FROM (
             SELECT ped.cliente as cliente,
                    s.cod_produto as cod,
                    MAX(s.nome_produto) as nome,
                    COALESCE(SUM(s.metros), 0) as metros
             FROM fato_tecido_signus s
             JOIN (${atributo}) ped ON ped.pedido_norm = s.pedido_norm
             WHERE ${tecidoWhere}
             GROUP BY ped.cliente, s.cod_produto
           )
         )
         WHERE rn = 1`,
      )
      .all(tecidoParams) as TopTecidoRow[]) {
      topTecido.set(row.cliente, row)
    }
  }

  const grouped = new Map<string, VendaEstadoCliente[]>()
  const totalPorUf = new Map<string, number>()
  for (const row of rows) {
    totalPorUf.set(row.uf, (totalPorUf.get(row.uf) ?? 0) + row.fat)
  }
  for (const row of rows) {
    const tecido = metros.get(row.cliente) ?? 0
    const top = topTecido.get(row.cliente)
    const lista = grouped.get(row.uf) ?? []
    const base = totalPorUf.get(row.uf) ?? 0
    lista.push({
      cliente: row.cliente,
      codCliente: row.cod,
      pedidos: row.pedidos,
      valorFaturado: row.fat,
      ticketMedio: row.pedidos ? row.fat / row.pedidos : 0,
      participacaoPct: base > 0 ? (row.fat / base) * 100 : 0,
      metros: tecido,
      produtoTerceiros: tecido === 0 && !top && (row.pedidosTerceiros > 0 || row.fat > 0),
      topTecido: top?.cod ?? null,
      topTecidoNome: top?.nome ?? null,
      topTecidoMetros: top?.metros ?? 0,
    })
    grouped.set(row.uf, lista)
  }
  for (const lista of grouped.values()) {
    lista.sort((a, b) => b.valorFaturado - a.valorFaturado || a.cliente.localeCompare(b.cliente))
  }
  return grouped
}

export function getVendasPorEstado(filters: DashFilters): VendasEstadoData {
  const sqlite = getSqlite()
  const mesAberto = mesCalendarioNoAno()
  const mesesFechados = Math.max(0, mesAberto - 1)
  const mesProximo = mesAberto >= 1 && mesAberto < 12 ? mesAberto + 1 : null
  const empty: VendasEstadoData = {
    loaded: false,
    parceiros: 0,
    mesAberto,
    mesProximo,
    mesesFechados,
    ritmoGeral: null,
    faturado: 0,
    faturadoExterior: 0,
    faturadoSemUf: 0,
    estadosComVenda: 0,
    ranking: [],
    projecaoProximoMes: 0,
    projecaoMesAberto: 0,
    realizadoMesAberto: 0,
    options: { meses: [], canais: [], clientes: [], responsaveis: [], produtos: [], oficinas: [] },
  }

  const hasPedidos = sqlite
    .prepare(
      `SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = 'fato_pedido_comercial'`,
    )
    .get()
  const hasParceiro = sqlite
    .prepare(
      `SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = 'fato_parceiro'`,
    )
    .get()
  if (!hasPedidos || !hasParceiro) return empty

  const parceiros = Number(
    (sqlite.prepare(`SELECT COUNT(*) as n FROM fato_parceiro`).get() as { n: number }).n,
  )
  const venda = sqlVendaFinal('p')
  const anoExpr = `CAST(substr(COALESCE(p.data_venda, p.data_cadastro), 1, 4) as INTEGER)`
  const mesExpr = `CAST(substr(COALESCE(p.data_venda, p.data_cadastro), 6, 2) as INTEGER)`
  const canalSql = filters.canal ? ` AND p.canal = @canal` : ''
  const params: Record<string, string | number> = { ano: YEAR, anoPrev: YEAR - 1 }
  if (filters.canal) params.canal = filters.canal

  const loaded = Boolean(
    sqlite
      .prepare(
        `SELECT 1 as v FROM fato_pedido_comercial p
         WHERE ${venda} AND ${anoExpr} = @ano LIMIT 1`,
      )
      .get({ ano: YEAR }),
  )
  if (!loaded) return { ...empty, parceiros }

  const meses = (
    sqlite
      .prepare(
        `SELECT DISTINCT ${mesExpr} as mes
         FROM fato_pedido_comercial p
         WHERE ${venda} AND ${anoExpr} = @ano AND ${mesExpr} BETWEEN 1 AND 12
         ORDER BY 1`,
      )
      .all({ ano: YEAR }) as { mes: number }[]
  ).map((row) => row.mes)
  const canais = (
    sqlite
      .prepare(
        `SELECT DISTINCT p.canal as canal
         FROM fato_pedido_comercial p
         WHERE ${venda} AND ${anoExpr} = @ano AND p.canal IS NOT NULL AND trim(p.canal) != ''
         ORDER BY 1`,
      )
      .all({ ano: YEAR }) as { canal: string }[]
  ).map((row) => row.canal)

  const serie = sqlite
    .prepare(
      `SELECT COALESCE(NULLIF(pa.uf, ''), 'SU') as uf,
              ${anoExpr} as ano,
              ${mesExpr} as mes,
              COALESCE(SUM(p.valor_faturado), 0) as fat
       FROM fato_pedido_comercial p
       LEFT JOIN fato_parceiro pa ON pa.codigo = trim(p.parceiro_codigo)
       WHERE ${venda} AND ${anoExpr} IN (@anoPrev, @ano)
         AND COALESCE(p.data_venda, p.data_cadastro) IS NOT NULL
         ${canalSql}
       GROUP BY 1, 2, 3`,
    )
    .all(params) as MesRow[]

  const mesSql = filters.mes ? ` AND ${mesExpr} = @mes` : ''
  const rankParams = { ...params }
  if (filters.mes) rankParams.mes = filters.mes
  const ranks = sqlite
    .prepare(
      `SELECT COALESCE(NULLIF(pa.uf, ''), 'SU') as uf,
              COALESCE(SUM(p.valor_faturado), 0) as fat,
              COUNT(*) as pedidos,
              COUNT(DISTINCT trim(p.parceiro_codigo)) as parceiros
       FROM fato_pedido_comercial p
       LEFT JOIN fato_parceiro pa ON pa.codigo = trim(p.parceiro_codigo)
       WHERE ${venda} AND ${anoExpr} = @ano ${canalSql} ${mesSql}
       GROUP BY 1`,
    )
    .all(rankParams) as RankRow[]

  const semConsumidor =
    `AND UPPER(TRIM(COALESCE(p.cliente, ''))) != 'CONSUMIDOR FINAL'`
  const clientesDaUf = clientesPorUf(
    sqlite,
    `${venda} AND ${anoExpr} = @ano ${canalSql} ${mesSql} ${semConsumidor}`,
    rankParams,
  )

  const byUf = new Map(ranks.map((row) => [row.uf, row]))
  const ufs = new Set<string>([...serie.map((row) => row.uf), ...ranks.map((row) => row.uf)])

  const total = ranks.reduce((sum, row) => sum + row.fat, 0)
  const sorted = [...ufs]
    .map((uf) => byUf.get(uf) ?? { uf, fat: 0, pedidos: 0, parceiros: 0 })
    .filter((row) => row.fat > 0 || isUfBrasil(row.uf))
    .sort((a, b) => b.fat - a.fat || a.uf.localeCompare(b.uf))

  const projecao = calcularProjecao({
    serie: serie.map((row) => ({
      chave: row.uf,
      ano: row.ano,
      mes: row.mes,
      fat: row.fat,
    })),
    chaves: sorted.map((row) => row.uf),
    ano: YEAR,
    mesesFechados,
    mesAberto,
    mesProximo,
  })

  const ranking: VendaEstadoRow[] = sorted.map((row, index) => {
    const previous = index > 0 ? sorted[index - 1] : null
    const linha = projecao.porChave.get(row.uf)
    const share = total > 0 ? (row.fat / total) * 100 : 0
    const prevShare = previous && total > 0 ? (previous.fat / total) * 100 : null
    return {
      uf: row.uf,
      nome: ufNome(row.uf),
      noMapa: isUfBrasil(row.uf),
      posicao: index + 1,
      faturado: row.fat,
      pedidos: row.pedidos,
      parceiros: row.parceiros,
      participacaoPct: share,
      diferencaReais: previous ? previous.fat - row.fat : null,
      diferencaPp: prevShare == null ? null : prevShare - share,
      participacaoFechadaPct: linha?.participacaoFechadaPct ?? 0,
      realizadoMesAberto: linha?.realizadoMesAberto ?? 0,
      projecaoMesAberto: linha?.projecaoMesAberto ?? null,
      projecaoProximoMes: linha?.projecaoProximoMes ?? null,
      clientes: clientesDaUf.get(row.uf) ?? [],
    }
  })

  return {
    loaded: true,
    parceiros,
    mesAberto,
    mesProximo,
    mesesFechados,
    ritmoGeral: projecao.ritmoGeral,
    faturado: total,
    faturadoExterior: byUf.get('EX')?.fat ?? 0,
    faturadoSemUf: byUf.get('SU')?.fat ?? 0,
    estadosComVenda: ranking.filter((row) => row.noMapa && row.faturado > 0).length,
    ranking: ranking.filter((row) => row.faturado > 0),
    projecaoProximoMes: projecao.projecaoProximoMes,
    projecaoMesAberto: projecao.projecaoMesAberto,
    realizadoMesAberto: projecao.realizadoMesAberto,
    options: {
      meses,
      canais,
      clientes: [],
      responsaveis: [],
      produtos: [],
      oficinas: [],
    },
  }
}
