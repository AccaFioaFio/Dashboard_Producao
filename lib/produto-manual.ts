import { getSqlite } from '@/db'
import { produtoNaBaseItens } from '@/data/pedidos'
import {
  codigoPorDescricao,
  MAX_DESCRICAO_PRODUTO,
} from '@/lib/produto-codigo-manual'

export type ProdutoParaIncluir =
  | { ok: false; error: string }
  | { ok: true; precisaDescricao: true; codProduto: string }
  | {
      ok: true
      precisaDescricao: false
      codProduto: string
      nomeProduto: string | null
    }

/**
 * Código da base de itens, código novo com a descrição digitada,
 * ou só descrição (gera código interno SC…).
 */
export function resolverProdutoParaIncluir(
  pedidoNorm: string,
  codInformado: string,
  descricaoInformada: string,
): ProdutoParaIncluir {
  const cod = codInformado.trim()
  const descricao = descricaoInformada.trim().replace(/\s+/g, ' ')

  if (!pedidoNorm) {
    return { ok: false, error: 'Informe o pedido.' }
  }

  if (!cod) {
    if (!descricao) {
      return { ok: false, error: 'Informe o código ou a descrição do produto.' }
    }
    if (descricao.length > MAX_DESCRICAO_PRODUTO) {
      return { ok: false, error: 'A descrição pode ter até 180 caracteres.' }
    }
    return {
      ok: true,
      precisaDescricao: false,
      codProduto: codigoPorDescricao(descricao),
      nomeProduto: descricao,
    }
  }

  const produto = produtoNaBaseItens(cod)
  if (produto) {
    const jaNaCarga = getSqlite()
      .prepare(
        `SELECT 1 as v FROM fato_pedido_item
         WHERE pedido_norm = ?
           AND replace(trim(cod_produto), ' ', '') = replace(trim(?), ' ', '')`,
      )
      .get(pedidoNorm, produto.codProduto)
    if (jaNaCarga) {
      return { ok: false, error: 'Este código já está na carga deste pedido.' }
    }
    return {
      ok: true,
      precisaDescricao: false,
      codProduto: produto.codProduto,
      nomeProduto: produto.nomeProduto,
    }
  }

  if (!descricao) {
    return { ok: true, precisaDescricao: true, codProduto: cod }
  }
  if (descricao.length > MAX_DESCRICAO_PRODUTO) {
    return { ok: false, error: 'A descrição pode ter até 180 caracteres.' }
  }
  return {
    ok: true,
    precisaDescricao: false,
    codProduto: cod,
    nomeProduto: descricao,
  }
}
