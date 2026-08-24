import type { FunilKpis, HeaderKpis, SerieMensal } from '@/lib/etl/types'

/** Snapshot dourado da carga atual em 24/08/2026.
 * Tecido vigente (2 pedidos / 768 pçs) e defeitos de oficina (524)
 * divergem do PDR escrito mais cedo no mesmo dia (4/794 e 479):
 * o Excel muda o dia inteiro. Corte, costura Produção, revisão e WIP fecham com o PDR.
 */

export const GOLDEN_HEADER: HeaderKpis = {
  pecasCortadas: 71887,
  pedidosCorte: 625,
  pecasCosturaProd: 25162,
  pecasRevisao: 75834,
  wipPedidos: 10,
  wipPecas: 2262,
  tecidoPedidos: 2,
  tecidoPecas: 768,
  oficinasPendentes: 4060,
  oficinasDefeitos: 524,
}

export const GOLDEN_FUNIL: FunilKpis = {
  corte: 625,
  comCostura: 297,
  semCostura: 328,
  comRevisao: 473,
  semRevisao: 152,
  costuraSemCorte: 48,
  revisaoSemCorte: 169,
  oficinas: 160,
  oficinasNoCorte: 134,
  oficinasOrfas: 26,
}

export const GOLDEN_SERIE: SerieMensal[] = [
  { mes: 1, cortadas: 7803, costura: 5386, revisao: 8772 },
  { mes: 2, cortadas: 13208, costura: 2710, revisao: 7267 },
  { mes: 3, cortadas: 14568, costura: 4963, revisao: 6275 },
  { mes: 4, cortadas: 7059, costura: 2936, revisao: 8877 },
  { mes: 5, cortadas: 5696, costura: 2228, revisao: 8127 },
  { mes: 6, cortadas: 8236, costura: 3666, revisao: 13021 },
  { mes: 7, cortadas: 13924, costura: 2161, revisao: 17435 },
  { mes: 8, cortadas: 1393, costura: 1112, revisao: 6060 },
]

export function diffGolden(
  header: HeaderKpis,
  funil: FunilKpis,
  serie: SerieMensal[],
) {
  const mismatches: string[] = []
  const headerKeys = Object.keys(GOLDEN_HEADER) as (keyof HeaderKpis)[]
  for (const key of headerKeys) {
    if (header[key] !== GOLDEN_HEADER[key]) {
      mismatches.push(`${key}: ${header[key]} ≠ ${GOLDEN_HEADER[key]}`)
    }
  }
  const funilKeys = Object.keys(GOLDEN_FUNIL) as (keyof FunilKpis)[]
  for (const key of funilKeys) {
    if (funil[key] !== GOLDEN_FUNIL[key]) {
      mismatches.push(`funil.${key}: ${funil[key]} ≠ ${GOLDEN_FUNIL[key]}`)
    }
  }
  for (const expected of GOLDEN_SERIE) {
    const actual = serie.find((row) => row.mes === expected.mes)
    if (!actual) {
      mismatches.push(`série mês ${expected.mes} ausente`)
      continue
    }
    if (actual.cortadas !== expected.cortadas) {
      mismatches.push(
        `série ${expected.mes} cortadas: ${actual.cortadas} ≠ ${expected.cortadas}`,
      )
    }
    if (actual.costura !== expected.costura) {
      mismatches.push(
        `série ${expected.mes} costura: ${actual.costura} ≠ ${expected.costura}`,
      )
    }
    if (actual.revisao !== expected.revisao) {
      mismatches.push(
        `série ${expected.mes} revisão: ${actual.revisao} ≠ ${expected.revisao}`,
      )
    }
  }
  return mismatches
}
