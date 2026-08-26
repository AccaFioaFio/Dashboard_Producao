'use client'

import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { pedidoHref } from '@/lib/pedido'

export function PedidoSearch() {
  const router = useRouter()

  return (
    <form
      className="hidden min-w-0 sm:block"
      onSubmit={(event) => {
        event.preventDefault()
        const form = event.currentTarget
        const value = String(new FormData(form).get('pedido') ?? '').trim()
        if (!value) {
          router.push('/pedidos')
          return
        }
        router.push(pedidoHref(value))
      }}
    >
      <label className="relative block">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-header-foreground/55" />
        <Input
          name="pedido"
          placeholder="Nº pedido"
          className="h-8 w-36 border-white/15 bg-white/12 pl-7 text-header-foreground placeholder:text-header-foreground/50 md:w-44"
        />
      </label>
    </form>
  )
}
