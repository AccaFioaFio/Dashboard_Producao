import 'server-only'

import { cache } from 'react'
import { getSqlite } from '@/db'
import { collapseItensCorte } from '@/lib/corte-producao'
import {
  entradasDoLancamento,
  lerApontamentoNuvem,
  unirEntradas,
  type ApontamentoNuvem,
  type ApontamentoNuvemEntrada,
} from '@/lib/apontamento-nuvem'
import {
  escolherLancamento,
  lerLancamentosNuvem,
  type CorteNuvemLancamento,
} from '@/lib/corte-nuvem'
import { apontamentoNuvemSyncOk } from '@/lib/apontamento-sync'
import { ensureCloudDatabase } from '@/lib/cloud/carga'
import { leadTimeDays } from '@/lib/dates'
import type { DashFilters } from '@/lib/filters'
import { funilSliceWhere, type FunilSlice } from '@/lib/funil'
import { ocPecasExpr } from '@/lib/corte-oc'
import { sqlPendentesOficina } from '@/lib/oficinas-qty'
import { pedidoDigits, parsePedidoParam } from '@/lib/pedido'
import { formatTecido } from '@/lib/format'
import { sqlAlmoxPrincipais } from '@/lib/almox-principais'
import {
  SQL_LANC_SO_PLANILHA,
  sqlCosturaProducaoUnion,
  sqlCosturaUnion,
  sqlRevisaoUnion,
} from '@/lib/apontamento-fatos'

export type PedidoListaRow = {
  pedidoNorm: string
  cliente: string | null
  canal: string | null
  statusVigente: string | null
  data: string | null
  pecas: number
  pecasCosturaProd: number
  pecasRevisao: number
  oficinasPendentes: number
  noCorte: boolean
  noCosturaProd: boolean
  noRevisao: boolean
  noOficinas: boolean
  noSignus: boolean
  responsavel: string | null
  excelRow: number | null
  tecido: string | null
  codTecido: string | null
  observacao: string | null
}

/** Uma linha da ficha: um produto, com o total da etapa. */
export type LinhaProdutoFicha = {
  codProduto: string | null
  produto: string
  pecas: number
  responsavel: string | null
  inicio: string | null
  fim: string | null
  origem: string | null
  origemNorm: string | null
  pendentes: number
  defeitos: number
}

export type PedidoFicha = {
  pedidoNorm: string
  flags: {
    corte: boolean
    costuraProd: boolean
    revisao: boolean
    oficinas: boolean
    signus: boolean
  }
  corte: {
    data: string | null
    statusVigente: string | null
    pecas: number
    terceiros: number
    estoque: number
    metros: number
    economia: number
    cliente: string | null
    canal: string | null
    responsavel: string | null
    inicioCorte: string | null
    finalCorte: string | null
    pcpProntas: string | null
    observacao: string | null
    leadTimeDias: number | null
    statusDuplo: boolean
  } | null
  ocs: {
    excelRow: number
    data: string | null
    status: string | null
    pecas: number
    cliente: string | null
    canal: string | null
    responsavel: string | null
    observacao: string | null
    tecido: string | null
    codTecido: string | null
  }[]
  linhas: {
    tecido: string | null
    codTecido: string | null
    metros: number | null
    economia: number | null
    pecas: number | null
    status: string | null
    excelRow: number
    isHeader: boolean
  }[]
  /** Uma linha por produto (costura: uma por produto e origem). */
  corteProdutos: LinhaProdutoFicha[]
  costura: LinhaProdutoFicha[]
  revisao: LinhaProdutoFicha[]
  oficinas: LinhaProdutoFicha[]
  signus: {
    data: string
    metros: number
    codProduto: string
    nomeProduto: string | null
    tipoNorm: string
    isBaixa: boolean
    origemMov: string | null
  }[]
  itens: {
    codProduto: string
    nomeProduto: string | null
    categoriaProduto: string | null
    qtdPedida: number | null
    qtdFaturada: number
    valorLiquido: number
    valorBruto: number
    /** Código lançado na lista, sem linha deste pedido em Itens.xlsx. */
    foraDoSignus: boolean
    /** Peças do lançamento operacional deste código. Nulo até existir lançamento. */
    qtdCortada: number | null
    qtdCosturada: number | null
    qtdRevisada: number | null
    inicioCorte: string | null
    fimCorte: string | null
    inicioCostura: string | null
    fimCostura: string | null
    inicioRevisao: string | null
    fimRevisao: string | null
  }[]
  qualidade: { tipo: string; detalhe: string; valor: number | null }[]
  datas: {
    pcpProntas: string | null
    inicioCorte: string | null
    finalCorte: string | null
    inicioCostura: string | null
    finalCostura: string | null
    envioOficina: string | null
    retornoOficina: string | null
    prometidaOficina: string | null
    oficinaAberta: boolean
    inicioRevisao: string | null
    finalRevisao: string | null
  }
  totais: {
    pecasCorte: number
    metrosCorte: number
    pecasCosturaProd: number
    pecasCosturaServico: number
    pecasRevisao: number
    enviadas: number
    retornadas: number
    pendentes: number
    defeitos: number
    metrosSignusBaixa: number
    diasCiclo: number | null
  }
}

export type QualidadeGrupo = {
  tipo: string
  eventos: {
    pedidoNorm: string | null
    detalhe: string
    excelRow: number | null
    valor: number | null
  }[]
}

export type SerieDiariaRow = {
  data: string
  cortadas: number
  costura: number
  revisao: number
}

export type ItemPedidoConsulta = {
  codProduto: string
  excelRow: number
  nomeProduto: string | null
  qtdPedida: number | null
  qtdReal: number | null
  qtdVolumes: number | null
  qtdVolumesBordados: number | null
  dataInicio: string | null
  dataFinal: string | null
  responsavel: string | null
  avisoDataFinal: string | null
}

export type ItensPedidoConsulta = {
  pedidoInformado: string
  pedidoNorm: string | null
  cliente: string | null
  canal: string | null
  status: string | null
  loaded: boolean
  /** Pedido na Corte e Costura, sem linhas deste número em Itens.xlsx. */
  inclusaoManual: boolean
  itens: ItemPedidoConsulta[]
}

export type ProdutoBaseItens = {
  codProduto: string
  nomeProduto: string | null
}

const COD_PRODUTO_IGUAL = `replace(trim(cod_produto), ' ', '') = replace(trim(?), ' ', '')`

function sqlite() {
  return getSqlite()
}

function hasObservacaoColumn() {
  return Boolean(
    sqlite()
      .prepare(
        `SELECT 1 as v FROM pragma_table_info('fato_corte_pedido') WHERE name = 'observacao'`,
      )
      .get(),
  )
}

function hasCorteLinhaObservacaoColumn() {
  return Boolean(
    sqlite()
      .prepare(
        `SELECT 1 as v FROM pragma_table_info('fato_corte_linha') WHERE name = 'observacao'`,
      )
      .get(),
  )
}

function hasPedidoItemTable() {
  return Boolean(
    sqlite()
      .prepare(
        `SELECT 1 as v FROM sqlite_master WHERE type = 'table' AND name = 'fato_pedido_item'`,
      )
      .get(),
  )
}

function sliceDateExpr(fatia: FunilSlice) {
  if (fatia === 'costuraSemCorte') {
    return `(SELECT MIN(c.data_producao) FROM ${sqlCosturaProducaoUnion('c')}
      WHERE c.pedido_norm = d.pedido_norm)`
  }
  if (fatia === 'revisaoSemCorte') {
    return `(SELECT MIN(r.data_producao) FROM ${sqlRevisaoUnion('r')}
      WHERE r.pedido_norm = d.pedido_norm)`
  }
  if (fatia === 'oficinas' || fatia === 'oficinasOrfas') {
    return `(SELECT MIN(o.data_envio) FROM fato_oficinas o WHERE o.pedido_norm = d.pedido_norm)`
  }
  if (fatia === 'wip' || fatia === 'aguardandoTecido') return 'h.data'
  return 'p.data'
}

function isOcFatia(fatia: FunilSlice) {
  return fatia === 'wip' || fatia === 'aguardandoTecido'
}

export const getPedidosLista = cache(async (filters: DashFilters = {}) => {
  await ensureCloudDatabase()
  const fatia: FunilSlice = filters.fatia ?? 'corte'
  const oc = isOcFatia(fatia)
  const clauses = oc
    ? [
        'h.is_header = 1',
        fatia === 'wip'
          ? "h.status = 'EM PRODUÇÃO'"
          : "h.status = 'AGUARDANDO TECIDO'",
      ]
    : [funilSliceWhere('d')[fatia]]
  const params: Record<string, unknown> = {}
  if (filters.q) {
    const exact = pedidoDigits(filters.q) ?? filters.q.trim()
    clauses.push((oc ? 'h' : 'd') + '.pedido_norm = @q')
    params.q = exact
  }
  if (filters.canal) {
    clauses.push(
      oc
        ? 'COALESCE(h.canal, d.canal) = @canal'
        : 'COALESCE(p.canal, d.canal) = @canal',
    )
    params.canal = filters.canal
  }
  if (filters.cliente) {
    clauses.push(
      oc
        ? 'COALESCE(h.cliente, d.cliente) = @cliente'
        : 'COALESCE(p.cliente, d.cliente) = @cliente',
    )
    params.cliente = filters.cliente
  }
  if (filters.responsavel) {
    clauses.push((oc ? 'h' : 'p') + '.responsavel = @responsavel')
    params.responsavel = filters.responsavel
  }
  if (filters.mes) {
    clauses.push(`CAST(substr(${sliceDateExpr(fatia)}, 6, 2) as INTEGER) = @mes`)
    params.mes = filters.mes
  }
  const where = clauses.join(' AND ')
  const fromOc = `
       FROM fato_corte_linha h
       JOIN dim_pedido d ON d.pedido_norm = h.pedido_norm
       LEFT JOIN fato_corte_pedido p ON p.pedido_norm = h.pedido_norm`
  const fromPedido = `
       FROM dim_pedido d
       LEFT JOIN fato_corte_pedido p ON p.pedido_norm = d.pedido_norm`
  const joinsLaterais = `
       LEFT JOIN (
         SELECT pedido_norm, SUM(qtd_pecas) as pecas
         FROM ${sqlCosturaProducaoUnion('c')} GROUP BY pedido_norm
       ) cs ON cs.pedido_norm = d.pedido_norm
       LEFT JOIN (
         SELECT pedido_norm, SUM(qtd_pecas) as pecas
         FROM ${sqlRevisaoUnion('r')} GROUP BY pedido_norm
       ) rv ON rv.pedido_norm = d.pedido_norm
       LEFT JOIN (
         SELECT pedido_norm, SUM(${sqlPendentesOficina()}) as pendentes
         FROM fato_oficinas GROUP BY pedido_norm
       ) ofc ON ofc.pedido_norm = d.pedido_norm`
  const stmt = sqlite().prepare(
    oc
      ? `SELECT h.pedido_norm as pedidoNorm,
              COALESCE(h.cliente, d.cliente) as cliente,
              COALESCE(h.canal, d.canal) as canal,
              h.status as statusVigente,
              h.data as data,
              ${ocPecasExpr('h')} as pecas,
              COALESCE(cs.pecas, 0) as pecasCosturaProd,
              COALESCE(rv.pecas, 0) as pecasRevisao,
              COALESCE(ofc.pendentes, 0) as oficinasPendentes,
              d.no_corte as noCorte,
              d.no_costura_prod as noCosturaProd,
              d.no_revisao as noRevisao,
              d.no_oficinas as noOficinas,
              d.no_signus as noSignus,
              h.responsavel as responsavel,
              h.excel_row as excelRow,
              h.tecido as tecido,
              h.cod_tecido as codTecido,
              ${hasCorteLinhaObservacaoColumn() ? 'h.observacao' : 'NULL'} as observacao
       ${fromOc}
       ${joinsLaterais}
       WHERE ${where}
       ORDER BY COALESCE(h.data, '0000-00-00') DESC, h.pedido_norm, h.excel_row
       LIMIT 800`
      : `SELECT d.pedido_norm as pedidoNorm,
              COALESCE(p.cliente, d.cliente) as cliente,
              COALESCE(p.canal, d.canal) as canal,
              (SELECT group_concat(DISTINCT h.status)
               FROM fato_corte_linha h
               WHERE h.pedido_norm = d.pedido_norm AND h.is_header = 1 AND h.status IS NOT NULL
              ) as statusVigente,
              p.data as data,
              COALESCE(p.pecas, 0) as pecas,
              COALESCE(cs.pecas, 0) as pecasCosturaProd,
              COALESCE(rv.pecas, 0) as pecasRevisao,
              COALESCE(ofc.pendentes, 0) as oficinasPendentes,
              d.no_corte as noCorte,
              d.no_costura_prod as noCosturaProd,
              d.no_revisao as noRevisao,
              d.no_oficinas as noOficinas,
              d.no_signus as noSignus,
              p.responsavel as responsavel,
              NULL as excelRow,
              (SELECT h.tecido FROM fato_corte_linha h
               WHERE h.pedido_norm = d.pedido_norm AND h.is_header = 1
               ORDER BY h.excel_row LIMIT 1) as tecido,
              (SELECT h.cod_tecido FROM fato_corte_linha h
               WHERE h.pedido_norm = d.pedido_norm AND h.is_header = 1
               ORDER BY h.excel_row LIMIT 1) as codTecido,
              ${hasObservacaoColumn() ? 'p.observacao' : 'NULL'} as observacao
       ${fromPedido}
       ${joinsLaterais}
       WHERE ${where}
       ORDER BY COALESCE(p.data, '0000-00-00') DESC, d.pedido_norm
       LIMIT 800`,
  )
  const rows = (
    Object.keys(params).length ? stmt.all(params) : stmt.all()
  ) as PedidoListaRow[]

  const countStmt = sqlite().prepare(
    oc
      ? `SELECT COUNT(*) as v ${fromOc} WHERE ${where}`
      : `SELECT COUNT(*) as v ${fromPedido} WHERE ${where}`,
  )
  const total = (
    (Object.keys(params).length ? countStmt.get(params) : countStmt.get()) as { v: number }
  ).v

  return {
    fatia,
    total,
    rows: rows.map((row) => ({
      ...row,
      statusVigente: row.statusVigente?.replaceAll(',', ' · ') ?? null,
      noCorte: Boolean(row.noCorte),
      noCosturaProd: Boolean(row.noCosturaProd),
      noRevisao: Boolean(row.noRevisao),
      noOficinas: Boolean(row.noOficinas),
      noSignus: Boolean(row.noSignus),
    })),
  }
})

function resolvePedidoNorm(raw: string) {
  const parsed = parsePedidoParam(raw)
  if (!parsed) return null
  const db = sqlite()
  const exact = db
    .prepare('SELECT pedido_norm as v FROM dim_pedido WHERE pedido_norm = ?')
    .get(parsed) as { v: string } | undefined
  if (exact) return exact.v
  const digits = pedidoDigits(parsed)
  if (!digits) return null
  const byDigits = db
    .prepare(
      `SELECT pedido_norm as v FROM dim_pedido
       WHERE pedido_norm = @digits
          OR replace(replace(pedido_norm, ' ', ''), '.', '') = @digits
       LIMIT 1`,
    )
    .get({ digits }) as { v: string } | undefined
  return byDigits?.v ?? null
}

function chaveProduto(cod: string) {
  return cod.replace(/\s+/g, '')
}

type MarcaItem = {
  codProduto: string
  nomeProduto: string | null
  cortada: number | null
  costurada: number | null
  revisada: number | null
  inicioCorte: string | null
  fimCorte: string | null
  inicioCostura: string | null
  fimCostura: string | null
  inicioRevisao: string | null
  fimRevisao: string | null
}

function extremo(datas: (string | null | undefined)[], qual: 'min' | 'max') {
  let escolhida: string | null = null
  for (const data of datas) {
    if (!data) continue
    if (!escolhida || (qual === 'min' ? data < escolhida : data > escolhida)) {
      escolhida = data
    }
  }
  return escolhida
}

function marcaDe(marcas: Map<string, MarcaItem>, cod: string) {
  const chave = chaveProduto(cod)
  let marca = marcas.get(chave)
  if (!marca) {
    marca = {
      codProduto: cod,
      nomeProduto: null,
      cortada: null,
      costurada: null,
      revisada: null,
      inicioCorte: null,
      fimCorte: null,
      inicioCostura: null,
      fimCostura: null,
      inicioRevisao: null,
      fimRevisao: null,
    }
    marcas.set(chave, marca)
  }
  return marca
}

function guardarNome(marca: MarcaItem, nome: string | null | undefined) {
  if (!marca.nomeProduto && nome?.trim()) marca.nomeProduto = nome.trim()
}

function periodoDe(
  linhas: { dataInicio: string | null; dataProducao: string | null; qtdPecas: number | null }[],
) {
  return {
    inicio: extremo(
      linhas.map((row) => row.dataInicio),
      'min',
    ),
    fim: extremo(
      linhas.filter((row) => row.qtdPecas != null).map((row) => row.dataProducao),
      'max',
    ),
  }
}

type DetalheApontamento = {
  codProduto: string
  excelRow: number
  origem: string | null
  qtdPecas: number | null
  dataInicio: string | null
  dataProducao: string | null
  responsavel: string | null
  observacao: string | null
  nomeProduto: string | null
  atualizadoEm: string
}

type OficinaLote = {
  oficina: string
  dataEnvio: string
  dataPrometida: string | null
  dataRetorno: string | null
  enviadas: number
  retornadas: number
  pendentes: number
  defeitos: number
  statusEntrega: string | null
  produto: string | null
  valorTotal: number | null
}

function textoChave(value: string | null | undefined) {
  return (value ?? '')
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function origemNormDe(origem: string | null | undefined) {
  if (!origem) return 'Sem origem'
  if (origem === 'Produção') return 'Producao'
  if (origem.includes('Etiqueta')) return 'Troca de Etiqueta'
  if (origem.includes('Feston')) return 'Aplicacao de Festone'
  if (origem.includes('Conserto')) return 'Conserto'
  return origem
}

function linhaVazia(parcial: Partial<LinhaProdutoFicha> & Pick<LinhaProdutoFicha, 'produto' | 'pecas'>): LinhaProdutoFicha {
  return {
    codProduto: null,
    responsavel: null,
    inicio: null,
    fim: null,
    origem: null,
    origemNorm: null,
    pendentes: 0,
    defeitos: 0,
    ...parcial,
  }
}

function entradaDeDetalhe(row: DetalheApontamento): ApontamentoNuvemEntrada {
  return {
    excelRow: row.excelRow,
    origem: row.origem,
    oficina: null,
    qtdPecas: row.qtdPecas,
    dataInicio: row.dataInicio,
    dataProducao: row.dataProducao,
    responsavel: row.responsavel,
    avisoDataProducao: null,
    observacao: row.observacao,
    atualizadoEm: row.atualizadoEm,
  }
}

/** Lado mais novo vence. Se a nuvem for mais nova, une por excel_row sem somar a correção duas vezes. */
function entradasVencedoras(
  locais: DetalheApontamento[],
  remoto: ApontamentoNuvem | undefined,
  nomeProduto: string | null,
): DetalheApontamento[] {
  let maxLocal = ''
  for (const row of locais) {
    if (row.atualizadoEm > maxLocal) maxLocal = row.atualizadoEm
  }
  if (locais.length && (!remoto || (maxLocal && remoto.atualizadoEm <= maxLocal))) {
    return locais
  }
  const nuvem = remoto
    ? entradasDoLancamento(remoto).map((row) => ({
        codProduto: remoto.codProduto,
        excelRow: row.excelRow,
        origem: row.origem,
        qtdPecas: row.qtdPecas,
        dataInicio: row.dataInicio,
        dataProducao: row.dataProducao,
        responsavel: row.responsavel,
        observacao: row.observacao,
        nomeProduto: nomeProduto ?? remoto.nomeProduto,
        atualizadoEm: row.atualizadoEm,
      }))
    : []
  return unirEntradas(locais.map(entradaDeDetalhe), nuvem.map(entradaDeDetalhe)).map((row) => ({
    codProduto: remoto?.codProduto ?? locais[0]?.codProduto ?? '',
    excelRow: row.excelRow,
    origem: row.origem,
    qtdPecas: row.qtdPecas,
    dataInicio: row.dataInicio,
    dataProducao: row.dataProducao,
    responsavel: row.responsavel,
    observacao: row.observacao,
    nomeProduto: nomeProduto ?? remoto?.nomeProduto ?? null,
    atualizadoEm: row.atualizadoEm,
  }))
}

function responsavelRecente(rows: DetalheApontamento[]) {
  let escolhido: DetalheApontamento | null = null
  for (const row of rows) {
    if (!row.responsavel) continue
    if (!escolhido || row.atualizadoEm >= escolhido.atualizadoEm) escolhido = row
  }
  return escolhido?.responsavel ?? null
}

function linhasDasEntradas(
  etapa: 'costura' | 'revisao',
  codProduto: string,
  nomeProduto: string | null,
  entradas: DetalheApontamento[],
  periodoProducao: { inicio: string | null; fim: string | null },
): LinhaProdutoFicha[] {
  const grupos = new Map<string, DetalheApontamento[]>()
  for (const row of entradas) {
    if (etapa === 'revisao') {
      const lista = grupos.get('') ?? []
      lista.push(row)
      grupos.set('', lista)
      continue
    }
    const origem = row.origem ?? 'Sem origem'
    const lista = grupos.get(origem) ?? []
    lista.push(row)
    grupos.set(origem, lista)
  }
  const linhas: LinhaProdutoFicha[] = []
  for (const [origem, rows] of grupos) {
    const pecas = rows.reduce((sum, row) => sum + (row.qtdPecas ?? 0), 0)
    if (pecas <= 0) continue
    const producao = etapa === 'revisao' || origem === 'Produção'
    linhas.push(
      linhaVazia({
        codProduto,
        produto: nomeProduto ?? codProduto,
        pecas,
        responsavel: responsavelRecente(rows),
        inicio: producao
          ? periodoProducao.inicio
          : extremo(
              rows.map((row) => row.dataInicio),
              'min',
            ),
        fim: producao
          ? periodoProducao.fim
          : extremo(
              rows.filter((row) => row.qtdPecas != null).map((row) => row.dataProducao),
              'max',
            ),
        origem: etapa === 'costura' ? origem : null,
        origemNorm: etapa === 'costura' ? origemNormDe(origem) : null,
      }),
    )
  }
  return linhas
}

function casaProduto(
  texto: string | null | undefined,
  linha: { codProduto: string | null; produto: string },
) {
  const nome = textoChave(texto)
  const outro = textoChave(linha.produto)
  if (
    nome &&
    outro &&
    (nome === outro ||
      (Math.min(nome.length, outro.length) >= 8 &&
        (outro.includes(nome) || nome.includes(outro))))
  ) {
    return true
  }
  const cod = (linha.codProduto ?? '').replace(/\s+/g, '').toLowerCase()
  const plano = nome.replace(/\s+/g, '')
  return Boolean(cod && plano.includes(cod))
}

function codigoPeloNome(
  nome: string | null | undefined,
  itens: { codProduto: string; nomeProduto: string | null }[],
) {
  const chave = textoChave(nome)
  if (!chave) return null
  return itens.find((item) => textoChave(item.nomeProduto) === chave)?.codProduto ?? null
}

function compararLinhas(a: LinhaProdutoFicha, b: LinhaProdutoFicha) {
  return (
    (a.codProduto ?? '').localeCompare(b.codProduto ?? '', 'pt-BR') ||
    a.produto.localeCompare(b.produto, 'pt-BR') ||
    (a.origem ?? '').localeCompare(b.origem ?? '', 'pt-BR')
  )
}

function comNomeDoItem(
  linhas: LinhaProdutoFicha[],
  itens: { codProduto: string; nomeProduto: string | null }[],
) {
  const porCodigo = new Map(itens.map((item) => [chaveProduto(item.codProduto), item]))
  return linhas.map((linha) => {
    if (!linha.codProduto) return linha
    const item = porCodigo.get(chaveProduto(linha.codProduto))
    if (!item?.nomeProduto) return linha
    return { ...linha, produto: item.nomeProduto }
  })
}

/** Planilha só do produto que não tem total na aba. Várias datas viram uma linha. */
function completarComPlanilha(
  aba: LinhaProdutoFicha[],
  planilha: {
    dataProducao: string
    pecas: number
    responsavel: string | null
    produto: string | null
    origem: string | null
    origemNorm: string | null
  }[],
  itens: { codProduto: string; nomeProduto: string | null }[],
): LinhaProdutoFicha[] {
  const grupos = new Map<
    string,
    {
      produto: string
      origem: string | null
      origemNorm: string | null
      pecas: number
      responsavel: string | null
      inicio: string | null
      fim: string | null
    }
  >()
  for (const row of planilha) {
    if (!row.pecas) continue
    const origemNorm = row.origemNorm ?? (row.origem ? origemNormDe(row.origem) : null)
    const chave = `${textoChave(row.produto)}|${origemNorm ?? ''}`
    const atual = grupos.get(chave)
    if (!atual) {
      grupos.set(chave, {
        produto: row.produto?.trim() || '—',
        origem: row.origem,
        origemNorm,
        pecas: row.pecas,
        responsavel: row.responsavel,
        inicio: row.dataProducao,
        fim: row.dataProducao,
      })
      continue
    }
    atual.pecas += row.pecas
    if (!atual.inicio || row.dataProducao < atual.inicio) atual.inicio = row.dataProducao
    if (!atual.fim || row.dataProducao > atual.fim) {
      atual.fim = row.dataProducao
      if (row.responsavel) atual.responsavel = row.responsavel
    }
  }
  const extras: LinhaProdutoFicha[] = []
  for (const grupo of grupos.values()) {
    const cod = codigoPeloNome(grupo.produto, itens)
    const candidato = { codProduto: cod, produto: grupo.produto }
    const jaNaAba = aba.some(
      (linha) =>
        (linha.origemNorm ?? '') === (grupo.origemNorm ?? '') &&
        (casaProduto(grupo.produto, linha) ||
          (cod != null &&
            linha.codProduto != null &&
            chaveProduto(linha.codProduto) === chaveProduto(cod))),
    )
    if (jaNaAba || grupo.pecas <= 0) continue
    extras.push(
      linhaVazia({
        codProduto: cod,
        produto: grupo.produto,
        pecas: grupo.pecas,
        responsavel: grupo.responsavel,
        inicio: grupo.inicio,
        fim: grupo.fim,
        origem: grupo.origem,
        origemNorm: grupo.origemNorm,
      }),
    )
  }
  return comNomeDoItem([...aba, ...extras], itens).sort(compararLinhas)
}

function agruparOficinas(
  lotes: OficinaLote[],
  itens: { codProduto: string; nomeProduto: string | null }[],
) {
  const grupos = new Map<string, LinhaProdutoFicha>()
  for (const lote of lotes) {
    const cod = codigoPeloNome(lote.produto, itens)
    const produto = lote.produto?.trim() || '—'
    const chave = `${cod ? chaveProduto(cod) : textoChave(produto)}|${textoChave(lote.oficina)}`
    const atual = grupos.get(chave)
    if (!atual) {
      grupos.set(
        chave,
        linhaVazia({
          codProduto: cod,
          produto,
          pecas: lote.enviadas,
          responsavel: lote.oficina,
          inicio: lote.dataEnvio,
          fim: lote.dataRetorno,
          pendentes: lote.pendentes,
          defeitos: lote.defeitos,
        }),
      )
      continue
    }
    atual.pecas += lote.enviadas
    atual.pendentes += lote.pendentes
    atual.defeitos += lote.defeitos
    if (lote.dataEnvio && (!atual.inicio || lote.dataEnvio < atual.inicio)) {
      atual.inicio = lote.dataEnvio
    }
    if (lote.dataRetorno && (!atual.fim || lote.dataRetorno > atual.fim)) {
      atual.fim = lote.dataRetorno
    }
  }
  return comNomeDoItem([...grupos.values()], itens).sort(compararLinhas)
}

function linhasCortePlanilha(
  ocs: {
    data: string | null
    pecas: number
    responsavel: string | null
    tecido: string | null
    codTecido: string | null
  }[],
  linhas: { tecido: string | null; codTecido: string | null; pecas: number | null }[],
) {
  if (ocs.length) {
    return ocs
      .filter((oc) => oc.pecas > 0)
      .map((oc) =>
        linhaVazia({
          produto: formatTecido(oc.codTecido, oc.tecido),
          pecas: oc.pecas,
          responsavel: oc.responsavel,
          inicio: oc.data,
          fim: oc.data,
        }),
      )
  }
  return linhas
    .filter((row) => row.pecas != null && row.pecas > 0)
    .map((row) =>
      linhaVazia({
        produto: formatTecido(row.codTecido, row.tecido),
        pecas: row.pecas ?? 0,
      }),
    )
}

/** Datas da aba, por código. A data inicial é a que o responsável lançou. */
function periodosApontamento(pedidoNorm: string, etapa: 'costura' | 'revisao') {
  const tabela = etapa === 'costura' ? 'costura_lancamento' : 'revisao_lancamento'
  const origem = etapa === 'costura' ? `AND origem = 'Produção'` : ''
  const rows = sqlite()
    .prepare(
      `SELECT cod_produto as codProduto,
              MIN(CASE WHEN data_inicio IS NOT NULL AND data_inicio != '' THEN data_inicio END) as inicio,
              MAX(CASE WHEN qtd_pecas IS NOT NULL AND data_producao IS NOT NULL AND data_producao != '' THEN data_producao END) as fim,
              MAX(atualizado_em) as atualizadoEm
       FROM ${tabela}
       WHERE pedido_norm = ? ${origem}
         AND NOT (${SQL_LANC_SO_PLANILHA})
       GROUP BY cod_produto`,
    )
    .all(pedidoNorm) as {
    codProduto: string
    inicio: string | null
    fim: string | null
    atualizadoEm: string | null
  }[]
  return new Map(rows.map((row) => [chaveProduto(row.codProduto), row]))
}

/**
 * Soma do lado mais novo (a correção da aba).
 * Uma linha por produto; na costura, uma linha por produto e origem.
 */
async function aplicarApontamento(
  marcas: Map<string, MarcaItem>,
  pedidoNorm: string,
  etapa: 'costura' | 'revisao',
) {
  const tabela = etapa === 'costura' ? 'costura_lancamento' : 'revisao_lancamento'
  const periodosLocais = periodosApontamento(pedidoNorm, etapa)
  const locais = new Map<
    string,
    { codProduto: string; qtdPecas: number; nomeProduto: string | null; atualizadoEm: string }
  >()
  const detalhes = new Map<string, DetalheApontamento[]>()
  for (const row of sqlite()
    .prepare(
      `SELECT cod_produto as codProduto, excel_row as excelRow,
              ${etapa === 'costura' ? 'origem' : 'NULL as origem'},
              qtd_pecas as qtdPecas, data_inicio as dataInicio,
              data_producao as dataProducao, responsavel, observacao,
              nome_produto as nomeProduto, atualizado_em as atualizadoEm
       FROM ${tabela}
       WHERE pedido_norm = ?`,
    )
    .all(pedidoNorm) as DetalheApontamento[]) {
    const chave = chaveProduto(row.codProduto)
    const lista = detalhes.get(chave) ?? []
    lista.push(row)
    detalhes.set(chave, lista)
  }
  for (const [chave, rows] of detalhes) {
    const producao =
      etapa === 'costura' ? rows.filter((row) => row.origem === 'Produção') : rows
    const comPecas = producao.filter((row) => row.qtdPecas != null)
    if (!comPecas.length) continue
    let atualizadoEm = ''
    let nomeProduto: string | null = null
    let pecas = 0
    for (const row of comPecas) {
      pecas += row.qtdPecas ?? 0
      if (row.nomeProduto) nomeProduto = row.nomeProduto
      if (row.atualizadoEm > atualizadoEm) atualizadoEm = row.atualizadoEm
    }
    locais.set(chave, {
      codProduto: comPecas[0].codProduto,
      qtdPecas: pecas,
      nomeProduto,
      atualizadoEm,
    })
  }

  // Após ensureCloudDatabase + sync ok, a nuvem já está no SQLite — evita Storage por clique.
  const nuvem = new Map<string, ApontamentoNuvem>()
  if (!apontamentoNuvemSyncOk()) {
    try {
      for (const [cod, row] of await lerApontamentoNuvem(etapa, pedidoNorm)) {
        const chave = chaveProduto(cod)
        if (!nuvem.has(chave)) nuvem.set(chave, row)
      }
    } catch (error) {
      console.error('leitura do lançamento na nuvem falhou', etapa, pedidoNorm, error)
    }
  }

  const linhas: LinhaProdutoFicha[] = []
  for (const chave of new Set([
    ...detalhes.keys(),
    ...locais.keys(),
    ...nuvem.keys(),
    ...periodosLocais.keys(),
  ])) {
    const local = locais.get(chave)
    const remoto = nuvem.get(chave)
    const marca = marcaDe(
      marcas,
      remoto?.codProduto ??
        local?.codProduto ??
        periodosLocais.get(chave)?.codProduto ??
        detalhes.get(chave)?.[0]?.codProduto ??
        chave,
    )
    guardarNome(marca, local?.nomeProduto)
    guardarNome(marca, remoto?.nomeProduto)
    const localPeriodo = periodosLocais.get(chave)
    const entradasPeriodo = (remoto ? entradasDoLancamento(remoto) : []).filter((row) => {
      if (etapa === 'costura' && row.origem !== 'Produção') return false
      const obs = (row.observacao ?? '').toLowerCase().replaceAll('ç', 'c')
      return !obs.includes('ja lancado na planilha')
    })
    const nuvemPeriodo = periodoDe(entradasPeriodo)
    const localMaisNovo = Boolean(local && (!remoto || local.atualizadoEm >= remoto.atualizadoEm))
    const periodo = localMaisNovo
      ? { inicio: localPeriodo?.inicio ?? null, fim: localPeriodo?.fim ?? null }
      : nuvemPeriodo.inicio || nuvemPeriodo.fim
        ? nuvemPeriodo
        : { inicio: localPeriodo?.inicio ?? null, fim: localPeriodo?.fim ?? null }
    if (etapa === 'costura') {
      marca.inicioCostura = periodo.inicio
      marca.fimCostura = periodo.fim
    } else {
      marca.inicioRevisao = periodo.inicio
      marca.fimRevisao = periodo.fim
    }
    const vencedoras = entradasVencedoras(
      detalhes.get(chave) ?? [],
      remoto,
      marca.nomeProduto,
    )
    const doProduto = linhasDasEntradas(etapa, marca.codProduto, marca.nomeProduto, vencedoras, periodo)
    linhas.push(...doProduto)
    const total =
      etapa === 'costura'
        ? doProduto
            .filter((row) => row.origemNorm === 'Producao')
            .reduce((sum, row) => sum + row.pecas, 0)
        : doProduto.reduce((sum, row) => sum + row.pecas, 0)
    if (total <= 0) continue
    if (etapa === 'costura') marca.costurada = total
    else marca.revisada = total
  }
  return linhas
}

/**
 * Peças lançadas por código nas listas operacionais.
 * Corte, costura e revisão da ficha usam este total, uma vez por produto.
 */
async function marcasLancamentoItens(pedidoNorm: string) {
  const marcas = new Map<string, MarcaItem>()
  const corteLinhas: LinhaProdutoFicha[] = []
  const corte = await lancamentosDoPedido(pedidoNorm)
  const nuvemCorte = new Map<string, CorteNuvemLancamento>()
  for (const [cod, row] of corte.nuvem) {
    const chave = chaveProduto(cod)
    if (!nuvemCorte.has(chave)) nuvemCorte.set(chave, row)
  }
  const localCorte = new Map<string, CorteNuvemLancamento>()
  const codigoCorte = new Map<string, string>()
  for (const [cod, row] of corte.locais) {
    const chave = chaveProduto(cod)
    if (!localCorte.has(chave)) localCorte.set(chave, row)
    if (!codigoCorte.has(chave)) codigoCorte.set(chave, cod)
  }
  for (const cod of corte.nuvem.keys()) {
    const chave = chaveProduto(cod)
    if (!codigoCorte.has(chave)) codigoCorte.set(chave, cod)
  }
  for (const chave of new Set([...localCorte.keys(), ...nuvemCorte.keys()])) {
    const lancamento = escolherLancamento(localCorte.get(chave), nuvemCorte.get(chave))
    const marca = marcaDe(marcas, codigoCorte.get(chave) ?? chave)
    guardarNome(marca, lancamento?.nomeProduto)
    marca.inicioCorte = lancamento?.dataInicio ?? null
    marca.fimCorte = lancamento?.dataFinal ?? null
    if (lancamento?.qtdReal == null) continue
    marca.cortada = lancamento.qtdReal
    if (lancamento.qtdReal <= 0) continue
    corteLinhas.push(
      linhaVazia({
        codProduto: marca.codProduto,
        produto: marca.nomeProduto ?? marca.codProduto,
        pecas: lancamento.qtdReal,
        responsavel: lancamento.responsavel,
        inicio: lancamento.dataInicio,
        fim: lancamento.dataFinal,
      }),
    )
  }

  const costura = await aplicarApontamento(marcas, pedidoNorm, 'costura')
  const revisao = await aplicarApontamento(marcas, pedidoNorm, 'revisao')
  return { marcas, corte: corteLinhas, costura, revisao }
}

export const getPedidoFicha = cache(async (raw: string): Promise<PedidoFicha | null> => {
  await ensureCloudDatabase()
  const pedidoNorm = resolvePedidoNorm(raw)
  if (!pedidoNorm) return null
  const db = sqlite()
  const flags = db
    .prepare(
      `SELECT no_corte as corte, no_costura_prod as costuraProd, no_revisao as revisao,
              no_oficinas as oficinas, no_signus as signus
       FROM dim_pedido WHERE pedido_norm = ?`,
    )
    .get(pedidoNorm) as
    | {
        corte: number
        costuraProd: number
        revisao: number
        oficinas: number
        signus: number
      }
    | undefined
  if (!flags) return null

  const obs = hasObservacaoColumn() ? 'observacao' : 'NULL as observacao'
  const corte = db
    .prepare(
      `SELECT data, status_vigente as statusVigente, pecas, terceiros, estoque, metros, economia,
              cliente, canal, responsavel, inicio_corte as inicioCorte, final_corte as finalCorte,
              pcp_prontas as pcpProntas, ${obs}, lead_time_dias as leadTimeDias,
              status_duplo as statusDuplo
       FROM fato_corte_pedido WHERE pedido_norm = ?`,
    )
    .get(pedidoNorm) as PedidoFicha['corte'] | undefined

  const ocObs = hasCorteLinhaObservacaoColumn()
    ? 'h.observacao'
    : 'NULL as observacao'
  const ocs = db
    .prepare(
      `SELECT h.excel_row as excelRow, h.data, h.status,
              ${ocPecasExpr('h')} as pecas,
              h.cliente, h.canal, h.responsavel,
              ${ocObs},
              h.tecido, h.cod_tecido as codTecido
       FROM fato_corte_linha h
       WHERE h.pedido_norm = ? AND h.is_header = 1
       ORDER BY h.excel_row`,
    )
    .all(pedidoNorm) as PedidoFicha['ocs']

  const linhas = db
    .prepare(
      `SELECT tecido, cod_tecido as codTecido, metros, economia, qtd_pecas as pecas, status,
              excel_row as excelRow, is_header as isHeader
       FROM fato_corte_linha
       WHERE pedido_norm = ? AND (metros IS NOT NULL OR qtd_pecas IS NOT NULL OR tecido IS NOT NULL OR is_header = 1)
       ORDER BY excel_row`,
    )
    .all(pedidoNorm) as PedidoFicha['linhas']

  const planilhaCostura = db
    .prepare(
      `SELECT data_producao as dataProducao, origem, origem_norm as origemNorm,
              qtd_pecas as pecas, responsavel, produto
       FROM fato_costura
       WHERE pedido_norm = ?`,
    )
    .all(pedidoNorm) as {
    dataProducao: string
    origem: string | null
    origemNorm: string | null
    pecas: number
    responsavel: string | null
    produto: string | null
  }[]

  const planilhaRevisao = db
    .prepare(
      `SELECT data_producao as dataProducao, qtd_pecas as pecas, responsavel, produto
       FROM fato_revisao
       WHERE pedido_norm = ?`,
    )
    .all(pedidoNorm) as {
    dataProducao: string
    pecas: number
    responsavel: string | null
    produto: string | null
  }[]

  const oficinas = db
    .prepare(
      `SELECT oficina, data_envio as dataEnvio, data_prometida as dataPrometida,
              CASE WHEN qtd_retornadas > 0 THEN data_retorno ELSE NULL END as dataRetorno,
              qtd_enviadas as enviadas, qtd_retornadas as retornadas,
              ${sqlPendentesOficina()} as pendentes, qtd_defeitos as defeitos, status_entrega as statusEntrega,
              produto, valor_total as valorTotal
       FROM fato_oficinas WHERE pedido_norm = ? ORDER BY data_envio, excel_row`,
    )
    .all(pedidoNorm) as OficinaLote[]

  const signus = db
    .prepare(
      `SELECT data, metros, cod_produto as codProduto, nome_produto as nomeProduto,
              tipo_norm as tipoNorm, is_baixa as isBaixa, origem_mov as origemMov
       FROM fato_tecido_signus s
       WHERE s.pedido_norm = ? AND ${sqlAlmoxPrincipais('s')}
       ORDER BY s.data, s.excel_row`,
    )
    .all(pedidoNorm) as PedidoFicha['signus']

  const qualidade = db
    .prepare(
      `SELECT tipo, detalhe, valor FROM qualidade_evento WHERE pedido_norm = ? ORDER BY tipo`,
    )
    .all(pedidoNorm) as PedidoFicha['qualidade']

  const itensBase = hasPedidoItemTable()
    ? (db
        .prepare(
          `SELECT cod_produto as codProduto, nome_produto as nomeProduto,
                  categoria_produto as categoriaProduto,
                  qtd_pedida as qtdPedida, qtd_faturada as qtdFaturada,
                  valor_liquido as valorLiquido, valor_bruto as valorBruto
           FROM fato_pedido_item
           WHERE pedido_norm = ?
           ORDER BY excel_row`,
        )
        .all(pedidoNorm) as Omit<
        PedidoFicha['itens'][number],
        | 'qtdCortada'
        | 'qtdCosturada'
        | 'qtdRevisada'
        | 'inicioCorte'
        | 'fimCorte'
        | 'inicioCostura'
        | 'fimCostura'
        | 'inicioRevisao'
        | 'fimRevisao'
        | 'foraDoSignus'
      >[])
    : []
  const lancados = await marcasLancamentoItens(pedidoNorm)
  const marcas = lancados.marcas
  const vistos = new Set(itensBase.map((row) => chaveProduto(row.codProduto)))
  const itens: PedidoFicha['itens'] = itensBase.map((row) => {
    const marca = marcas.get(chaveProduto(row.codProduto))
    return {
      ...row,
      qtdCortada: marca?.cortada ?? null,
      qtdCosturada: marca?.costurada ?? null,
      qtdRevisada: marca?.revisada ?? null,
      inicioCorte: marca?.inicioCorte ?? null,
      fimCorte: marca?.fimCorte ?? null,
      inicioCostura: marca?.inicioCostura ?? null,
      fimCostura: marca?.fimCostura ?? null,
      inicioRevisao: marca?.inicioRevisao ?? null,
      fimRevisao: marca?.fimRevisao ?? null,
      foraDoSignus: false,
    }
  })
  const foraDoSignus = [...marcas.values()]
    .filter(
      (marca) =>
        !vistos.has(chaveProduto(marca.codProduto)) &&
        (marca.cortada != null ||
          marca.costurada != null ||
          marca.revisada != null ||
          marca.inicioCorte != null ||
          marca.fimCorte != null ||
          marca.inicioCostura != null ||
          marca.fimCostura != null ||
          marca.inicioRevisao != null ||
          marca.fimRevisao != null),
    )
    .sort((a, b) => a.codProduto.localeCompare(b.codProduto, 'pt-BR'))
  for (const marca of foraDoSignus) {
    const conhecido = produtoNaBaseItens(marca.codProduto)
    itens.push({
      codProduto: conhecido?.codProduto ?? marca.codProduto,
      nomeProduto: marca.nomeProduto ?? conhecido?.nomeProduto ?? null,
      categoriaProduto: null,
      qtdPedida: null,
      qtdFaturada: 0,
      valorLiquido: 0,
      valorBruto: 0,
      qtdCortada: marca.cortada,
      qtdCosturada: marca.costurada,
      qtdRevisada: marca.revisada,
      inicioCorte: marca.inicioCorte,
      fimCorte: marca.fimCorte,
      inicioCostura: marca.inicioCostura,
      fimCostura: marca.fimCostura,
      inicioRevisao: marca.inicioRevisao,
      fimRevisao: marca.fimRevisao,
      foraDoSignus: true,
    })
  }

  const nomes = itens.map((row) => ({
    codProduto: row.codProduto,
    nomeProduto: row.nomeProduto,
  }))
  const costura = completarComPlanilha(lancados.costura, planilhaCostura, nomes)
  const revisao = completarComPlanilha(
    lancados.revisao,
    planilhaRevisao.map((row) => ({ ...row, origem: null, origemNorm: null })),
    nomes,
  )
  const corteProdutos = lancados.corte.length
    ? comNomeDoItem(lancados.corte, nomes).sort(compararLinhas)
    : linhasCortePlanilha(ocs, linhas)
  const oficinasProduto = agruparOficinas(oficinas, nomes)

  const pecasCosturaProd = costura
    .filter((row) => row.origemNorm === 'Producao')
    .reduce((sum, row) => sum + row.pecas, 0)
  const pecasCosturaServico = costura
    .filter((row) => row.origemNorm !== 'Producao')
    .reduce((sum, row) => sum + row.pecas, 0)
  const pecasRevisao = revisao.reduce((sum, row) => sum + row.pecas, 0)
  const temCorteAba = itens.some((row) => row.inicioCorte || row.fimCorte)
  const temCosturaAba = itens.some((row) => row.fimCostura)
  const temRevisaoAba = itens.some((row) => row.fimRevisao)
  const inicioCorte = temCorteAba
    ? extremo(itens.map((row) => row.inicioCorte), 'min')
    : (corte?.inicioCorte ?? null)
  const finalCorte = temCorteAba
    ? extremo(itens.map((row) => row.fimCorte), 'max')
    : (corte?.finalCorte ?? null)
  const inicioCostura = extremo(itens.map((row) => row.inicioCostura), 'min')
  const finalCostura = temCosturaAba
    ? extremo(itens.map((row) => row.fimCostura), 'max')
    : extremo(
        costura.filter((row) => row.origemNorm === 'Producao').map((row) => row.fim),
        'max',
      )
  const inicioRevisao = extremo(itens.map((row) => row.inicioRevisao), 'min')
  const finalRevisao = temRevisaoAba
    ? extremo(itens.map((row) => row.fimRevisao), 'max')
    : extremo(revisao.map((row) => row.fim), 'max')
  const oficinaAberta = oficinas.some((row) => row.pendentes > 0)
  const prometidaBase = oficinaAberta
    ? oficinas.filter((row) => row.pendentes > 0)
    : oficinas
  const pcpProntas = corte?.pcpProntas ?? null

  return {
    pedidoNorm,
    flags: {
      corte: Boolean(flags.corte),
      costuraProd: Boolean(flags.costuraProd),
      revisao: Boolean(flags.revisao),
      oficinas: Boolean(flags.oficinas),
      signus: Boolean(flags.signus),
    },
    corte: corte
      ? { ...corte, statusDuplo: Boolean(corte.statusDuplo) }
      : null,
    ocs,
    linhas: linhas.map((row) => ({ ...row, isHeader: Boolean(row.isHeader) })),
    corteProdutos,
    costura,
    revisao,
    oficinas: oficinasProduto,
    signus: signus.map((row) => ({ ...row, isBaixa: Boolean(row.isBaixa) })),
    itens,
    qualidade,
    datas: {
      pcpProntas,
      inicioCorte,
      finalCorte,
      inicioCostura,
      finalCostura,
      envioOficina: extremo(oficinas.map((row) => row.dataEnvio), 'min'),
      retornoOficina: extremo(oficinas.map((row) => row.dataRetorno), 'max'),
      prometidaOficina: extremo(prometidaBase.map((row) => row.dataPrometida), 'max'),
      oficinaAberta,
      inicioRevisao,
      finalRevisao,
    },
    totais: {
      pecasCorte: corte?.pecas ?? 0,
      metrosCorte: corte?.metros ?? 0,
      pecasCosturaProd,
      pecasCosturaServico,
      pecasRevisao,
      enviadas: oficinas.reduce((sum, row) => sum + row.enviadas, 0),
      retornadas: oficinas.reduce((sum, row) => sum + row.retornadas, 0),
      pendentes: oficinas.reduce((sum, row) => sum + row.pendentes, 0),
      defeitos: oficinas.reduce((sum, row) => sum + row.defeitos, 0),
      metrosSignusBaixa: signus
        .filter((row) => row.isBaixa)
        .reduce((sum, row) => sum + row.metros, 0),
      diasCiclo: leadTimeDays(pcpProntas, finalRevisao),
    },
  }
})

export const getQualidadeEventos = cache(async (): Promise<QualidadeGrupo[]> => {
  await ensureCloudDatabase()
  const rows = sqlite()
    .prepare(
      `SELECT tipo, pedido_norm as pedidoNorm, detalhe, excel_row as excelRow, valor
       FROM qualidade_evento
       ORDER BY tipo, pedido_norm`,
    )
    .all() as {
    tipo: string
    pedidoNorm: string | null
    detalhe: string
    excelRow: number | null
    valor: number | null
  }[]

  const groups = new Map<string, QualidadeGrupo['eventos']>()
  for (const row of rows) {
    const list = groups.get(row.tipo) ?? []
    list.push({
      pedidoNorm: row.pedidoNorm,
      detalhe: row.detalhe,
      excelRow: row.excelRow,
      valor: row.valor,
    })
    groups.set(row.tipo, list)
  }
  return [...groups.entries()].map(([tipo, eventos]) => ({ tipo, eventos }))
})

export const getSerieDiaria = cache(async (dias = 30): Promise<SerieDiariaRow[]> => {
  await ensureCloudDatabase()
  const db = sqlite()
  const hoje = (db.prepare(`SELECT date('now', 'localtime') as v`).get() as { v: string }).v
  const inicio = (
    db
      .prepare(`SELECT date(?, '-' || ? || ' days') as v`)
      .get(hoje, dias - 1) as { v: string }
  ).v

  const cortadas = db
    .prepare(
      `SELECT data, COALESCE(SUM(qtd_pecas), 0) as pecas
       FROM fato_corte_linha
       WHERE data >= @inicio AND data <= @hoje
       GROUP BY data`,
    )
    .all({ inicio, hoje }) as { data: string; pecas: number }[]
  const costura = db
    .prepare(
      `SELECT data_producao as data, COALESCE(SUM(qtd_pecas), 0) as pecas
       FROM ${sqlCosturaProducaoUnion('c')}
       WHERE data_producao >= @inicio AND data_producao <= @hoje
       GROUP BY data_producao`,
    )
    .all({ inicio, hoje }) as { data: string; pecas: number }[]
  const revisao = db
    .prepare(
      `SELECT data_producao as data, COALESCE(SUM(qtd_pecas), 0) as pecas
       FROM ${sqlRevisaoUnion('r')}
       WHERE data_producao >= @inicio AND data_producao <= @hoje
       GROUP BY data_producao`,
    )
    .all({ inicio, hoje }) as { data: string; pecas: number }[]

  const byDay = new Map<string, SerieDiariaRow>()
  const start = Date.parse(`${inicio}T00:00:00Z`)
  for (let i = 0; i < dias; i++) {
    const iso = new Date(start + i * 86400000).toISOString().slice(0, 10)
    byDay.set(iso, { data: iso, cortadas: 0, costura: 0, revisao: 0 })
  }
  for (const row of cortadas) {
    const item = byDay.get(row.data)
    if (item) item.cortadas = row.pecas
  }
  for (const row of costura) {
    const item = byDay.get(row.data)
    if (item) item.costura = row.pecas
  }
  for (const row of revisao) {
    const item = byDay.get(row.data)
    if (item) item.revisao = row.pecas
  }
  return [...byDay.values()]
})

export function produtoNaBaseItens(cod: string): ProdutoBaseItens | null {
  const texto = cod.trim()
  if (!texto || !hasPedidoItemTable()) return null
  const row = sqlite()
    .prepare(
      `SELECT cod_produto as codProduto, nome_produto as nomeProduto
       FROM fato_pedido_item
       WHERE ${COD_PRODUTO_IGUAL}
       ORDER BY CASE WHEN nome_produto IS NOT NULL AND trim(nome_produto) != '' THEN 0 ELSE 1 END,
                excel_row DESC
       LIMIT 1`,
    )
    .get(texto) as ProdutoBaseItens | undefined
  return row ?? null
}

export function cabecaPedidoCorte(pedidoNorm: string) {
  return (
    sqlite()
      .prepare(
        `SELECT cliente, canal, status_vigente as status
         FROM fato_corte_pedido
         WHERE pedido_norm = ?`,
      )
      .get(pedidoNorm) as
      | { cliente: string | null; canal: string | null; status: string | null }
      | undefined
  ) ?? null
}

async function lancamentosDoPedido(pedidoNorm: string) {
  const locais = new Map<string, { excelRow: number } & CorteNuvemLancamento>()
  for (const lancamento of sqlite()
    .prepare(
      `SELECT cod_produto as codProduto, excel_row as excelRow,
              qtd_real as qtdReal, qtd_volumes as qtdVolumes,
              qtd_volumes_bordados as qtdVolumesBordados,
              data_inicio as dataInicio, data_final as dataFinal,
              responsavel, aviso_data_final as avisoDataFinal,
              nome_produto as nomeProduto,
              atualizado_em as atualizadoEm
       FROM corte_producao_lancamento
       WHERE pedido_norm = ?
       ORDER BY atualizado_em DESC`,
    )
    .all(pedidoNorm) as ({
    codProduto: string
    excelRow: number
  } & CorteNuvemLancamento)[]) {
    if (!locais.has(lancamento.codProduto)) locais.set(lancamento.codProduto, lancamento)
  }

  let nuvem = new Map<string, CorteNuvemLancamento>()
  try {
    nuvem = await lerLancamentosNuvem(pedidoNorm)
  } catch (error) {
    console.error('leitura do corte na nuvem falhou', pedidoNorm, error)
  }
  return { locais, nuvem }
}

function itemDoLancamento(
  codProduto: string,
  excelRow: number,
  lancamento: CorteNuvemLancamento | undefined,
  qtdPedida: number | null,
  nomeProduto: string | null,
): ItemPedidoConsulta {
  return {
    codProduto,
    excelRow,
    nomeProduto,
    qtdPedida,
    qtdReal: lancamento?.qtdReal ?? null,
    qtdVolumes: lancamento?.qtdVolumes ?? null,
    qtdVolumesBordados: lancamento?.qtdVolumesBordados ?? null,
    dataInicio: lancamento?.dataInicio ?? null,
    dataFinal: lancamento?.dataFinal ?? null,
    responsavel: lancamento?.responsavel ?? null,
    avisoDataFinal: lancamento?.avisoDataFinal ?? null,
  }
}

export const getItensPorPedido = cache(async (raw: string): Promise<ItensPedidoConsulta> => {
  await ensureCloudDatabase()
  const pedidoInformado = parsePedidoParam(raw).trim()
  const vazio: ItensPedidoConsulta = {
    pedidoInformado,
    pedidoNorm: null,
    cliente: null,
    canal: null,
    status: null,
    loaded: hasPedidoItemTable(),
    inclusaoManual: false,
    itens: [],
  }
  if (!pedidoInformado || !vazio.loaded) return vazio

  const pedidoNorm = pedidoDigits(pedidoInformado)
  if (!pedidoNorm) return vazio

  const rows = sqlite()
    .prepare(
      `SELECT i.pedido_norm as pedidoNorm, i.pedido_raw as pedidoRaw,
              i.tipo_comercializacao as tipo, i.cliente, i.canal, i.status,
              i.cod_produto as codProduto, i.nome_produto as nomeProduto,
              i.qtd_pedida as qtdPedida, i.excel_row as excelRow
       FROM fato_pedido_item i
       WHERE i.pedido_norm = ?
       ORDER BY i.excel_row`,
    )
    .all(pedidoNorm) as {
    pedidoNorm: string
    pedidoRaw: string
    tipo: string | null
    cliente: string | null
    canal: string | null
    status: string | null
    codProduto: string
    nomeProduto: string | null
    qtdPedida: number
    excelRow: number
    qtdReal: number | null
    qtdVolumes: number | null
    qtdVolumesBordados: number | null
    dataInicio: string | null
    dataFinal: string | null
    responsavel: string | null
    avisoDataFinal: string | null
  }[]

  const { locais, nuvem } = await lancamentosDoPedido(pedidoNorm)
  const cabeca = rows[0]
    if (!cabeca) {
    const corte = cabecaPedidoCorte(pedidoNorm)
    const codigos = new Set<string>([...locais.keys(), ...nuvem.keys()])
    const itens = [...codigos].map((codProduto) => {
      const local = locais.get(codProduto)
      const lancamento = escolherLancamento(local, nuvem.get(codProduto))
      const produto = produtoNaBaseItens(codProduto)
      return itemDoLancamento(
        produto?.codProduto ?? codProduto,
        local?.excelRow ?? 0,
        lancamento,
        null,
        produto?.nomeProduto ?? lancamento?.nomeProduto ?? null,
      )
    })
    itens.sort((a, b) => a.codProduto.localeCompare(b.codProduto))
    return {
      pedidoInformado,
      pedidoNorm,
      cliente: corte?.cliente ?? null,
      canal: corte?.canal ?? null,
      status: corte?.status ?? null,
      loaded: true,
      inclusaoManual: true,
      itens,
    }
  }

  const itens = collapseItensCorte(
    rows.map((row) => ({
      ...row,
      qtdReal: null,
      qtdVolumes: null,
      qtdVolumesBordados: null,
      dataInicio: null,
      dataFinal: null,
      responsavel: null,
      avisoDataFinal: null,
    })),
  )
  return {
    pedidoInformado,
    pedidoNorm: cabeca.pedidoNorm,
    cliente: cabeca.cliente,
    canal: cabeca.canal,
    status: cabeca.status,
    loaded: true,
    inclusaoManual: false,
    itens: itens.map((row) => {
      const lancamento = escolherLancamento(
        locais.get(row.codProduto),
        nuvem.get(row.codProduto),
      )
      return itemDoLancamento(
        row.codProduto,
        row.excelRow,
        lancamento,
        row.qtdPedida,
        row.nomeProduto,
      )
    }),
  }
})
