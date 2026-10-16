/** Colunas já existentes no relatório. A tela só grava o que o Excel já tem. */

export const ETAPAS_APONTAMENTO = {
  costura: {
    titulo: 'Costura Produção',
    href: '/costuras/producao',
    voltar: '/costuras',
    voltarLabel: 'Voltar à Costura',
    acesso: '/costuras',
    tabela: 'costura_lancamento',
    nuvem: 'costura-operacao',
    temOrigem: true,
    qtdLabel: 'Qtd a somar',
  },
  revisao: {
    titulo: 'Lançamento de revisão',
    href: '/revisao/lancamento',
    voltar: '/revisao',
    voltarLabel: 'Voltar à Revisão',
    acesso: '/revisao',
    tabela: 'revisao_lancamento',
    nuvem: 'revisao-operacao',
    temOrigem: false,
    qtdLabel: 'Qtd a somar',
  },
} as const

export type EtapaApontamento = keyof typeof ETAPAS_APONTAMENTO

/** Origens que o relatório de Costura já usa. */
export const ORIGENS_COSTURA = [
  'Produção',
  'Troca de Etiqueta',
  'Aplicação de Festonê',
  'Conserto',
] as const

/** Responsáveis que já lançam no relatório de Costura. */
export const RESPONSAVEIS_COSTURA = ['Luiz Eduardo', 'Miriam', 'Elaine'] as const

/** Responsáveis que já lançam no relatório de Revisão. */
export const RESPONSAVEIS_REVISAO = ['Jô', 'Jeniffer', 'Vanessa'] as const

/**
 * Observação ao registrar no card uma qtd que já existia na planilha
 * (descrição incompleta no Excel). Entra no “Já lançado” do card; o KPI
 * não soma de novo (a planilha já conta).
 */
export const OBS_JA_LANCADO_PLANILHA = 'já lançado na planilha'

export function observacaoJaNaPlanilha(value: string | null | undefined) {
  if (!value) return false
  const fold = value
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  return fold.includes('ja lancado na planilha')
}

export function etapaApontamento(value: string): EtapaApontamento | null {
  if (value === 'costura' || value === 'revisao') return value
  return null
}

export function origemCosturaValida(value: string) {
  return (ORIGENS_COSTURA as readonly string[]).includes(value)
}

export function origemCosturaConserto(value: string) {
  return value.trim() === 'Conserto'
}

export function responsavelApontamentoValido(etapa: EtapaApontamento, value: string) {
  const lista = etapa === 'costura' ? RESPONSAVEIS_COSTURA : RESPONSAVEIS_REVISAO
  return (lista as readonly string[]).includes(value)
}
