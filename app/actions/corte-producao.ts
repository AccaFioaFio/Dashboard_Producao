'use server'

import { revalidatePath } from 'next/cache'
import { getSqlite } from '@/db'
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
  | { ok: true; aviso?: string }
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

  const deveAvisar = Boolean(dataFinal) && dataFinal !== (anterior?.avisoDataFinal ?? null)
  if (!dataFinal && anterior?.avisoDataFinal) {
    db.prepare(
      `UPDATE corte_producao_lancamento
       SET aviso_data_final = NULL
       WHERE pedido_norm = ? AND cod_produto = ? AND excel_row = ?`,
    ).run(pedidoNorm, codProduto, excelRow)
  }

  revalidatePath('/corte/producao')
  if (!deveAvisar) return { ok: true }

  db.prepare(
    `UPDATE corte_producao_lancamento
     SET aviso_data_final = ?
     WHERE pedido_norm = ? AND cod_produto = ? AND excel_row = ?`,
  ).run(dataFinal, pedidoNorm, codProduto, excelRow)

  const item = db
    .prepare(
      `SELECT nome_produto as nomeProduto, cliente
       FROM fato_pedido_item
       WHERE pedido_norm = ? AND cod_produto = ? AND excel_row = ?`,
    )
    .get(pedidoNorm, codProduto, excelRow) as
    | { nomeProduto: string | null; cliente: string | null }
    | undefined

  try {
    await enviarAvisoCorteFinalizado({
      pedidoNorm,
      codProduto,
      nomeProduto: item?.nomeProduto ?? null,
      cliente: item?.cliente ?? null,
      qtdReal,
      dataInicio: dataInicio || null,
      dataFinal,
      responsavel: responsavel || null,
    })
  } catch (error) {
    const detalhe = error instanceof Error ? error.message : String(error)
    console.error(
      'aviso de corte finalizado não enviado',
      pedidoNorm,
      codProduto,
      detalhe,
    )
    db.prepare(
      `UPDATE corte_producao_lancamento
       SET aviso_data_final = ?
       WHERE pedido_norm = ? AND cod_produto = ? AND excel_row = ?`,
    ).run(anterior?.avisoDataFinal ?? null, pedidoNorm, codProduto, excelRow)
    return {
      ok: true,
      aviso: `Data gravada. O e-mail não saiu (${detalhe.slice(0, 140)}). Será tentado de novo ao salvar este item.`,
    }
  }

  return { ok: true, aviso: 'Aviso de corte finalizado enviado.' }
}
