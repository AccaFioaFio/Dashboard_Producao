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
  origemCosturaValida,
  responsavelApontamentoValido,
  type EtapaApontamento,
} from '@/lib/apontamento'
import {
  apagarApontamentoNuvem,
  gravarApontamentoNuvem,
} from '@/lib/apontamento-nuvem'
import { EXCEL_ROW_FORA_DA_CARGA } from '@/lib/corte-producao'
import { pedidoDigits } from '@/lib/pedido'
import { resolverProdutoParaIncluir } from '@/lib/produto-manual'

export type SalvarApontamentoInput = {
  etapa: EtapaApontamento
  pedidoNorm: string
  codProduto: string
  excelRow: number
  origem: string
  qtdPecas: string
  dataProducao: string
  responsavel: string
  nomeProduto?: string | null
}

export type SalvarApontamentoResult = { ok: true } | { ok: false; error: string }

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

function quantidade(value: string): number | null | 'invalida' {
  const texto = value.trim().replace(',', '.')
  if (!texto) return null
  const numero = Number(texto)
  if (!Number.isFinite(numero) || numero < 0) return 'invalida'
  return numero
}

function semPermissao(etapa: EtapaApontamento) {
  return `Sem permissão para lançar em ${ETAPAS_APONTAMENTO[etapa].titulo}.`
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

  await ensureCloudDatabase()
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
  const gravado = getSqlite()
    .prepare(
      `SELECT ${origemSql}, qtd_pecas as qtdPecas, data_producao as dataProducao,
              responsavel, nome_produto as nomeProduto
       FROM ${tabela}
       WHERE pedido_norm = ? AND cod_produto = ? AND excel_row = ?`,
    )
    .get(pedido, resolvido.codProduto, EXCEL_ROW_FORA_DA_CARGA) as {
    origem: string | null
    qtdPecas: number | null
    dataProducao: string | null
    responsavel: string | null
    nomeProduto: string | null
  }

  const nuvem = await gravarApontamentoNuvem(etapa, pedido, {
    codProduto: resolvido.codProduto,
    origem: gravado?.origem ?? null,
    qtdPecas: gravado?.qtdPecas ?? null,
    dataProducao: gravado?.dataProducao ?? null,
    responsavel: gravado?.responsavel ?? null,
    nomeProduto: gravado?.nomeProduto ?? resolvido.nomeProduto,
  })
  if (!nuvem.ok) {
    return {
      ok: false,
      error: `Incluiu nesta tela. A nuvem não atualizou (${nuvem.error}).`,
    }
  }
  revalidatePath(ETAPAS_APONTAMENTO[etapa].href)
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

  await ensureCloudDatabase()

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

  const responsavel = input.responsavel.trim()
  if (responsavel && !responsavelApontamentoValido(etapa, responsavel)) {
    return { ok: false, error: 'Escolha um responsável da lista.' }
  }

  const origem = etapa === 'costura' ? input.origem.trim() : ''
  if (origem && !origemCosturaValida(origem)) {
    return { ok: false, error: 'Escolha uma origem do relatório de Costura.' }
  }
  if (etapa === 'costura' && (qtdPecas != null || dataProducao || responsavel) && !origem) {
    return { ok: false, error: 'Escolha a origem antes de gravar o lançamento.' }
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
  const vazio = qtdPecas == null && !dataProducao && !responsavel && !origem

  if (vazio) {
    if (foraDaCarga) {
      db.prepare(
        `UPDATE ${tabela}
         SET qtd_pecas = NULL, data_producao = NULL, responsavel = NULL,
             nome_produto = COALESCE(?, nome_produto), atualizado_em = ?
         WHERE pedido_norm = ? AND cod_produto = ?`,
      ).run(nomeProduto, new Date().toISOString(), pedidoNorm, codProduto)
      if (etapa === 'costura') {
        db.prepare(
          `UPDATE ${tabela} SET origem = NULL WHERE pedido_norm = ? AND cod_produto = ?`,
        ).run(pedidoNorm, codProduto)
      }
      const nuvem = await gravarApontamentoNuvem(etapa, pedidoNorm, {
        codProduto,
        origem: null,
        qtdPecas: null,
        dataProducao: null,
        responsavel: null,
        nomeProduto,
      })
      revalidatePath(ETAPAS_APONTAMENTO[etapa].href)
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
    revalidatePath(ETAPAS_APONTAMENTO[etapa].href)
    if (!apagado.ok) {
      return {
        ok: false,
        error: `Limpou nesta tela. A nuvem não apagou (${apagado.error}).`,
      }
    }
    return { ok: true }
  }

  const agora = new Date().toISOString()
  if (etapa === 'costura') {
    db.prepare(
      `INSERT INTO ${tabela} (
         pedido_norm, cod_produto, excel_row, origem, qtd_pecas, data_producao,
         responsavel, nome_produto, atualizado_em
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(pedido_norm, cod_produto, excel_row) DO UPDATE SET
         origem = excluded.origem,
         qtd_pecas = excluded.qtd_pecas,
         data_producao = excluded.data_producao,
         responsavel = excluded.responsavel,
         nome_produto = COALESCE(excluded.nome_produto, ${tabela}.nome_produto),
         atualizado_em = excluded.atualizado_em`,
    ).run(
      pedidoNorm,
      codProduto,
      excelRow,
      origem,
      qtdPecas,
      dataProducao || null,
      responsavel || null,
      nomeProduto,
      agora,
    )
  } else {
    db.prepare(
      `INSERT INTO ${tabela} (
         pedido_norm, cod_produto, excel_row, qtd_pecas, data_producao,
         responsavel, nome_produto, atualizado_em
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(pedido_norm, cod_produto, excel_row) DO UPDATE SET
         qtd_pecas = excluded.qtd_pecas,
         data_producao = excluded.data_producao,
         responsavel = excluded.responsavel,
         nome_produto = COALESCE(excluded.nome_produto, ${tabela}.nome_produto),
         atualizado_em = excluded.atualizado_em`,
    ).run(
      pedidoNorm,
      codProduto,
      excelRow,
      qtdPecas,
      dataProducao || null,
      responsavel || null,
      nomeProduto,
      agora,
    )
  }

  db.prepare(
    `DELETE FROM ${tabela}
     WHERE pedido_norm = ? AND cod_produto = ? AND excel_row != ?`,
  ).run(pedidoNorm, codProduto, excelRow)

  const nuvem = await gravarApontamentoNuvem(etapa, pedidoNorm, {
    codProduto,
    origem: origem || null,
    qtdPecas,
    dataProducao: dataProducao || null,
    responsavel: responsavel || null,
    nomeProduto,
  })
  revalidatePath(ETAPAS_APONTAMENTO[etapa].href)
  if (!nuvem.ok) {
    return {
      ok: false,
      error: `Gravou nesta tela, mas a nuvem não atualizou (${nuvem.error}). Ao reabrir, os campos podem voltar vazios.`,
    }
  }
  return { ok: true }
}
