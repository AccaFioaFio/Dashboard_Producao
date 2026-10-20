import { cache } from 'react'
import { getSqlite } from '@/db'
import { ensureCloudDatabase } from '@/lib/cloud/carga'
import {
  ETAPAS_APONTAMENTO,
  type EtapaApontamento,
} from '@/lib/apontamento'
import {
  entradasDoLancamento,
  lerApontamentoNuvem,
  unirEntradas,
  type ApontamentoNuvem,
  type ApontamentoNuvemEntrada,
} from '@/lib/apontamento-nuvem'
import { sincronizarPedidoApontamento } from '@/lib/apontamento-sync'
import { collapseItensCorte, EXCEL_ROW_FORA_DA_CARGA } from '@/lib/corte-producao'
import { parsePedidoParam, pedidoDigits } from '@/lib/pedido'
import { cabecaPedidoCorte, produtoNaBaseItens } from '@/data/pedidos'

export type ItemApontamento = {
  codProduto: string
  excelRow: number
  nomeProduto: string | null
  qtdPedida: number | null
  origem: string | null
  oficina: string | null
  /** Soma de todas as entradas do produto (datas diferentes entram aqui). */
  qtdPecas: number | null
  /** Menor data inicial já lançada neste produto. */
  dataInicio: string | null
  dataProducao: string | null
  responsavel: string | null
  avisoDataProducao: string | null
  /** Datas de produção que já entraram na lista de aviso. */
  datasAvisadas: string[]
  observacao: string | null
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

type AgregadoProduto = {
  excelRow: number
  origem: string | null
  oficina: string | null
  qtdPecas: number
  dataInicio: string | null
  dataProducao: string | null
  responsavel: string | null
  avisoDataProducao: string | null
  datasAvisadas: string[]
  observacao: string | null
  nomeProduto: string | null
  atualizadoEm: string
}

function agregarLinhas(rows: Gravado[]): AgregadoProduto | null {
  if (!rows.length) return null
  const ordenadas = [...rows].sort((a, b) =>
    a.atualizadoEm < b.atualizadoEm ? 1 : a.atualizadoEm > b.atualizadoEm ? -1 : 0,
  )
  const recente = ordenadas[0]
  const datasAvisadas = [
    ...new Set(
      ordenadas
        .filter(
          (row) =>
            row.dataProducao &&
            row.avisoDataProducao &&
            row.avisoDataProducao === row.dataProducao,
        )
        .map((row) => row.dataProducao as string),
    ),
  ]
  const pecas = ordenadas.reduce((sum, row) => sum + (row.qtdPecas ?? 0), 0)
  const dataInicio = ordenadas.reduce<string | null>((menor, row) => {
    if (!row.dataInicio) return menor
    if (!menor || row.dataInicio < menor) return row.dataInicio
    return menor
  }, null)
  return {
    excelRow: recente.excelRow,
    origem: recente.origem,
    oficina: recente.oficina,
    qtdPecas: pecas,
    dataInicio,
    dataProducao: null,
    responsavel: null,
    avisoDataProducao: null,
    datasAvisadas,
    observacao: null,
    nomeProduto: recente.nomeProduto,
    atualizadoEm: recente.atualizadoEm,
  }
}

function gravadosParaEntradas(rows: Gravado[]): ApontamentoNuvemEntrada[] {
  return rows.map((row) => ({
    excelRow: row.excelRow,
    origem: row.origem,
    oficina: row.oficina,
    qtdPecas: row.qtdPecas,
    dataInicio: row.dataInicio,
    dataProducao: row.dataProducao,
    responsavel: row.responsavel,
    avisoDataProducao: row.avisoDataProducao,
    observacao: row.observacao,
    atualizadoEm: row.atualizadoEm,
  }))
}

async function lancamentosDoPedido(etapa: EtapaApontamento, pedidoNorm: string) {
  const tabela = ETAPAS_APONTAMENTO[etapa].tabela
  const origem = etapa === 'costura' ? 'origem' : 'NULL as origem'
  const porCodigo = new Map<string, Gravado[]>()
  for (const row of getSqlite()
    .prepare(
      `SELECT cod_produto as codProduto, excel_row as excelRow, ${origem},
              ${etapa === 'costura' ? 'oficina' : 'NULL as oficina'},
              qtd_pecas as qtdPecas, data_inicio as dataInicio, data_producao as dataProducao,
              responsavel, aviso_data_producao as avisoDataProducao,
              observacao, nome_produto as nomeProduto,
              atualizado_em as atualizadoEm
       FROM ${tabela}
       WHERE pedido_norm = ?
       ORDER BY atualizado_em DESC`,
    )
    .all(pedidoNorm) as Gravado[]) {
    const lista = porCodigo.get(row.codProduto) ?? []
    lista.push(row)
    porCodigo.set(row.codProduto, lista)
  }

  let nuvem = new Map<string, ApontamentoNuvem>()
  try {
    nuvem = await lerApontamentoNuvem(etapa, pedidoNorm)
  } catch (error) {
    console.error('leitura do lançamento na nuvem falhou', etapa, pedidoNorm, error)
  }
  return { porCodigo, nuvem }
}

/**
 * Une entradas locais + nuvem por excel_row e soma — não usa Math.max dos totais
 * (isso perdia peças quando cada lado tinha datas/linhas diferentes).
 *
 * Se o local for mais novo que o documento na nuvem, usa só o local: depois de
 * Corrigir o SQLite já tem o total certo; unir com nuvem atrasada somava de novo.
 */
function mergeProduto(
  locais: Gravado[] | undefined,
  nuvem: ApontamentoNuvem | undefined,
): AgregadoProduto | undefined {
  if (!locais?.length && !nuvem) return undefined

  if (locais?.length && nuvem?.atualizadoEm) {
    let maxLocal = ''
    for (const row of locais) {
      if (row.atualizadoEm > maxLocal) maxLocal = row.atualizadoEm
    }
    if (maxLocal && nuvem.atualizadoEm < maxLocal) {
      return agregarLinhas(locais) ?? undefined
    }
  }

  const entradas = unirEntradas(
    locais?.length ? gravadosParaEntradas(locais) : [],
    nuvem ? entradasDoLancamento(nuvem) : [],
  )
  if (!entradas.length) return undefined
  const nomeProduto =
    locais?.find((row) => row.nomeProduto)?.nomeProduto ?? nuvem?.nomeProduto ?? null
  const comoGravado: Gravado[] = entradas.map((row) => ({
    codProduto: nuvem?.codProduto ?? locais?.[0]?.codProduto ?? '',
    excelRow: row.excelRow,
    origem: row.origem,
    oficina: row.oficina,
    qtdPecas: row.qtdPecas,
    dataInicio: row.dataInicio,
    dataProducao: row.dataProducao,
    responsavel: row.responsavel,
    avisoDataProducao: row.avisoDataProducao,
    observacao: row.observacao,
    nomeProduto,
    atualizadoEm: row.atualizadoEm,
  }))
  return agregarLinhas(comoGravado) ?? undefined
}

function itemDe(
  codProduto: string,
  excelRow: number,
  nomeProduto: string | null,
  qtdPedida: number | null,
  lancamento: AgregadoProduto | undefined,
): ItemApontamento {
  return {
    codProduto,
    excelRow,
    nomeProduto: nomeProduto ?? lancamento?.nomeProduto ?? null,
    qtdPedida,
    origem: null,
    oficina: null,
    qtdPecas: lancamento && lancamento.qtdPecas > 0 ? lancamento.qtdPecas : null,
    dataInicio: lancamento?.dataInicio ?? null,
    dataProducao: null,
    responsavel: null,
    avisoDataProducao: null,
    datasAvisadas: lancamento?.datasAvisadas ?? [],
    observacao: null,
  }
}

export function listarOficinasApontamento() {
  const existe = getSqlite()
    .prepare(
      `SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = 'dim_oficina'`,
    )
    .get()
  if (!existe) return [] as string[]
  return (
    getSqlite()
      .prepare('SELECT oficina FROM dim_oficina ORDER BY oficina')
      .all() as { oficina: string }[]
  ).map((row) => row.oficina)
}

/** Linhas da planilha do pedido (texto de produto costuma ser incompleto). */
export function listarPlanilhaPedido(
  etapa: EtapaApontamento,
  pedidoNorm: string,
): { dataProducao: string; pecas: number; produto: string | null; responsavel: string | null }[] {
  const tabela = etapa === 'costura' ? 'fato_costura' : 'fato_revisao'
  const existe = getSqlite()
    .prepare(`SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(tabela)
  if (!existe) return []
  const filtroOrigem = etapa === 'costura' ? `AND origem_norm = 'Producao'` : ''
  return getSqlite()
    .prepare(
      `SELECT data_producao as dataProducao, qtd_pecas as pecas,
              produto, responsavel
       FROM ${tabela}
       WHERE pedido_norm = ? ${filtroOrigem}
       ORDER BY data_producao, excel_row`,
    )
    .all(pedidoNorm) as {
    dataProducao: string
    pecas: number
    produto: string | null
    responsavel: string | null
  }[]
}

/**
 * Qtd já somada nos cards com observação “já lançado na planilha”.
 * Serve para não contar duas vezes no total da tela (planilha + cards).
 */
export function somarLancadoSoPlanilha(
  etapa: EtapaApontamento,
  pedidoNorm: string,
): number {
  const tabela = ETAPAS_APONTAMENTO[etapa].tabela
  const existe = getSqlite()
    .prepare(`SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(tabela)
  if (!existe) return 0
  const row = getSqlite()
    .prepare(
      `SELECT COALESCE(SUM(qtd_pecas), 0) as v
       FROM ${tabela}
       WHERE pedido_norm = ?
         AND qtd_pecas IS NOT NULL
         AND lower(replace(coalesce(observacao, ''), 'ç', 'c')) LIKE '%ja lancado na planilha%'`,
    )
    .get(pedidoNorm) as { v: number }
  return row.v
}

export const getApontamentoPedido = cache(
  async (
    etapa: EtapaApontamento,
    raw: string,
    /** `local` = gravação rápida (sem sync global / pedido); tela usa o padrão. */
    modo: 'full' | 'local' = 'full',
  ): Promise<ApontamentoConsulta> => {
    await ensureCloudDatabase(modo === 'local' ? { light: true } : undefined)
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

    // Mobile ↔ desktop: sobe o que só estava no SQLite e baixa o que já está na nuvem.
    if (modo !== 'local') {
      await sincronizarPedidoApontamento(etapa, pedidoNorm)
    }

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

    const { porCodigo, nuvem } = await lancamentosDoPedido(etapa, pedidoNorm)
    const cabeca = rows[0]
    if (!cabeca) {
      const corte = cabecaPedidoCorte(pedidoNorm)
      const codigos = new Set<string>([...porCodigo.keys(), ...nuvem.keys()])
      const itens = [...codigos].map((codProduto) => {
        const lancamento = mergeProduto(porCodigo.get(codProduto), nuvem.get(codProduto))
        const produto = produtoNaBaseItens(codProduto)
        return itemDe(
          produto?.codProduto ?? codProduto,
          lancamento?.excelRow ?? EXCEL_ROW_FORA_DA_CARGA,
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
        qtdVolumesBordados: null,
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
          mergeProduto(porCodigo.get(row.codProduto), nuvem.get(row.codProduto)),
        ),
      ),
    }
  },
)
