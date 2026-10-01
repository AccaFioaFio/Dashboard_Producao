import type { Metadata } from 'next'
import { ApontamentoTela } from '@/components/apontamento-tela'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Costura Produção' }

export default function CosturaProducaoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  return <ApontamentoTela etapa="costura" searchParams={searchParams} />
}
