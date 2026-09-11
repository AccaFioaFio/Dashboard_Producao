/**
 * Filtro da coluna CATEGORIA (Signus / estoque).
 * Sem seleção = todas as categorias; com seleção = match exato.
 */
export function sqlCategoriaFilter(alias: string, categoria?: string) {
  if (!categoria) return null
  return `${alias}.categoria = @categoria`
}

/** Recorte fixo MATÉRIA PRIMA / TECIDO (legado; preferir sqlCategoriaFilter). */
export function sqlCategoriaTecido(alias: string) {
  return `(
    COALESCE(${alias}.categoria, '') LIKE '%PRIMA%'
    OR upper(COALESCE(${alias}.categoria, '')) = 'TECIDO'
  )`
}
