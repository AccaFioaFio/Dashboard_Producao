import { formatNumber } from '@/lib/format'

/** Como a quantidade de um código entra nos cards. */
export const CLASSES_UNIDADE = ['metro', 'peca', 'quilo', 'folha', 'sem', 'outra'] as const

export type ClasseUnidade = (typeof CLASSES_UNIDADE)[number]

export type QuebraUnidade = Record<ClasseUnidade, number>

const ROTULO: Record<ClasseUnidade, string> = {
  metro: 'metro',
  peca: 'peça',
  quilo: 'quilo',
  folha: 'folha',
  sem: 'sem unidade no estoque',
  outra: 'outra unidade',
}

export function quebraVazia(): QuebraUnidade {
  return { metro: 0, peca: 0, quilo: 0, folha: 0, sem: 0, outra: 0 }
}

export function normalizarClasse(value: string | null | undefined): ClasseUnidade {
  if (value && (CLASSES_UNIDADE as readonly string[]).includes(value)) {
    return value as ClasseUnidade
  }
  return 'outra'
}

/** Unidade do estoque. Sem cadastro no saldo, a quantidade não vira metro. */
export function sqlClasseUnidade(unidade: string, emMetros: string) {
  const u = `upper(trim(COALESCE(${unidade}, '')))`
  return `CASE
    WHEN COALESCE(${emMetros}, 0) = 1 OR ${u} IN ('MT', 'M', 'MTS', 'METRO') THEN 'metro'
    WHEN ${u} IN ('PC', 'PCS', 'PECA', 'PEC', 'UN', 'UND', 'UNID', 'UNI') THEN 'peca'
    WHEN ${u} IN ('KG', 'KGS', 'KILO') THEN 'quilo'
    WHEN ${u} IN ('FO', 'FL', 'FOLHA', 'FLS') THEN 'folha'
    WHEN trim(COALESCE(${unidade}, '')) = '' THEN 'sem'
    ELSE 'outra'
  END`
}

export function somarCampo<T extends { classe: string }>(
  rows: T[],
  campo: keyof T,
): QuebraUnidade {
  const quebra = quebraVazia()
  for (const row of rows) {
    const valor = Number(row[campo] ?? 0)
    if (!valor) continue
    quebra[normalizarClasse(row.classe)] += valor
  }
  return quebra
}

export function formatClasse(value: number, classe: ClasseUnidade) {
  const digits = value !== 0 && Math.abs(value) < 10 ? 1 : 0
  const texto = formatNumber(value, digits)
  if (classe === 'metro') return `${texto} m`
  if (classe === 'peca') return `${texto} pc`
  if (classe === 'quilo') return `${texto} kg`
  if (classe === 'folha') return `${texto} fl`
  return texto
}

/** Junta só as unidades que têm quantidade. Metro não soma com peça. */
export function formatQuebra(quebra: QuebraUnidade) {
  const partes = CLASSES_UNIDADE.filter((classe) => quebra[classe]).map((classe) =>
    formatClasse(quebra[classe], classe),
  )
  return partes.length ? partes.join(' · ') : '0'
}

/** Número grande do card: uma linha, a mesma fonte dos outros KPIs. */
export function valorPrincipal(quebra: QuebraUnidade) {
  if (quebra.metro) return formatClasse(quebra.metro, 'metro')
  const classe = CLASSES_UNIDADE.find((item) => quebra[item])
  return classe ? formatClasse(quebra[classe], classe) : '0'
}

/** Peça, quilo e folha que não cabem no número grande. */
export function complementoQuebra(quebra: QuebraUnidade) {
  const principal = quebra.metro ? 'metro' : CLASSES_UNIDADE.find((item) => quebra[item])
  return CLASSES_UNIDADE.filter((classe) => classe !== principal && quebra[classe])
    .map((classe) => formatClasse(quebra[classe], classe))
    .join(' · ')
}

export function temOutraUnidade(quebra: QuebraUnidade) {
  return CLASSES_UNIDADE.some((classe) => classe !== 'metro' && quebra[classe] !== 0)
}

export function textoCodigos(quebra: QuebraUnidade) {
  const partes = CLASSES_UNIDADE.filter((classe) => quebra[classe]).map(
    (classe) => `${formatNumber(quebra[classe], 0)} em ${ROTULO[classe]}`,
  )
  return partes.length ? partes.join(' · ') : '0 códigos'
}
