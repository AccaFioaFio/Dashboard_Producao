export type QualidadeTipo =
  | 'revisao_total'
  | 'revisao_qtd_eq_pedido'
  | 'dias_corte_serial'
  | 'status_duplo'
  | 'oficina_vazia'
  | 'lilica'
  | 'orfao_costura'
  | 'orfao_revisao'
  | 'orfao_oficina'

export type QualidadeEvento = {
  tipo: QualidadeTipo
  pedidoNorm: string | null
  detalhe: string
  excelRow: number | null
  valor: number | null
}

export type CorteLinha = {
  excelRow: number
  pedidoNorm: string
  isHeader: boolean
  isStar: boolean
  data: string | null
  status: string | null
  qtdPecas: number | null
  qtdTerceiros: number | null
  qtdEstoque: number | null
  metros: number | null
  economia: number | null
  tecido: string | null
  codTecido: string | null
  responsavel: string | null
  canal: string | null
  cliente: string | null
  inicioCorte: string | null
  finalCorte: string | null
  diasDeCorteRaw: number | null
}

export type CortePedido = {
  pedidoNorm: string
  data: string | null
  statusVigente: string | null
  pecas: number
  terceiros: number
  estoque: number
  metros: number
  economia: number
  responsavel: string | null
  canal: string | null
  cliente: string | null
  inicioCorte: string | null
  finalCorte: string | null
  leadTimeDias: number | null
  statusDuplo: boolean
  headersCount: number
}

export type CosturaLancamento = {
  excelRow: number
  pedidoNorm: string
  dataProducao: string
  origem: string
  origemNorm: string
  qtdPecas: number
  responsavel: string | null
  produto: string | null
}

export type RevisaoLancamento = {
  excelRow: number
  pedidoNorm: string
  dataProducao: string
  qtdPecas: number
  responsavel: string | null
  produto: string | null
}

export type OficinaLote = {
  excelRow: number
  pedidoNorm: string | null
  oficina: string
  dataEnvio: string
  qtdEnviadas: number
  qtdRetornadas: number
  qtdPendentes: number
  qtdDefeitos: number
  statusEntrega: string | null
  dataPrometida: string | null
  dataRetorno: string | null
  produto: string | null
  valorTotal: number | null
}

export type Snapshot = {
  corteLinhas: CorteLinha[]
  cortePedidos: CortePedido[]
  costura: CosturaLancamento[]
  revisao: RevisaoLancamento[]
  oficinas: OficinaLote[]
  qualidade: QualidadeEvento[]
}

export type HeaderKpis = {
  pecasCortadas: number
  pedidosCorte: number
  pecasCosturaProd: number
  pecasRevisao: number
  wipPedidos: number
  wipPecas: number
  tecidoPedidos: number
  tecidoPecas: number
  tecidoMetros: number
  metrosConsumo: number
  metrosEconomia: number
  oficinasPendentes: number
  oficinasDefeitos: number
}

export type FunilKpis = {
  corte: number
  comCostura: number
  semCostura: number
  comRevisao: number
  semRevisao: number
  costuraSemCorte: number
  revisaoSemCorte: number
  oficinas: number
  oficinasNoCorte: number
  oficinasOrfas: number
}

export type SerieMensal = {
  mes: number
  cortadas: number
  costura: number
  revisao: number
}
