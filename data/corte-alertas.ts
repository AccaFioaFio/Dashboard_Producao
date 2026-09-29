import { cache } from 'react'
import { getSqlite } from '@/db'
import { ensureCloudDatabase } from '@/lib/cloud/carga'
import { listarAlertasNuvem } from '@/lib/corte-nuvem'

export type AlertaCorteItem = {
  codProduto: string
  nomeProduto: string | null
  qtdReal: number | null
  dataFinal: string
  responsavel: string | null
}

export type AlertaCorte = {
  id: string
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

  const marcas = alertas.map(() => '?').join(', ')
  const itens = alertas.length
    ? (db
        .prepare(
          `SELECT alerta_id as alertaId, cod_produto as codProduto,
                  nome_produto as nomeProduto, qtd_real as qtdReal,
                  data_final as dataFinal, responsavel
           FROM corte_producao_alerta_item
           WHERE alerta_id IN (${marcas})
           ORDER BY id`,
        )
        .all(...alertas.map((alerta) => alerta.id)) as ItemRow[])
    : []

  const porAlerta = new Map<string, AlertaCorteItem[]>()
  for (const item of itens) {
    const chave = String(item.alertaId)
    const lista = porAlerta.get(chave) ?? []
    lista.push({
      codProduto: item.codProduto,
      nomeProduto: item.nomeProduto,
      qtdReal: item.qtdReal,
      dataFinal: item.dataFinal,
      responsavel: item.responsavel,
    })
    porAlerta.set(chave, lista)
  }

  const locais = alertas.map((alerta) => ({
    id: String(alerta.id),
    pedidoNorm: alerta.pedidoNorm,
    cliente: alerta.cliente,
    enviadoEm: alerta.enviadoEm,
    itens: porAlerta.get(String(alerta.id)) ?? [],
  }))

  let nuvem: AlertaCorte[] = []
  try {
    nuvem = (await listarAlertasNuvem())
      .filter((alerta) => !alerta.vistoEm)
      .map((alerta) => ({
        id: alerta.id,
        pedidoNorm: alerta.pedidoNorm,
        cliente: alerta.cliente,
        enviadoEm: alerta.enviadoEm,
        itens: alerta.itens,
      }))
  } catch (error) {
    console.error('alertas de corte na nuvem falharam', error)
  }

  const chaves = new Set(nuvem.map((alerta) => `${alerta.pedidoNorm}|${alerta.enviadoEm}`))
  return [...nuvem, ...locais.filter((alerta) => !chaves.has(`${alerta.pedidoNorm}|${alerta.enviadoEm}`))].sort(
    (a, b) => b.enviadoEm.localeCompare(a.enviadoEm) || b.id.localeCompare(a.id),
  )
})
