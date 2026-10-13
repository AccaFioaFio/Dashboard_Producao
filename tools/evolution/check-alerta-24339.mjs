import Database from 'better-sqlite3'

const db = new Database('data/producao.sqlite', { readonly: true })
const p = '24339'

console.log(
  'LANC',
  db
    .prepare(
      `SELECT pedido_norm, cod_produto, data_final, aviso_data_final, atualizado_em
       FROM corte_producao_lancamento
       WHERE pedido_norm = ? OR pedido_norm LIKE ?
       ORDER BY atualizado_em DESC`,
    )
    .all(p, `%${p}%`),
)

console.log(
  'ALERTA',
  db
    .prepare(
      `SELECT id, pedido_norm, cliente, enviado_em, visto_em
       FROM corte_producao_alerta
       WHERE pedido_norm = ? OR pedido_norm LIKE ?
       ORDER BY id DESC LIMIT 10`,
    )
    .all(p, `%${p}%`),
)

console.log(
  'ITENS',
  db
    .prepare(
      `SELECT a.id, a.enviado_em, i.cod_produto, i.data_final
       FROM corte_producao_alerta a
       JOIN corte_producao_alerta_item i ON i.alerta_id = a.id
       WHERE a.pedido_norm = ? OR a.pedido_norm LIKE ?
       ORDER BY a.id DESC LIMIT 20`,
    )
    .all(p, `%${p}%`),
)

console.log(
  'ALERTAS_ABERTOS',
  db
    .prepare(
      `SELECT id, pedido_norm, enviado_em, visto_em
       FROM corte_producao_alerta
       WHERE visto_em IS NULL
       ORDER BY enviado_em DESC LIMIT 10`,
    )
    .all(),
)
