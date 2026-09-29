import { cache } from 'react'
import { getSqlite } from '@/db'
import { ensureCloudDatabase } from '@/lib/cloud/carga'

export type AlertaCorteItem = {
  codProduto: string
  nomeProduto: string | null
  qtdReal: number | null
  dataFinal: string
  responsavel: string | null
}

export type AlertaCorte = {
  id: number
  pedidoNorm: string
  cliente: string | null
  enviadoEm: string
  itens: AlertaCorteItem[]
}

type AlertaRow = {
  id: number
  pedidoNorm: string
  cliente: string | null
  enviadoEm: string
}

type ItemRow = AlertaCorteItem & { alertaId: number }

export const getAlertasCorteAbertos = cache(async (): Promise<AlertaCorte[]> => {
  await ensureCloudDatabase()
  const db = getSqlite()
  const alertas = db
    .prepare(
      `SELECT id, pedido_norm as pedidoNorm, cliente, enviado_em as enviadoEm
       FROM corte_producao_alerta
       WHERE visto_em IS NULL
       ORDER BY enviado_em DESC, id DESC`,
    )
    .all() as AlertaRow[]
  if (!alertas.length) return []

  const marcas = alertas.map(() => '?').join(', ')
  const itens = db
    .prepare(
      `SELECT alerta_id as alertaId, cod_produto as codProduto,
              nome_produto as nomeProduto, qtd_real as qtdReal,
              data_final as dataFinal, responsavel
       FROM corte_producao_alerta_item
       WHERE alerta_id IN (${marcas})
       ORDER BY id`,
    )
    .all(...alertas.map((alerta) => alerta.id)) as ItemRow[]

  const porAlerta = new Map<number, AlertaCorteItem[]>()
  for (const item of itens) {
    const lista = porAlerta.get(item.alertaId) ?? []
    lista.push({
      codProduto: item.codProduto,
      nomeProduto: item.nomeProduto,
      qtdReal: item.qtdReal,
      dataFinal: item.dataFinal,
      responsavel: item.responsavel,
    })
    porAlerta.set(item.alertaId, lista)
  }

  return alertas.map((alerta) => ({
    ...alerta,
    itens: porAlerta.get(alerta.id) ?? [],
  }))
})
