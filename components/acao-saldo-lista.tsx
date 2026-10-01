'use client'

import { useMemo, useState } from 'react'
import { GroupedTable } from '@/components/grouped-table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AcaoOrigemRow, AcaoProdutoRow } from '@/data/dashboard'
import { formatInt } from '@/lib/format'

const ALL = '__all__'

/** Saldo do tecido antes e depois de cada linha. O depois não fica negativo. */
function saldosDaLinha(origens: AcaoOrigemRow[]) {
  let pool = 0
  return origens.map((origem) => {
    pool += origem.entrada - origem.saida
    return {
      depois: Math.max(0, pool),
      estourou: pool < 0,
    }
  })
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

function FilterSelect({
  label,
  value,
  items,
  onChange,
}: {
  label: string
  value: string
  items: string[]
  onChange: (value: string) => void
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <Select
        value={value}
        onValueChange={(next) => onChange(!next || next === ALL ? ALL : String(next))}
      >
        <SelectTrigger className="h-8 w-full min-w-0 bg-background/70">
          <SelectValue>
            {(selected) => (
              <span className="truncate">
                {selected == null || selected === ALL ? 'Todos' : String(selected)}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false} className="max-h-72">
          <SelectItem value={ALL}>Todos</SelectItem>
          {items.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}

export function AcaoSaldoLista({ produtos }: { produtos: AcaoProdutoRow[] }) {
  const [modelo, setModelo] = useState(ALL)
  const [descricao, setDescricao] = useState(ALL)

  const modelos = useMemo(
    () => uniqueSorted(produtos.flatMap((row) => row.origens.map((origem) => origem.modelo))),
    [produtos],
  )
  const descricoes = useMemo(
    () => uniqueSorted(produtos.map((row) => row.descricao)),
    [produtos],
  )

  const groups = useMemo(() => {
    const modeloAtivo = modelo !== ALL
    const descricaoAtiva = descricao !== ALL
    return produtos.flatMap((row) => {
      if (descricaoAtiva && row.descricao !== descricao) return []
      const origens = modeloAtivo
        ? row.origens.filter((origem) => origem.modelo === modelo)
        : row.origens
      if (modeloAtivo && origens.length === 0) return []
      const entrada = modeloAtivo
        ? origens.reduce((sum, origem) => sum + origem.entrada, 0)
        : row.entrada
      const saida = modeloAtivo
        ? origens.reduce((sum, origem) => sum + origem.saida, 0)
        : row.saida
      const saldo = entrada - saida
      const saldos = saldosDaLinha(origens)
      return [
        {
          id: `${row.codigo}||${row.descricao}`,
          alert: saldo < 0,
          cells: {
            codigo: row.codigo,
            descricao: row.descricao,
            entrada: formatInt(entrada),
            saida: formatInt(saida),
            saldo: formatInt(saldo),
          },
          children: origens.map((origem, index) => {
            const movimento = saldos[index]
            return {
              alert: movimento?.estourou ?? false,
              cells: {
                modelo: origem.modelo,
                origem: origem.origem,
                aproveitamento: origem.aproveitamento,
                cliente: origem.cliente,
                entrada: formatInt(origem.entrada),
                saida: formatInt(origem.saida),
                saldo: formatInt(movimento?.depois ?? 0),
              },
            }
          }),
        },
      ]
    })
  }, [produtos, modelo, descricao])

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <FilterSelect label="Modelo" value={modelo} items={modelos} onChange={setModelo} />
        <FilterSelect
          label="Descrição"
          value={descricao}
          items={descricoes}
          onChange={setDescricao}
        />
      </div>
      <GroupedTable
        columns={[
          { key: 'codigo', label: 'Código' },
          { key: 'descricao', label: 'Descrição', wrap: true },
          { key: 'entrada', label: 'Cortadas', numeric: true },
          { key: 'saida', label: 'Aproveitadas', numeric: true },
          { key: 'saldo', label: 'Saldo', numeric: true },
        ]}
        childColumns={[
          { key: 'modelo', label: 'Modelo', wrap: true },
          { key: 'origem', label: 'Origem', link: true },
          { key: 'aproveitamento', label: 'Aproveitamento', link: true },
          { key: 'cliente', label: 'Cliente', wrap: true },
          { key: 'entrada', label: 'Cortadas', numeric: true },
          { key: 'saida', label: 'Aproveitadas', numeric: true },
          { key: 'saldo', label: 'Saldo', numeric: true },
        ]}
        groups={groups}
        empty="Nenhum produto com movimento"
        childEmpty="Nenhuma origem neste produto"
      />
    </div>
  )
}
