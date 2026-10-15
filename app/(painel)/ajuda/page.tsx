import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import { AjudaSecaoView } from '@/components/ajuda-conteudo'
import { ajudaGeral, ajudaSecoes } from '@/lib/ajuda'

export const metadata: Metadata = { title: 'Ajuda' }

export default function AjudaPage() {
  return (
    <PageShell
      title="Ajuda"
      description="Escopo, fontes, KPIs e o que dá / não dá fazer em cada aba. Na própria tela, use o botão Como funciona."
      help={false}
    >
      <section className="card-surface flex flex-col gap-3 rounded-lg border border-border/70 p-4">
        <h2 className="text-base font-semibold tracking-tight">
          {ajudaGeral.titulo}
        </h2>
        <p className="max-w-3xl text-sm leading-snug text-muted-foreground">
          {ajudaGeral.resumo}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Regras gerais
            </h3>
            <ul className="list-disc space-y-1 pl-4 text-sm leading-snug">
              {ajudaGeral.regras.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Planilhas de origem
            </h3>
            <ul className="list-disc space-y-1 pl-4 text-sm leading-snug">
              {ajudaGeral.fontes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <nav
        aria-label="Índice das abas"
        className="flex flex-wrap gap-2 print:hidden"
      >
        {ajudaSecoes.map((secao) => (
          <a
            key={secao.id}
            href={`#${secao.id}`}
            className="rounded-md border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-foreground/90 hover:border-primary/40 hover:text-primary"
          >
            {secao.titulo}
          </a>
        ))}
      </nav>

      <div className="flex flex-col gap-4">
        {ajudaSecoes.map((secao) => (
          <AjudaSecaoView key={secao.id} secao={secao} showLink />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Em qualquer aba, o botão{' '}
        <span className="font-medium text-foreground">Como funciona</span> abre
        só o trecho daquela tela. Voltar à{' '}
        <Link href="/" className="font-medium text-primary hover:underline">
          Visão Geral
        </Link>
        .
      </p>
    </PageShell>
  )
}
