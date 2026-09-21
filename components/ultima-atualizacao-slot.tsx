import { getLatestCarga } from '@/data/dashboard'
import { formatDateTime } from '@/lib/format'

export async function UltimaAtualizacaoSlot() {
  const carga = await getLatestCarga()
  return (
    <div className="flex flex-col gap-0.5 px-2 py-2 group-data-[collapsible=icon]:hidden">
      <p className="text-[10px] tracking-wide text-sidebar-foreground/45 uppercase">
        Última atualização
      </p>
      <p className="truncate text-xs font-medium text-sidebar-foreground/80">
        {formatDateTime(carga?.lidaEm)}
      </p>
    </div>
  )
}
