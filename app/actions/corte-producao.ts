'use server'

import { revalidatePath } from 'next/cache'
import { getSqlite } from '@/db'
import { getItensPorPedido } from '@/data/pedidos'
import { ensureCloudDatabase } from '@/lib/cloud/carga'
import { canAccessPath } from '@/lib/auth/access'
import { readSession } from '@/lib/auth/cookie'
import { pedidoDigits } from '@/lib/pedido'
import { responsavelCorteValido } from '@/lib/corte-producao'
import {
  apagarLancamentoNuvem,
  criarAlertaNuvem,
  gravarLancamentoNuvem,
  marcarAlertaNuvemVisto,
  marcarAvisoNuvem,
} from '@/lib/corte-nuvem'
import { enviarAvisoCorteFinalizado } from '@/lib/mail/corte-finalizado'
import { gravarDatasCorteNaPlanilha } from '@/lib/corte-planilha-datas'

export type SalvarCorteProducaoInput = {
  pedidoNorm: string
  codProduto: string
  excelRow: number
  qtdReal: string
  dataInicio: string
  dataFinal: string
  responsavel: string
}

export type SalvarCorteProducaoResult =
  | { ok: true; aviso?: string }
  | { ok: false; error: string }

export type EnviarEmailCorteResult =
  | { ok: true; enviados: number; aviso: string }
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

export async function salvarCorteProducao(
  input: SalvarCorteProducaoInput,
): Promise<SalvarCorteProducaoResult> {
  const session = await readSession()
  if (!session || !canAccessPath('/corte', session.acessos)) {
    return { ok: false, error: 'Sem permissão para gravar o corte.' }
  }

  await ensureCloudDatabase()

  const pedidoNorm = pedidoDigits(input.pedidoNorm)
  const codProduto = input.codProduto.trim()
  const excelRow = Number(input.excelRow)
  if (!pedidoNorm || !codProduto || !Number.isInteger(excelRow) || excelRow < 1) {
    return { ok: false, error: 'Item do pedido inválido.' }
  }

  const qtdReal = quantidade(input.qtdReal)
  if (qtdReal === 'invalida') {
    return { ok: false, error: 'Quantidade real precisa ser um número a partir de zero.' }
  }

  const dataInicio = input.dataInicio.trim()
  const dataFinal = input.dataFinal.trim()
  if (dataInicio && !dataValida(dataInicio)) {
    return { ok: false, error: 'Data de início inválida.' }
  }
  if (dataFinal && !dataValida(dataFinal)) {
    return { ok: false, error: 'Data final inválida.' }
  }
  if (dataInicio && dataFinal && dataFinal < dataInicio) {
    return { ok: false, error: 'A data final não pode ser anterior ao início.' }
  }

  const responsavel = input.responsavel.trim()
  if (responsavel && !responsavelCorteValido(responsavel)) {
    return { ok: false, error: 'Escolha um responsável da lista.' }
  }

  const existe = getSqlite()
    .prepare(
      `SELECT 1 as v FROM fato_pedido_item
       WHERE pedido_norm = ? AND cod_produto = ? AND excel_row = ?`,
    )
    .get(pedidoNorm, codProduto, excelRow)
  if (!existe) {
    return { ok: false, error: 'Este item não está na carga do pedido.' }
  }

  const db = getSqlite()
  const anterior = db
    .prepare(
      `SELECT aviso_data_final as avisoDataFinal
       FROM corte_producao_lancamento
       WHERE pedido_norm = ? AND cod_produto = ? AND excel_row = ?`,
    )
    .get(pedidoNorm, codProduto, excelRow) as
    | { avisoDataFinal: string | null }
    | undefined

  if (qtdReal == null && !dataInicio && !dataFinal && !responsavel) {
    db.prepare(
      `DELETE FROM corte_producao_lancamento
       WHERE pedido_norm = ? AND cod_produto = ?`,
    ).run(pedidoNorm, codProduto)
    const apagado = await apagarLancamentoNuvem(pedidoNorm, codProduto)
    revalidatePath('/corte/producao')
    if (!apagado.ok) {
      return {
        ok: false,
        error: `Limpou neste computador. A nuvem não apagou (${apagado.error}).`,
      }
    }
    return { ok: true }
  }

  db.prepare(
    `INSERT INTO corte_producao_lancamento (
       pedido_norm, cod_produto, excel_row, qtd_real, data_inicio, data_final,
       responsavel, atualizado_em
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(pedido_norm, cod_produto, excel_row) DO UPDATE SET
       qtd_real = excluded.qtd_real,
       data_inicio = excluded.data_inicio,
       data_final = excluded.data_final,
       responsavel = excluded.responsavel,
       atualizado_em = excluded.atualizado_em`,
  ).run(
    pedidoNorm,
    codProduto,
    excelRow,
    qtdReal,
    dataInicio || null,
    dataFinal || null,
    responsavel || null,
    new Date().toISOString(),
  )

  if (!dataFinal && anterior?.avisoDataFinal) {
    db.prepare(
      `UPDATE corte_producao_lancamento
       SET aviso_data_final = NULL
       WHERE pedido_norm = ? AND cod_produto = ?`,
    ).run(pedidoNorm, codProduto)
  }

  db.prepare(
    `DELETE FROM corte_producao_lancamento
     WHERE pedido_norm = ? AND cod_produto = ? AND excel_row != ?`,
  ).run(pedidoNorm, codProduto, excelRow)

  const nuvem = await gravarLancamentoNuvem(pedidoNorm, codProduto, {
    qtdReal,
    dataInicio: dataInicio || null,
    dataFinal: dataFinal || null,
    responsavel: responsavel || null,
  })
  if (!nuvem.ok) {
    revalidatePath('/corte/producao')
    return {
      ok: false,
      error: `Gravou nesta tela, mas a nuvem não atualizou (${nuvem.error}). Ao reabrir o corte, os campos podem voltar vazios.`,
    }
  }

  revalidatePath('/corte/producao')

  const planilha = await gravarDatasCorteNaPlanilha(pedidoNorm)
  if (!planilha.ok) {
    return {
      ok: false,
      error: `As datas ficaram nesta tela. ${planilha.error}`,
    }
  }

  return {
    ok: true,
    aviso:
      planilha.linhas > 0
        ? 'Planilha: data início e data final do corte gravadas na linha em produção. O status muda pela fórmula quando o Excel abrir o arquivo.'
        : undefined,
  }
}

export async function enviarEmailCorteProducao(
  pedidoInformado: string,
): Promise<EnviarEmailCorteResult> {
  const session = await readSession()
  if (!session || !canAccessPath('/corte', session.acessos)) {
    return { ok: false, error: 'Sem permissão para enviar o aviso de corte.' }
  }

  await ensureCloudDatabase()
  const consulta = await getItensPorPedido(pedidoInformado)
  const pedidoNorm = consulta.pedidoNorm
  if (!consulta.loaded || !pedidoNorm || !consulta.itens.length) {
    return { ok: false, error: 'Pedido sem itens para avisar.' }
  }

  const pendentes: {
    excelRow: number
    codProduto: string
    nomeProduto: string | null
    qtdReal: number | null
    dataInicio: string | null
    dataFinal: string
    responsavel: string | null
  }[] = []
  const vistos = new Set<string>()

  for (const item of consulta.itens) {
    if (!item.dataFinal || item.avisoDataFinal === item.dataFinal) continue
    if (vistos.has(item.codProduto)) continue
    vistos.add(item.codProduto)
    pendentes.push({
      excelRow: item.excelRow,
      codProduto: item.codProduto,
      nomeProduto: item.nomeProduto,
      qtdReal: item.qtdReal,
      dataInicio: item.dataInicio,
      dataFinal: item.dataFinal,
      responsavel: item.responsavel,
    })
  }

  if (!pendentes.length) {
    return {
      ok: true,
      enviados: 0,
      aviso:
        'Nenhum item novo para avisar. Preencha a data final do que já foi cortado e envie de novo.',
    }
  }

  try {
    await enviarAvisoCorteFinalizado({
      pedidoNorm,
      cliente: consulta.cliente,
      itens: pendentes,
    })
  } catch (error) {
    const detalhe = error instanceof Error ? error.message : String(error)
    console.error('aviso de corte finalizado não enviado', pedidoNorm, detalhe)
    return {
      ok: false,
      error: `O e-mail não saiu (${detalhe.slice(0, 140)}). Os itens continuam pendentes.`,
    }
  }

  const db = getSqlite()
  const enviadoEm = new Date().toISOString()
  const alertaId = `${pedidoNorm}-${Date.now()}`
  const marcar = db.prepare(
    `UPDATE corte_producao_lancamento
     SET aviso_data_final = ?
     WHERE pedido_norm = ? AND cod_produto = ?`,
  )
  const garantir = db.prepare(
    `INSERT INTO corte_producao_lancamento (
       pedido_norm, cod_produto, excel_row, qtd_real, data_inicio, data_final,
       responsavel, aviso_data_final, atualizado_em
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(pedido_norm, cod_produto, excel_row) DO UPDATE SET
       aviso_data_final = excluded.aviso_data_final`,
  )
  const criarAlerta = db.prepare(
    `INSERT INTO corte_producao_alerta (pedido_norm, cliente, enviado_em)
     VALUES (?, ?, ?)`,
  )
  const criarItem = db.prepare(
    `INSERT INTO corte_producao_alerta_item (
       alerta_id, cod_produto, nome_produto, qtd_real, data_inicio, data_final, responsavel
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  const gravar = db.transaction(() => {
    for (const item of pendentes) {
      const atualizado = marcar.run(item.dataFinal, pedidoNorm, item.codProduto)
      if (atualizado.changes === 0) {
        garantir.run(
          pedidoNorm,
          item.codProduto,
          item.excelRow,
          item.qtdReal,
          item.dataInicio,
          item.dataFinal,
          item.responsavel,
          item.dataFinal,
          enviadoEm,
        )
      }
    }
    const alerta = criarAlerta.run(pedidoNorm, consulta.cliente, enviadoEm)
    const alertaLocal = Number(alerta.lastInsertRowid)
    for (const item of pendentes) {
      criarItem.run(
        alertaLocal,
        item.codProduto,
        item.nomeProduto,
        item.qtdReal,
        item.dataInicio,
        item.dataFinal,
        item.responsavel,
      )
    }
  })
  gravar()

  const falhasNuvem: string[] = []
  for (const item of pendentes) {
    const marcado = await marcarAvisoNuvem(pedidoNorm, item.codProduto, item.dataFinal)
    if (!marcado.ok) falhasNuvem.push(marcado.error)
  }
  const alertaNuvem = await criarAlertaNuvem({
    id: alertaId,
    pedidoNorm,
    cliente: consulta.cliente,
    enviadoEm,
    vistoEm: null,
    itens: pendentes.map((item) => ({
      codProduto: item.codProduto,
      nomeProduto: item.nomeProduto,
      qtdReal: item.qtdReal,
      dataInicio: item.dataInicio,
      dataFinal: item.dataFinal,
      responsavel: item.responsavel,
    })),
  })
  if (!alertaNuvem.ok) falhasNuvem.push(alertaNuvem.error)

  revalidatePath('/corte/producao')
  revalidatePath('/')

  const enviados = pendentes.length
  const base =
    enviados === 1
      ? 'E-mail enviado com 1 item. O alerta entrou na Visão Geral.'
      : `E-mail enviado com ${enviados} itens. O alerta entrou na Visão Geral.`
  return {
    ok: true,
    enviados,
    aviso: falhasNuvem.length
      ? `${base} A nuvem não gravou o envio (${falhasNuvem[0]}). Ao reabrir, pode parecer que o e-mail não saiu.`
      : base,
  }
}

export async function marcarAlertaCorteVisto(alertaId: string) {
  const session = await readSession()
  if (!session || !canAccessPath('/', session.acessos)) {
    return { ok: false as const, error: 'Sem permissão para marcar o alerta como visto.' }
  }
  const id = alertaId.trim()
  if (!id || id.length > 80) {
    return { ok: false as const, error: 'Alerta inválido.' }
  }
  await ensureCloudDatabase()
  const vistoEm = new Date().toISOString()
  if (/^\d+$/.test(id)) {
    getSqlite()
      .prepare(
        `UPDATE corte_producao_alerta
         SET visto_em = ?
         WHERE id = ? AND visto_em IS NULL`,
      )
      .run(vistoEm, Number(id))
  }
  const nuvem = await marcarAlertaNuvemVisto(id)
  if (!nuvem.ok) {
    return { ok: false as const, error: nuvem.error ?? 'Não marcou o alerta na nuvem.' }
  }
  revalidatePath('/')
  return { ok: true as const }
}
