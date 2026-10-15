'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CircleHelp } from 'lucide-react'
import { AjudaSecaoView } from '@/components/ajuda-conteudo'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { findAjudaSecao } from '@/lib/ajuda'

export function AjudaTrigger() {
  const pathname = usePathname()
  const secao = findAjudaSecao(pathname)

  if (!secao) return null

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 print:hidden"
            aria-label={`Como funciona: ${secao.titulo}`}
          />
        }
      >
        <CircleHelp className="size-3.5" />
        <span className="hidden sm:inline">Como funciona</span>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border/70 pr-12">
          <SheetTitle>Como funciona · {secao.titulo}</SheetTitle>
          <SheetDescription>
            Escopo, fontes, KPIs e limites desta tela.
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <AjudaSecaoView secao={secao} compact />
          <p className="text-xs text-muted-foreground">
            Manual completo na{' '}
            <Link
              href={`/ajuda#${secao.id}`}
              className="font-medium text-primary hover:underline"
            >
              aba Ajuda
            </Link>
            .
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
