export type ItemProgramacao = {
  id: string
  codProduto: string
  nome: string
  /** Quantidade pedida no pedido (Itens.xlsx). */
  qtdPedido: number | null
  /** Quantidade que entra na programação de produção. */
  quantidadeProducao: string
  /** Início do período na produção (YYYY-MM-DD). */
  dataInicio: string
  /** Fim do período na produção (YYYY-MM-DD). */
  dataFim: string
}

/** Linha gravada no banco local (consulta). */
export type LinhaProgramacao = {
  key: string
  pedido: string
  pedidoNorm: string | null
  cliente: string | null
  itemId: string
  codProduto: string
  nome: string
  qtdPedido: number | null
  quantidadeProducao: string
  dataInicio: string
  dataFim: string
  savedAt: string
}

export type ProgramacaoBanco = {
  version: 2
  linhas: LinhaProgramacao[]
}

export type GrupoPedidoProgramacao = {
  pedido: string
  pedidoNorm: string | null
  cliente: string | null
  linhas: LinhaProgramacao[]
}

export type GrupoDataProgramacao = {
  /** Chave do período: `inicio` ou `inicio|fim`. */
  dataProducao: string
  dataInicio: string
  dataFim: string
  pedidos: GrupoPedidoProgramacao[]
}

export const PROGRAMACAO_STORAGE_KEY = 'programacao-producao:v1'

const DATA = /^\d{4}-\d{2}-\d{2}$/

export function dataProducaoValida(value: string) {
  if (!DATA.test(value)) return false
  const [ano, mes, dia] = value.split('-').map(Number)
  const data = new Date(Date.UTC(ano, mes - 1, dia))
  return (
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
  )
}

export function periodoValido(inicio: string, fim: string) {
  return dataProducaoValida(inicio) && dataProducaoValida(fim) && inicio <= fim
}

function parseUtc(iso: string) {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia))
}

function toIso(date: Date) {
  return date.toISOString().slice(0, 10)
}

/** Dias inclusivos do período (UTC). */
export function cadaDiaNoPeriodo(inicio: string, fim: string): string[] {
  if (!periodoValido(inicio, fim)) return []
  const dias: string[] = []
  const cursor = parseUtc(inicio)
  const fimDate = parseUtc(fim)
  while (cursor.getTime() <= fimDate.getTime()) {
    dias.push(toIso(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dias
}

export function periodosSobrepoem(
  inicioA: string,
  fimA: string,
  inicioB: string,
  fimB: string,
) {
  return inicioA <= fimB && inicioB <= fimA
}

export function parseQuantidade(value: string): number | null {
  const texto = value.trim().replace(',', '.')
  if (!texto) return null
  const numero = Number(texto)
  if (!Number.isFinite(numero) || numero <= 0) return null
  return numero
}

export function itemComQuantidade(item: ItemProgramacao) {
  return parseQuantidade(item.quantidadeProducao) != null
}

export function itemProntoParaSalvar(item: ItemProgramacao) {
  return (
    item.nome.trim().length > 0 &&
    itemComQuantidade(item) &&
    periodoValido(item.dataInicio, item.dataFim)
  )
}

function chavePedido(pedido: string, pedidoNorm: string | null) {
  return (pedidoNorm ?? pedido).trim()
}

export function linhaKey(
  pedidoNorm: string | null,
  pedido: string,
  itemId: string,
  dataInicio: string,
  dataFim: string,
) {
  return `${chavePedido(pedido, pedidoNorm)}|${itemId}|${dataInicio}|${dataFim}`
}

function lerPeriodoRaw(raw: Record<string, unknown>, dataFallback = '') {
  const inicio =
    typeof raw.dataInicio === 'string' && dataProducaoValida(raw.dataInicio)
      ? raw.dataInicio
      : ''
  const fim =
    typeof raw.dataFim === 'string' && dataProducaoValida(raw.dataFim)
      ? raw.dataFim
      : ''
  if (periodoValido(inicio, fim)) return { dataInicio: inicio, dataFim: fim }
  const unica =
    typeof raw.dataProducao === 'string' && dataProducaoValida(raw.dataProducao)
      ? raw.dataProducao
      : dataFallback && dataProducaoValida(dataFallback)
        ? dataFallback
        : ''
  if (!unica) return null
  return { dataInicio: unica, dataFim: unica }
}

/** Aceita gravações antigas com `quantidade` / data única. */
export function normalizarItemSalvo(
  raw: unknown,
  dataFallback = '',
): ItemProgramacao | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  if (typeof item.id !== 'string' || typeof item.nome !== 'string') return null
  const qtdPedido =
    typeof item.qtdPedido === 'number' && Number.isFinite(item.qtdPedido)
      ? item.qtdPedido
      : null
  const quantidadeProducao =
    typeof item.quantidadeProducao === 'string'
      ? item.quantidadeProducao
      : typeof item.quantidade === 'string'
        ? item.quantidade
        : ''
  const periodo = lerPeriodoRaw(item, dataFallback)
  return {
    id: item.id,
    codProduto: typeof item.codProduto === 'string' ? item.codProduto : '',
    nome: item.nome,
    qtdPedido,
    quantidadeProducao,
    dataInicio: periodo?.dataInicio ?? '',
    dataFim: periodo?.dataFim ?? '',
  }
}

export function normalizarLinha(raw: unknown): LinhaProgramacao | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.pedido !== 'string' || typeof row.nome !== 'string') return null
  if (typeof row.quantidadeProducao !== 'string') return null
  const periodo = lerPeriodoRaw(row)
  if (!periodo) return null
  const pedidoNorm = typeof row.pedidoNorm === 'string' ? row.pedidoNorm : null
  const itemId =
    typeof row.itemId === 'string'
      ? row.itemId
      : typeof row.id === 'string'
        ? row.id
        : `${row.codProduto ?? 'item'}`
  const qtdPedido =
    typeof row.qtdPedido === 'number' && Number.isFinite(row.qtdPedido)
      ? row.qtdPedido
      : null
  return {
    key:
      typeof row.key === 'string'
        ? row.key
        : linhaKey(
            pedidoNorm,
            row.pedido,
            itemId,
            periodo.dataInicio,
            periodo.dataFim,
          ),
    pedido: row.pedido,
    pedidoNorm,
    cliente: typeof row.cliente === 'string' ? row.cliente : null,
    itemId,
    codProduto: typeof row.codProduto === 'string' ? row.codProduto : '',
    nome: row.nome,
    qtdPedido,
    quantidadeProducao: row.quantidadeProducao,
    dataInicio: periodo.dataInicio,
    dataFim: periodo.dataFim,
    savedAt: typeof row.savedAt === 'string' ? row.savedAt : new Date().toISOString(),
  }
}

function migrarV1ParaBanco(raw: Record<string, unknown>): ProgramacaoBanco | null {
  if (!Array.isArray(raw.itens) || typeof raw.pedido !== 'string') return null
  const dataFallback =
    typeof raw.dataProducao === 'string' && dataProducaoValida(raw.dataProducao)
      ? raw.dataProducao
      : ''
  const pedidoNorm = typeof raw.pedidoNorm === 'string' ? raw.pedidoNorm : null
  const cliente = typeof raw.cliente === 'string' ? raw.cliente : null
  const savedAt =
    typeof raw.savedAt === 'string' ? raw.savedAt : new Date().toISOString()
  const linhas: LinhaProgramacao[] = []
  for (const itemRaw of raw.itens) {
    const item = normalizarItemSalvo(itemRaw, dataFallback)
    if (!item || !itemProntoParaSalvar(item)) continue
    linhas.push({
      key: linhaKey(
        pedidoNorm,
        raw.pedido,
        item.id,
        item.dataInicio,
        item.dataFim,
      ),
      pedido: raw.pedido,
      pedidoNorm,
      cliente,
      itemId: item.id,
      codProduto: item.codProduto,
      nome: item.nome,
      qtdPedido: item.qtdPedido,
      quantidadeProducao: item.quantidadeProducao,
      dataInicio: item.dataInicio,
      dataFim: item.dataFim,
      savedAt,
    })
  }
  return { version: 2, linhas }
}

export function lerBancoProgramacao(): ProgramacaoBanco {
  if (typeof window === 'undefined') return { version: 2, linhas: [] }
  try {
    const raw = window.localStorage.getItem(PROGRAMACAO_STORAGE_KEY)
    if (!raw) return { version: 2, linhas: [] }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed.version === 2 && Array.isArray(parsed.linhas)) {
      return {
        version: 2,
        linhas: parsed.linhas
          .map(normalizarLinha)
          .filter((row): row is LinhaProgramacao => row != null),
      }
    }
    if (parsed.version === 1) {
      const migrado = migrarV1ParaBanco(parsed)
      if (migrado) {
        gravarBancoProgramacao(migrado)
        return migrado
      }
    }
  } catch {
    /* ignore */
  }
  return { version: 2, linhas: [] }
}

export function gravarBancoProgramacao(banco: ProgramacaoBanco) {
  window.localStorage.setItem(PROGRAMACAO_STORAGE_KEY, JSON.stringify(banco))
}

/** Substitui as linhas do pedido e acrescenta as novas prontas. */
export function mesclarPedidoNoBanco(input: {
  pedido: string
  pedidoNorm: string | null
  cliente: string | null
  itens: ItemProgramacao[]
}): { banco: ProgramacaoBanco; gravados: number; removidosAnteriores: number } {
  const banco = lerBancoProgramacao()
  const chave = chavePedido(input.pedido, input.pedidoNorm)
  const anteriores = banco.linhas.filter(
    (row) => chavePedido(row.pedido, row.pedidoNorm) === chave,
  )
  const restantes = banco.linhas.filter(
    (row) => chavePedido(row.pedido, row.pedidoNorm) !== chave,
  )
  const savedAt = new Date().toISOString()
  const novas = input.itens.filter(itemProntoParaSalvar).map((item) => ({
    key: linhaKey(
      input.pedidoNorm,
      input.pedido,
      item.id,
      item.dataInicio,
      item.dataFim,
    ),
    pedido: input.pedido,
    pedidoNorm: input.pedidoNorm,
    cliente: input.cliente,
    itemId: item.id,
    codProduto: item.codProduto,
    nome: item.nome,
    qtdPedido: item.qtdPedido,
    quantidadeProducao: item.quantidadeProducao,
    dataInicio: item.dataInicio,
    dataFim: item.dataFim,
    savedAt,
  }))
  const next: ProgramacaoBanco = { version: 2, linhas: [...restantes, ...novas] }
  gravarBancoProgramacao(next)
  return {
    banco: next,
    gravados: novas.length,
    removidosAnteriores: anteriores.length,
  }
}

export function itensSalvosDoPedido(
  banco: ProgramacaoBanco,
  pedido: string,
  pedidoNorm: string | null,
): ItemProgramacao[] {
  const chave = chavePedido(pedido, pedidoNorm)
  return banco.linhas
    .filter((row) => chavePedido(row.pedido, row.pedidoNorm) === chave)
    .map((row) => ({
      id: row.itemId,
      codProduto: row.codProduto,
      nome: row.nome,
      qtdPedido: row.qtdPedido,
      quantidadeProducao: row.quantidadeProducao,
      dataInicio: row.dataInicio,
      dataFim: row.dataFim,
    }))
}

/** Remove todas as linhas do pedido no banco local. */
export function removerPedidoDoBanco(
  pedido: string,
  pedidoNorm: string | null,
): { banco: ProgramacaoBanco; removidos: number } {
  const banco = lerBancoProgramacao()
  const chave = chavePedido(pedido, pedidoNorm)
  const restantes = banco.linhas.filter(
    (row) => chavePedido(row.pedido, row.pedidoNorm) !== chave,
  )
  const removidos = banco.linhas.length - restantes.length
  const next: ProgramacaoBanco = { version: 2, linhas: restantes }
  if (removidos > 0) gravarBancoProgramacao(next)
  return { banco: next, removidos }
}

/** Remove linhas específicas pela chave. */
export function removerLinhasDoBanco(
  keys: string[],
): { banco: ProgramacaoBanco; removidos: number } {
  const banco = lerBancoProgramacao()
  const set = new Set(keys.filter(Boolean))
  if (set.size === 0) return { banco, removidos: 0 }
  const restantes = banco.linhas.filter((row) => !set.has(row.key))
  const removidos = banco.linhas.length - restantes.length
  const next: ProgramacaoBanco = { version: 2, linhas: restantes }
  if (removidos > 0) gravarBancoProgramacao(next)
  return { banco: next, removidos }
}

export function agruparProgramacao(
  linhas: LinhaProgramacao[],
  dataFiltro?: string,
): GrupoDataProgramacao[] {
  const filtradas =
    dataFiltro && dataProducaoValida(dataFiltro)
      ? linhas.filter((row) =>
          periodosSobrepoem(row.dataInicio, row.dataFim, dataFiltro, dataFiltro),
        )
      : [...linhas]

  const porPeriodo = new Map<string, LinhaProgramacao[]>()
  for (const row of filtradas) {
    const chave = `${row.dataInicio}|${row.dataFim}`
    const lista = porPeriodo.get(chave) ?? []
    lista.push(row)
    porPeriodo.set(chave, lista)
  }

  return [...porPeriodo.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chave, rows]) => {
      const [dataInicio, dataFim] = chave.split('|')
      const porPedido = new Map<string, GrupoPedidoProgramacao>()
      for (const row of rows) {
        const chavePed = chavePedido(row.pedido, row.pedidoNorm)
        const grupo = porPedido.get(chavePed)
        if (grupo) {
          grupo.linhas.push(row)
        } else {
          porPedido.set(chavePed, {
            pedido: row.pedido,
            pedidoNorm: row.pedidoNorm,
            cliente: row.cliente,
            linhas: [row],
          })
        }
      }
      const pedidos = [...porPedido.values()].sort((a, b) =>
        a.pedido.localeCompare(b.pedido, 'pt-BR', { numeric: true }),
      )
      for (const pedido of pedidos) {
        pedido.linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      }
      return {
        dataProducao: dataInicio === dataFim ? dataInicio : chave,
        dataInicio,
        dataFim,
        pedidos,
      }
    })
}
