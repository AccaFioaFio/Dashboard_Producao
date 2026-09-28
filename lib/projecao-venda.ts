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
  projecaoProximoMes: number | null
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
 * Uma projeção para a empresa inteira: o mesmo mês do ano anterior × ritmo dos
 * meses já fechados. Cada linha recebe a fatia que teve nesses meses fechados,
 * para o total por estado e por representante ser o mesmo número.
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
    porChave.set(chave, {
      participacaoFechadaPct: parte * 100,
      realizadoMesAberto:
        mesAberto > 0 ? soma(serie, ano, mesAberto, mesAberto, chave) : 0,
      projecaoMesAberto: ritmoGeral == null ? null : projecaoMesAberto * parte,
      projecaoProximoMes:
        ritmoGeral == null || mesProximo == null ? null : projecaoProximoMes * parte,
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
