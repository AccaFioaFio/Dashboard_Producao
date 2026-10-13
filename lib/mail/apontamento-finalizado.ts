import 'server-only'

import { formatDate, formatNumber } from '@/lib/format'
import type { EtapaApontamento } from '@/lib/apontamento'
import { isCodigoGeradoSemCadastro } from '@/lib/produto-codigo-manual'

export type AvisoApontamentoItem = {
  codProduto: string
  nomeProduto: string | null
  qtdPecas: number | null
  dataProducao: string
  responsavel: string | null
  origem?: string | null
}

export type AvisoApontamentoFinalizado = {
  etapa: EtapaApontamento
  pedidoNorm: string
  cliente: string | null
  itens: AvisoApontamentoItem[]
}

function quantidade(value: number | null) {
  if (value == null) return 'não informada'
  return formatNumber(value, value % 1 ? 2 : 0)
}

function blocoItem(item: AvisoApontamentoItem, indice: number, total: number, etapa: EtapaApontamento) {
  const produto = item.nomeProduto?.replace(/\s+/g, ' ').trim() || '—'
  const linhas = [
    `Produto: ${produto}`,
    `Código: ${isCodigoGeradoSemCadastro(item.codProduto) ? '—' : item.codProduto}`,
    `Quantidade: ${quantidade(item.qtdPecas)}`,
    `Data produção: ${formatDate(item.dataProducao)}`,
    `Responsável: ${item.responsavel?.trim() || '—'}`,
  ]
  if (etapa === 'costura') {
    linhas.splice(2, 0, `Origem: ${item.origem?.trim() || '—'}`)
  }
  if (total > 1) linhas.unshift(`Item ${indice + 1}`)
  return linhas
}

export function montarTextoAvisoApontamento(aviso: AvisoApontamentoFinalizado) {
  if (!aviso.itens.length) {
    throw new Error(
      aviso.etapa === 'costura'
        ? 'Nenhum item com costura produção para avisar.'
        : 'Nenhum item com revisão para avisar.',
    )
  }
  const varios = aviso.itens.length > 1
  const cabeca =
    aviso.etapa === 'costura'
      ? varios
        ? `A costura produção de ${aviso.itens.length} itens foi lançada. A revisão pode seguir.`
        : 'A costura produção deste item foi lançada. A revisão pode seguir.'
      : varios
        ? `A revisão de ${aviso.itens.length} itens foi lançada.`
        : 'A revisão deste item foi lançada.'
  const linhas = [
    cabeca,
    '',
    `Pedido: ${aviso.pedidoNorm}`,
    `Cliente: ${aviso.cliente?.trim() || '—'}`,
    '',
    ...aviso.itens.flatMap((item, indice) => [
      ...blocoItem(item, indice, aviso.itens.length, aviso.etapa),
      '',
    ]),
  ]
  return linhas.join('\n').trimEnd()
}

export function montarTextoAvisoCostura(
  aviso: Omit<AvisoApontamentoFinalizado, 'etapa'>,
) {
  return montarTextoAvisoApontamento({ ...aviso, etapa: 'costura' })
}

export function montarTextoAvisoRevisao(
  aviso: Omit<AvisoApontamentoFinalizado, 'etapa'>,
) {
  return montarTextoAvisoApontamento({ ...aviso, etapa: 'revisao' })
}
