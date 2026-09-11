import { foldSignus } from '@/lib/keys'

/** Almox usados em baixas Signus, saldo e previsão de compra em todo o dashboard. */
export const ALMOX_PRINCIPAIS = [
  '14-ACCA TEXTIL',
  '8-FAF TEXTIL',
  '7-TRU COMMERCE',
] as const

/** Texto curto para tooltips / descrições de tela. */
export const ALMOX_PRINCIPAIS_LABEL =
  '14-ACCA TEXTIL, 8-FAF TEXTIL e 7-TRU COMMERCE'

const ALMOX_PRINCIPAIS_FOLD = new Set(
  ALMOX_PRINCIPAIS.map((nome) => foldSignus(nome)),
)

export function isAlmoxPrincipal(nome: string | null | undefined) {
  if (!nome) return false
  return ALMOX_PRINCIPAIS_FOLD.has(foldSignus(nome))
}

/** Cláusula SQL para filtrar `fato_tecido_signus` / alias `s`. */
export function sqlAlmoxPrincipais(alias = 's') {
  const list = ALMOX_PRINCIPAIS.map((nome) => `'${nome.replace(/'/g, "''")}'`).join(
    ', ',
  )
  return `${alias}.almox IN (${list})`
}
