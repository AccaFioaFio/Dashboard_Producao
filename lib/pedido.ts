export function pedidoHref(pedido: string) {
  return `/pedidos/${encodeURIComponent(pedido)}`
}

export function parsePedidoParam(raw: string) {
  try {
    return decodeURIComponent(raw).trim()
  } catch {
    return raw.trim()
  }
}

export function pedidoDigits(value: string) {
  const digits = value.replace(/\D/g, '')
  if (!digits) return null
  return digits.replace(/^0+/, '') || digits
}

export const QUALIDADE_TIPO_LABEL: Record<string, string> = {
  revisao_total: 'Linha de total da Revisão',
  revisao_qtd_eq_pedido: 'Qtd = número do pedido',
  dias_corte_serial: 'DIAS DE CORTE serial',
  status_duplo: 'Mesmo pedido com status diferentes nas ordens de corte',
  oficina_vazia: 'Linha sem oficina',
  lilica: 'Lilica sem retorno',
  orfao_costura: 'Costura Produção sem Corte 2026',
  orfao_revisao: 'Revisão sem Corte 2026',
  orfao_oficina: 'Oficina sem Corte 2026',
  orfao_signus: 'Baixa Signus sem Corte 2026',
}

export const AGING_FAIXAS = [
  { key: '0-7', label: '0 a 7 dias', min: 0, max: 7 },
  { key: '8-15', label: '8 a 15 dias', min: 8, max: 15 },
  { key: '16-30', label: '16 a 30 dias', min: 16, max: 30 },
  { key: '31+', label: 'Mais de 30 dias', min: 31, max: Infinity },
] as const

export function agingFaixa(dias: number | null) {
  if (dias == null || !Number.isFinite(dias) || dias < 0) return null
  return AGING_FAIXAS.find((faixa) => dias >= faixa.min && dias <= faixa.max) ?? null
}
