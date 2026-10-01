'use server'

import { revalidatePath } from 'next/cache'
import { getSqlite } from '@/db'
import {
  cabecaPedidoCorte,
  getItensPorPedido,
  produtoNaBaseItens,
} from '@/data/pedidos'
import { ensureCloudDatabase } from '@/lib/cloud/carga'
import { canAccessPath } from '@/lib/auth/access'
import { readSession } from '@/lib/auth/cookie'
import { pedidoDigits } from '@/lib/pedido'
import {
  EXCEL_ROW_FORA_DA_CARGA,
  responsavelCorteValido,
} from '@/lib/corte-producao'
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
  qtdVolumes: string
  dataInicio: string
  dataFinal: string
  responsavel: string
}

export type SalvarCorteProducaoResult =
  | { ok: true; aviso?: string }
  | { ok: false; error: string }

export type SalvarListaCortadorResult =
  | {
      ok: true
      salvos: number
      aviso: string
      itens: { codProduto: string; dataFinal: string }[]
    }
  | { ok: false; error: string }

/** Pausa o SMTP. A lista e o alerta continuam. Volte para `false` para reativar o e-mail. */
const ENVIO_EMAIL_CORTE_PAUSADO = true

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

export type BuscarProdutoLancamentoResult =
  | { ok: true; codProduto: string; nomeProduto: string | null }
  | { ok: false; error: string }

export async function buscarProdutoParaLancamento(
  pedidoNorm: string,
  codInformado: string,
): Promise<BuscarProdutoLancamentoResult> {
  const session = await readSession()
  if (!session || !canAccessPath('/corte', session.acessos)) {
    return { ok: false, error: 'Sem permissão para incluir produto neste pedido.' }
  }

  await ensureCloudDatabase()
  const pedido = pedidoDigits(pedidoNorm)
  const cod = codInformado.trim()
  if (!pedido || !cod) {
    return { ok: false, error: 'Informe o código do produto.' }
  }
  if (!cabecaPedidoCorte(pedido)) {
    return { ok: false, error: 'Este pedido não está na Corte e Costura.' }
  }
  const produto = produtoNaBaseItens(cod)
  if (!produto) {
    return { ok: false, error: 'Código não encontrado na base de itens.' }
  }
  const jaNaCarga = getSqlite()
    .prepare(
      `SELECT 1 as v FROM fato_pedido_item
       WHERE pedido_norm = ? AND replace(trim(cod_produto), ' ', '') = replace(trim(?), ' ', '')`,
    )
    .get(pedido, produto.codProduto)
  if (jaNaCarga) {
    return { ok: false, error: 'Este código já está na carga deste pedido.' }
  }
  return {
    ok: true,
    codProduto: produto.codProduto,
    nomeProduto: produto.nomeProduto,
  }
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
  let codProduto = input.codProduto.trim()
  const excelRow = Number(input.excelRow)
  const foraDaCarga = excelRow === EXCEL_ROW_FORA_DA_CARGA
  if (!pedidoNorm || !codProduto || !Number.isInteger(excelRow) || excelRow < 0) {
    return { ok: false, error: 'Item do pedido inválido.' }
  }

  const qtdReal = quantidade(input.qtdReal)
  if (qtdReal === 'invalida') {
    return { ok: false, error: 'Quantidade real precisa ser um número a partir de zero.' }
  }
  const qtdVolumes = quantidade(input.qtdVolumes)
  if (qtdVolumes === 'invalida') {
    return { ok: false, error: 'Quantidade de volumes precisa ser um número a partir de zero.' }
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

  if (foraDaCarga) {
    if (!cabecaPedidoCorte(pedidoNorm)) {
      return { ok: false, error: 'Este pedido não está na Corte e Costura.' }
    }
    const produto = produtoNaBaseItens(codProduto)
    if (!produto) {
      return { ok: false, error: 'Código não encontrado na base de itens.' }
    }
    codProduto = produto.codProduto
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

  if (qtdReal == null && qtdVolumes == null && !dataInicio && !dataFinal && !responsavel) {
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
       pedido_norm, cod_produto, excel_row, qtd_real, qtd_volumes, data_inicio, data_final,
       responsavel, atualizado_em
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(pedido_norm, cod_produto, excel_row) DO UPDATE SET
       qtd_real = excluded.qtd_real,
       qtd_volumes = excluded.qtd_volumes,
       data_inicio = excluded.data_inicio,
       data_final = excluded.data_final,
       responsavel = excluded.responsavel,
       atualizado_em = excluded.atualizado_em`,
  ).run(
    pedidoNorm,
    codProduto,
    excelRow,
    qtdReal,
    qtdVolumes,
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
    qtdVolumes,
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

export async function salvarListaCortador(
  pedidoInformado: string,
): Promise<SalvarListaCortadorResult> {
  const session = await readSession()
  if (!session || !canAccessPath('/corte', session.acessos)) {
    return { ok: false, error: 'Sem permissão para gravar a lista do cortador.' }
  }

  await ensureCloudDatabase()
  const consulta = await getItensPorPedido(pedidoInformado)
  const pedidoNorm = consulta.pedidoNorm
  if (!consulta.loaded || !pedidoNorm || !consulta.itens.length) {
    return { ok: false, error: 'Pedido sem itens para a lista.' }
  }

  const pendentes: {
    excelRow: number
    codProduto: string
    nomeProduto: string | null
    qtdReal: number | null
    qtdVolumes: number | null
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
      qtdVolumes: item.qtdVolumes,
      dataInicio: item.dataInicio,
      dataFinal: item.dataFinal,
      responsavel: item.responsavel,
    })
  }

  if (!pendentes.length) {
    return {
      ok: true,
      salvos: 0,
      itens: [],
      aviso:
        'Nenhum item novo para a lista. Preencha a data final do que já foi cortado e salve de novo.',
    }
  }

  if (!ENVIO_EMAIL_CORTE_PAUSADO) {
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
  }

  const db = getSqlite()
  const enviadoEm = new Date().toISOString()
  const alertaId = `${pedidoNorm}-${Date.now()}`
  const marcar = db.prepare(
    `UPDATE corte_producao_lancamento
     SET aviso_data_final = ?, atualizado_em = ?
     WHERE pedido_norm = ? AND cod_produto = ?`,
  )
  const garantir = db.prepare(
    `INSERT INTO corte_producao_lancamento (
       pedido_norm, cod_produto, excel_row, qtd_real, qtd_volumes, data_inicio, data_final,
       responsavel, aviso_data_final, atualizado_em
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(pedido_norm, cod_produto, excel_row) DO UPDATE SET
       aviso_data_final = excluded.aviso_data_final,
       atualizado_em = excluded.atualizado_em`,
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
      const atualizado = marcar.run(item.dataFinal, enviadoEm, pedidoNorm, item.codProduto)
      if (atualizado.changes === 0) {
        garantir.run(
          pedidoNorm,
          item.codProduto,
          item.excelRow,
          item.qtdReal,
          item.qtdVolumes,
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
    const marcado = await marcarAvisoNuvem(pedidoNorm, item.codProduto, item.dataFinal, {
      qtdReal: item.qtdReal,
      qtdVolumes: item.qtdVolumes,
      dataInicio: item.dataInicio,
      dataFinal: item.dataFinal,
      responsavel: item.responsavel,
    })
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

  const salvos = pendentes.length
  const base =
    salvos === 1
      ? '1 item entrou na lista do cortador. O alerta ficou na Visão Geral.'
      : `${salvos} itens entraram na lista do cortador. O alerta ficou na Visão Geral.`
  return {
    ok: true,
    salvos,
    itens: pendentes.map((item) => ({
      codProduto: item.codProduto,
      dataFinal: item.dataFinal,
    })),
    aviso: falhasNuvem.length
      ? `${base} A nuvem não gravou a lista (${falhasNuvem[0]}). Ao reabrir, pode parecer que o item não entrou.`
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
