import { readFileSync } from 'node:fs'
import { parentPort, workerData } from 'node:worker_threads'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

function foldName(name) {
  return String(name)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

const { path: filePath, sheets } = workerData
const buffer = readFileSync(filePath)
const workbook = XLSX.read(buffer, {
  type: 'buffer',
  cellDates: true,
  cellNF: false,
  cellText: false,
  cellStyles: false,
})

// Remove abas não usadas antes do postMessage (clone menor/mais rápido).
if (Array.isArray(sheets) && sheets.length) {
  const keep = new Set(sheets.map(foldName))
  for (const name of [...workbook.SheetNames]) {
    if (!keep.has(foldName(name))) {
      delete workbook.Sheets[name]
    }
  }
  workbook.SheetNames = workbook.SheetNames.filter((name) =>
    keep.has(foldName(name)),
  )
}

parentPort.postMessage(workbook)
