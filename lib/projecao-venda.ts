type SerieMes = {
  chave: string
  ano: number
  mes: number
  fat: number
}

export type ProjecaoLinha = {
  /** Fatia do faturado dos meses já fechados deste ano. */
  participacaoFechadaPct: number
  realizadoMesAberto: number
  projecaoMesAberto: number | null
  /** Fatia desta chave na projeção da empresa para o mês seguinte. */
  projecaoProximoMes: number | null
  /** Ritmo dos meses fechados desta chave. Null quando o ano anterior não tem base. */
  ritmoIndividual: number | null
  /**
   * Mês seguinte do ano anterior desta chave × ritmo dela.
   * Sem base no período fechado, usa o ritmo da empresa sobre o mês dela.
   * Null quando não há base nenhuma no ano anterior.
   */
  projecaoProximoMesIndividual: number | null
  /** A projeção individual acima usou o ritmo da empresa por falta de base no período. */
  projecaoIndividualUsaRitmoEmpresa: boolean
}

export type ProjecaoVenda = {
  ritmoGeral: number | null
  projecaoMesAberto: number
  projecaoProximoMes: number
  realizadoMesAberto: number
  porChave: Map<string, ProjecaoLinha>
}

function soma(
  serie: SerieMes[],
  ano: number,
  from: number,
  to: number,
  chave?: string,
) {
  let total = 0
  for (const row of serie) {
    if (row.ano !== ano || row.mes < from || row.mes > to) continue
    if (chave != null && row.chave !== chave) continue
    total += row.fat
  }
  return total
}

/**
 * Duas leituras do mesmo mês seguinte.
 * Empresa: o mês do ano anterior × ritmo dos meses já fechados, repartido pela
 * fatia de cada chave nesse período. A soma por estado e por representante é
 * o mesmo número.
 * Individual: o mesmo mês do ano anterior da própria chave × o ritmo dela.
 * Sem faturado dela nos meses fechados do ano anterior, entra o ritmo da empresa
 * sobre o mês dela. Sem nenhuma base, a projeção individual fica vazia.
 */
export function calcularProjecao({
  serie,
  chaves,
  ano,
  mesesFechados,
  mesAberto,
  mesProximo,
}: {
  serie: SerieMes[]
  chaves: string[]
  ano: number
  mesesFechados: number
  mesAberto: number
  mesProximo: number | null
}): ProjecaoVenda {
  const anteriorFechado =
    mesesFechados >= 1 ? soma(serie, ano - 1, 1, mesesFechados) : 0
  const atualFechado =
    mesesFechados >= 1 ? soma(serie, ano, 1, mesesFechados) : 0
  const ritmoGeral =
    mesesFechados >= 1 && anteriorFechado > 0 ? atualFechado / anteriorFechado : null

  const baseAberto = mesAberto > 0 ? soma(serie, ano - 1, mesAberto, mesAberto) : 0
  const baseProximo =
    mesProximo != null ? soma(serie, ano - 1, mesProximo, mesProximo) : 0
  const projecaoMesAberto = ritmoGeral == null ? 0 : baseAberto * ritmoGeral
  const projecaoProximoMes =
    ritmoGeral == null || mesProximo == null ? 0 : baseProximo * ritmoGeral
  const realizadoMesAberto =
    mesAberto > 0 ? soma(serie, ano, mesAberto, mesAberto) : 0

  const porChave = new Map<string, ProjecaoLinha>()
  for (const chave of chaves) {
    const fechado =
      mesesFechados >= 1 ? soma(serie, ano, 1, mesesFechados, chave) : 0
    const parte = atualFechado > 0 ? fechado / atualFechado : 0
    const anteriorChave =
      mesesFechados >= 1 ? soma(serie, ano - 1, 1, mesesFechados, chave) : 0
    const baseProximoChave =
      mesProximo != null ? soma(serie, ano - 1, mesProximo, mesProximo, chave) : 0
    const ritmoIndividual = anteriorChave > 0 ? fechado / anteriorChave : null
    const usaRitmoEmpresa =
      mesProximo != null && ritmoIndividual == null && ritmoGeral != null && baseProximoChave > 0
    const ritmoIndividualAplicado = ritmoIndividual ?? (usaRitmoEmpresa ? ritmoGeral : null)
    porChave.set(chave, {
      participacaoFechadaPct: parte * 100,
      realizadoMesAberto:
        mesAberto > 0 ? soma(serie, ano, mesAberto, mesAberto, chave) : 0,
      projecaoMesAberto: ritmoGeral == null ? null : projecaoMesAberto * parte,
      projecaoProximoMes:
        ritmoGeral == null || mesProximo == null ? null : projecaoProximoMes * parte,
      ritmoIndividual,
      projecaoProximoMesIndividual:
        ritmoIndividualAplicado == null || mesProximo == null
          ? null
          : baseProximoChave * ritmoIndividualAplicado,
      projecaoIndividualUsaRitmoEmpresa: usaRitmoEmpresa,
    })
  }

  return {
    ritmoGeral,
    projecaoMesAberto,
    projecaoProximoMes,
    realizadoMesAberto,
    porChave,
  }
}
