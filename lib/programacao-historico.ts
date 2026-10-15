export type ProgramacaoHistoricoAcao =
  | 'salvar_pedido'
  | 'excluir_pedido'
  | 'excluir_item'

export type ProgramacaoHistoricoEvento = {
  id: string
  ocorridoEm: string
  usuarioLogin: string
  acao: ProgramacaoHistoricoAcao
  pedido: string | null
  pedidoNorm: string | null
  cliente: string | null
  itemKey: string | null
  itemNome: string | null
  detalhe: string
}

export function novoHistoricoId() {
  return `ph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function detalheSalvarPedido(input: {
  usuarioLogin: string
  pedido: string
  gravados: number
}) {
  const n = input.gravados
  return `${input.usuarioLogin} salvou pedido ${input.pedido} (${n} item${n === 1 ? '' : 's'})`
}

export function detalheExcluirPedido(input: {
  usuarioLogin: string
  pedido: string
  removidos: number
}) {
  const n = input.removidos
  return `${input.usuarioLogin} excluiu pedido ${input.pedido} (${n} item${n === 1 ? '' : 's'})`
}

export function detalheExcluirItem(input: {
  usuarioLogin: string
  pedido: string
  itemNome: string
}) {
  return `${input.usuarioLogin} excluiu item "${input.itemNome}" do pedido ${input.pedido}`
}
