import {
  parseCorte,
  parseCostura,
  parseOficinas,
  parseRevisao,
} from '@/lib/etl/parse'
import { parseAproveitamento } from '@/lib/etl/parse-aproveitamento'
import { parseEstoqueTecidos } from '@/lib/etl/parse-estoque'
import { parsePedidosComerciais } from '@/lib/etl/parse-pedidos'
import { parsePedidosItens } from '@/lib/etl/parse-itens'
import { parseSignusTecidos } from '@/lib/etl/parse-signus'
import type { QualidadeEvento, Snapshot } from '@/lib/etl/types'
import type * as XLSX from 'xlsx'

/** Recalcula órfãos a partir dos conjuntos atuais (mantém o restante da qualidade). */
export function attachOrfaosQualidade(snapshot: Snapshot): Snapshot {
  const base = snapshot.qualidade.filter((row) => !row.tipo.startsWith('orfao_'))
  const qualidade: QualidadeEvento[] = [...base]

  const corteSet = new Set(snapshot.cortePedidos.map((row) => row.pedidoNorm))
  const costuraProd = new Set(
    snapshot.costura
      .filter((row) => row.origemNorm === 'Producao')
      .map((row) => row.pedidoNorm),
  )
  const revisaoSet = new Set(snapshot.revisao.map((row) => row.pedidoNorm))
  const oficinasSet = new Set(
    snapshot.oficinas
      .map((row) => row.pedidoNorm)
      .filter((value): value is string => Boolean(value)),
  )
  const signusPedidos = new Set(
    snapshot.tecidosSignus
      .filter((row) => row.isBaixa && row.pedidoNorm)
      .map((row) => row.pedidoNorm as string),
  )

  for (const pedido of costuraProd) {
    if (!corteSet.has(pedido)) {
      qualidade.push({
        tipo: 'orfao_costura',
        pedidoNorm: pedido,
        detalhe: 'Costura Produção 2026 sem corte 2026',
        excelRow: null,
        valor: null,
      })
    }
  }
  for (const pedido of revisaoSet) {
    if (!corteSet.has(pedido)) {
      qualidade.push({
        tipo: 'orfao_revisao',
        pedidoNorm: pedido,
        detalhe: 'Revisão 2026 sem corte 2026',
        excelRow: null,
        valor: null,
      })
    }
  }
  for (const pedido of oficinasSet) {
    if (!corteSet.has(pedido)) {
      qualidade.push({
        tipo: 'orfao_oficina',
        pedidoNorm: pedido,
        detalhe: 'Oficina 2026 sem corte 2026',
        excelRow: null,
        valor: null,
      })
    }
  }
  for (const pedido of signusPedidos) {
    if (!corteSet.has(pedido)) {
      const metros = snapshot.tecidosSignus
        .filter((row) => row.isBaixa && row.pedidoNorm === pedido)
        .reduce((sum, row) => sum + row.metros, 0)
      qualidade.push({
        tipo: 'orfao_signus',
        pedidoNorm: pedido,
        detalhe: 'Baixa Signus 2026 sem corte 2026',
        excelRow: null,
        valor: metros,
      })
    }
  }

  return { ...snapshot, qualidade }
}

export function buildSnapshotFromWorkbooks(
  corteWb: XLSX.WorkBook,
  oficinasWb: XLSX.WorkBook,
  signusWb: XLSX.WorkBook,
  estoqueWb: XLSX.WorkBook,
  pedidosWb: XLSX.WorkBook | null,
  itensWb: XLSX.WorkBook | null,
): Snapshot {
  const corte = parseCorte(corteWb)
  const aproveitamento = parseAproveitamento(corteWb)
  const costura = parseCostura(corteWb)
  const revisao = parseRevisao(corteWb)
  const oficinas = parseOficinas(oficinasWb)
  const tecidosSignus = parseSignusTecidos(signusWb)
  const tecidosEstoque = parseEstoqueTecidos(estoqueWb)
  const pedidosComerciais = pedidosWb ? parsePedidosComerciais(pedidosWb) : []
  const pedidosItens = itensWb ? parsePedidosItens(itensWb) : []

  return attachOrfaosQualidade({
    corteLinhas: corte.linhas,
    cortePedidos: corte.pedidos,
    costura,
    revisao: revisao.limpos,
    oficinas: oficinas.lotes,
    tecidosSignus,
    tecidosEstoque,
    pedidosComerciais,
    pedidosItens,
    qualidade: [
      ...corte.qualidade,
      ...revisao.qualidade,
      ...oficinas.qualidade,
    ],
    aproveitamento,
  })
}
