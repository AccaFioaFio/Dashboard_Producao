import Link from 'next/link'
import { FileQuestion } from 'lucide-react'
import { PageShell } from '@/components/page-shell'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <PageShell
      title="Página não encontrada"
      description="O endereço acessado não existe neste painel."
    >
      <Empty className="flex-1 rounded-lg border border-dashed border-border bg-card/40">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileQuestion />
          </EmptyMedia>
          <EmptyTitle>Erro 404</EmptyTitle>
          <EmptyDescription className="max-w-md text-pretty">
            Verifique o endereço ou use a navegação lateral para voltar a uma
            área do painel.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" render={<Link href="/" />}>
            Ir para a visão geral
          </Button>
        </EmptyContent>
      </Empty>
    </PageShell>
  )
}
