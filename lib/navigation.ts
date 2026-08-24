import {
  ClipboardCheck,
  Factory,
  LayoutDashboard,
  Scissors,
  Settings,
  ShieldCheck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type NavItem = {
  title: string
  href: string
  icon: LucideIcon
  description: string
}

export type NavSection = {
  label: string
  items: NavItem[]
}

export const navigation: NavSection[] = [
  {
    label: 'Operação',
    items: [
      {
        title: 'Visão geral',
        href: '/',
        icon: LayoutDashboard,
        description: 'KPIs 2026, funil de pedido e alertas de WIP.',
      },
      {
        title: 'Corte',
        href: '/corte',
        icon: Scissors,
        description: 'Peças, canal, responsável e pedidos parados.',
      },
      {
        title: 'Apontamento',
        href: '/apontamento',
        icon: ClipboardCheck,
        description: 'Costura e revisão do dia, com Origem obrigatória.',
      },
      {
        title: 'Oficinas',
        href: '/oficinas',
        icon: Factory,
        description: 'Pendentes, SLA, Lilica e lotes sem retorno.',
      },
    ],
  },
  {
    label: 'Controle',
    items: [
      {
        title: 'Qualidade',
        href: '/qualidade',
        icon: ShieldCheck,
        description: 'Órfãos, totais, serial de corte e cadastro quebrado.',
      },
    ],
  },
  {
    label: 'Sistema',
    items: [
      {
        title: 'Configurações',
        href: '/configuracoes',
        icon: Settings,
        description: 'Caminhos OneDrive, última carga e atualizar dados.',
      },
    ],
  },
]

export const allNavItems: NavItem[] = navigation.flatMap((section) => section.items)

export function findNavItem(href: string): NavItem | undefined {
  return allNavItems.find((item) => item.href === href)
}
