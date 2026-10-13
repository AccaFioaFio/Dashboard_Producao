/** Prefixo de códigos gerados quando o item entra só com descrição. */
export const PREFIXO_CODIGO_SEM_CADASTRO = 'SC'

export const MAX_DESCRICAO_PRODUTO = 180

export function isCodigoGeradoSemCadastro(cod: string) {
  return new RegExp(`^${PREFIXO_CODIGO_SEM_CADASTRO}[0-9A-F]{8}$`, 'i').test(
    cod.trim(),
  )
}

/** Código estável a partir da descrição (não colide com códigos numéricos da base). */
export function codigoPorDescricao(descricao: string) {
  const normalizada = descricao.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')
  let h = 2166136261
  for (let i = 0; i < normalizada.length; i++) {
    h ^= normalizada.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `${PREFIXO_CODIGO_SEM_CADASTRO}${(h >>> 0).toString(16).toUpperCase().padStart(8, '0')}`
}
