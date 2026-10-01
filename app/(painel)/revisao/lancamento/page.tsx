import type { Metadata } from 'next'
import { ApontamentoTela } from '@/components/apontamento-tela'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Lançamento de revisão' }

export default function RevisaoLancamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  return <ApontamentoTela etapa="revisao" searchParams={searchParams} />
}
