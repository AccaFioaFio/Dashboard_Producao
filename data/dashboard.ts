import 'server-only'

import { cache } from 'react'
import { getSqlite } from '@/db'
import { isProducaoOrigem } from '@/lib/keys'
import { YEAR } from '@/lib/paths'
import type { FunilKpis, HeaderKpis, SerieMensal } from '@/lib/etl/types'

export type CargaInfo = {
  id: number
  lidaEm: string
  cortePath: string
  oficinasPath: string
  corteLastWrite: string | null
  oficinasLastWrite: string | null
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

export const getLatestCarga = cache(async (): Promise<CargaInfo | null> => {
  const row = sqlite()
    .prepare(
      `SELECT id, lida_em as lidaEm, corte_path as cortePath, oficinas_path as oficinasPath,
              corte_last_write as corteLastWrite, oficinas_last_write as oficinasLastWrite,
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
      .prepare("SELECT COUNT(*) as v FROM fato_corte_pedido WHERE status_vigente = 'AGUARDANDO TECIDO'")
      .get() as { v: number }
  ).v
  const tecidoPecas = (
    db
      .prepare("SELECT COALESCE(SUM(qtd_pecas), 0) as v FROM fato_corte_linha WHERE status = 'AGUARDANDO TECIDO'")
      .get() as { v: number }
  ).v
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
    pecasCosturaProd,
    pecasRevisao,
    wipPedidos,
    wipPecas,
    tecidoPedidos,
    tecidoPecas,
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

export const getCorteBreakdown = cache(async (filters: { mes?: number; canal?: string }) => {
  const db = sqlite()
  const clauses = ['1=1']
  const params: Record<string, unknown> = {}
  if (filters.mes) {
    clauses.push("CAST(substr(p.data, 6, 2) as INTEGER) = @mes")
    params.mes = filters.mes
  }
  if (filters.canal) {
    clauses.push('p.canal = @canal')
    params.canal = filters.canal
  }
  const where = clauses.join(' AND ')

  const porMes = db
    .prepare(
      `SELECT CAST(substr(data, 6, 2) as INTEGER) as nome, COALESCE(SUM(pecas), 0) as pecas, COUNT(*) as pedidos
       FROM fato_corte_pedido WHERE data IS NOT NULL GROUP BY nome ORDER BY nome`,
    )
    .all() as { nome: number; pecas: number; pedidos: number }[]
  const porCanal = db
    .prepare(
      `SELECT COALESCE(canal, '(sem canal)') as nome, COALESCE(SUM(pecas), 0) as pecas, COUNT(*) as pedidos
       FROM fato_corte_pedido GROUP BY canal ORDER BY pecas DESC`,
    )
    .all() as NamedTotal[]
  const porResponsavel = db
    .prepare(
      `SELECT COALESCE(responsavel, '(sem responsável)') as nome, COALESCE(SUM(pecas), 0) as pecas, COUNT(*) as pedidos
       FROM fato_corte_pedido GROUP BY responsavel ORDER BY pecas DESC`,
    )
    .all() as NamedTotal[]
  const porCliente = db
    .prepare(
      `SELECT COALESCE(cliente, '(sem cliente)') as nome, COALESCE(SUM(pecas), 0) as pecas, COUNT(*) as pedidos
       FROM fato_corte_pedido GROUP BY cliente ORDER BY pecas DESC LIMIT 12`,
    )
    .all() as NamedTotal[]

  const wip = db
    .prepare(
      `SELECT pedido_norm as pedidoNorm, data, status_vigente as statusVigente, pecas, canal, cliente, responsavel
       FROM fato_corte_pedido WHERE status_vigente = 'EM PRODUÇÃO' ORDER BY pecas DESC`,
    )
    .all() as CortePedidoRow[]
  const tecido = db
    .prepare(
      `SELECT pedido_norm as pedidoNorm, data, status_vigente as statusVigente, pecas, canal, cliente, responsavel
       FROM fato_corte_pedido WHERE status_vigente = 'AGUARDANDO TECIDO' ORDER BY pecas DESC`,
    )
    .all() as CortePedidoRow[]

  const canais = db
    .prepare(
      `SELECT canal FROM dim_canal ORDER BY canal`,
    )
    .all() as { canal: string }[]

  void where
  void params

  return { porMes, porCanal, porResponsavel, porCliente, wip, tecido, canais: canais.map((row) => row.canal) }
})

function todayIso() {
  const db = sqlite()
  return (db.prepare(`SELECT date('now', 'localtime') as v`).get() as { v: string }).v
}

export const getCosturas = cache(async () => {
  const db = sqlite()
  const mix = db
    .prepare(
      `SELECT origem, origem_norm as origemNorm, COUNT(*) as lancamentos,
              COALESCE(SUM(qtd_pecas), 0) as pecas, COUNT(DISTINCT pedido_norm) as pedidos
       FROM fato_costura GROUP BY origem_norm ORDER BY pecas DESC`,
    )
    .all() as {
    origem: string
    origemNorm: string
    lancamentos: number
    pecas: number
    pedidos: number
  }[]
  const porResponsavel = db
    .prepare(
      `SELECT COALESCE(responsavel, '(sem)') as nome, COALESCE(SUM(qtd_pecas), 0) as pecas, COUNT(*) as pedidos
       FROM fato_costura WHERE origem_norm = 'Producao'
       GROUP BY responsavel ORDER BY pecas DESC`,
    )
    .all() as NamedTotal[]
  const hoje = todayIso()
  const doDia = db
    .prepare(
      `SELECT pedido_norm as pedido, qtd_pecas as pecas, responsavel, produto, origem
       FROM fato_costura WHERE data_producao = ? AND origem_norm = 'Producao'
       ORDER BY excel_row DESC`,
    )
    .all(hoje) as {
    pedido: string
    pecas: number
    responsavel: string | null
    produto: string | null
    origem: string
  }[]
  return { mix, porResponsavel, doDia, hoje }
})

export const getRevisao = cache(async () => {
  const db = sqlite()
  const porResponsavel = db
    .prepare(
      `SELECT COALESCE(responsavel, '(sem)') as nome, COALESCE(SUM(qtd_pecas), 0) as pecas, COUNT(*) as pedidos
       FROM fato_revisao GROUP BY responsavel ORDER BY pecas DESC`,
    )
    .all() as NamedTotal[]
  const hoje = todayIso()
  const doDia = db
    .prepare(
      `SELECT pedido_norm as pedido, qtd_pecas as pecas, responsavel, produto
       FROM fato_revisao WHERE data_producao = ? ORDER BY excel_row DESC`,
    )
    .all(hoje) as {
    pedido: string
    pecas: number
    responsavel: string | null
    produto: string | null
  }[]
  return { porResponsavel, doDia, hoje }
})

export const getOficinas = cache(async () => {
  const db = sqlite()
  const ranking = db
    .prepare(
      `SELECT oficina as nome, COALESCE(SUM(qtd_pendentes), 0) as pecas,
              COUNT(*) as pedidos, COALESCE(SUM(qtd_enviadas), 0) as enviadas,
              COALESCE(SUM(qtd_retornadas), 0) as retornadas,
              COALESCE(SUM(qtd_defeitos), 0) as defeitos
       FROM fato_oficinas GROUP BY oficina ORDER BY pecas DESC`,
    )
    .all() as {
    nome: string
    pecas: number
    pedidos: number
    enviadas: number
    retornadas: number
    defeitos: number
  }[]
  const sla = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status_entrega LIKE 'Em dia%' THEN 1 ELSE 0 END) as noPrazo,
         SUM(CASE WHEN status_entrega LIKE '%Atrasad%' THEN 1 ELSE 0 END) as atraso,
         COUNT(*) as lotes,
         SUM(CASE WHEN qtd_pendentes > 0 THEN 1 ELSE 0 END) as abertos,
         COALESCE(SUM(valor_total), 0) as valor
       FROM fato_oficinas`,
    )
    .get() as {
    noPrazo: number
    atraso: number
    lotes: number
    abertos: number
    valor: number
  }
  const enviadas = (
    db.prepare('SELECT COALESCE(SUM(qtd_enviadas), 0) as v FROM fato_oficinas').get() as { v: number }
  ).v
  const retornadas = (
    db.prepare('SELECT COALESCE(SUM(qtd_retornadas), 0) as v FROM fato_oficinas').get() as { v: number }
  ).v
  const semRetorno = db
    .prepare(
      `SELECT oficina, pedido_norm as pedido, qtd_enviadas as enviadas, data_envio as data
       FROM fato_oficinas
       WHERE qtd_enviadas > 0 AND qtd_retornadas = 0 AND qtd_pendentes = 0
       ORDER BY qtd_enviadas DESC LIMIT 20`,
    )
    .all() as { oficina: string; pedido: string | null; enviadas: number; data: string }[]
  const porMes = db
    .prepare(
      `SELECT CAST(substr(data_envio, 6, 2) as INTEGER) as mes,
              COALESCE(SUM(qtd_enviadas), 0) as enviadas,
              COALESCE(SUM(qtd_pendentes), 0) as pendentes
       FROM fato_oficinas GROUP BY mes ORDER BY mes`,
    )
    .all() as { mes: number; enviadas: number; pendentes: number }[]
  return { ranking, sla, enviadas, retornadas, semRetorno, porMes }
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
