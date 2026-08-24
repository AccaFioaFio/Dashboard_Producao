export type DashFilters = {
  mes?: number
  canal?: string
  cliente?: string
  responsavel?: string
  produto?: string
  oficina?: string
  q?: string
}

export type FilterField = Exclude<keyof DashFilters, never>

export type FilterOptions = {
  meses: number[]
  canais: string[]
  clientes: string[]
  responsaveis: string[]
  produtos: string[]
  oficinas: string[]
}

const KEYS: FilterField[] = [
  'mes',
  'canal',
  'cliente',
  'responsavel',
  'produto',
  'oficina',
  'q',
]

function first(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]
  return value
}

export function parseFilters(
  searchParams: Record<string, string | string[] | undefined>,
): DashFilters {
  const mesRaw = first(searchParams.mes)
  const mes = mesRaw ? Number(mesRaw) : undefined
  const q = first(searchParams.q)?.trim()
  return {
    mes: mes && mes >= 1 && mes <= 12 ? mes : undefined,
    canal: first(searchParams.canal) || undefined,
    cliente: first(searchParams.cliente) || undefined,
    responsavel: first(searchParams.responsavel) || undefined,
    produto: first(searchParams.produto) || undefined,
    oficina: first(searchParams.oficina) || undefined,
    q: q || undefined,
  }
}

export function filtersToSearch(filters: DashFilters) {
  const params = new URLSearchParams()
  if (filters.mes) params.set('mes', String(filters.mes))
  if (filters.canal) params.set('canal', filters.canal)
  if (filters.cliente) params.set('cliente', filters.cliente)
  if (filters.responsavel) params.set('responsavel', filters.responsavel)
  if (filters.produto) params.set('produto', filters.produto)
  if (filters.oficina) params.set('oficina', filters.oficina)
  if (filters.q) params.set('q', filters.q)
  return params
}

export function countActiveFilters(filters: DashFilters) {
  return KEYS.reduce((count, key) => (filters[key] ? count + 1 : count), 0)
}

export function hasActiveFilters(filters: DashFilters) {
  return countActiveFilters(filters) > 0
}
