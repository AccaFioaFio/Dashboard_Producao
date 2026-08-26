export const FUNIL_SLICES = [
  'corte',
  'comCostura',
  'semCostura',
  'comRevisao',
  'semRevisao',
  'costuraSemCorte',
  'revisaoSemCorte',
  'oficinas',
  'oficinasOrfas',
  'wip',
  'aguardandoTecido',
] as const

export type FunilSlice = (typeof FUNIL_SLICES)[number]

export type FunilSliceMeta = {
  id: FunilSlice
  label: string
  group: 'etapa' | 'fila' | 'parado'
  hint: string
}

export const FUNIL_SLICE_META: FunilSliceMeta[] = [
  {
    id: 'corte',
    label: 'Corte 2026',
    group: 'etapa',
    hint: 'Pedidos distintos no Corte. Não é contagem de linha.',
  },
  {
    id: 'comCostura',
    label: 'Com Costura Produção',
    group: 'etapa',
    hint: 'Cortados em 2026 com lançamento Origem = Produção.',
  },
  {
    id: 'comRevisao',
    label: 'Com Revisão',
    group: 'etapa',
    hint: 'Cortados em 2026 com Data Produção na Revisão.',
  },
  {
    id: 'semCostura',
    label: 'Sem Costura Produção',
    group: 'fila',
    hint: 'Cortados sem Costura Produção. Parte foi para oficina.',
  },
  {
    id: 'semRevisao',
    label: 'Sem Revisão',
    group: 'fila',
    hint: 'Cortados em 2026 ainda sem Revisão.',
  },
  {
    id: 'costuraSemCorte',
    label: 'Costura sem Corte',
    group: 'fila',
    hint: 'Costura Produção 2026 ausente no Corte 2026.',
  },
  {
    id: 'revisaoSemCorte',
    label: 'Revisão sem Corte',
    group: 'fila',
    hint: 'Revisados em 2026 e cortados em outro ano. Não é falha de soma.',
  },
  {
    id: 'oficinas',
    label: 'Oficinas',
    group: 'fila',
    hint: 'Pedidos com lote enviado em 2026.',
  },
  {
    id: 'oficinasOrfas',
    label: 'Oficinas órfãs',
    group: 'fila',
    hint: 'Oficina 2026 sem pedido no Corte 2026.',
  },
  {
    id: 'wip',
    label: 'WIP Corte',
    group: 'parado',
    hint: 'Status vigente EM PRODUÇÃO.',
  },
  {
    id: 'aguardandoTecido',
    label: 'Aguardando tecido',
    group: 'parado',
    hint: 'Linha de Corte com status AGUARDANDO TECIDO.',
  },
]

const SLICE_SET = new Set<string>(FUNIL_SLICES)

export function isFunilSlice(value: unknown): value is FunilSlice {
  return typeof value === 'string' && SLICE_SET.has(value)
}

export function funilSliceMeta(id: FunilSlice) {
  return FUNIL_SLICE_META.find((item) => item.id === id)!
}

export function pedidosFatiaHref(id: FunilSlice) {
  return `/pedidos?fatia=${id}`
}

export function funilSliceWhere(alias = 'd'): Record<FunilSlice, string> {
  return {
    corte: `${alias}.no_corte = 1`,
    comCostura: `${alias}.no_corte = 1 AND ${alias}.no_costura_prod = 1`,
    semCostura: `${alias}.no_corte = 1 AND ${alias}.no_costura_prod = 0`,
    comRevisao: `${alias}.no_corte = 1 AND ${alias}.no_revisao = 1`,
    semRevisao: `${alias}.no_corte = 1 AND ${alias}.no_revisao = 0`,
    costuraSemCorte: `${alias}.no_costura_prod = 1 AND ${alias}.no_corte = 0`,
    revisaoSemCorte: `${alias}.no_revisao = 1 AND ${alias}.no_corte = 0`,
    oficinas: `${alias}.no_oficinas = 1`,
    oficinasOrfas: `${alias}.no_oficinas = 1 AND ${alias}.no_corte = 0`,
    wip: `${alias}.no_corte = 1 AND p.status_vigente = 'EM PRODUÇÃO'`,
    aguardandoTecido: `${alias}.no_corte = 1 AND EXISTS (
      SELECT 1 FROM fato_corte_linha l
      WHERE l.pedido_norm = ${alias}.pedido_norm AND l.status = 'AGUARDANDO TECIDO'
    )`,
  }
}
