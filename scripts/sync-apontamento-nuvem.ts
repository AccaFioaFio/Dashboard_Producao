/**
 * Baixa lançamentos Costura Produção / Revisão da nuvem para o SQLite local
 * e mostra a soma (planilha + tela), inclusive por dia.
 */
import { loadLocalEnv } from '../lib/load-env'

loadLocalEnv()

async function main() {
  const { getSqlite } = await import('../db')
  const {
    ensureApontamentosNuvemNoSqlite,
    publicarApontamentosLocaisNaNuvem,
  } = await import('../lib/apontamento-sync')
  const {
    somarPecasCosturaProducao,
    somarPecasRevisao,
    sqlCosturaProducaoUnion,
    sqlRevisaoUnion,
  } = await import('../lib/apontamento-fatos')

  getSqlite()
  const publicados = await publicarApontamentosLocaisNaNuvem({ force: true })
  const sync = await ensureApontamentosNuvemNoSqlite({ force: true })
  const db = getSqlite()

  const costuraDia = db
    .prepare(
      `SELECT data_producao as data, COALESCE(SUM(qtd_pecas),0) as pecas, COUNT(*) as n
       FROM ${sqlCosturaProducaoUnion('c')}
       WHERE data_producao IS NOT NULL
       GROUP BY data_producao
       ORDER BY data_producao DESC
       LIMIT 10`,
    )
    .all()
  const revisaoDia = db
    .prepare(
      `SELECT data_producao as data, COALESCE(SUM(qtd_pecas),0) as pecas, COUNT(*) as n
       FROM ${sqlRevisaoUnion('r')}
       WHERE data_producao IS NOT NULL
       GROUP BY data_producao
       ORDER BY data_producao DESC
       LIMIT 10`,
    )
    .all()

  const ontemCostura = db
    .prepare(
      `SELECT COALESCE(SUM(qtd_pecas),0) as pecas, COUNT(*) as n
       FROM costura_lancamento
       WHERE data_producao = '2026-10-13' AND origem = 'Produção'`,
    )
    .get()
  const ontemRevisao = db
    .prepare(
      `SELECT COALESCE(SUM(qtd_pecas),0) as pecas, COUNT(*) as n
       FROM revisao_lancamento
       WHERE data_producao = '2026-10-13'`,
    )
    .get()

  console.log(
    JSON.stringify(
      {
        publicadosNaNuvem: publicados,
        sync,
        kpiCosturaProd: somarPecasCosturaProducao(),
        kpiRevisao: somarPecasRevisao(),
        lancamentosOntem: {
          '2026-10-13': { costura: ontemCostura, revisao: ontemRevisao },
        },
        ultimosDias: { costura: costuraDia, revisao: revisaoDia },
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
