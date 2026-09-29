export const RESPONSAVEIS_CORTE = ['Jair', 'Gustavo', 'Vitor', 'Leonardo'] as const

export function responsavelCorteValido(value: string) {
  return (RESPONSAVEIS_CORTE as readonly string[]).includes(value)
}
