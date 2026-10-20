import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

/** Nomes fixos gerados pela automação (1 aba = 1 parquet). */
export const PARQUET_NAMES = {
  corte: 'PROGRAMAÇÃO CORTE E COSTURA - CORTE.parquet',
  costura: 'PROGRAMAÇÃO CORTE E COSTURA - RELATORIO COSTURA.parquet',
  revisao: 'PROGRAMAÇÃO CORTE E COSTURA - RELATORIO REVISÃO.parquet',
  aproveitamentoOrigem:
    'PROGRAMAÇÃO CORTE E COSTURA - APROVEITAMENTO - Origem.parquet',
  aproveitamentoPedidos:
    'PROGRAMAÇÃO CORTE E COSTURA - APROVEITAMENTO - Pedidos.parquet',
  oficinas: 'Produção Oficinas - TABELA OFICINAS.parquet',
  signus: 'Movimentacao Tecidos.parquet',
  estoque: 'Saldo do Estoque Geral.parquet',
  pedidos: 'Pedidos.parquet',
  itens: 'Itens.parquet',
  parceiros: 'Parceiro Comercial.parquet',
} as const

/** Arquivos que compõem a fonte "corte" (workbook multi-aba). */
export function corteBundleNames() {
  return [
    PARQUET_NAMES.corte,
    PARQUET_NAMES.costura,
    PARQUET_NAMES.revisao,
    PARQUET_NAMES.aproveitamentoOrigem,
    PARQUET_NAMES.aproveitamentoPedidos,
  ] as const
}

export function parquetPath(dir: string, name: string) {
  return path.join(dir, name)
}

export function resolveParquetBeside(primaryPath: string, fileName: string) {
  return path.join(path.dirname(primaryPath), fileName)
}

/** Maior mtime ISO do bundle (ex.: todas as abas de corte). */
export function maxMtimeIso(filePaths: string[]): string {
  let maxMs = 0
  let iso = ''
  for (const filePath of filePaths) {
    if (!existsSync(filePath)) continue
    const mtime = statSync(filePath).mtime
    if (mtime.getTime() >= maxMs) {
      maxMs = mtime.getTime()
      iso = mtime.toISOString()
    }
  }
  if (!iso) {
    throw new Error(`Nenhum arquivo encontrado: ${filePaths.join(', ')}`)
  }
  return iso
}

export function requiredParquetPaths(dir: string) {
  return {
    corte: parquetPath(dir, PARQUET_NAMES.corte),
    costura: parquetPath(dir, PARQUET_NAMES.costura),
    revisao: parquetPath(dir, PARQUET_NAMES.revisao),
    aproveitamentoOrigem: parquetPath(dir, PARQUET_NAMES.aproveitamentoOrigem),
    aproveitamentoPedidos: parquetPath(
      dir,
      PARQUET_NAMES.aproveitamentoPedidos,
    ),
    oficinas: parquetPath(dir, PARQUET_NAMES.oficinas),
    signus: parquetPath(dir, PARQUET_NAMES.signus),
    estoque: parquetPath(dir, PARQUET_NAMES.estoque),
    pedidos: parquetPath(dir, PARQUET_NAMES.pedidos),
    itens: parquetPath(dir, PARQUET_NAMES.itens),
    parceiros: parquetPath(dir, PARQUET_NAMES.parceiros),
  }
}

export function parquetFolderReady(dir: string) {
  const paths = requiredParquetPaths(dir)
  return (
    existsSync(paths.corte) &&
    existsSync(paths.costura) &&
    existsSync(paths.revisao) &&
    existsSync(paths.oficinas) &&
    existsSync(paths.signus) &&
    existsSync(paths.estoque)
  )
}

/** Caminhos do bundle de corte ao lado do arquivo CORTE (projeto ou cache). */
export function corteBundlePaths(cortePrimaryPath: string) {
  return corteBundleNames().map((name) =>
    resolveParquetBeside(cortePrimaryPath, name),
  )
}
