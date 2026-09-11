import { isFunilSlice, type FunilSlice } from '@/lib/funil'

/** Padrão do filtro Categoria na aba Tecidos (igual ao Excel). */
export const CATEGORIA_TECIDO_PADRAO = 'MATÉRIA PRIMA'

export type DashFilters = {
  mes?: number
  canal?: string
  cliente?: string
  responsavel?: string
  produto?: string
  oficina?: string
  q?: string
  tipo?: string
  categoria?: string
  fatia?: FunilSlice
}

export type FilterField = Exclude<keyof DashFilters, never>

export type FilterOptions = {
  meses: number[]
  canais: string[]
  clientes: string[]
  responsaveis: string[]
  produtos: string[]
  oficinas: string[]
  tipos?: { value: string; label: string }[]
  categorias?: string[]
}

const KEYS: FilterField[] = [
  'mes',
  'canal',
  'cliente',
  'responsavel',
  'produto',
  'oficina',
  'q',
  'tipo',
  'categoria',
  'fatia',
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
  const fatiaRaw = first(searchParams.fatia)
  return {
    mes: mes && mes >= 1 && mes <= 12 ? mes : undefined,
    canal: first(searchParams.canal) || undefined,
    cliente: first(searchParams.cliente) || undefined,
    responsavel: first(searchParams.responsavel) || undefined,
    produto: first(searchParams.produto) || undefined,
    oficina: first(searchParams.oficina) || undefined,
    q: q || undefined,
    tipo: first(searchParams.tipo)?.trim() || undefined,
    categoria: first(searchParams.categoria)?.trim() || undefined,
    fatia: isFunilSlice(fatiaRaw) ? fatiaRaw : undefined,
  }
}

/** Garante MATÉRIA PRIMA quando a URL não traz categoria. */
export function withCategoriaPadrao(filters: DashFilters): DashFilters {
  return {
    ...filters,
    categoria: filters.categoria || CATEGORIA_TECIDO_PADRAO,
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
  if (filters.tipo) params.set('tipo', filters.tipo)
  if (filters.categoria) params.set('categoria', filters.categoria)
  if (filters.fatia) params.set('fatia', filters.fatia)
  return params
}

export function countActiveFilters(filters: DashFilters) {
  return KEYS.reduce((count, key) => {
    const value = filters[key]
    if (!value) return count
    // Padrão da aba Tecidos não conta como "recorte extra".
    if (key === 'categoria' && value === CATEGORIA_TECIDO_PADRAO) return count
    return count + 1
  }, 0)
}

export function hasActiveFilters(filters: DashFilters) {
  return countActiveFilters(filters) > 0
}
