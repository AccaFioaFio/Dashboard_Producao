import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { canAccessPath, canAtualizar, homePath } from '@/lib/auth/access'
import { openSession, SESSION_COOKIE } from '@/lib/auth/token'

function continueWithPath(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.set('x-pathname', request.nextUrl.pathname)
  return NextResponse.next({ request: { headers } })
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const session = await openSession(request.cookies.get(SESSION_COOKIE)?.value)

  if (pathname === '/login') {
    if (session) {
      return NextResponse.redirect(new URL(homePath(session.acessos), request.url))
    }
    return NextResponse.next()
  }

  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (pathname === '/api/atualizar-dados') {
    if (!canAtualizar(session.acessos)) {
      return NextResponse.json({ ok: false, error: 'Sem permissão.' }, { status: 403 })
    }
    return continueWithPath(request)
  }

  if (pathname.startsWith('/api/')) {
    return continueWithPath(request)
  }

  if (!canAccessPath(pathname, session.acessos)) {
    return NextResponse.redirect(new URL(homePath(session.acessos), request.url))
  }

  return continueWithPath(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
