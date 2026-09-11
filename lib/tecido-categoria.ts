import { foldSignus } from '@/lib/keys'

/**
 * Categorias Signus/estoque que entram na aba Tecidos.
 * Estoque em metros misturava acabados/embalagens sem este recorte.
 */
export function isCategoriaTecido(categoria: string | null | undefined) {
  const catFold = foldSignus(categoria ?? '')
  if (!catFold) return false
  if (catFold === 'TECIDO') return true
  if (catFold.includes('PRIMA')) return true
  return false
}

/** Cláusula SQL: só MATÉRIA PRIMA / TECIDO (quando não há filtro explícito). */
export function sqlCategoriaTecido(alias: string) {
  return `(
    COALESCE(${alias}.categoria, '') LIKE '%PRIMA%'
    OR upper(COALESCE(${alias}.categoria, '')) = 'TECIDO'
  )`
}

/** Filtro opcional por categoria exata; senão mantém só categorias de tecido. */
export function sqlCategoriaFilter(alias: string, categoria?: string) {
  if (categoria) return `${alias}.categoria = @categoria`
  return sqlCategoriaTecido(alias)
}
