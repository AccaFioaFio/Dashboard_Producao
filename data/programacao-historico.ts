import { getSqlite } from '@/db'
import { ensureCloudDatabase } from '@/lib/cloud/carga'
import {
  detalheExcluirItem,
  detalheExcluirPedido,
  detalheSalvarPedido,
  novoHistoricoId,
  type ProgramacaoHistoricoAcao,
  type ProgramacaoHistoricoEvento,
} from '@/lib/programacao-historico'
import {
  ensureProgramacaoHistoricoNuvemNoSqlite,
  publicarHistoricoProgramacaoNuvem,
} from '@/lib/programacao-historico-sync'

function tabelaExiste() {
  return Boolean(
    getSqlite()
      .prepare(
        `SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = 'programacao_historico'`,
      )
      .get(),
  )
}

function inserirLocal(evento: ProgramacaoHistoricoEvento) {
  getSqlite()
    .prepare(
      `INSERT INTO programacao_historico (
         id, ocorrido_em, usuario_login, acao, pedido, pedido_norm, cliente,
         item_key, item_nome, detalhe
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .run(
      evento.id,
      evento.ocorridoEm,
      evento.usuarioLogin,
      evento.acao,
      evento.pedido,
      evento.pedidoNorm,
      evento.cliente,
      evento.itemKey,
      evento.itemNome,
      evento.detalhe,
    )
}

async function registrar(evento: ProgramacaoHistoricoEvento) {
  if (!tabelaExiste()) return { nuvemError: undefined as string | undefined }
  inserirLocal(evento)
  const nuvem = await publicarHistoricoProgramacaoNuvem(evento)
  return { nuvemError: nuvem.ok ? undefined : nuvem.error }
}

export async function registrarHistoricoSalvarPedido(input: {
  usuarioLogin: string
  pedido: string
  pedidoNorm: string | null
  cliente: string | null
  gravados: number
}) {
  return registrar({
    id: novoHistoricoId(),
    ocorridoEm: new Date().toISOString(),
    usuarioLogin: input.usuarioLogin,
    acao: 'salvar_pedido',
    pedido: input.pedido,
    pedidoNorm: input.pedidoNorm,
    cliente: input.cliente,
    itemKey: null,
    itemNome: null,
    detalhe: detalheSalvarPedido(input),
  })
}

export async function registrarHistoricoExcluirPedido(input: {
  usuarioLogin: string
  pedido: string
  pedidoNorm: string | null
  cliente: string | null
  removidos: number
}) {
  return registrar({
    id: novoHistoricoId(),
    ocorridoEm: new Date().toISOString(),
    usuarioLogin: input.usuarioLogin,
    acao: 'excluir_pedido',
    pedido: input.pedido,
    pedidoNorm: input.pedidoNorm,
    cliente: input.cliente,
    itemKey: null,
    itemNome: null,
    detalhe: detalheExcluirPedido(input),
  })
}

export async function registrarHistoricoExcluirItem(input: {
  usuarioLogin: string
  pedido: string
  pedidoNorm: string | null
  cliente: string | null
  itemKey: string
  itemNome: string
}) {
  return registrar({
    id: novoHistoricoId(),
    ocorridoEm: new Date().toISOString(),
    usuarioLogin: input.usuarioLogin,
    acao: 'excluir_item',
    pedido: input.pedido,
    pedidoNorm: input.pedidoNorm,
    cliente: input.cliente,
    itemKey: input.itemKey,
    itemNome: input.itemNome,
    detalhe: detalheExcluirItem(input),
  })
}

export type FiltroHistoricoProgramacao = {
  pedido?: string
  usuario?: string
  dataInicio?: string
  dataFim?: string
  limite?: number
}

export async function listarHistoricoProgramacao(
  filtro: FiltroHistoricoProgramacao = {},
): Promise<ProgramacaoHistoricoEvento[]> {
  await ensureCloudDatabase()
  await ensureProgramacaoHistoricoNuvemNoSqlite()
  if (!tabelaExiste()) return []

  const limite = Math.min(Math.max(filtro.limite ?? 200, 1), 500)
  const pedido = filtro.pedido?.trim() ?? ''
  const usuario = filtro.usuario?.trim().toLocaleLowerCase('pt-BR') ?? ''
  const dataInicio = filtro.dataInicio?.trim() ?? ''
  const dataFim = filtro.dataFim?.trim() ?? ''

  const where: string[] = []
  const args: (string | number)[] = []

  if (pedido) {
    where.push(
      `(LOWER(COALESCE(pedido, '')) LIKE ? OR LOWER(COALESCE(pedido_norm, '')) LIKE ? OR LOWER(detalhe) LIKE ?)`,
    )
    const like = `%${pedido.toLocaleLowerCase('pt-BR')}%`
    args.push(like, like, like)
  }
  if (usuario) {
    where.push(`LOWER(usuario_login) LIKE ?`)
    args.push(`%${usuario}%`)
  }
  if (dataInicio) {
    where.push(`ocorrido_em >= ?`)
    args.push(`${dataInicio}T00:00:00.000Z`)
  }
  if (dataFim) {
    where.push(`ocorrido_em <= ?`)
    args.push(`${dataFim}T23:59:59.999Z`)
  }

  const sql = `SELECT id, ocorrido_em as ocorridoEm, usuario_login as usuarioLogin,
                      acao, pedido, pedido_norm as pedidoNorm, cliente,
                      item_key as itemKey, item_nome as itemNome, detalhe
               FROM programacao_historico
               ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
               ORDER BY ocorrido_em DESC
               LIMIT ?`
  args.push(limite)

  return getSqlite().prepare(sql).all(...args) as ProgramacaoHistoricoEvento[]
}

export type { ProgramacaoHistoricoAcao, ProgramacaoHistoricoEvento }
