import { formatDate, formatInt, formatMeters, formatMoney, formatNumber } from '@/lib/format'
import type { FunilKpis } from '@/lib/etl/types'
import { hintLines } from '@/lib/obs'

function sharePct(part: number, total: number) {
  if (!total) return null
  return `${formatNumber((part / total) * 100, 1)}%`
}

function pedidoHead(
  pedido: string | null | undefined,
  extras: (string | null | undefined)[],
) {
  return [`Pedido ${pedido || '—'}`, ...extras].filter(Boolean).join(' · ')
}

export function explainNamedVolume(args: {
  titulo: string
  nome: string
  pecas: number
  pedidos: number
  totalPecas?: number
  extra?: string
}) {
  const share = sharePct(args.pecas, args.totalPecas ?? 0)
  return hintLines([
    `${args.titulo} ${args.nome}: ${formatInt(args.pecas)} peças em ${formatInt(args.pedidos)} pedido${args.pedidos === 1 ? '' : 's'}${share ? ` (${share} do recorte)` : ''}.`,
    args.extra,
  ])
}

export function explainMesVolume(args: {
  mes: string
  pecas: number
  pedidos?: number
  extra?: string
}) {
  return hintLines([
    `${args.mes}: ${formatInt(args.pecas)} peças${args.pedidos != null ? ` em ${formatInt(args.pedidos)} pedido${args.pedidos === 1 ? '' : 's'}` : ''}.`,
    args.extra,
  ])
}

export function explainCorteWip(row: {
  pedidoNorm: string
  data: string | null
  cliente: string | null
  canal: string | null
  pecas: number
  responsavel: string | null
  tecido?: string | null
  observacao?: string | null
}) {
  return hintLines(
    [
      pedidoHead(row.pedidoNorm, [row.cliente, row.canal, row.responsavel]),
      row.tecido ? `EM PRODUÇÃO · ${row.tecido}.` : 'Ordem de corte EM PRODUÇÃO.',
      `${formatInt(row.pecas)} peças deste cabeçalho · data ${formatDate(row.data)}.`,
      'Mesmo nº pedido com outro status entra noutra fila. Não é contagem de linha de tecido.',
    ],
    row.observacao,
  )
}

export function explainAguardandoTecido(row: {
  pedidoNorm: string
  data?: string | null
  cliente: string | null
  tecido: string
  metros: number
  pecas: number
  saldoAtual?: number
  saldoReservado?: number
  responsavel?: string | null
  statusVigente?: string | null
  observacao?: string | null
}) {
  return hintLines(
    [
      pedidoHead(row.pedidoNorm, [row.cliente, row.responsavel]),
      `${row.statusVigente ?? 'AGUARDANDO TECIDO'} · ${row.tecido}.`,
      `${formatMeters(row.metros, row.metros >= 10 ? 0 : 1)} apontados no Corte · ${formatInt(row.pecas)} peças.`,
      row.saldoAtual != null
        ? `Saldo atual ${formatMeters(row.saldoAtual)} · reservado ${formatMeters(row.saldoReservado ?? 0)}.`
        : null,
      row.data ? `Data do pedido ${formatDate(row.data)}.` : null,
    ],
    row.observacao,
  )
}

export function explainCosturaOrigem(args: {
  origem: string
  lancamentos: number
  pecas: number
  pedidos: number
  uso: string
  extra?: string
}) {
  return hintLines([
    `${args.origem}: ${formatInt(args.pecas)} peças em ${formatInt(args.lancamentos)} lançamento${args.lancamentos === 1 ? '' : 's'} · ${formatInt(args.pedidos)} pedido${args.pedidos === 1 ? '' : 's'}.`,
    `Uso: ${args.uso}.`,
    args.extra,
  ])
}

export function explainLancamentoDia(row: {
  pedido: string
  pecas: number
  responsavel: string | null
  produto: string | null
  origem?: string
  etapa: 'Costura Produção' | 'Revisão'
  observacao?: string | null
}) {
  return hintLines(
    [
      pedidoHead(row.pedido, [row.responsavel, row.produto, row.origem]),
      `${row.etapa} do dia: ${formatInt(row.pecas)} peça${row.pecas === 1 ? '' : 's'}.`,
    ],
    row.observacao,
  )
}

export function explainOficinaRanking(row: {
  nome: string
  pendentes: number
  enviadas: number
  retornadas: number
  defeitos: number
  valor: number
  remessas?: number
  valorRemessa?: number
  clienteSignus?: string | null
}) {
  const retorno =
    row.enviadas > 0 ? `${formatNumber((row.retornadas / row.enviadas) * 100, 1)}%` : '—'
  const quebra =
    row.enviadas > 0 && row.retornadas === 0 && row.pendentes === 0
      ? 'Enviadas sem retorno e sem pendente — quebra de cadastro (não fecha o saldo).'
      : null
  const remessa =
    row.remessas && row.remessas > 0
      ? `Signus: ${formatInt(row.remessas)} remessa${row.remessas === 1 ? '' : 's'} p/ industrialização · ${formatMoney(row.valorRemessa ?? 0)}${row.clienteSignus ? ` (${row.clienteSignus})` : ''}.`
      : null
  return hintLines([
    `${row.nome}: ${formatInt(row.pendentes)} pendentes · ${formatInt(row.enviadas)} enviadas · ${formatInt(row.retornadas)} retornadas (${retorno} de retorno).`,
    `${formatInt(row.defeitos)} defeito${row.defeitos === 1 ? '' : 's'} · valor lançado ${formatMoney(row.valor)}.`,
    remessa,
    quebra,
  ])
}

export function explainOficinaSemRetorno(row: {
  oficina: string
  pedido: string | null
  enviadas: number
  data: string
  produto?: string | null
  observacao?: string | null
}) {
  return hintLines(
    [
      pedidoHead(row.pedido, [row.oficina, row.produto]),
      `${formatInt(row.enviadas)} peças enviadas em ${formatDate(row.data)}, 0 retornadas e 0 pendentes.`,
      'O lote não fecha o saldo — costuma ser cadastro incompleto (ex.: Lilica).',
    ],
    row.observacao,
  )
}

export function explainTecidoRanking(row: {
  tecido: string
  metros: number
  signusMetros: number
  saldoAtual?: number
  saldoReservado?: number
  economia: number
  pedidos: number
  totalCorte: number
}) {
  const share = sharePct(row.metros, row.totalCorte)
  const delta = row.metros - row.signusMetros
  return hintLines([
    `${row.tecido}: Corte ${formatMeters(row.metros)}${share ? ` (${share} do consumo)` : ''} em ${formatInt(row.pedidos)} pedido${row.pedidos === 1 ? '' : 's'}.`,
    `Baixa Signus ${formatMeters(row.signusMetros)} · delta Corte − Signus ${formatMeters(delta)} · economia ${formatMeters(row.economia, row.economia >= 10 ? 0 : 1)}.`,
    row.saldoAtual != null
      ? `Saldo atual ${formatMeters(row.saldoAtual)} · reservado ${formatMeters(row.saldoReservado ?? 0)}.`
      : null,
    'Corte = MTS da programação. Signus = baixa real nos almox principais. Estoque = saldo dos mesmos almox (snapshot).',
  ])
}

export function explainTecidoMes(args: {
  mes: string
  corte: number
  signus: number
}) {
  const delta = args.corte - args.signus
  return hintLines([
    `${args.mes}: Corte ${formatMeters(args.corte)} · baixa Signus ${formatMeters(args.signus)} · delta ${formatMeters(delta)}.`,
    'Gap esperado: Signus soma tipos de baixa (Produção/insumos + SAÍDA FF/AC/TC), não só o consumo do Corte — e as datas/Orig. Mov. não batem 1:1.',
  ])
}

export function explainTecidoTipo(args: {
  tipo: string
  metros: number
  movimentos: number
  pedidos: number
  extra?: string
  selected?: boolean
}) {
  return hintLines([
    `${args.tipo}: ${formatMeters(args.metros)} em ${formatInt(args.movimentos)} movimento${args.movimentos === 1 ? '' : 's'} · ${formatInt(args.pedidos)} pedido${args.pedidos === 1 ? '' : 's'}.`,
    args.extra,
    args.selected
      ? 'Selecionado — clique de novo para limpar o filtro.'
      : 'Clique para ver os tecidos deste tipo.',
  ])
}

export function explainTecidoProdutoAgg(args: {
  tecido: string
  metros: number
  movimentos: number
  pedidos: number
}) {
  return hintLines([
    `${args.tecido}: ${formatMeters(args.metros)} em ${formatInt(args.movimentos)} movimento${args.movimentos === 1 ? '' : 's'} · ${formatInt(args.pedidos)} pedido${args.pedidos === 1 ? '' : 's'}.`,
    'Agregado do recorte atual (filtros da página).',
  ])
}

export function explainTecidoCruzado(row: {
  tecido: string
  corteMetros: number
  signusMetros: number
  saldoAtual?: number
  saldoReservado?: number
  cortePedidos?: number
  signusPedidos?: number
}) {
  const delta = row.corteMetros - row.signusMetros
  return hintLines([
    `${row.tecido}: programação ${formatMeters(row.corteMetros)} vs baixa ${formatMeters(row.signusMetros)} (delta ${formatMeters(delta)}).`,
    row.saldoAtual != null
      ? `Saldo atual ${formatMeters(row.saldoAtual)} · reservado ${formatMeters(row.saldoReservado ?? 0)}.`
      : null,
    row.cortePedidos != null
      ? `Pedidos no Corte ${formatInt(row.cortePedidos)}${row.signusPedidos != null ? ` · com baixa Signus ${formatInt(row.signusPedidos)}` : ''}.`
      : null,
    'Cruza COD TECIDO com Código produto (Signus e estoque dos almox principais).',
  ])
}

export function explainTecidoCanal(args: {
  nome: string
  metros: number
  movimentos: number
}) {
  return hintLines([
    `${args.nome}: ${formatMeters(args.metros)} baixados em ${formatInt(args.movimentos)} movimento${args.movimentos === 1 ? '' : 's'}.`,
    args.nome === 'Produção (insumos)'
      ? 'Baixa BOM (PRODUÇÃO: MATÉRIA-PRIMA/INSUMOS). Entra no KPI oficial.'
      : 'Baixa operacional do canal (SAIDA FF/AC/TC). Entra no KPI oficial.',
  ])
}

export function explainSignusSemCorte(row: {
  tecido: string
  signusMetros: number
  signusPedidos: number
}) {
  return hintLines([
    `${row.tecido}: ${formatMeters(row.signusMetros)} baixados no Signus em ${formatInt(row.signusPedidos)} pedido${row.signusPedidos === 1 ? '' : 's'}.`,
    'Código de produto sem correspondente no Corte (COD TECIDO).',
  ])
}

export function explainEstoqueSemCorte(row: {
  tecido: string
  saldoAtual: number
  saldoReservado: number
}) {
  return hintLines([
    `${row.tecido}: saldo atual ${formatMeters(row.saldoAtual)} · reservado ${formatMeters(row.saldoReservado)}.`,
    'Código no estoque dos almox principais sem COD TECIDO na programação de Corte.',
  ])
}

export function explainTecidoRastreio(row: {
  data: string
  tecido: string
  tipo: string
  metros: number
  pedidoNorm: string | null
  origemMov: string | null
  almox: string | null
  isBaixa: boolean
  tipoMovimento?: string
}) {
  return hintLines([
    `${formatDate(row.data)} · ${row.tecido}: ${formatMeters(row.metros)} · ${row.tipo}.`,
    row.pedidoNorm
      ? `Pedido ${row.pedidoNorm}${row.origemMov ? ` · Orig. Mov. ${row.origemMov}` : ''}.`
      : `Sem pedido no Orig. Mov.${row.origemMov ? ` (${row.origemMov})` : ''}.`,
    row.almox ? `Almox ${row.almox}.` : null,
    row.isBaixa
      ? 'Entra no KPI oficial de baixa (produção ou SAIDA FF/AC/TC).'
      : 'Fora do KPI oficial de baixa.',
    row.tipoMovimento && row.tipoMovimento !== row.tipo
      ? `Tipo Signus: ${row.tipoMovimento}.`
      : null,
  ])
}

export function explainTecidoValorGrupo(row: {
  tecido: string
  valorUnitario: number | null
  baixa: number
  valorBaixa: number
  consumo: number
  valorConsumoEst: number
  pedidos: number
}) {
  return hintLines([
    `${row.tecido}: VU ${row.valorUnitario == null ? '—' : formatMoney(row.valorUnitario)}.`,
    `Qtd baixada ${formatMeters(row.baixa, row.baixa >= 10 ? 0 : 1)} → VU × qtd ${formatMoney(row.valorBaixa)}.`,
    `Consumo do Corte ${formatMeters(row.consumo, row.consumo >= 10 ? 0 : 1)} → VU × consumo ${formatMoney(row.valorConsumoEst)}.`,
    `${formatInt(row.pedidos)} pedido${row.pedidos === 1 ? '' : 's'} neste tecido. Abra o + para o detalhe.`,
  ])
}

export function explainTecidoValorPedido(row: {
  pedidoNorm: string
  cliente: string | null
  consumo: number
  baixa: number
  valorUnitario: number | null
  valorBaixa: number
  documentos: string
  observacao?: string | null
  alert?: boolean
  warning?: boolean
}) {
  return hintLines(
    [
      pedidoHead(row.pedidoNorm, [row.cliente]),
      `Consumo no Corte ${formatMeters(row.consumo, row.consumo >= 10 ? 0 : 1)} · baixa Signus ${formatMeters(row.baixa, row.baixa >= 10 ? 0 : 1)} · delta ${formatMeters(row.consumo - row.baixa, 0)}.`,
      `VU médio ${row.valorUnitario == null ? '—' : formatMoney(row.valorUnitario)} · VU × baixa ${formatMoney(row.valorBaixa)}.`,
      row.documentos !== '—' ? `Documento: ${row.documentos}.` : null,
      row.alert
        ? 'Vermelho: há baixa no Signus, mas o Corte não registrou consumo neste pedido. Costuma ser lançamento auxiliar.'
        : null,
      row.warning
        ? 'Amarelo: o Corte registrou consumo, mas ainda não há baixa no Signus. Por isso o valor fica zerado.'
        : null,
    ],
    row.observacao,
  )
}

export function explainDocumentoValor(row: {
  tipo: string
  valor: number
  metros: number
  movimentos: number
  pedidos: number
}) {
  const entraBaixa =
    /invent|nota fiscal|transfer|lançamento|lancamento/i.test(row.tipo)
      ? 'Fora do KPI de baixa de produção.'
      : 'Só produção + SAIDA FF/AC/TC somam o valor da baixa.'
  return hintLines([
    `${row.tipo}: ${formatMoney(row.valor)} · ${formatMeters(row.metros)} em ${formatInt(row.movimentos)} movimento${row.movimentos === 1 ? '' : 's'} · ${formatInt(row.pedidos)} pedido${row.pedidos === 1 ? '' : 's'}.`,
    entraBaixa,
  ])
}

export function explainFunilRow(label: string, funil: FunilKpis) {
  const n = formatInt
  const map: Record<string, string> = {
    'Corte 2026': `${n(funil.corte)} pedidos distintos no Corte 2026 (não é contagem de linha; * herda o cabeçalho).`,
    'Com Costura Produção': `${n(funil.comCostura)} pedidos do Corte com lançamento Origem = Produção na Costura.`,
    'Sem Costura Produção': `${n(funil.semCostura)} cortados sem Costura Produção. Parte foi para oficina (${n(funil.oficinasNoCorte)} também no Corte).`,
    'Com Revisão': `${n(funil.comRevisao)} pedidos do Corte 2026 com Data Produção na Revisão.`,
    'Sem Revisão': `${n(funil.semRevisao)} pedidos do Corte 2026 ainda sem Revisão.`,
    'Costura sem Corte': `${n(funil.costuraSemCorte)} pedidos com Costura Produção 2026 e ausentes no Corte 2026.`,
    'Revisão sem Corte': `${n(funil.revisaoSemCorte)} pedidos revisados em 2026 que foram cortados em outro ano. Não é falha de soma.`,
    'Oficinas (órfãos)': `${n(funil.oficinas)} pedidos nas Oficinas 2026 · ${n(funil.oficinasNoCorte)} também no Corte · ${n(funil.oficinasOrfas)} órfãos.`,
  }
  return map[label] ?? label
}

export function explainOficinaMes(args: {
  mes: string
  enviadas: number
  pendentes: number
}) {
  return hintLines([
    `${args.mes}: ${formatInt(args.enviadas)} peças enviadas · ${formatInt(args.pendentes)} ainda pendentes.`,
    'Pendente = enviadas − retornadas (saldo do lote com Data Envio no mês).',
  ])
}

export function explainAcaoSaldo(row: {
  codigo: string
  descricao: string
  modelo?: string
  entrada: number
  saida: number
  saldo: number
}) {
  return hintLines([
    `${row.codigo} · ${row.descricao}${row.modelo && row.modelo !== '—' ? ` · ${row.modelo}` : ''}.`,
    `Cortadas ${formatInt(row.entrada)} − aproveitadas ${formatInt(row.saida)} = saldo ${formatInt(row.saldo)}.`,
    'Saldo = TAB_ENTRADA (QTD CORTADO) menos TAB_SAIDA (QTD APROVEITAMENTO). Lista completa, sem recorte de mês.',
  ])
}

export function tipoTecidoHint(tipoNorm: string) {
  const map: Record<string, string> = {
    baixa_producao: 'Baixa BOM de produção. Entra no KPI oficial de metros.',
    baixa_canal: 'SAIDA FF/AC/TC por canal. Entra no KPI oficial.',
    retorno_corte: 'Retorno de tecido, não é consumo.',
    compra: 'Compra ou devolução. Fora do KPI de baixa.',
    inventario: 'Inventário. Fora do KPI de baixa.',
    ajuste: 'Ajuste auxiliar. Fora do KPI de baixa.',
    transferencia: 'Transferência de almox. Fora do KPI de baixa.',
    amostra: 'Amostra. Fora do KPI de baixa.',
  }
  return map[tipoNorm]
}
