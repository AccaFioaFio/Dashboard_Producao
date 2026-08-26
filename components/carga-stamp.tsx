import { getLatestCarga } from '@/data/dashboard'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

function isStale(lidaEm: string | null | undefined) {
  if (!lidaEm) return false
  const then = new Date(lidaEm).getTime()
  if (Number.isNaN(then)) return false
  const now = Date.now()
  const day = new Date().getDay()
  if (day === 0 || day === 6) return false
  return now - then > 30 * 60 * 1000
}

export async function CargaStamp() {
  const carga = await getLatestCarga()
  const stale = isStale(carga?.lidaEm)
  return (
    <span
      className={cn(
        'hidden max-w-[12rem] truncate text-[11px] lg:inline',
        stale ? 'font-medium text-amber-200' : 'text-header-foreground/75',
      )}
      title={stale ? 'Carga com mais de 30 min em dia útil' : 'Horário da última carga boa'}
    >
      {stale ? 'Atrasada · ' : ''}
      {formatDateTime(carga?.lidaEm)}
    </span>
  )
}
