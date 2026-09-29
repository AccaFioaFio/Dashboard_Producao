import 'server-only'

import nodemailer from 'nodemailer'
import { formatDate, formatNumber } from '@/lib/format'

const DESTINOS = [
  'operacional4@fioafio.com.br',
  'operacional3@fioafio.com.br',
  'operacional5@fioafio.com.br',
  'jaqueline@fioafio.com.br',
]

export type AvisoCorteItem = {
  codProduto: string
  nomeProduto: string | null
  qtdReal: number | null
  dataInicio: string | null
  dataFinal: string
  responsavel: string | null
}

export type AvisoCorteFinalizado = {
  pedidoNorm: string
  cliente: string | null
  itens: AvisoCorteItem[]
}

function destinatarios() {
  const lista = (process.env.SMTP_CORTE_TO ?? '')
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean)
  return lista.length ? lista : DESTINOS
}

function transporte() {
  const user = (process.env.SMTP_USER ?? '').trim()
  const pass = (process.env.SMTP_PASS ?? '').replace(/\s+/g, '')
  if (!user && !pass) {
    throw new Error('SMTP_USER e SMTP_PASS ausentes neste deploy.')
  }
  if (!user) throw new Error('SMTP_USER ausente neste deploy.')
  if (!pass) throw new Error('SMTP_PASS ausente neste deploy.')
  return {
    user,
    mail: nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass },
    }),
  }
}

function quantidade(value: number | null) {
  if (value == null) return 'não informada'
  return formatNumber(value, value % 1 ? 2 : 0)
}

function blocoItem(item: AvisoCorteItem, indice: number, total: number) {
  const produto = item.nomeProduto?.replace(/\s+/g, ' ').trim() || '—'
  const linhas = [
    `Produto: ${produto}`,
    `Código: ${item.codProduto}`,
    `Quantidade real: ${quantidade(item.qtdReal)}`,
    `Início: ${formatDate(item.dataInicio)}`,
    `Data final: ${formatDate(item.dataFinal)}`,
    `Responsável: ${item.responsavel?.trim() || '—'}`,
  ]
  if (total > 1) linhas.unshift(`Item ${indice + 1}`)
  return linhas
}

export async function enviarAvisoCorteFinalizado(aviso: AvisoCorteFinalizado) {
  if (!aviso.itens.length) {
    throw new Error('Nenhum item com corte finalizado para avisar.')
  }

  const smtp = transporte()
  const varios = aviso.itens.length > 1
  const linhas = [
    varios
      ? `O corte de ${aviso.itens.length} itens foi finalizado. A costura pode seguir.`
      : 'O corte deste item foi finalizado. A costura pode seguir.',
    '',
    `Pedido: ${aviso.pedidoNorm}`,
    `Cliente: ${aviso.cliente?.trim() || '—'}`,
    '',
    ...aviso.itens.flatMap((item, indice) => [
      ...blocoItem(item, indice, aviso.itens.length),
      '',
    ]),
  ]

  await smtp.mail.sendMail({
    from: `"Corte Produção" <${smtp.user}>`,
    to: destinatarios(),
    subject: `Corte finalizado — pedido ${aviso.pedidoNorm}`,
    text: linhas.join('\n').trimEnd(),
  })
}
