'use server'

import { revalidatePath } from 'next/cache'
import { getSqlite } from '@/db'
import { getItensPorPedido } from '@/data/pedidos'
import { ensureCloudDatabase } from '@/lib/cloud/carga'
import { canAccessPath } from '@/lib/auth/access'
import { readSession } from '@/lib/auth/cookie'
import { pedidoDigits } from '@/lib/pedido'
import { responsavelCorteValido } from '@/lib/corte-producao'
import { enviarAvisoCorteFinalizado } from '@/lib/mail/corte-finalizado'

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
  | { ok: true }
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
       WHERE pedido_norm = ? AND cod_produto = ? AND excel_row = ?`,
    ).run(pedidoNorm, codProduto, excelRow)
    revalidatePath('/corte/producao')
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
       WHERE pedido_norm = ? AND cod_produto = ? AND excel_row = ?`,
    ).run(pedidoNorm, codProduto, excelRow)
  }

  revalidatePath('/corte/producao')
  return { ok: true }
}

type LancamentoAviso = {
  excelRow: number
  qtdReal: number | null
  dataInicio: string | null
  dataFinal: string | null
  responsavel: string | null
  avisoDataFinal: string | null
}

function lancamentoAvisado(
  pedidoNorm: string,
  codProduto: string,
  excelRow: number,
  dataFinal: string,
) {
  const db = getSqlite()
  const direta = db
    .prepare(
      `SELECT excel_row as excelRow, qtd_real as qtdReal,
              data_inicio as dataInicio, data_final as dataFinal,
              responsavel, aviso_data_final as avisoDataFinal
       FROM corte_producao_lancamento
       WHERE pedido_norm = ? AND cod_produto = ? AND excel_row = ?`,
    )
    .get(pedidoNorm, codProduto, excelRow) as LancamentoAviso | undefined
  if (direta?.dataFinal === dataFinal) return direta
  return db
    .prepare(
      `SELECT excel_row as excelRow, qtd_real as qtdReal,
              data_inicio as dataInicio, data_final as dataFinal,
              responsavel, aviso_data_final as avisoDataFinal
       FROM corte_producao_lancamento
       WHERE pedido_norm = ? AND cod_produto = ? AND data_final = ?
       ORDER BY excel_row
       LIMIT 1`,
    )
    .get(pedidoNorm, codProduto, dataFinal) as LancamentoAviso | undefined
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
    if (!item.dataFinal) continue
    const lancamento = lancamentoAvisado(
      pedidoNorm,
      item.codProduto,
      item.excelRow,
      item.dataFinal,
    )
    if (!lancamento?.dataFinal || lancamento.avisoDataFinal === lancamento.dataFinal) {
      continue
    }
    const chave = `${item.codProduto}|${lancamento.excelRow}`
    if (vistos.has(chave)) continue
    vistos.add(chave)
    pendentes.push({
      excelRow: lancamento.excelRow,
      codProduto: item.codProduto,
      nomeProduto: item.nomeProduto,
      qtdReal: lancamento.qtdReal,
      dataInicio: lancamento.dataInicio,
      dataFinal: lancamento.dataFinal,
      responsavel: lancamento.responsavel,
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
  const marcar = db.prepare(
    `UPDATE corte_producao_lancamento
     SET aviso_data_final = ?
     WHERE pedido_norm = ? AND cod_produto = ? AND excel_row = ?`,
  )
  const gravar = db.transaction(() => {
    for (const item of pendentes) {
      marcar.run(item.dataFinal, pedidoNorm, item.codProduto, item.excelRow)
    }
  })
  gravar()
  revalidatePath('/corte/producao')

  const enviados = pendentes.length
  return {
    ok: true,
    enviados,
    aviso:
      enviados === 1
        ? 'E-mail enviado com 1 item.'
        : `E-mail enviado com ${enviados} itens.`,
  }
}
