import { getSqlite } from '@/db'
import { produtoNaBaseItens } from '@/data/pedidos'

const MAX_DESCRICAO = 180

export type ProdutoParaIncluir =
  | { ok: false; error: string }
  | { ok: true; precisaDescricao: true; codProduto: string }
  | {
      ok: true
      precisaDescricao: false
      codProduto: string
      nomeProduto: string | null
    }

/** Código da base de itens, ou código novo com a descrição que a pessoa digitou. */
export function resolverProdutoParaIncluir(
  pedidoNorm: string,
  codInformado: string,
  descricaoInformada: string,
): ProdutoParaIncluir {
  const cod = codInformado.trim()
  if (!pedidoNorm || !cod) {
    return { ok: false, error: 'Informe o código do produto.' }
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

  const descricao = descricaoInformada.trim().replace(/\s+/g, ' ')
  if (!descricao) {
    return { ok: true, precisaDescricao: true, codProduto: cod }
  }
  if (descricao.length > MAX_DESCRICAO) {
    return { ok: false, error: 'A descrição pode ter até 180 caracteres.' }
  }
  return {
    ok: true,
    precisaDescricao: false,
    codProduto: cod,
    nomeProduto: descricao,
  }
}
