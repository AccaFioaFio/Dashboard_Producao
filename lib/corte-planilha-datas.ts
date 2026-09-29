import {
  copyFileSync,
  existsSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import { getSqlite } from '@/db'
import { canonicalizePedido, normalizeHeader, normalizeStatus } from '@/lib/keys'
import { corteXlsxPath } from '@/lib/paths'

const DATA = /^\d{4}-\d{2}-\d{2}$/

/** Excel serial (base 1899-12-30), o mesmo formato das datas já gravadas na aba CORTE. */
export function excelDateSerial(iso: string) {
  if (!DATA.test(iso)) return null
  const [ano, mes, dia] = iso.split('-').map(Number)
  const utc = Date.UTC(ano, mes - 1, dia)
  if (Number.isNaN(utc)) return null
  const serial = Math.round((utc - Date.UTC(1899, 11, 30)) / 86_400_000)
  return serial > 0 ? serial : null
}

type ColunasCorte = {
  headerRow: number
  pedido: string
  status: string
  inicio: string
  final: string
}

type Celula = {
  col: string
  row: number
  attrs: string
  inner: string
  tag: string
}

export type AplicarDatasCorteResult = {
  sheetXml: string
  linhas: number
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
}

function attr(attrs: string, name: string) {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))
  return match?.[1] ?? null
}

function sharedStrings(xml: string) {
  const textos: string[] = []
  for (const bloco of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const partes = [...bloco[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((parte) =>
      decodeXml(parte[1]),
    )
    textos.push(partes.join(''))
  }
  return textos
}

function celulas(sheetXml: string) {
  const lista: Celula[] = []
  const re = /<c\b([^>]*\br="([A-Z]{1,3})(\d+)"[^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g
  for (const match of sheetXml.matchAll(re)) {
    lista.push({
      attrs: match[1],
      col: match[2],
      row: Number(match[3]),
      inner: match[4] ?? '',
      tag: match[0],
    })
  }
  return lista
}

function valorCelula(celula: Celula, textos: string[]) {
  const tipo = attr(celula.attrs, 't')
  if (tipo === 'inlineStr') {
    const partes = [...celula.inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((parte) =>
      decodeXml(parte[1]),
    )
    return partes.join('')
  }
  const valor = celula.inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)
  if (!valor) return null
  const texto = decodeXml(valor[1]).trim()
  if (tipo === 's') {
    const indice = Number(texto)
    return Number.isInteger(indice) ? (textos[indice] ?? null) : null
  }
  if (tipo === 'str') return texto
  if (texto === '') return null
  const numero = Number(texto)
  return Number.isFinite(numero) && /^-?\d+(\.\d+)?$/.test(texto) ? numero : texto
}

function colunaPorTitulo(celulasHeader: Celula[], textos: string[], aliases: string[]) {
  const mapa = new Map<string, string>()
  for (const celula of celulasHeader) {
    const titulo = normalizeHeader(valorCelula(celula, textos))
    if (titulo && !mapa.has(titulo)) mapa.set(titulo, celula.col)
  }
  for (const alias of aliases) {
    const direto = mapa.get(normalizeHeader(alias))
    if (direto) return direto
  }
  for (const [titulo, coluna] of mapa) {
    if (aliases.some((alias) => titulo.includes(normalizeHeader(alias)))) return coluna
  }
  return null
}

function colunasCorte(lista: Celula[], textos: string[]): ColunasCorte | null {
  const porLinha = new Map<number, Celula[]>()
  for (const celula of lista) {
    if (celula.row > 40) continue
    const grupo = porLinha.get(celula.row) ?? []
    grupo.push(celula)
    porLinha.set(celula.row, grupo)
  }
  for (const [headerRow, grupo] of porLinha) {
    const pedido = colunaPorTitulo(grupo, textos, ['N PEDIDO', 'NO PEDIDO', 'NUMERO PEDIDO'])
    const status = colunaPorTitulo(grupo, textos, ['STATUS'])
    const inicio = colunaPorTitulo(grupo, textos, ['INICIO CORTE'])
    const final = colunaPorTitulo(grupo, textos, ['FINAL CORTE'])
    if (pedido && status && inicio && final) {
      return { headerRow, pedido, status, inicio, final }
    }
  }
  return null
}

function celulaData(coluna: string, linha: number, estilo: string | null, serial: number) {
  const style = estilo ? ` s="${estilo}"` : ''
  return `<c r="${coluna}${linha}"${style}><v>${serial}</v></c>`
}

function serialAtual(celula: Celula, textos: string[]) {
  if (celula.inner.includes('<f')) return null
  const valor = valorCelula(celula, textos)
  return typeof valor === 'number' ? valor : null
}

/**
 * Troca INICIO CORTE e FINAL CORTE só nas linhas do pedido cujo status
 * em cache ainda é EM PRODUÇÃO. A fórmula de STATUS permanece na célula.
 */
export function aplicarDatasCorteNoXml(
  sheetXml: string,
  sharedStringsXml: string,
  pedidoNorm: string,
  inicioIso: string,
  finalIso: string,
): AplicarDatasCorteResult {
  const inicio = excelDateSerial(inicioIso)
  const final = excelDateSerial(finalIso)
  if (inicio == null || final == null) {
    throw new Error('Data de corte inválida para a planilha.')
  }
  if (final < inicio) {
    throw new Error('A data final do corte é anterior ao início.')
  }

  const textos = sharedStrings(sharedStringsXml)
  const lista = celulas(sheetXml)
  const colunas = colunasCorte(lista, textos)
  if (!colunas) {
    throw new Error('Cabeçalho da aba CORTE não encontrado (Nº PEDIDO, STATUS, INICIO CORTE, FINAL CORTE).')
  }

  const porLinha = new Map<number, Map<string, Celula>>()
  for (const celula of lista) {
    if (celula.row <= colunas.headerRow) continue
    const linha = porLinha.get(celula.row) ?? new Map<string, Celula>()
    linha.set(celula.col, celula)
    porLinha.set(celula.row, linha)
  }

  let xml = sheetXml
  let linhas = 0
  for (const [row, linha] of porLinha) {
    const pedidoCelula = linha.get(colunas.pedido)
    const statusCelula = linha.get(colunas.status)
    if (!pedidoCelula || !statusCelula) continue
    const pedido = canonicalizePedido(valorCelula(pedidoCelula, textos))
    if (pedido !== pedidoNorm) continue
    const status = normalizeStatus(valorCelula(statusCelula, textos))
    if (status !== 'EM PRODUÇÃO') continue

    const inicioCelula = linha.get(colunas.inicio)
    const finalCelula = linha.get(colunas.final)
    if (inicioCelula?.inner.includes('<f') || finalCelula?.inner.includes('<f')) {
      throw new Error(
        `A linha ${row} do pedido ${pedidoNorm} tem fórmula na data de corte. Não alterei a planilha.`,
      )
    }

    let mudou = false
    if (!inicioCelula || serialAtual(inicioCelula, textos) !== inicio) {
      const tag = celulaData(
        colunas.inicio,
        row,
        inicioCelula ? attr(inicioCelula.attrs, 's') : finalCelula ? attr(finalCelula.attrs, 's') : null,
        inicio,
      )
      xml = inicioCelula
        ? xml.replace(inicioCelula.tag, tag)
        : inserirCelula(xml, row, tag)
      mudou = true
    }
    if (!finalCelula || serialAtual(finalCelula, textos) !== final) {
      const tag = celulaData(
        colunas.final,
        row,
        finalCelula ? attr(finalCelula.attrs, 's') : attr(inicioCelula?.attrs ?? '', 's'),
        final,
      )
      xml = finalCelula ? xml.replace(finalCelula.tag, tag) : inserirCelula(xml, row, tag)
      mudou = true
    }
    if (mudou) linhas += 1
  }

  return { sheetXml: xml, linhas }
}

function inserirCelula(sheetXml: string, row: number, tag: string) {
  const re = new RegExp(`(<row\\b[^>]*\\br="${row}"[^>]*>)([\\s\\S]*?)(</row>)`)
  const match = sheetXml.match(re)
  if (!match) {
    throw new Error(`Linha ${row} da aba CORTE não encontrada.`)
  }
  return sheetXml.replace(re, `$1$2${tag}$3`)
}

function abaCorte(workbookXml: string, relsXml: string) {
  const sheets = [...workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)]
  const corte = sheets
    .map((match) => ({
      name: attr(match[1], 'name'),
      id: attr(match[1], 'r:id'),
    }))
    .find((sheet) => sheet.name && normalizeHeader(sheet.name) === 'CORTE')
  if (!corte?.id) return null
  const rels = [...relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)]
  const rel = rels
    .map((match) => ({
      id: attr(match[1], 'Id'),
      target: attr(match[1], 'Target'),
    }))
    .find((item) => item.id === corte.id)
  if (!rel?.target) return null
  const target = rel.target.replace(/\\/g, '/')
  if (target.startsWith('/')) return target.slice(1)
  return path.posix.join('xl', target)
}

function marcarRecalculo(workbookXml: string) {
  if (/<calcPr\b[^>]*\bfullCalcOnLoad="1"/.test(workbookXml)) return workbookXml
  if (/<calcPr\b/.test(workbookXml)) {
    return workbookXml.replace(/<calcPr\b/, '<calcPr fullCalcOnLoad="1"')
  }
  return workbookXml.replace(/<\/workbook>/, '<calcPr fullCalcOnLoad="1"/></workbook>')
}

let fila: Promise<void> = Promise.resolve()
const gravacaoRecente = new Map<string, { chave: string; mtimeMs: number }>()

function emFila<T>(trabalho: () => Promise<T>) {
  const execucao = fila.then(trabalho, trabalho)
  fila = execucao.then(
    () => undefined,
    () => undefined,
  )
  return execucao
}

export type GravarDatasCortePlanilhaResult =
  | { ok: true; linhas: number }
  | { ok: false; error: string }

async function escreverArquivo(filePath: string, buffer: Buffer) {
  const tmp = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.tmp`,
  )
  try {
    writeFileSync(tmp, buffer)
    copyFileSync(tmp, filePath)
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp)
  }
}

async function gravarNoArquivo(
  filePath: string,
  pedidoNorm: string,
  inicio: string,
  final: string,
) {
  const zip = await JSZip.loadAsync(readFileSync(filePath))
  const workbookFile = zip.file('xl/workbook.xml')
  const relsFile = zip.file('xl/_rels/workbook.xml.rels')
  if (!workbookFile || !relsFile) {
    throw new Error('A planilha de corte não tem o índice das abas.')
  }
  const workbookXml = await workbookFile.async('string')
  const relsXml = await relsFile.async('string')
  const sheetPath = abaCorte(workbookXml, relsXml)
  const sheetFile = sheetPath ? zip.file(sheetPath) : null
  const stringsFile = zip.file('xl/sharedStrings.xml')
  if (!sheetFile || !stringsFile || !sheetPath) {
    throw new Error('A aba CORTE não foi encontrada na planilha.')
  }

  const aplicado = aplicarDatasCorteNoXml(
    await sheetFile.async('string'),
    await stringsFile.async('string'),
    pedidoNorm,
    inicio,
    final,
  )
  if (aplicado.linhas === 0) return 0

  zip.file(sheetPath, aplicado.sheetXml)
  zip.file('xl/workbook.xml', marcarRecalculo(workbookXml))
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  await escreverArquivo(filePath, buffer)
  return aplicado.linhas
}

/**
 * Primeira data de início e última data final já gravadas neste pedido.
 * Só escreve na linha da planilha que ainda está EM PRODUÇÃO.
 */
export async function gravarDatasCorteNaPlanilha(
  pedidoNorm: string,
  filePath = corteXlsxPath(),
): Promise<GravarDatasCortePlanilhaResult> {
  return emFila(async () => {
    const periodo = getSqlite()
      .prepare(
        `SELECT
           MIN(CASE WHEN data_inicio IS NOT NULL AND data_inicio != '' THEN data_inicio END) as inicio,
           MAX(CASE WHEN data_final IS NOT NULL AND data_final != '' THEN data_final END) as final
         FROM corte_producao_lancamento
         WHERE pedido_norm = ?`,
      )
      .get(pedidoNorm) as { inicio: string | null; final: string | null }

    if (!periodo?.inicio || !periodo.final) return { ok: true, linhas: 0 }
    if (periodo.final < periodo.inicio) {
      return {
        ok: false,
        error: 'A última data final gravada é anterior à primeira data de início.',
      }
    }
    if (!existsSync(filePath)) return { ok: true, linhas: 0 }

    const chave = `${periodo.inicio}|${periodo.final}`
    const cacheKey = `${filePath}|${pedidoNorm}`
    const mtimeMs = statSync(filePath).mtimeMs
    const recente = gravacaoRecente.get(cacheKey)
    if (recente?.chave === chave && recente.mtimeMs === mtimeMs) {
      return { ok: true, linhas: 0 }
    }

    try {
      const linhas = await gravarNoArquivo(
        filePath,
        pedidoNorm,
        periodo.inicio,
        periodo.final,
      )
      gravacaoRecente.set(cacheKey, {
        chave,
        mtimeMs: statSync(filePath).mtimeMs,
      })
      return { ok: true, linhas }
    } catch (error) {
      const detalhe = error instanceof Error ? error.message : String(error)
      const bloqueada = /EBUSY|EPERM|EACCES|being used|used by another/i.test(detalhe)
      return {
        ok: false,
        error: bloqueada
          ? 'A planilha Corte e Costura está aberta. Feche o Excel e grave a data de novo.'
          : detalhe.slice(0, 180),
      }
    }
  })
}
