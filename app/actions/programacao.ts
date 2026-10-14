'use server'

import { getItensPorPedido } from '@/data/pedidos'
import { canAccessPath } from '@/lib/auth/access'
import { readSession } from '@/lib/auth/cookie'

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
  const session = await readSession()
  if (!session || !canAccessPath('/programacao', session.acessos)) {
    return { ok: false, error: 'Sem permissão.' }
  }

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
