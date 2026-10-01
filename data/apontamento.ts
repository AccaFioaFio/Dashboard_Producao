import { cache } from 'react'
import { getSqlite } from '@/db'
import { ensureCloudDatabase } from '@/lib/cloud/carga'
import {
  ETAPAS_APONTAMENTO,
  type EtapaApontamento,
} from '@/lib/apontamento'
import { lerApontamentoNuvem, type ApontamentoNuvem } from '@/lib/apontamento-nuvem'
import { collapseItensCorte, EXCEL_ROW_FORA_DA_CARGA } from '@/lib/corte-producao'
import { parsePedidoParam, pedidoDigits } from '@/lib/pedido'
import { cabecaPedidoCorte, produtoNaBaseItens } from '@/data/pedidos'

export type ItemApontamento = {
  codProduto: string
  excelRow: number
  nomeProduto: string | null
  qtdPedida: number | null
  origem: string | null
  qtdPecas: number | null
  dataProducao: string | null
  responsavel: string | null
}

export type ApontamentoConsulta = {
  pedidoInformado: string
  pedidoNorm: string | null
  cliente: string | null
  canal: string | null
  status: string | null
  loaded: boolean
  inclusaoManual: boolean
  itens: ItemApontamento[]
}

type Gravado = ApontamentoNuvem & { excelRow: number }

function tabelaItensExiste() {
  return Boolean(
    getSqlite()
      .prepare(
        `SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = 'fato_pedido_item'`,
      )
      .get(),
  )
}

function maisRecente(local: Gravado | undefined, nuvem: ApontamentoNuvem | undefined) {
  if (!local && !nuvem) return undefined
  const base = !local
    ? { ...nuvem!, excelRow: EXCEL_ROW_FORA_DA_CARGA }
    : !nuvem
      ? local
      : local.atualizadoEm >= nuvem.atualizadoEm
        ? local
        : { ...nuvem, excelRow: local.excelRow }
  const outro = base === local ? nuvem : local
  if (!base.nomeProduto && outro?.nomeProduto) {
    return { ...base, nomeProduto: outro.nomeProduto }
  }
  return base
}

async function lancamentosDoPedido(etapa: EtapaApontamento, pedidoNorm: string) {
  const tabela = ETAPAS_APONTAMENTO[etapa].tabela
  const origem = etapa === 'costura' ? 'origem' : 'NULL as origem'
  const locais = new Map<string, Gravado>()
  for (const row of getSqlite()
    .prepare(
      `SELECT cod_produto as codProduto, excel_row as excelRow, ${origem},
              qtd_pecas as qtdPecas, data_producao as dataProducao,
              responsavel, nome_produto as nomeProduto, atualizado_em as atualizadoEm
       FROM ${tabela}
       WHERE pedido_norm = ?
       ORDER BY atualizado_em DESC`,
    )
    .all(pedidoNorm) as Gravado[]) {
    if (!locais.has(row.codProduto)) locais.set(row.codProduto, row)
  }

  let nuvem = new Map<string, ApontamentoNuvem>()
  try {
    nuvem = await lerApontamentoNuvem(etapa, pedidoNorm)
  } catch (error) {
    console.error('leitura do lançamento na nuvem falhou', etapa, pedidoNorm, error)
  }
  return { locais, nuvem }
}

function itemDe(
  codProduto: string,
  excelRow: number,
  nomeProduto: string | null,
  qtdPedida: number | null,
  lancamento: Gravado | ApontamentoNuvem | undefined,
): ItemApontamento {
  return {
    codProduto,
    excelRow,
    nomeProduto,
    qtdPedida,
    origem: lancamento?.origem ?? null,
    qtdPecas: lancamento?.qtdPecas ?? null,
    dataProducao: lancamento?.dataProducao ?? null,
    responsavel: lancamento?.responsavel ?? null,
  }
}

export const getApontamentoPedido = cache(
  async (etapa: EtapaApontamento, raw: string): Promise<ApontamentoConsulta> => {
    await ensureCloudDatabase()
    const pedidoInformado = parsePedidoParam(raw).trim()
    const vazio: ApontamentoConsulta = {
      pedidoInformado,
      pedidoNorm: null,
      cliente: null,
      canal: null,
      status: null,
      loaded: tabelaItensExiste(),
      inclusaoManual: false,
      itens: [],
    }
    if (!pedidoInformado || !vazio.loaded) return vazio

    const pedidoNorm = pedidoDigits(pedidoInformado)
    if (!pedidoNorm) return vazio

    const rows = getSqlite()
      .prepare(
        `SELECT pedido_raw as pedidoRaw, tipo_comercializacao as tipo, cliente, canal, status,
                cod_produto as codProduto, nome_produto as nomeProduto,
                qtd_pedida as qtdPedida, excel_row as excelRow
         FROM fato_pedido_item
         WHERE pedido_norm = ?
         ORDER BY excel_row`,
      )
      .all(pedidoNorm) as {
      pedidoRaw: string
      tipo: string | null
      cliente: string | null
      canal: string | null
      status: string | null
      codProduto: string
      nomeProduto: string | null
      qtdPedida: number
      excelRow: number
    }[]

    const { locais, nuvem } = await lancamentosDoPedido(etapa, pedidoNorm)
    const cabeca = rows[0]
    if (!cabeca) {
      const corte = cabecaPedidoCorte(pedidoNorm)
      const codigos = new Set<string>([...locais.keys(), ...nuvem.keys()])
      const itens = [...codigos].map((codProduto) => {
        const local = locais.get(codProduto)
        const lancamento = maisRecente(local, nuvem.get(codProduto))
        const produto = produtoNaBaseItens(codProduto)
        return itemDe(
          produto?.codProduto ?? codProduto,
          local?.excelRow ?? EXCEL_ROW_FORA_DA_CARGA,
          produto?.nomeProduto ?? lancamento?.nomeProduto ?? null,
          null,
          lancamento,
        )
      })
      itens.sort((a, b) => a.codProduto.localeCompare(b.codProduto, 'pt-BR'))
      return {
        pedidoInformado,
        pedidoNorm,
        cliente: corte?.cliente ?? null,
        canal: corte?.canal ?? null,
        status: corte?.status ?? null,
        loaded: true,
        inclusaoManual: true,
        itens,
      }
    }

    const colapsados = collapseItensCorte(
      rows.map((row) => ({
        ...row,
        pedidoNorm,
        qtdReal: null,
        qtdVolumes: null,
        dataInicio: null,
        dataFinal: null,
        responsavel: null,
        avisoDataFinal: null,
      })),
    )

    return {
      pedidoInformado,
      pedidoNorm,
      cliente: cabeca.cliente,
      canal: cabeca.canal,
      status: cabeca.status,
      loaded: true,
      inclusaoManual: false,
      itens: colapsados.map((row) =>
        itemDe(
          row.codProduto,
          row.excelRow,
          row.nomeProduto,
          row.qtdPedida,
          maisRecente(locais.get(row.codProduto), nuvem.get(row.codProduto)),
        ),
      ),
    }
  },
)
