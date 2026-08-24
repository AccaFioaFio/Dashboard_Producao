import {
  ClipboardCheck,
  Factory,
  LayoutDashboard,
  Scissors,
  Settings,
  ShieldCheck,
  Shirt,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type NavItem = {
  title: string
  href: string
  icon: LucideIcon
  description: string
}

export const navigation: NavItem[] = [
  {
    title: 'Visão Geral',
    href: '/',
    icon: LayoutDashboard,
    description: 'KPIs 2026, funil de pedido e alertas de WIP.',
  },
  {
    title: 'Corte',
    href: '/corte',
    icon: Scissors,
    description: 'Peças, tecido, consumo, economia e pedidos parados.',
  },
  {
    title: 'Costuras',
    href: '/costuras',
    icon: Shirt,
    description: 'Origem, mix Produção/serviço e lançamentos do dia.',
  },
  {
    title: 'Revisão',
    href: '/revisao',
    icon: ClipboardCheck,
    description: 'Peças revisadas, responsável e lançamentos do dia.',
  },
  {
    title: 'Oficinas',
    href: '/oficinas',
    icon: Factory,
    description: 'Pendentes, SLA, Lilica e lotes sem retorno.',
  },
  {
    title: 'Qualidade',
    href: '/qualidade',
    icon: ShieldCheck,
    description: 'Órfãos, totais, serial de Corte e cadastro quebrado.',
  },
  {
    title: 'Configurações',
    href: '/configuracoes',
    icon: Settings,
    description: 'Caminhos OneDrive, última carga e atualizar dados.',
  },
]

export function findNavItem(href: string): NavItem | undefined {
  return navigation.find((item) => item.href === href)
}
