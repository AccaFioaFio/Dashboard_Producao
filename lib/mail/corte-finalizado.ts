import 'server-only'

import nodemailer from 'nodemailer'
import { connection } from 'next/server'
import { formatDate, formatNumber } from '@/lib/format'

const DESTINOS = [
  'operacional4@fioafio.com.br',
  'operacional3@fioafio.com.br',
  'operacional5@fioafio.com.br',
  'jaqueline@fioafio.com.br',
]

export type AvisoCorteFinalizado = {
  pedidoNorm: string
  codProduto: string
  nomeProduto: string | null
  cliente: string | null
  qtdReal: number | null
  dataInicio: string | null
  dataFinal: string
  responsavel: string | null
}

function envValue(name: string) {
  const value = process.env[name]
  return typeof value === 'string' ? value : ''
}

function destinatarios() {
  const lista = envValue('SMTP_CORTE_TO')
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean)
  return lista.length ? lista : DESTINOS
}

async function transporte() {
  await connection()
  const user = envValue('SMTP_USER').trim()
  const pass = envValue('SMTP_PASS').replace(/\s+/g, '')
  if (!user || !pass) return null
  return {
    user,
    mail: nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user, pass },
    }),
  }
}

function quantidade(value: number | null) {
  if (value == null) return 'não informada'
  return formatNumber(value, value % 1 ? 2 : 0)
}

export async function enviarAvisoCorteFinalizado(aviso: AvisoCorteFinalizado) {
  const smtp = await transporte()
  if (!smtp) {
    throw new Error('SMTP sem usuário ou senha de app.')
  }

  const produto = aviso.nomeProduto?.replace(/\s+/g, ' ').trim() || '—'
  const linhas = [
    'O corte deste item foi finalizado. A costura pode seguir.',
    '',
    `Pedido: ${aviso.pedidoNorm}`,
    `Cliente: ${aviso.cliente?.trim() || '—'}`,
    `Produto: ${produto}`,
    `Código: ${aviso.codProduto}`,
    `Quantidade real: ${quantidade(aviso.qtdReal)}`,
    `Início: ${formatDate(aviso.dataInicio)}`,
    `Data final: ${formatDate(aviso.dataFinal)}`,
    `Responsável: ${aviso.responsavel?.trim() || '—'}`,
  ]

  await smtp.mail.sendMail({
    from: `"Corte Produção" <${smtp.user}>`,
    to: destinatarios(),
    subject: `Corte finalizado — pedido ${aviso.pedidoNorm}`,
    text: linhas.join('\n'),
  })
}
