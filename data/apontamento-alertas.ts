import { cache } from 'react'
import { getSqlite } from '@/db'
import { ensureCloudDatabase } from '@/lib/cloud/carga'
import type { EtapaApontamento } from '@/lib/apontamento'
import { listarAlertasApontamentoNuvem } from '@/lib/apontamento-nuvem'

export type AlertaApontamentoItem = {
  codProduto: string
  nomeProduto: string | null
  qtdPecas: number | null
  dataProducao: string
  responsavel: string | null
  origem?: string | null
}

export type AlertaApontamento = {
  id: string
  etapa: EtapaApontamento
  pedidoNorm: string
  cliente: string | null
  enviadoEm: string
  itens: AlertaApontamentoItem[]
}

type AlertaRow = {
  id: number
  pedidoNorm: string
  cliente: string | null
  enviadoEm: string
}

type ItemRow = AlertaApontamentoItem & { alertaId: number }

function tabelas(etapa: EtapaApontamento) {
  return etapa === 'costura'
    ? { alerta: 'costura_producao_alerta', item: 'costura_producao_alerta_item' }
    : { alerta: 'revisao_alerta', item: 'revisao_alerta_item' }
}

function tabelaExiste(nome: string) {
  return Boolean(
    getSqlite()
      .prepare(`SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(nome),
  )
}

async function alertasDaEtapa(etapa: EtapaApontamento): Promise<AlertaApontamento[]> {
  const { alerta: tabelaAlerta, item: tabelaItem } = tabelas(etapa)
  if (!tabelaExiste(tabelaAlerta) || !tabelaExiste(tabelaItem)) return []

  const db = getSqlite()
  const alertas = db
    .prepare(
      `SELECT id, pedido_norm as pedidoNorm, cliente, enviado_em as enviadoEm
       FROM ${tabelaAlerta}
       WHERE visto_em IS NULL
       ORDER BY enviado_em DESC, id DESC`,
    )
    .all() as AlertaRow[]

  const marcas = alertas.map(() => '?').join(', ')
  const origemCol = etapa === 'costura' ? 'origem' : 'NULL as origem'
  const itens = alertas.length
    ? (db
        .prepare(
          `SELECT alerta_id as alertaId, cod_produto as codProduto,
                  nome_produto as nomeProduto, qtd_pecas as qtdPecas,
                  data_producao as dataProducao, responsavel, ${origemCol}
           FROM ${tabelaItem}
           WHERE alerta_id IN (${marcas})
           ORDER BY id`,
        )
        .all(...alertas.map((alerta) => alerta.id)) as ItemRow[])
    : []

  const porAlerta = new Map<string, AlertaApontamentoItem[]>()
  for (const item of itens) {
    const chave = String(item.alertaId)
    const lista = porAlerta.get(chave) ?? []
    lista.push({
      codProduto: item.codProduto,
      nomeProduto: item.nomeProduto,
      qtdPecas: item.qtdPecas,
      dataProducao: item.dataProducao,
      responsavel: item.responsavel,
      origem: item.origem,
    })
    porAlerta.set(chave, lista)
  }

  const locais = alertas.map((alerta) => ({
    id: String(alerta.id),
    etapa,
    pedidoNorm: alerta.pedidoNorm,
    cliente: alerta.cliente,
    enviadoEm: alerta.enviadoEm,
    itens: porAlerta.get(String(alerta.id)) ?? [],
  }))

  let nuvem: AlertaApontamento[] = []
  try {
    nuvem = (await listarAlertasApontamentoNuvem(etapa))
      .filter((alerta) => !alerta.vistoEm)
      .map((alerta) => ({
        id: alerta.id,
        etapa,
        pedidoNorm: alerta.pedidoNorm,
        cliente: alerta.cliente,
        enviadoEm: alerta.enviadoEm,
        itens: alerta.itens,
      }))
  } catch (error) {
    console.error('alertas de apontamento na nuvem falharam', etapa, error)
  }

  const chaves = new Set(nuvem.map((alerta) => `${alerta.pedidoNorm}|${alerta.enviadoEm}`))
  return [
    ...nuvem,
    ...locais.filter((alerta) => !chaves.has(`${alerta.pedidoNorm}|${alerta.enviadoEm}`)),
  ].sort(
    (a, b) => b.enviadoEm.localeCompare(a.enviadoEm) || b.id.localeCompare(a.id),
  )
}

export const getAlertasApontamentoAbertos = cache(
  async (): Promise<{
    costura: AlertaApontamento[]
    revisao: AlertaApontamento[]
  }> => {
    await ensureCloudDatabase()
    const [costura, revisao] = await Promise.all([
      alertasDaEtapa('costura'),
      alertasDaEtapa('revisao'),
    ])
    return { costura, revisao }
  },
)
