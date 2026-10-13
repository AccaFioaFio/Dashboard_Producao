import { getSqlite } from '@/db'
import { ETAPAS_APONTAMENTO, type EtapaApontamento } from '@/lib/apontamento'
import { syncDimPedidoApontamento } from '@/lib/apontamento-fatos'

type LinhaLocal = {
  pedidoNorm: string
  codProduto: string
  excelRow: number
  origem: string | null
  qtdPecas: number | null
  dataProducao: string | null
  responsavel: string | null
  avisoDataProducao: string | null
  observacao: string | null
  nomeProduto: string | null
  atualizadoEm: string
}

type AlertaLocal = {
  id: number
  pedidoNorm: string
  cliente: string | null
  enviadoEm: string
  vistoEm: string | null
}

type AlertaItemLocal = {
  alertaId: number
  codProduto: string
  nomeProduto: string | null
  qtdPecas: number | null
  dataProducao: string
  responsavel: string | null
  origem: string | null
}

export type ApontamentoOperacaoBackup = {
  costura: LinhaLocal[]
  revisao: LinhaLocal[]
  costuraAlertas: AlertaLocal[]
  costuraItens: AlertaItemLocal[]
  revisaoAlertas: AlertaLocal[]
  revisaoItens: AlertaItemLocal[]
}

function tabelaExiste(nome: string) {
  return Boolean(
    getSqlite()
      .prepare(`SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(nome),
  )
}

function ler(etapa: EtapaApontamento): LinhaLocal[] {
  const tabela = ETAPAS_APONTAMENTO[etapa].tabela
  if (!tabelaExiste(tabela)) return []
  const origem = etapa === 'costura' ? 'origem' : 'NULL as origem'
  return getSqlite()
    .prepare(
      `SELECT pedido_norm as pedidoNorm, cod_produto as codProduto,
              excel_row as excelRow, ${origem}, qtd_pecas as qtdPecas,
              data_producao as dataProducao, responsavel,
              aviso_data_producao as avisoDataProducao,
              observacao, nome_produto as nomeProduto,
              atualizado_em as atualizadoEm
       FROM ${tabela}`,
    )
    .all() as LinhaLocal[]
}

function lerAlertas(tabela: string): AlertaLocal[] {
  if (!tabelaExiste(tabela)) return []
  return getSqlite()
    .prepare(
      `SELECT id, pedido_norm as pedidoNorm, cliente,
              enviado_em as enviadoEm, visto_em as vistoEm
       FROM ${tabela}`,
    )
    .all() as AlertaLocal[]
}

function lerItens(tabela: string, comOrigem: boolean): AlertaItemLocal[] {
  if (!tabelaExiste(tabela)) return []
  const origem = comOrigem ? 'origem' : 'NULL as origem'
  return getSqlite()
    .prepare(
      `SELECT alerta_id as alertaId, cod_produto as codProduto,
              nome_produto as nomeProduto, qtd_pecas as qtdPecas,
              data_producao as dataProducao, responsavel, ${origem}
       FROM ${tabela}`,
    )
    .all() as AlertaItemLocal[]
}

/** Copia costura e revisão lançadas na tela antes de o SQLite da carga ser substituído. */
export function captureApontamentoOperacao(): ApontamentoOperacaoBackup | null {
  try {
    const backup: ApontamentoOperacaoBackup = {
      costura: ler('costura'),
      revisao: ler('revisao'),
      costuraAlertas: lerAlertas('costura_producao_alerta'),
      costuraItens: lerItens('costura_producao_alerta_item', true),
      revisaoAlertas: lerAlertas('revisao_alerta'),
      revisaoItens: lerItens('revisao_alerta_item', false),
    }
    const vazio =
      !backup.costura.length &&
      !backup.revisao.length &&
      !backup.costuraAlertas.length &&
      !backup.revisaoAlertas.length
    if (vazio) return null
    return backup
  } catch {
    return null
  }
}

function mergeAlertas(
  tabelaAlerta: string,
  tabelaItem: string,
  alertas: AlertaLocal[],
  itens: AlertaItemLocal[],
  comOrigem: boolean,
) {
  const db = getSqlite()
  if (!tabelaExiste(tabelaAlerta) || !tabelaExiste(tabelaItem)) return

  const alertaExiste = db.prepare(
    `SELECT id FROM ${tabelaAlerta} WHERE pedido_norm = ? AND enviado_em = ?`,
  )
  const criarAlerta = db.prepare(
    `INSERT INTO ${tabelaAlerta} (pedido_norm, cliente, enviado_em, visto_em)
     VALUES (?, ?, ?, ?)`,
  )
  const criarItem = comOrigem
    ? db.prepare(
        `INSERT INTO ${tabelaItem} (
           alerta_id, cod_produto, nome_produto, qtd_pecas, data_producao, responsavel, origem
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
    : db.prepare(
        `INSERT INTO ${tabelaItem} (
           alerta_id, cod_produto, nome_produto, qtd_pecas, data_producao, responsavel
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )

  for (const alerta of alertas) {
    const ja = alertaExiste.get(alerta.pedidoNorm, alerta.enviadoEm) as
      | { id: number }
      | undefined
    if (ja) continue
    const criado = criarAlerta.run(
      alerta.pedidoNorm,
      alerta.cliente,
      alerta.enviadoEm,
      alerta.vistoEm,
    )
    const novoId = Number(criado.lastInsertRowid)
    for (const item of itens) {
      if (item.alertaId !== alerta.id) continue
      if (comOrigem) {
        criarItem.run(
          novoId,
          item.codProduto,
          item.nomeProduto,
          item.qtdPecas,
          item.dataProducao,
          item.responsavel,
          item.origem,
        )
      } else {
        criarItem.run(
          novoId,
          item.codProduto,
          item.nomeProduto,
          item.qtdPecas,
          item.dataProducao,
          item.responsavel,
        )
      }
    }
  }
}

/** Recoloca lançamentos mais novos do que os que vieram no SQLite publicado. */
export function mergeApontamentoOperacao(backup: ApontamentoOperacaoBackup | null) {
  if (!backup) return
  const db = getSqlite()

  const gravar = db.transaction(() => {
    for (const etapa of ['costura', 'revisao'] as const) {
      const tabela = ETAPAS_APONTAMENTO[etapa].tabela
      const colunasOrigem = etapa === 'costura' ? 'origem, ' : ''
      const valoresOrigem = etapa === 'costura' ? '?, ' : ''
      const atualizaOrigem = etapa === 'costura' ? 'origem = excluded.origem,' : ''
      const upsert = db.prepare(
        `INSERT INTO ${tabela} (
           pedido_norm, cod_produto, excel_row, ${colunasOrigem}qtd_pecas, data_producao,
           responsavel, aviso_data_producao, observacao, nome_produto, atualizado_em
         ) VALUES (?, ?, ?, ${valoresOrigem}?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(pedido_norm, cod_produto, excel_row) DO UPDATE SET
           ${atualizaOrigem}
           qtd_pecas = excluded.qtd_pecas,
           data_producao = excluded.data_producao,
           responsavel = excluded.responsavel,
           aviso_data_producao = excluded.aviso_data_producao,
           observacao = excluded.observacao,
           nome_produto = COALESCE(excluded.nome_produto, ${tabela}.nome_produto),
           atualizado_em = excluded.atualizado_em
         WHERE excluded.atualizado_em >= ${tabela}.atualizado_em`,
      )
      for (const row of backup[etapa]) {
        const comuns = [
          row.pedidoNorm,
          row.codProduto,
          row.excelRow,
          ...(etapa === 'costura' ? [row.origem] : []),
          row.qtdPecas,
          row.dataProducao,
          row.responsavel,
          row.avisoDataProducao,
          row.observacao,
          row.nomeProduto,
          row.atualizadoEm,
        ]
        upsert.run(...comuns)
      }
    }

    mergeAlertas(
      'costura_producao_alerta',
      'costura_producao_alerta_item',
      backup.costuraAlertas,
      backup.costuraItens,
      true,
    )
    mergeAlertas(
      'revisao_alerta',
      'revisao_alerta_item',
      backup.revisaoAlertas,
      backup.revisaoItens,
      false,
    )
  })
  gravar()
  syncDimPedidoApontamento()
}
