/** Saldo de peças ainda na oficina: enviadas − retornadas (nunca negativo). */
export function pendentesOficina(enviadas: number, retornadas: number) {
  return Math.max(0, enviadas - retornadas)
}

/** Expressão SQL do saldo pendente (alias opcional da tabela, ex. `o`). */
export function sqlPendentesOficina(alias?: string) {
  const p = alias ? `${alias}.` : ''
  return `MAX(0, COALESCE(${p}qtd_enviadas, 0) - COALESCE(${p}qtd_retornadas, 0))`
}
