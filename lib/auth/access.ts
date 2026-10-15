import type { SessionUser } from '@/lib/auth/types'

export const ALL_ACCESS = '*'

const PREFIXES = [
  '/corte/acao-comercial',
  '/corte',
  '/costuras',
  '/revisao',
  '/oficinas',
  '/qualidade',
  '/tecidos',
  '/top-clientes',
  '/vendas',
  '/pedidos',
  '/programacao',
  '/inconsistencias',
  '/configuracoes',
]

export function normalizeLogin(login: string) {
  return login.trim().toLocaleLowerCase('pt-BR')
}

export function homePath(acessos: string[]) {
  if (acessos.includes(ALL_ACCESS) || acessos.includes('/')) return '/'
  return acessos[0] ?? '/login'
}

export function areaForPath(pathname: string): string | null {
  if (pathname === '/apontamento' || pathname.startsWith('/apontamento/')) {
    return '/costuras'
  }
  if (pathname === '/') return '/'
  return (
    PREFIXES.filter(
      (href) => pathname === href || pathname.startsWith(`${href}/`),
    ).sort((a, b) => b.length - a.length)[0] ?? null
  )
}

export function canAccessPath(pathname: string, acessos: string[]) {
  if (acessos.includes(ALL_ACCESS)) return true
  // Ajuda é liberada para qualquer usuário logado.
  if (pathname === '/ajuda' || pathname.startsWith('/ajuda/')) return true
  const area = areaForPath(pathname)
  if (!area) return false
  if (acessos.includes(area)) return true
  return acessos.some((href) => href !== '/' && area.startsWith(`${href}/`))
}

export function canSeeNav(href: string, acessos: string[]) {
  if (href === '/ajuda') return true
  if (acessos.includes(ALL_ACCESS)) return true
  return acessos.includes(href)
}

export function canAtualizar(acessos: string[]) {
  return acessos.includes(ALL_ACCESS) || acessos.includes('/configuracoes')
}

export function canBuscarPedido(acessos: string[]) {
  return acessos.includes(ALL_ACCESS) || acessos.includes('/pedidos')
}

/** Só o login principal monta/exclui programação. */
export const LOGIN_PROGRAMACAO_EDITOR = 'geral@fioafio'

export function canEditarProgramacao(login: string) {
  return normalizeLogin(login) === LOGIN_PROGRAMACAO_EDITOR
}

export function homePathFor(user: Pick<SessionUser, 'acessos'>) {
  return homePath(user.acessos)
}
