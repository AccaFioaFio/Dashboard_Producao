import { getSqlite } from '@/db'
import type { DashFilters, FilterOptions } from '@/lib/filters'
import { calcularProjecao } from '@/lib/projecao-venda'
import { YEAR } from '@/lib/year'

export type VendaRepresentanteRow = {
  representante: string
  posicao: number
  faturado: number
  pedidos: number
  clientes: number
  participacaoPct: number
  diferencaReais: number | null
  diferencaPp: number | null
  participacaoFechadaPct: number
  realizadoMesAberto: number
  projecaoMesAberto: number | null
  projecaoProximoMes: number | null
  ritmoIndividual: number | null
  projecaoProximoMesIndividual: number | null
  projecaoIndividualUsaRitmoEmpresa: boolean
}

export type VendasRepresentanteData = {
  loaded: boolean
  mesAberto: number
  mesProximo: number | null
  mesesFechados: number
  ritmoGeral: number | null
  faturado: number
  representantesComVenda: number
  ranking: VendaRepresentanteRow[]
  projecaoProximoMes: number
  projecaoMesAberto: number
  realizadoMesAberto: number
  options: FilterOptions
}

const SEM_REPRESENTANTE = '(sem representante)'

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

type MesRow = { rep: string; ano: number; mes: number; fat: number }
type RankRow = { rep: string; fat: number; pedidos: number; clientes: number }

export function getVendasPorRepresentante(filters: DashFilters): VendasRepresentanteData {
  const sqlite = getSqlite()
  const mesAberto = mesCalendarioNoAno()
  const mesesFechados = Math.max(0, mesAberto - 1)
  const mesProximo = mesAberto >= 1 && mesAberto < 12 ? mesAberto + 1 : null
  const emptyOptions: FilterOptions = {
    meses: [],
    canais: [],
    clientes: [],
    responsaveis: [],
    produtos: [],
    oficinas: [],
  }
  const empty: VendasRepresentanteData = {
    loaded: false,
    mesAberto,
    mesProximo,
    mesesFechados,
    ritmoGeral: null,
    faturado: 0,
    representantesComVenda: 0,
    ranking: [],
    projecaoProximoMes: 0,
    projecaoMesAberto: 0,
    realizadoMesAberto: 0,
    options: emptyOptions,
  }

  const hasPedidos = sqlite
    .prepare(
      `SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = 'fato_pedido_comercial'`,
    )
    .get()
  if (!hasPedidos) return empty

  const venda = sqlVendaFinal('p')
  const anoExpr = `CAST(substr(COALESCE(p.data_venda, p.data_cadastro), 1, 4) as INTEGER)`
  const mesExpr = `CAST(substr(COALESCE(p.data_venda, p.data_cadastro), 6, 2) as INTEGER)`
  const repExpr = `COALESCE(NULLIF(trim(p.vendedor), ''), '${SEM_REPRESENTANTE}')`
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
  if (!loaded) return empty

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
      `SELECT ${repExpr} as rep,
              ${anoExpr} as ano,
              ${mesExpr} as mes,
              COALESCE(SUM(p.valor_faturado), 0) as fat
       FROM fato_pedido_comercial p
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
      `SELECT ${repExpr} as rep,
              COALESCE(SUM(p.valor_faturado), 0) as fat,
              COUNT(*) as pedidos,
              COUNT(DISTINCT NULLIF(trim(p.cliente), '')) as clientes
       FROM fato_pedido_comercial p
       WHERE ${venda} AND ${anoExpr} = @ano ${canalSql} ${mesSql}
       GROUP BY 1`,
    )
    .all(rankParams) as RankRow[]

  const byRep = new Map(ranks.map((row) => [row.rep, row]))
  const reps = new Set<string>([...serie.map((row) => row.rep), ...ranks.map((row) => row.rep)])

  const total = ranks.reduce((sum, row) => sum + row.fat, 0)
  const sorted = [...reps]
    .map((rep) => byRep.get(rep) ?? { rep, fat: 0, pedidos: 0, clientes: 0 })
    .filter((row) => row.fat > 0)
    .sort((a, b) => b.fat - a.fat || a.rep.localeCompare(b.rep))

  const projecao = calcularProjecao({
    serie: serie.map((row) => ({
      chave: row.rep,
      ano: row.ano,
      mes: row.mes,
      fat: row.fat,
    })),
    chaves: sorted.map((row) => row.rep),
    ano: YEAR,
    mesesFechados,
    mesAberto,
    mesProximo,
  })

  const ranking: VendaRepresentanteRow[] = sorted.map((row, index) => {
    const previous = index > 0 ? sorted[index - 1] : null
    const linha = projecao.porChave.get(row.rep)
    const share = total > 0 ? (row.fat / total) * 100 : 0
    const prevShare = previous && total > 0 ? (previous.fat / total) * 100 : null
    return {
      representante: row.rep,
      posicao: index + 1,
      faturado: row.fat,
      pedidos: row.pedidos,
      clientes: row.clientes,
      participacaoPct: share,
      diferencaReais: previous ? previous.fat - row.fat : null,
      diferencaPp: prevShare == null ? null : prevShare - share,
      participacaoFechadaPct: linha?.participacaoFechadaPct ?? 0,
      realizadoMesAberto: linha?.realizadoMesAberto ?? 0,
      projecaoMesAberto: linha?.projecaoMesAberto ?? null,
      projecaoProximoMes: linha?.projecaoProximoMes ?? null,
      ritmoIndividual: linha?.ritmoIndividual ?? null,
      projecaoProximoMesIndividual: linha?.projecaoProximoMesIndividual ?? null,
      projecaoIndividualUsaRitmoEmpresa: linha?.projecaoIndividualUsaRitmoEmpresa ?? false,
    }
  })

  return {
    loaded: true,
    mesAberto,
    mesProximo,
    mesesFechados,
    ritmoGeral: projecao.ritmoGeral,
    faturado: total,
    representantesComVenda: ranking.length,
    ranking,
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
