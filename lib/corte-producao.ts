import { fold } from '@/lib/keys'

export const RESPONSAVEIS_CORTE = ['Jair', 'Gustavo', 'Vitor', 'Leonardo'] as const

export function responsavelCorteValido(value: string) {
  return (RESPONSAVEIS_CORTE as readonly string[]).includes(value)
}

export type ItemCortePedido = {
  codProduto: string
  excelRow: number
  nomeProduto: string | null
  qtdPedida: number
  qtdReal: number | null
  dataInicio: string | null
  dataFinal: string | null
  responsavel: string | null
  pedidoRaw: string
  tipo: string | null
}

/** Faturamento da entrega futura (CFOP 5116): repete os produtos do pedido simples. */
function faturamentoEntregaFutura(tipo: string | null) {
  const texto = fold(tipo ?? '')
  if (texto.includes('5116')) return true
  return texto.includes('VENDA DE ENTREGA FUTURA') && !texto.includes('SIMPLES')
}

function preenchimento(row: ItemCortePedido) {
  return (
    (row.qtdReal != null ? 1 : 0) +
    (row.dataInicio ? 1 : 0) +
    (row.dataFinal ? 1 : 0) +
    (row.responsavel ? 1 : 0)
  )
}

/**
 * Um código por pedido. Cópia do faturamento (5116) e linhas repetidas
 * com a mesma quantidade contam uma vez. Quantidades diferentes do mesmo
 * código somam numa linha só. Lançamento já feito em qualquer cópia permanece.
 */
export function collapseItensCorte<T extends ItemCortePedido>(rows: T[]): T[] {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const list = groups.get(row.codProduto) ?? []
    list.push(row)
    groups.set(row.codProduto, list)
  }

  const itens: T[] = []
  for (const group of groups.values()) {
    const semNota = group.filter((row) => !faturamentoEntregaFutura(row.tipo))
    const fonte = semNota.length ? semNota : group
    const quantidades = [...new Set(fonte.map((row) => row.qtdPedida))]
    const qtdPedida =
      quantidades.length === 1
        ? quantidades[0]
        : quantidades.reduce((sum, qtd) => sum + qtd, 0)

    const escolhida = [...fonte].sort(
      (a, b) => preenchimento(b) - preenchimento(a) || a.excelRow - b.excelRow,
    )[0]
    const lancamento =
      preenchimento(escolhida) > 0
        ? escolhida
        : [...group].sort(
            (a, b) => preenchimento(b) - preenchimento(a) || a.excelRow - b.excelRow,
          )[0]

    itens.push({
      ...escolhida,
      qtdPedida,
      qtdReal: lancamento?.qtdReal ?? escolhida.qtdReal,
      dataInicio: lancamento?.dataInicio ?? escolhida.dataInicio,
      dataFinal: lancamento?.dataFinal ?? escolhida.dataFinal,
      responsavel: lancamento?.responsavel ?? escolhida.responsavel,
    })
  }

  itens.sort((a, b) => a.excelRow - b.excelRow || a.codProduto.localeCompare(b.codProduto))
  return itens
}
