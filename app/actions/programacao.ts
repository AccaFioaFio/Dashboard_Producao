'use server'

import { getItensPorPedido } from '@/data/pedidos'
import {
  excluirLinhasProgramacao,
  excluirPedidoProgramacao as excluirPedidoDb,
  importarLinhasProgramacao,
  listarProgramacao,
  substituirPedidoProgramacao,
} from '@/data/programacao'
import { canAccessPath } from '@/lib/auth/access'
import { readSession } from '@/lib/auth/cookie'
import {
  itemProntoParaSalvar,
  normalizarLinha,
  type ItemProgramacao,
  type LinhaProgramacao,
  type ProgramacaoBanco,
} from '@/lib/programacao'

function semPermissao() {
  return { ok: false as const, error: 'Sem permissão.' }
}

async function autorizarProgramacao() {
  const session = await readSession()
  if (!session) return null
  const ok =
    canAccessPath('/programacao', session.acessos) ||
    canAccessPath('/corte', session.acessos) ||
    canAccessPath('/costuras', session.acessos) ||
    canAccessPath('/revisao', session.acessos)
  return ok ? session : null
}

export type BuscarProgramacaoPedidoResult =
  | {
      ok: true
      loaded: boolean
      pedidoInformado: string
      pedidoNorm: string | null
      cliente: string | null
      canal: string | null
      status: string | null
      inclusaoManual: boolean
      itens: {
        id: string
        codProduto: string
        nome: string
        qtdPedido: number | null
      }[]
    }
  | { ok: false; error: string }

export async function buscarProgramacaoPedido(
  pedido: string,
): Promise<BuscarProgramacaoPedidoResult> {
  const session = await autorizarProgramacao()
  if (!session) return semPermissao()

  const informado = pedido.trim()
  if (!informado) {
    return { ok: false, error: 'Informe o número do pedido.' }
  }

  const consulta = await getItensPorPedido(informado)
  if (!consulta.loaded) {
    return {
      ok: true,
      loaded: false,
      pedidoInformado: consulta.pedidoInformado,
      pedidoNorm: null,
      cliente: null,
      canal: null,
      status: null,
      inclusaoManual: false,
      itens: [],
    }
  }

  if (!consulta.pedidoNorm && consulta.itens.length === 0 && !consulta.cliente) {
    return {
      ok: true,
      loaded: true,
      pedidoInformado: consulta.pedidoInformado,
      pedidoNorm: null,
      cliente: null,
      canal: null,
      status: null,
      inclusaoManual: false,
      itens: [],
    }
  }

  return {
    ok: true,
    loaded: true,
    pedidoInformado: consulta.pedidoInformado,
    pedidoNorm: consulta.pedidoNorm,
    cliente: consulta.cliente,
    canal: consulta.canal,
    status: consulta.status,
    inclusaoManual: consulta.inclusaoManual,
    itens: consulta.itens.map((item, index) => ({
      id: `${item.codProduto || 'item'}-${item.excelRow || index}`,
      codProduto: item.codProduto,
      nome: (item.nomeProduto ?? item.codProduto ?? '').trim() || 'Item',
      qtdPedido: item.qtdPedida,
    })),
  }
}

export type ProgramacaoResult =
  | { ok: true; banco: ProgramacaoBanco }
  | { ok: false; error: string }

export async function carregarProgramacao(): Promise<ProgramacaoResult> {
  const session = await autorizarProgramacao()
  if (!session) return semPermissao()
  try {
    const banco = await listarProgramacao()
    return { ok: true, banco }
  } catch {
    return { ok: false, error: 'Não foi possível carregar a programação.' }
  }
}

export async function salvarPedidoProgramacao(input: {
  pedido: string
  pedidoNorm: string | null
  cliente: string | null
  itens: ItemProgramacao[]
}): Promise<ProgramacaoResult & { gravados?: number }> {
  const session = await autorizarProgramacao()
  if (!session) return semPermissao()

  const pedido = input.pedido.trim()
  if (!pedido) return { ok: false, error: 'Informe o número do pedido.' }

  const prontos = input.itens.filter(itemProntoParaSalvar)
  if (prontos.length === 0) {
    return { ok: false, error: 'Nenhum item pronto para salvar (nome, qtd e período).' }
  }

  try {
    const { banco, gravados } = await substituirPedidoProgramacao({
      pedido,
      pedidoNorm: input.pedidoNorm,
      cliente: input.cliente?.trim() ? input.cliente.trim() : null,
      itens: prontos,
    })
    return { ok: true, banco, gravados }
  } catch {
    return { ok: false, error: 'Não foi possível salvar a programação.' }
  }
}

export async function excluirPedidoProgramacaoAction(
  pedido: string,
  pedidoNorm: string | null,
): Promise<ProgramacaoResult & { removidos?: number }> {
  const session = await autorizarProgramacao()
  if (!session) return semPermissao()

  const informado = pedido.trim()
  if (!informado) return { ok: false, error: 'Informe o número do pedido.' }

  try {
    const { banco, removidos } = await excluirPedidoDb(informado, pedidoNorm)
    return { ok: true, banco, removidos }
  } catch {
    return { ok: false, error: 'Não foi possível excluir o pedido.' }
  }
}

export async function excluirItemProgramacao(
  key: string,
): Promise<ProgramacaoResult & { removidos?: number }> {
  const session = await autorizarProgramacao()
  if (!session) return semPermissao()

  const chave = key.trim()
  if (!chave) return { ok: false, error: 'Item inválido.' }

  try {
    const { banco, removidos } = await excluirLinhasProgramacao([chave])
    return { ok: true, banco, removidos }
  } catch {
    return { ok: false, error: 'Não foi possível excluir o item.' }
  }
}

export async function importarProgramacaoLocal(
  linhas: unknown[],
): Promise<ProgramacaoResult & { gravados?: number }> {
  const session = await autorizarProgramacao()
  if (!session) return semPermissao()

  const normalizadas = linhas
    .map(normalizarLinha)
    .filter((row): row is LinhaProgramacao => row != null)

  if (normalizadas.length === 0) {
    return { ok: false, error: 'Nenhuma linha válida para importar.' }
  }

  try {
    const atual = await listarProgramacao()
    if (atual.linhas.length > 0) {
      return { ok: true, banco: atual, gravados: 0 }
    }
    const { banco, gravados } = await importarLinhasProgramacao(normalizadas)
    return { ok: true, banco, gravados }
  } catch {
    return { ok: false, error: 'Não foi possível importar a programação local.' }
  }
}
