import 'server-only'

import {
  montarTextoAvisoCorte,
  type AvisoCorteFinalizado,
} from '@/lib/mail/corte-finalizado'

function destinatarios() {
  return (process.env.WHATSAPP_CORTE_TO ?? '')
    .split(/[;,]/)
    .map((item) => item.replace(/\D/g, ''))
    .filter((item) => item.length >= 10)
}

function config() {
  const baseUrl = (process.env.WHATSAPP_EVOLUTION_URL ?? '').replace(/\/+$/, '')
  const instance = (process.env.WHATSAPP_EVOLUTION_INSTANCE ?? '').trim()
  const apikey = (process.env.WHATSAPP_EVOLUTION_APIKEY ?? '').trim()
  if (!baseUrl) throw new Error('WHATSAPP_EVOLUTION_URL ausente neste deploy.')
  if (!instance) throw new Error('WHATSAPP_EVOLUTION_INSTANCE ausente neste deploy.')
  if (!apikey) throw new Error('WHATSAPP_EVOLUTION_APIKEY ausente neste deploy.')
  return { baseUrl, instance, apikey }
}

async function enviarTexto(numero: string, text: string) {
  const { baseUrl, instance, apikey } = config()
  const url = `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey,
    },
    body: JSON.stringify({
      number: numero,
      text,
      textMessage: { text },
    }),
  })
  if (!res.ok) {
    const corpo = await res.text().catch(() => '')
    throw new Error(
      `Evolution HTTP ${res.status}${corpo ? `: ${corpo.slice(0, 120)}` : ''}`,
    )
  }
}

export async function enviarAvisoCorteWhatsApp(aviso: AvisoCorteFinalizado) {
  const destinos = destinatarios()
  if (!destinos.length) {
    throw new Error(
      'WHATSAPP_CORTE_TO ausente ou inválido (use DDI+DDD+número, ex.: 5511999999999).',
    )
  }

  const text = montarTextoAvisoCorte(aviso)
  const falhas: string[] = []
  for (const numero of destinos) {
    try {
      await enviarTexto(numero, text)
    } catch (error) {
      const detalhe = error instanceof Error ? error.message : String(error)
      falhas.push(`${numero}: ${detalhe}`)
    }
  }
  if (falhas.length) {
    throw new Error(falhas.join('; '))
  }
}
