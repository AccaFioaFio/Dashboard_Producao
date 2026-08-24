import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { SimpleTable } from '@/components/simple-table'
import { RefreshForm } from '@/components/refresh-form'
import { getQualidade } from '@/data/dashboard'
import { formatInt } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Qualidade' }

const TIPO_LABEL: Record<string, string> = {
  revisao_total: 'Total da Revisão (sem pedido)',
  revisao_qtd_eq_pedido: 'Qtd = número do pedido',
  dias_corte_serial: 'DIAS DE CORTE serial',
  status_duplo: 'Status duplo no Corte',
  oficina_vazia: 'Linha 2026 sem oficina',
  lilica: 'Lilica sem retorno/pendente',
  orfao_costura: 'Costura Produção sem Corte 2026',
  orfao_revisao: 'Revisão 2026 sem Corte 2026',
  orfao_oficina: 'Oficina 2026 sem Corte 2026',
}

export default async function QualidadePage() {
  const qualidade = await getQualidade()

  return (
    <PageShell
      title="Qualidade"
      description="Órfãos de 2026, limpeza da Revisão, serial de DIAS DE CORTE, status duplo e oficina vazia."
      actions={<RefreshForm />}
    >
      <SimpleTable
        columns={[
          { key: 'tipo', label: 'Evento' },
          { key: 'count', label: 'Ocorrências', numeric: true },
          { key: 'valor', label: 'Valor associado', numeric: true },
        ]}
        rows={qualidade.resumo.map((row) => ({
          tipo: TIPO_LABEL[row.tipo] ?? row.tipo,
          count: formatInt(row.count),
          valor: formatInt(row.valor),
        }))}
        empty="Nenhum evento de qualidade. Rode Atualizar dados."
      />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Amostra (até 200)</h2>
        <SimpleTable
          columns={[
            { key: 'tipo', label: 'Tipo' },
            { key: 'pedido', label: 'Pedido' },
            { key: 'detalhe', label: 'Detalhe' },
            { key: 'linha', label: 'Linha Excel', numeric: true },
            { key: 'valor', label: 'Valor', numeric: true },
          ]}
          rows={qualidade.eventos.map((row) => ({
            tipo: TIPO_LABEL[row.tipo] ?? row.tipo,
            pedido: row.pedidoNorm,
            detalhe: row.detalhe,
            linha: row.excelRow,
            valor: row.valor == null ? '—' : formatInt(row.valor),
          }))}
        />
      </section>
    </PageShell>
  )
}
