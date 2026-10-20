'use server'

import { revalidatePath } from 'next/cache'
import { getSqlite } from '@/db'
import { produtoNaBaseItens } from '@/data/pedidos'
import { ensureCloudDatabase } from '@/lib/cloud/carga'
import { canAccessPath } from '@/lib/auth/access'
import { readSession } from '@/lib/auth/cookie'
import {
  ETAPAS_APONTAMENTO,
  etapaApontamento,
  origemCosturaConserto,
  origemCosturaValida,
  responsavelApontamentoValido,
  type EtapaApontamento,
} from '@/lib/apontamento'
import { syncDimPedidoApontamento } from '@/lib/apontamento-fatos'
import {
  apagarApontamentoNuvem,
  criarAlertaApontamentoNuvem,
  gravarApontamentoNuvem,
  listarAlertasApontamentoNuvem,
  marcarAlertaApontamentoNuvemVisto,
  marcarAvisoApontamentoNuvem,
  substituirTotalApontamentoNuvem,
} from '@/lib/apontamento-nuvem'
import {
  marcarSubstituicaoApontamento,
  sincronizarProdutoApontamento,
} from '@/lib/apontamento-sync'
import { enviarAvisoApontamentoWhatsApp } from '@/lib/whatsapp/apontamento-finalizado'
import { EXCEL_ROW_FORA_DA_CARGA } from '@/lib/corte-producao'
import { getApontamentoPedido } from '@/data/apontamento'
import { pedidoDigits } from '@/lib/pedido'
import { clipObs } from '@/lib/obs'
import { resolverProdutoParaIncluir } from '@/lib/produto-manual'

/** Mesma lista/instância do corte (`WHATSAPP_CORTE_TO`). A lista e o alerta continuam se o envio falhar. */
const ENVIO_WHATSAPP_APONTAMENTO_PAUSADO = false

export type SalvarApontamentoInput = {
  etapa: EtapaApontamento
  pedidoNorm: string
  codProduto: string
  excelRow: number
  origem: string
  oficina?: string
  qtdPecas: string
  dataInicio?: string
  dataProducao: string
  responsavel: string
  observacao?: string
  nomeProduto?: string | null
}

export type SalvarApontamentoResult = { ok: true } | { ok: false; error: string }

export type SomarApontamentoResult =
  | { ok: true; total: number }
  | { ok: false; error: string }

export type CorrigirApontamentoResult =
  | { ok: true; total: number }
  | { ok: false; error: string }

export type BuscarProdutoApontamentoResult =
  | {
      ok: true
      precisaDescricao: false
      codProduto: string
      nomeProduto: string | null
    }
  | { ok: true; precisaDescricao: true; codProduto: string }
  | { ok: false; error: string }

const DATA = /^\d{4}-\d{2}-\d{2}$/

function dataValida(value: string) {
  if (!DATA.test(value)) return false
  const [ano, mes, dia] = value.split('-').map(Number)
  const data = new Date(Date.UTC(ano, mes - 1, dia))
  return (
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
  )
}

function dataInicioInformada(value: string | undefined) {
  return (value ?? '').trim()
}

function validarDataInicio(dataInicio: string, dataProducao: string) {
  if (dataInicio && !dataValida(dataInicio)) return 'Data inicial inválida.'
  if (dataInicio && dataProducao && dataInicio > dataProducao) {
    return 'A data inicial não pode ser depois da data de produção.'
  }
  return null
}

/** A data inicial é do produto: todas as somas ficam com o mesmo começo. */
function propagarDataInicio(
  etapa: EtapaApontamento,
  pedidoNorm: string,
  codProduto: string,
  dataInicio: string | null,
  agora: string,
) {
  const tabela = ETAPAS_APONTAMENTO[etapa].tabela
  getSqlite()
    .prepare(
      `UPDATE ${tabela}
       SET data_inicio = ?, atualizado_em = ?
       WHERE pedido_norm = ? AND cod_produto = ?`,
    )
    .run(dataInicio, agora, pedidoNorm, codProduto)
}

function producaoMaisCedo(
  etapa: EtapaApontamento,
  pedidoNorm: string,
  codProduto: string,
  dataProducaoNova: string,
) {
  const tabela = ETAPAS_APONTAMENTO[etapa].tabela
  const origem = etapa === 'costura' ? `AND origem = 'Produção'` : ''
  const row = getSqlite()
    .prepare(
      `SELECT MIN(data_producao) as v FROM ${tabela}
       WHERE pedido_norm = ? AND cod_produto = ?
         AND qtd_pecas IS NOT NULL
         AND data_producao IS NOT NULL AND data_producao != ''
         ${origem}`,
    )
    .get(pedidoNorm, codProduto) as { v: string | null }
  const datas = [row?.v, dataProducaoNova || null].filter((value): value is string => Boolean(value))
  datas.sort()
  return datas[0] ?? null
}

function quantidade(value: string): number | null | 'invalida' {
  const texto = value.trim().replace(',', '.')
  if (!texto) return null
  const numero = Number(texto)
  if (!Number.isFinite(numero) || numero < 0) return 'invalida'
  return numero
}

function oficinaCadastrada(value: string) {
  return Boolean(
    getSqlite().prepare('SELECT 1 as v FROM dim_oficina WHERE oficina = ?').get(value),
  )
}

function semPermissao(etapa: EtapaApontamento) {
  return `Sem permissão para lançar em ${ETAPAS_APONTAMENTO[etapa].titulo}.`
}

/** Invalida só as rotas da etapa — a home atualiza na próxima navegação. */
function revalidateApontamento(etapa: EtapaApontamento) {
  revalidatePath(ETAPAS_APONTAMENTO[etapa].href)
  revalidatePath(ETAPAS_APONTAMENTO[etapa].voltar)
}

export async function buscarProdutoApontamento(
  etapaInformada: string,
  pedidoNorm: string,
  codInformado: string,
  descricaoInformada = '',
): Promise<BuscarProdutoApontamentoResult> {
  const etapa = etapaApontamento(etapaInformada)
  if (!etapa) return { ok: false, error: 'Etapa inválida.' }

  const session = await readSession()
  if (!session || !canAccessPath(ETAPAS_APONTAMENTO[etapa].acesso, session.acessos)) {
    return { ok: false, error: semPermissao(etapa) }
  }

  await ensureCloudDatabase({ light: true })
  const pedido = pedidoDigits(pedidoNorm)
  const resolvido = resolverProdutoParaIncluir(pedido, codInformado, descricaoInformada)
  if (!resolvido.ok || resolvido.precisaDescricao) return resolvido

  const tabela = ETAPAS_APONTAMENTO[etapa].tabela
  const agora = new Date().toISOString()
  getSqlite()
    .prepare(
      `INSERT INTO ${tabela} (
         pedido_norm, cod_produto, excel_row, nome_produto, atualizado_em
       ) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(pedido_norm, cod_produto, excel_row) DO UPDATE SET
         nome_produto = COALESCE(excluded.nome_produto, ${tabela}.nome_produto),
         atualizado_em = excluded.atualizado_em`,
    )
    .run(pedido, resolvido.codProduto, EXCEL_ROW_FORA_DA_CARGA, resolvido.nomeProduto, agora)

  const origemSql = etapa === 'costura' ? 'origem' : 'NULL as origem'
  const oficinaSql = etapa === 'costura' ? 'oficina' : 'NULL as oficina'
  const gravado = getSqlite()
    .prepare(
      `SELECT ${origemSql}, ${oficinaSql}, qtd_pecas as qtdPecas, data_inicio as dataInicio,
              data_producao as dataProducao,
              responsavel, nome_produto as nomeProduto
       FROM ${tabela}
       WHERE pedido_norm = ? AND cod_produto = ? AND excel_row = ?`,
    )
    .get(pedido, resolvido.codProduto, EXCEL_ROW_FORA_DA_CARGA) as {
    origem: string | null
    oficina: string | null
    qtdPecas: number | null
    dataInicio: string | null
    dataProducao: string | null
    responsavel: string | null
    nomeProduto: string | null
  }

  const nuvem = await gravarApontamentoNuvem(etapa, pedido, {
    codProduto: resolvido.codProduto,
    origem: gravado?.origem ?? null,
    oficina: gravado?.oficina ?? null,
    qtdPecas: gravado?.qtdPecas ?? null,
    dataInicio: gravado?.dataInicio ?? null,
        dataProducao: gravado?.dataProducao ?? null,
        responsavel: gravado?.responsavel ?? null,
    observacao: null,
    nomeProduto: gravado?.nomeProduto ?? resolvido.nomeProduto,
  })
  if (!nuvem.ok) {
    return {
      ok: false,
      error: `Incluiu nesta tela. A nuvem não atualizou (${nuvem.error}).`,
    }
  }
  if (pedido) syncDimPedidoApontamento(pedido)
  revalidateApontamento(etapa)
  return resolvido
}

export async function salvarApontamento(
  input: SalvarApontamentoInput,
): Promise<SalvarApontamentoResult> {
  const etapa = etapaApontamento(input.etapa)
  if (!etapa) return { ok: false, error: 'Etapa inválida.' }

  const session = await readSession()
  if (!session || !canAccessPath(ETAPAS_APONTAMENTO[etapa].acesso, session.acessos)) {
    return { ok: false, error: semPermissao(etapa) }
  }

  await ensureCloudDatabase({ light: true })

  const pedidoNorm = pedidoDigits(input.pedidoNorm)
  let codProduto = input.codProduto.trim()
  const excelRow = Number(input.excelRow)
  const foraDaCarga = excelRow === EXCEL_ROW_FORA_DA_CARGA
  if (!pedidoNorm || !codProduto || !Number.isInteger(excelRow) || excelRow < 0) {
    return { ok: false, error: 'Item do pedido inválido.' }
  }

  const qtdPecas = quantidade(input.qtdPecas)
  if (qtdPecas === 'invalida') {
    return { ok: false, error: 'A quantidade precisa ser um número a partir de zero.' }
  }

  const dataProducao = input.dataProducao.trim()
  if (dataProducao && !dataValida(dataProducao)) {
    return { ok: false, error: 'Data de produção inválida.' }
  }
  const dataInicio = dataInicioInformada(input.dataInicio)
  const erroInicio = validarDataInicio(dataInicio, dataProducao)
  if (erroInicio) return { ok: false, error: erroInicio }

  const responsavel = input.responsavel.trim()
  if (responsavel && !responsavelApontamentoValido(etapa, responsavel)) {
    return { ok: false, error: 'Escolha um responsável da lista.' }
  }

  const origem = etapa === 'costura' ? input.origem.trim() : ''
  if (origem && !origemCosturaValida(origem)) {
    return { ok: false, error: 'Escolha uma origem do relatório de Costura.' }
  }
  const conserto = etapa === 'costura' && origemCosturaConserto(origem)
  const oficina = conserto ? (input.oficina?.trim() ?? '') : ''
  if (oficina && !oficinaCadastrada(oficina)) {
    return { ok: false, error: 'Escolha uma oficina da lista de Oficinas.' }
  }
  const observacao = clipObs(input.observacao, 500)
  if (etapa === 'costura' && (qtdPecas != null || dataProducao || responsavel || observacao) && !origem) {
    return { ok: false, error: 'Escolha a origem antes de gravar o lançamento.' }
  }
  if (
    conserto &&
    (qtdPecas != null || dataProducao || responsavel || observacao) &&
    !oficina
  ) {
    return { ok: false, error: 'Em Conserto, escolha a oficina antes de gravar o lançamento.' }
  }

  let nomeProduto: string | null = null
  if (foraDaCarga) {
    const produto = produtoNaBaseItens(codProduto)
    const nomeInformado = input.nomeProduto?.trim() || null
    if (produto) {
      codProduto = produto.codProduto
      nomeProduto = produto.nomeProduto ?? nomeInformado
    } else {
      nomeProduto = nomeInformado
      if (!nomeProduto) {
        const guardado = getSqlite()
          .prepare(
            `SELECT nome_produto as nomeProduto FROM ${ETAPAS_APONTAMENTO[etapa].tabela}
             WHERE pedido_norm = ? AND cod_produto = ?`,
          )
          .get(pedidoNorm, codProduto) as { nomeProduto: string | null } | undefined
        nomeProduto = guardado?.nomeProduto ?? null
      }
      if (!nomeProduto) {
        return { ok: false, error: 'Informe a descrição do produto.' }
      }
    }
  } else {
    const existe = getSqlite()
      .prepare(
        `SELECT 1 as v FROM fato_pedido_item
         WHERE pedido_norm = ? AND cod_produto = ? AND excel_row = ?`,
      )
      .get(pedidoNorm, codProduto, excelRow)
    if (!existe) {
      return { ok: false, error: 'Este item não está na carga do pedido.' }
    }
  }

  const tabela = ETAPAS_APONTAMENTO[etapa].tabela
  const db = getSqlite()
  const vazio =
    qtdPecas == null &&
    !dataInicio &&
    !dataProducao &&
    !responsavel &&
    !origem &&
    !oficina &&
    !observacao

  if (vazio) {
    if (foraDaCarga) {
      db.prepare(
        `UPDATE ${tabela}
         SET qtd_pecas = NULL, data_inicio = NULL, data_producao = NULL, responsavel = NULL,
             aviso_data_producao = NULL, observacao = NULL,
             nome_produto = COALESCE(?, nome_produto), atualizado_em = ?
         WHERE pedido_norm = ? AND cod_produto = ?`,
      ).run(nomeProduto, new Date().toISOString(), pedidoNorm, codProduto)
      if (etapa === 'costura') {
        db.prepare(
          `UPDATE ${tabela}
           SET origem = NULL, oficina = NULL
           WHERE pedido_norm = ? AND cod_produto = ?`,
        ).run(pedidoNorm, codProduto)
      }
      const nuvem = await gravarApontamentoNuvem(etapa, pedidoNorm, {
        codProduto,
        origem: null,
        oficina: null,
        qtdPecas: null,
        dataInicio: null,
        dataProducao: null,
        responsavel: null,
        avisoDataProducao: null,
        observacao: null,
        nomeProduto,
      })
      syncDimPedidoApontamento(pedidoNorm)
      revalidateApontamento(etapa)
      if (!nuvem.ok) {
        return {
          ok: false,
          error: `Limpou nesta tela. A nuvem não atualizou (${nuvem.error}).`,
        }
      }
      return { ok: true }
    }
    db.prepare(`DELETE FROM ${tabela} WHERE pedido_norm = ? AND cod_produto = ?`).run(
      pedidoNorm,
      codProduto,
    )
    const apagado = await apagarApontamentoNuvem(etapa, pedidoNorm, codProduto)
    syncDimPedidoApontamento(pedidoNorm)
    revalidateApontamento(etapa)
    if (!apagado.ok) {
      return {
        ok: false,
        error: `Limpou nesta tela. A nuvem não apagou (${apagado.error}).`,
      }
    }
    return { ok: true }
  }

  if (dataInicio) {
    const fim = producaoMaisCedo(etapa, pedidoNorm, codProduto, dataProducao)
    if (fim && dataInicio > fim) {
      return { ok: false, error: 'A data inicial não pode ser depois da data de produção.' }
    }
  }

  const agora = new Date().toISOString()
  if (etapa === 'costura') {
    db.prepare(
      `INSERT INTO ${tabela} (
         pedido_norm, cod_produto, excel_row, origem, oficina, qtd_pecas, data_inicio, data_producao,
         responsavel, observacao, nome_produto, atualizado_em
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(pedido_norm, cod_produto, excel_row) DO UPDATE SET
         origem = excluded.origem,
         oficina = excluded.oficina,
         qtd_pecas = excluded.qtd_pecas,
         data_inicio = excluded.data_inicio,
         data_producao = excluded.data_producao,
         responsavel = excluded.responsavel,
         observacao = excluded.observacao,
         nome_produto = COALESCE(excluded.nome_produto, ${tabela}.nome_produto),
         atualizado_em = excluded.atualizado_em`,
    ).run(
      pedidoNorm,
      codProduto,
      excelRow,
      origem || null,
      oficina || null,
      qtdPecas,
      dataInicio || null,
      dataProducao || null,
      responsavel || null,
      observacao,
      nomeProduto,
      agora,
    )
  } else {
    db.prepare(
      `INSERT INTO ${tabela} (
         pedido_norm, cod_produto, excel_row, qtd_pecas, data_inicio, data_producao,
         responsavel, observacao, nome_produto, atualizado_em
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(pedido_norm, cod_produto, excel_row) DO UPDATE SET
         qtd_pecas = excluded.qtd_pecas,
         data_inicio = excluded.data_inicio,
         data_producao = excluded.data_producao,
         responsavel = excluded.responsavel,
         observacao = excluded.observacao,
         nome_produto = COALESCE(excluded.nome_produto, ${tabela}.nome_produto),
         atualizado_em = excluded.atualizado_em`,
    ).run(
      pedidoNorm,
      codProduto,
      excelRow,
      qtdPecas,
      dataInicio || null,
      dataProducao || null,
      responsavel || null,
      observacao,
      nomeProduto,
      agora,
    )
  }
  propagarDataInicio(etapa, pedidoNorm, codProduto, dataInicio || null, agora)

  const nuvem = await gravarApontamentoNuvem(etapa, pedidoNorm, {
    codProduto,
    origem: origem || null,
    oficina: oficina || null,
    qtdPecas,
    dataInicio: dataInicio || null,
    dataProducao: dataProducao || null,
    responsavel: responsavel || null,
    observacao,
    nomeProduto,
    excelRow,
  })
  if (nuvem.ok) {
    await sincronizarProdutoApontamento(etapa, pedidoNorm, codProduto, { skipPull: true })
  }
  syncDimPedidoApontamento(pedidoNorm)
  revalidateApontamento(etapa)
  if (!nuvem.ok) {
    return {
      ok: false,
      error: `Gravou nesta tela, mas a nuvem não atualizou (${nuvem.error}). Ao reabrir, os campos podem voltar vazios.`,
    }
  }
  return { ok: true }
}

/**
 * Soma uma quantidade nova no produto, com a data informada (pode ser outro dia).
 * Não substitui lançamentos anteriores do mesmo código.
 */
export async function somarApontamento(
  input: SalvarApontamentoInput,
): Promise<SomarApontamentoResult> {
  const etapa = etapaApontamento(input.etapa)
  if (!etapa) return { ok: false, error: 'Etapa inválida.' }

  const session = await readSession()
  if (!session || !canAccessPath(ETAPAS_APONTAMENTO[etapa].acesso, session.acessos)) {
    return { ok: false, error: semPermissao(etapa) }
  }

  await ensureCloudDatabase({ light: true })

  const pedidoNorm = pedidoDigits(input.pedidoNorm)
  let codProduto = input.codProduto.trim()
  if (!pedidoNorm || !codProduto) {
    return { ok: false, error: 'Item do pedido inválido.' }
  }

  const qtdPecas = quantidade(input.qtdPecas)
  if (qtdPecas === 'invalida' || qtdPecas == null || qtdPecas <= 0) {
    return { ok: false, error: 'Informe a quantidade a somar (maior que zero).' }
  }

  const dataProducao = input.dataProducao.trim()
  if (!dataProducao || !dataValida(dataProducao)) {
    return { ok: false, error: 'Informe a data de produção deste lançamento.' }
  }
  const dataInicio = dataInicioInformada(input.dataInicio)
  const erroInicio = validarDataInicio(dataInicio, dataProducao)
  if (erroInicio) return { ok: false, error: erroInicio }

  const responsavel = input.responsavel.trim()
  if (!responsavel || !responsavelApontamentoValido(etapa, responsavel)) {
    return { ok: false, error: 'Escolha um responsável da lista.' }
  }

  const origem = etapa === 'costura' ? input.origem.trim() : ''
  if (etapa === 'costura' && !origemCosturaValida(origem)) {
    return { ok: false, error: 'Escolha a origem antes de somar.' }
  }
  const conserto = etapa === 'costura' && origemCosturaConserto(origem)
  const oficina = conserto ? (input.oficina?.trim() ?? '') : ''
  if (conserto && !oficinaCadastrada(oficina)) {
    return { ok: false, error: 'Em Conserto, escolha a oficina antes de somar.' }
  }
  if (etapa === 'costura' && !origem) {
    return { ok: false, error: 'Escolha a origem antes de somar.' }
  }

  const observacao = clipObs(input.observacao, 500)
  const excelRowBase = Number(input.excelRow)
  const foraDaCarga = excelRowBase === EXCEL_ROW_FORA_DA_CARGA
  let nomeProduto: string | null = null
  if (foraDaCarga) {
    const produto = produtoNaBaseItens(codProduto)
    const nomeInformado = input.nomeProduto?.trim() || null
    if (produto) {
      codProduto = produto.codProduto
      nomeProduto = produto.nomeProduto ?? nomeInformado
    } else {
      nomeProduto = nomeInformado
      if (!nomeProduto) {
        const guardado = getSqlite()
          .prepare(
            `SELECT nome_produto as nomeProduto FROM ${ETAPAS_APONTAMENTO[etapa].tabela}
             WHERE pedido_norm = ? AND cod_produto = ?
             ORDER BY atualizado_em DESC LIMIT 1`,
          )
          .get(pedidoNorm, codProduto) as { nomeProduto: string | null } | undefined
        nomeProduto = guardado?.nomeProduto ?? null
      }
      if (!nomeProduto) {
        return { ok: false, error: 'Informe a descrição do produto.' }
      }
    }
  } else {
    const existe = getSqlite()
      .prepare(
        `SELECT 1 as v FROM fato_pedido_item
         WHERE pedido_norm = ? AND cod_produto = ? AND excel_row = ?`,
      )
      .get(pedidoNorm, codProduto, excelRowBase)
    if (!existe) {
      return { ok: false, error: 'Este item não está na carga do pedido.' }
    }
  }

  const tabela = ETAPAS_APONTAMENTO[etapa].tabela
  const db = getSqlite()
  if (dataInicio) {
    const fim = producaoMaisCedo(etapa, pedidoNorm, codProduto, dataProducao)
    if (fim && dataInicio > fim) {
      return { ok: false, error: 'A data inicial não pode ser depois da data de produção.' }
    }
  }
  const agora = new Date().toISOString()
  let excelRowNovo = -Date.now()
  while (
    db
      .prepare(
        `SELECT 1 as v FROM ${tabela}
         WHERE pedido_norm = ? AND cod_produto = ? AND excel_row = ?`,
      )
      .get(pedidoNorm, codProduto, excelRowNovo)
  ) {
    excelRowNovo -= 1
  }

  if (etapa === 'costura') {
    db.prepare(
      `INSERT INTO ${tabela} (
         pedido_norm, cod_produto, excel_row, origem, oficina, qtd_pecas, data_inicio, data_producao,
         responsavel, observacao, nome_produto, atualizado_em
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      pedidoNorm,
      codProduto,
      excelRowNovo,
      origem || null,
      oficina || null,
      qtdPecas,
      dataInicio || null,
      dataProducao,
      responsavel,
      observacao,
      nomeProduto,
      agora,
    )
  } else {
    db.prepare(
      `INSERT INTO ${tabela} (
         pedido_norm, cod_produto, excel_row, qtd_pecas, data_inicio, data_producao,
         responsavel, observacao, nome_produto, atualizado_em
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      pedidoNorm,
      codProduto,
      excelRowNovo,
      qtdPecas,
      dataInicio || null,
      dataProducao,
      responsavel,
      observacao,
      nomeProduto,
      agora,
    )
  }
  propagarDataInicio(etapa, pedidoNorm, codProduto, dataInicio || null, agora)

  // Publica na nuvem sem re-baixar o pedido (total já está no SQLite).
  const sync = await sincronizarProdutoApontamento(etapa, pedidoNorm, codProduto, {
    skipPull: true,
  })
  syncDimPedidoApontamento(pedidoNorm)
  revalidateApontamento(etapa)
  if (!sync.ok) {
    return {
      ok: false,
      error: `Somou nesta tela, mas a nuvem não atualizou (${sync.error}). Ao reabrir, o total pode ficar incompleto.`,
    }
  }
  return { ok: true, total: sync.total }
}

/**
 * Corrige erro de digitação: substitui o total do produto (todas as somas)
 * pelo valor informado. Zero apaga o lançamento deste produto no pedido.
 */
export async function corrigirApontamento(
  input: SalvarApontamentoInput,
): Promise<CorrigirApontamentoResult> {
  const etapa = etapaApontamento(input.etapa)
  if (!etapa) return { ok: false, error: 'Etapa inválida.' }

  const session = await readSession()
  if (!session || !canAccessPath(ETAPAS_APONTAMENTO[etapa].acesso, session.acessos)) {
    return { ok: false, error: semPermissao(etapa) }
  }

  await ensureCloudDatabase({ light: true })

  const pedidoNorm = pedidoDigits(input.pedidoNorm)
  let codProduto = input.codProduto.trim()
  if (!pedidoNorm || !codProduto) {
    return { ok: false, error: 'Item do pedido inválido.' }
  }

  const qtdPecas = quantidade(input.qtdPecas)
  if (qtdPecas === 'invalida') {
    return { ok: false, error: 'A quantidade precisa ser um número a partir de zero.' }
  }
  if (qtdPecas == null) {
    return { ok: false, error: 'Informe o novo total (ou zero para apagar).' }
  }

  const zerar = qtdPecas === 0
  const dataProducao = input.dataProducao.trim()
  const dataInicio = dataInicioInformada(input.dataInicio)
  const responsavel = input.responsavel.trim()
  const origem = etapa === 'costura' ? input.origem.trim() : ''
  const conserto = etapa === 'costura' && origemCosturaConserto(origem)
  const oficina = conserto ? (input.oficina?.trim() ?? '') : ''
  const observacao = clipObs(input.observacao, 500)

  if (!zerar) {
    if (!dataProducao || !dataValida(dataProducao)) {
      return { ok: false, error: 'Informe a data de produção desta correção.' }
    }
    const erroInicio = validarDataInicio(dataInicio, dataProducao)
    if (erroInicio) return { ok: false, error: erroInicio }
    if (!responsavel || !responsavelApontamentoValido(etapa, responsavel)) {
      return { ok: false, error: 'Escolha um responsável da lista.' }
    }
    if (etapa === 'costura' && !origemCosturaValida(origem)) {
      return { ok: false, error: 'Escolha a origem antes de corrigir.' }
    }
    if (conserto && !oficinaCadastrada(oficina)) {
      return { ok: false, error: 'Em Conserto, escolha a oficina antes de corrigir.' }
    }
  }

  const excelRowBase = Number(input.excelRow)
  const foraDaCarga = excelRowBase === EXCEL_ROW_FORA_DA_CARGA
  let nomeProduto: string | null = null
  if (foraDaCarga) {
    const produto = produtoNaBaseItens(codProduto)
    const nomeInformado = input.nomeProduto?.trim() || null
    if (produto) {
      codProduto = produto.codProduto
      nomeProduto = produto.nomeProduto ?? nomeInformado
    } else {
      nomeProduto = nomeInformado
      if (!nomeProduto) {
        const guardado = getSqlite()
          .prepare(
            `SELECT nome_produto as nomeProduto FROM ${ETAPAS_APONTAMENTO[etapa].tabela}
             WHERE pedido_norm = ? AND cod_produto = ?
             ORDER BY atualizado_em DESC LIMIT 1`,
          )
          .get(pedidoNorm, codProduto) as { nomeProduto: string | null } | undefined
        nomeProduto = guardado?.nomeProduto ?? null
      }
      if (!nomeProduto && !zerar) {
        return { ok: false, error: 'Informe a descrição do produto.' }
      }
    }
  } else {
    const existe = getSqlite()
      .prepare(
        `SELECT 1 as v FROM fato_pedido_item
         WHERE pedido_norm = ? AND cod_produto = ? AND excel_row = ?`,
      )
      .get(pedidoNorm, codProduto, excelRowBase)
    if (!existe) {
      // Depois de várias somas o excel_row da tela pode ser o da última entrada,
      // não o da carga — ainda assim a correção vale se já houver lançamento.
      const temLancamento = getSqlite()
        .prepare(
          `SELECT 1 as v FROM ${ETAPAS_APONTAMENTO[etapa].tabela}
           WHERE pedido_norm = ? AND cod_produto = ? LIMIT 1`,
        )
        .get(pedidoNorm, codProduto)
      if (!temLancamento) {
        return { ok: false, error: 'Este item não está na carga do pedido.' }
      }
    }
  }

  const tabela = ETAPAS_APONTAMENTO[etapa].tabela
  const db = getSqlite()
  if (!nomeProduto) {
    const guardado = db
      .prepare(
        `SELECT nome_produto as nomeProduto FROM ${tabela}
         WHERE pedido_norm = ? AND cod_produto = ?
         ORDER BY atualizado_em DESC LIMIT 1`,
      )
      .get(pedidoNorm, codProduto) as { nomeProduto: string | null } | undefined
    nomeProduto = guardado?.nomeProduto ?? input.nomeProduto?.trim() ?? null
  }

  db.prepare(`DELETE FROM ${tabela} WHERE pedido_norm = ? AND cod_produto = ?`).run(
    pedidoNorm,
    codProduto,
  )

  if (zerar) {
    const nuvem = await substituirTotalApontamentoNuvem(etapa, pedidoNorm, {
      excelRow: 0,
      codProduto,
      origem: null,
      oficina: null,
      qtdPecas: null,
      dataInicio: null,
      dataProducao: null,
      responsavel: null,
      observacao: null,
      nomeProduto,
    })
    if (nuvem.ok) {
      // Não mesclar depois: unir com leitura atrasada da nuvem recria o total antigo.
      marcarSubstituicaoApontamento(etapa, pedidoNorm, codProduto)
    }
    syncDimPedidoApontamento(pedidoNorm)
    revalidateApontamento(etapa)
    if (!nuvem.ok) {
      return {
        ok: false,
        error: `Zerou nesta tela, mas a nuvem não atualizou (${nuvem.error}). Ao reabrir, o total pode voltar.`,
      }
    }
    return { ok: true, total: 0 }
  }

  const agora = new Date().toISOString()
  let excelRowNovo = -Date.now()
  while (
    db
      .prepare(
        `SELECT 1 as v FROM ${tabela}
         WHERE pedido_norm = ? AND cod_produto = ? AND excel_row = ?`,
      )
      .get(pedidoNorm, codProduto, excelRowNovo)
  ) {
    excelRowNovo -= 1
  }

  if (etapa === 'costura') {
    db.prepare(
      `INSERT INTO ${tabela} (
         pedido_norm, cod_produto, excel_row, origem, oficina, qtd_pecas, data_inicio, data_producao,
         responsavel, observacao, nome_produto, atualizado_em
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      pedidoNorm,
      codProduto,
      excelRowNovo,
      origem || null,
      oficina || null,
      qtdPecas,
      dataInicio || null,
      dataProducao,
      responsavel,
      observacao,
      nomeProduto,
      agora,
    )
  } else {
    db.prepare(
      `INSERT INTO ${tabela} (
         pedido_norm, cod_produto, excel_row, qtd_pecas, data_inicio, data_producao,
         responsavel, observacao, nome_produto, atualizado_em
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      pedidoNorm,
      codProduto,
      excelRowNovo,
      qtdPecas,
      dataInicio || null,
      dataProducao,
      responsavel,
      observacao,
      nomeProduto,
      agora,
    )
  }

  // Só substitui na nuvem — NÃO chamar sincronizarProduto/mesclar depois:
  // unir entradas locais com uma leitura atrasada da nuvem somava o total
  // antigo + a correção (ex.: 370 + 178 = 548).
  const nuvem = await substituirTotalApontamentoNuvem(etapa, pedidoNorm, {
    excelRow: excelRowNovo,
    codProduto,
    origem: origem || null,
    oficina: oficina || null,
    qtdPecas,
    dataInicio: dataInicio || null,
    dataProducao,
    responsavel,
    observacao,
    nomeProduto,
  })
  if (nuvem.ok) {
    marcarSubstituicaoApontamento(etapa, pedidoNorm, codProduto)
  }
  syncDimPedidoApontamento(pedidoNorm)
  revalidateApontamento(etapa)
  if (!nuvem.ok) {
    return {
      ok: false,
      error: `Corrigiu nesta tela, mas a nuvem não atualizou (${nuvem.error}). Ao reabrir, o total pode voltar ao valor antigo.`,
    }
  }
  return { ok: true, total: qtdPecas }
}

/** Grava só a data inicial do produto, sem somar quantidade. */
export async function gravarDataInicioApontamento(
  input: SalvarApontamentoInput,
): Promise<SalvarApontamentoResult> {
  const etapa = etapaApontamento(input.etapa)
  if (!etapa) return { ok: false, error: 'Etapa inválida.' }

  const session = await readSession()
  if (!session || !canAccessPath(ETAPAS_APONTAMENTO[etapa].acesso, session.acessos)) {
    return { ok: false, error: semPermissao(etapa) }
  }

  await ensureCloudDatabase({ light: true })

  const pedidoNorm = pedidoDigits(input.pedidoNorm)
  let codProduto = input.codProduto.trim()
  if (!pedidoNorm || !codProduto) return { ok: false, error: 'Item do pedido inválido.' }

  const dataInicio = dataInicioInformada(input.dataInicio)
  if (dataInicio && !dataValida(dataInicio)) {
    return { ok: false, error: 'Data inicial inválida.' }
  }

  const tabela = ETAPAS_APONTAMENTO[etapa].tabela
  const db = getSqlite()
  const existentes = db
    .prepare(
      `SELECT COUNT(*) as v FROM ${tabela} WHERE pedido_norm = ? AND cod_produto = ?`,
    )
    .get(pedidoNorm, codProduto) as { v: number }

  if (dataInicio && existentes.v > 0) {
    const fim = producaoMaisCedo(etapa, pedidoNorm, codProduto, '')
    if (fim && dataInicio > fim) {
      return { ok: false, error: 'A data inicial não pode ser depois da data de produção.' }
    }
  }

  const agora = new Date().toISOString()
  const limpando = !dataInicio && existentes.v > 0
  if (existentes.v > 0) {
    propagarDataInicio(etapa, pedidoNorm, codProduto, dataInicio || null, agora)
  } else if (dataInicio) {
    const excelRowBase = Number(input.excelRow)
    const excelRow = Number.isInteger(excelRowBase) && excelRowBase >= 0 ? excelRowBase : 0
    const origem = etapa === 'costura' ? input.origem.trim() : ''
    if (etapa === 'costura' && !origemCosturaValida(origem)) {
      return { ok: false, error: 'Escolha a origem antes de gravar a data inicial.' }
    }
    const conserto = etapa === 'costura' && origemCosturaConserto(origem)
    const oficina = conserto ? (input.oficina?.trim() ?? '') : ''
    if (conserto && !oficinaCadastrada(oficina)) {
      return { ok: false, error: 'Em Conserto, escolha a oficina antes de gravar a data inicial.' }
    }
    let nomeProduto = input.nomeProduto?.trim() || null
    if (!nomeProduto) {
      const produto = produtoNaBaseItens(codProduto)
      if (produto) {
        codProduto = produto.codProduto
        nomeProduto = produto.nomeProduto
      }
    }
    if (etapa === 'costura') {
      db.prepare(
        `INSERT INTO ${tabela} (
           pedido_norm, cod_produto, excel_row, origem, oficina, qtd_pecas, data_inicio,
           data_producao, responsavel, observacao, nome_produto, atualizado_em
         ) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, ?, ?)`,
      ).run(pedidoNorm, codProduto, excelRow, origem, oficina || null, dataInicio, nomeProduto, agora)
    } else {
      db.prepare(
        `INSERT INTO ${tabela} (
           pedido_norm, cod_produto, excel_row, qtd_pecas, data_inicio, data_producao,
           responsavel, observacao, nome_produto, atualizado_em
         ) VALUES (?, ?, ?, NULL, ?, NULL, NULL, NULL, ?, ?)`,
      ).run(pedidoNorm, codProduto, excelRow, dataInicio, nomeProduto, agora)
    }
  } else {
    return { ok: true }
  }

  const sync = await sincronizarProdutoApontamento(etapa, pedidoNorm, codProduto, {
    skipPull: true,
    incluirVazios: limpando,
  })
  if (limpando && sync.ok) {
    const oficinaVazia = etapa === 'costura' ? `AND (oficina IS NULL OR oficina = '')` : ''
    db.prepare(
      `DELETE FROM ${tabela}
       WHERE pedido_norm = ? AND cod_produto = ?
         AND qtd_pecas IS NULL
         AND (data_inicio IS NULL OR data_inicio = '')
         AND (data_producao IS NULL OR data_producao = '')
         AND (responsavel IS NULL OR responsavel = '')
         AND (observacao IS NULL OR observacao = '')
         ${oficinaVazia}`,
    ).run(pedidoNorm, codProduto)
  }
  syncDimPedidoApontamento(pedidoNorm)
  revalidateApontamento(etapa)
  if (!sync.ok) {
    return {
      ok: false,
      error: `Gravou a data inicial nesta tela, mas a nuvem não atualizou (${sync.error}).`,
    }
  }
  return { ok: true }
}

export type SalvarListaApontamentoResult =
  | {
      ok: true
      salvos: number
      itens: { codProduto: string; dataProducao: string }[]
      aviso: string
    }
  | { ok: false; error: string }

function tabelasAlerta(etapa: EtapaApontamento) {
  return etapa === 'costura'
    ? {
        alerta: 'costura_producao_alerta',
        item: 'costura_producao_alerta_item',
        listaNome: 'lista de costura',
      }
    : {
        alerta: 'revisao_alerta',
        item: 'revisao_alerta_item',
        listaNome: 'lista de revisão',
      }
}

export async function salvarListaApontamento(
  etapaInformada: string,
  pedidoInformado: string,
  codProdutoInformado?: string,
): Promise<SalvarListaApontamentoResult> {
  const etapa = etapaApontamento(etapaInformada)
  if (!etapa) return { ok: false, error: 'Etapa inválida.' }

  const session = await readSession()
  if (!session || !canAccessPath(ETAPAS_APONTAMENTO[etapa].acesso, session.acessos)) {
    return { ok: false, error: semPermissao(etapa) }
  }

  await ensureCloudDatabase({ light: true })
  const consulta = await getApontamentoPedido(etapa, pedidoInformado, 'local')
  const pedidoNorm = consulta.pedidoNorm
  if (!consulta.loaded || !pedidoNorm || !consulta.itens.length) {
    return { ok: false, error: 'Pedido sem itens para a lista.' }
  }

  const codFiltro = codProdutoInformado?.trim().replaceAll(' ', '').toLocaleLowerCase('pt-BR') || ''
  const tabelaLanc = ETAPAS_APONTAMENTO[etapa].tabela
  const origemSql = etapa === 'costura' ? 'origem' : 'NULL as origem'
  const oficinaSql = etapa === 'costura' ? 'oficina' : 'NULL as oficina'
  const linhasPendentes = getSqlite()
    .prepare(
      `SELECT excel_row as excelRow, cod_produto as codProduto,
              nome_produto as nomeProduto, ${origemSql}, ${oficinaSql},
              qtd_pecas as qtdPecas, data_inicio as dataInicio, data_producao as dataProducao,
              responsavel, observacao
       FROM ${tabelaLanc}
       WHERE pedido_norm = ?
         AND qtd_pecas IS NOT NULL
         AND data_producao IS NOT NULL
         AND responsavel IS NOT NULL
         AND (aviso_data_producao IS NULL OR aviso_data_producao != data_producao)
       ORDER BY atualizado_em DESC`,
    )
    .all(pedidoNorm) as {
    excelRow: number
    codProduto: string
    nomeProduto: string | null
    origem: string | null
    oficina: string | null
    qtdPecas: number | null
    dataInicio: string | null
    dataProducao: string
    responsavel: string | null
    observacao: string | null
  }[]

  const pendentes: {
    excelRow: number
    codProduto: string
    nomeProduto: string | null
    origem: string | null
    oficina: string | null
    qtdPecas: number | null
    dataInicio: string | null
    dataProducao: string
    responsavel: string | null
    observacao: string | null
  }[] = []
  const vistos = new Set<string>()

  for (const item of linhasPendentes) {
    if (codFiltro) {
      const chave = item.codProduto.trim().replaceAll(' ', '').toLocaleLowerCase('pt-BR')
      if (chave !== codFiltro) continue
    }
    // Produção e serviços (etiqueta, festonê, conserto) entram na lista; o funil
    // continua filtrando só Produção nos KPIs.
    if (etapa === 'costura' && !origemCosturaValida(item.origem ?? '')) continue
    // Um aviso por produto+data (várias somas no mesmo dia entram juntas).
    const chaveAviso = `${item.codProduto}\0${item.dataProducao}`
    if (vistos.has(chaveAviso)) continue
    vistos.add(chaveAviso)
    const nomeLista =
      item.nomeProduto ??
      consulta.itens.find((row) => row.codProduto === item.codProduto)?.nomeProduto ??
      null
    pendentes.push({
      ...item,
      nomeProduto: nomeLista,
    })
  }

  const { listaNome, alerta: tabelaAlerta, item: tabelaItem } = tabelasAlerta(etapa)

  if (!pendentes.length) {
    const foco = codFiltro ? 'este item' : 'a lista'
    return {
      ok: true,
      salvos: 0,
      itens: [],
      aviso:
        etapa === 'costura'
          ? `Nenhum item novo para ${foco}. Preencha origem, qtd, data e responsável e salve de novo.`
          : `Nenhum item novo para ${foco}. Preencha qtd, data e responsável e salve de novo.`,
    }
  }

  const avisoPayload = {
    pedidoNorm,
    cliente: consulta.cliente,
    itens: pendentes.map((item) => ({
      codProduto: item.codProduto,
      nomeProduto: item.nomeProduto,
      qtdPecas: item.qtdPecas,
      dataProducao: item.dataProducao,
      responsavel: item.responsavel,
      origem: item.origem,
      observacao: item.observacao,
    })),
  }

  const db = getSqlite()
  const enviadoEm = new Date().toISOString()
  const alertaId = `${etapa}-${pedidoNorm}-${Date.now()}`
  const tabela = ETAPAS_APONTAMENTO[etapa].tabela
  const marcar = db.prepare(
    `UPDATE ${tabela}
     SET aviso_data_producao = ?, atualizado_em = ?
     WHERE pedido_norm = ? AND cod_produto = ? AND data_producao = ?`,
  )
  const garantir =
    etapa === 'costura'
      ? db.prepare(
          `INSERT INTO ${tabela} (
             pedido_norm, cod_produto, excel_row, origem, qtd_pecas, data_producao,
             responsavel, aviso_data_producao, nome_produto, atualizado_em
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(pedido_norm, cod_produto, excel_row) DO UPDATE SET
             aviso_data_producao = excluded.aviso_data_producao,
             atualizado_em = excluded.atualizado_em`,
        )
      : db.prepare(
          `INSERT INTO ${tabela} (
             pedido_norm, cod_produto, excel_row, qtd_pecas, data_producao,
             responsavel, aviso_data_producao, nome_produto, atualizado_em
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(pedido_norm, cod_produto, excel_row) DO UPDATE SET
             aviso_data_producao = excluded.aviso_data_producao,
             atualizado_em = excluded.atualizado_em`,
        )
  const criarAlerta = db.prepare(
    `INSERT INTO ${tabelaAlerta} (pedido_norm, cliente, enviado_em)
     VALUES (?, ?, ?)`,
  )
  const criarItem =
    etapa === 'costura'
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

  const gravar = db.transaction(() => {
    for (const item of pendentes) {
      const atualizado = marcar.run(
        item.dataProducao,
        enviadoEm,
        pedidoNorm,
        item.codProduto,
        item.dataProducao,
      )
      if (atualizado.changes === 0) {
        if (etapa === 'costura') {
          garantir.run(
            pedidoNorm,
            item.codProduto,
            item.excelRow,
            item.origem,
            item.qtdPecas,
            item.dataProducao,
            item.responsavel,
            item.dataProducao,
            item.nomeProduto,
            enviadoEm,
          )
        } else {
          garantir.run(
            pedidoNorm,
            item.codProduto,
            item.excelRow,
            item.qtdPecas,
            item.dataProducao,
            item.responsavel,
            item.dataProducao,
            item.nomeProduto,
            enviadoEm,
          )
        }
      }
    }
    const alerta = criarAlerta.run(pedidoNorm, consulta.cliente, enviadoEm)
    const alertaLocal = Number(alerta.lastInsertRowid)
    for (const item of pendentes) {
      if (etapa === 'costura') {
        criarItem.run(
          alertaLocal,
          item.codProduto,
          item.nomeProduto,
          item.qtdPecas,
          item.dataProducao,
          item.responsavel,
          item.origem,
        )
      } else {
        criarItem.run(
          alertaLocal,
          item.codProduto,
          item.nomeProduto,
          item.qtdPecas,
          item.dataProducao,
          item.responsavel,
        )
      }
    }
  })
  gravar()

  const falhasNuvem: string[] = []
  const avisosNuvem = await Promise.all(
    pendentes.map((item) =>
      marcarAvisoApontamentoNuvem(etapa, pedidoNorm, item.codProduto, item.dataProducao, {
        codProduto: item.codProduto,
        origem: item.origem,
        oficina: item.oficina ?? null,
        qtdPecas: item.qtdPecas,
        dataInicio: item.dataInicio,
        dataProducao: item.dataProducao,
        responsavel: item.responsavel,
        observacao: item.observacao,
        nomeProduto: item.nomeProduto,
      }),
    ),
  )
  for (const marcado of avisosNuvem) {
    if (!marcado.ok) falhasNuvem.push(marcado.error)
  }
  const alertaNuvem = await criarAlertaApontamentoNuvem(etapa, {
    id: alertaId,
    pedidoNorm,
    cliente: consulta.cliente,
    enviadoEm,
    vistoEm: null,
    itens: avisoPayload.itens,
  })
  if (!alertaNuvem.ok) falhasNuvem.push(alertaNuvem.error)

  const avisosEnvio: string[] = []
  if (!ENVIO_WHATSAPP_APONTAMENTO_PAUSADO) {
    try {
      await enviarAvisoApontamentoWhatsApp({ ...avisoPayload, etapa })
    } catch (error) {
      const detalhe = error instanceof Error ? error.message : String(error)
      console.error('aviso de apontamento WhatsApp não enviado', etapa, pedidoNorm, detalhe)
      avisosEnvio.push(`O WhatsApp não saiu (${detalhe.slice(0, 140)}).`)
    }
  }

  revalidateApontamento(etapa)

  const salvos = pendentes.length
  const base =
    salvos === 1
      ? `1 item entrou na ${listaNome}. O alerta ficou na Visão Geral.`
      : `${salvos} itens entraram na ${listaNome}. O alerta ficou na Visão Geral.`
  const extras: string[] = []
  if (falhasNuvem.length) {
    extras.push(
      `A nuvem não gravou a lista (${falhasNuvem[0]}). Ao reabrir, pode parecer que o item não entrou.`,
    )
  }
  extras.push(...avisosEnvio)
  return {
    ok: true,
    salvos,
    itens: pendentes.map((item) => ({
      codProduto: item.codProduto,
      dataProducao: item.dataProducao,
    })),
    aviso: extras.length ? `${base} ${extras.join(' ')}` : base,
  }
}

export async function marcarAlertaApontamentoVisto(
  etapaInformada: string,
  alertaId: string,
) {
  const etapa = etapaApontamento(etapaInformada)
  if (!etapa) return { ok: false as const, error: 'Etapa inválida.' }

  const session = await readSession()
  if (!session || !canAccessPath('/', session.acessos)) {
    return { ok: false as const, error: 'Sem permissão para marcar o alerta como visto.' }
  }
  const id = alertaId.trim()
  if (!id || id.length > 80) {
    return { ok: false as const, error: 'Alerta inválido.' }
  }
  await ensureCloudDatabase({ light: true })
  const vistoEm = new Date().toISOString()
  const { alerta: tabelaAlerta } = tabelasAlerta(etapa)
  const db = getSqlite()

  let pedidoNorm: string | null = null
  let enviadoEm: string | null = null

  if (/^\d+$/.test(id)) {
    const row = db
      .prepare(
        `SELECT pedido_norm as pedidoNorm, enviado_em as enviadoEm
         FROM ${tabelaAlerta}
         WHERE id = ?`,
      )
      .get(Number(id)) as { pedidoNorm: string; enviadoEm: string } | undefined
    if (row) {
      pedidoNorm = row.pedidoNorm
      enviadoEm = row.enviadoEm
    }
  }

  try {
    const alertasNuvem = await listarAlertasApontamentoNuvem(etapa)
    const alvo =
      alertasNuvem.find((alerta) => alerta.id === id) ??
      (pedidoNorm && enviadoEm
        ? alertasNuvem.find(
            (alerta) =>
              alerta.pedidoNorm === pedidoNorm && alerta.enviadoEm === enviadoEm,
          )
        : undefined)
    if (alvo) {
      pedidoNorm = alvo.pedidoNorm
      enviadoEm = alvo.enviadoEm
    }
    const idsNuvem = new Set<string>()
    if (alvo) idsNuvem.add(alvo.id)
    for (const alerta of alertasNuvem) {
      if (
        pedidoNorm &&
        enviadoEm &&
        alerta.pedidoNorm === pedidoNorm &&
        alerta.enviadoEm === enviadoEm
      ) {
        idsNuvem.add(alerta.id)
      }
    }
    if (!alvo) idsNuvem.add(id)
    for (const nuvemId of idsNuvem) {
      const nuvem = await marcarAlertaApontamentoNuvemVisto(etapa, nuvemId)
      if (!nuvem.ok) {
        return {
          ok: false as const,
          error: nuvem.error ?? 'Não marcou o alerta na nuvem.',
        }
      }
    }
  } catch (error) {
    console.error('marcar alerta de apontamento na nuvem falhou', etapa, error)
  }

  // Local e nuvem usam IDs diferentes; fecha os dois pelo pedido + horário do envio.
  if (pedidoNorm && enviadoEm) {
    db.prepare(
      `UPDATE ${tabelaAlerta}
       SET visto_em = ?
       WHERE pedido_norm = ? AND enviado_em = ? AND visto_em IS NULL`,
    ).run(vistoEm, pedidoNorm, enviadoEm)
  } else if (/^\d+$/.test(id)) {
    db.prepare(
      `UPDATE ${tabelaAlerta}
       SET visto_em = ?
       WHERE id = ? AND visto_em IS NULL`,
    ).run(vistoEm, Number(id))
  }

  revalidatePath('/')
  return { ok: true as const }
}
