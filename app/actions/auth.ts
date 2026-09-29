'use server'

import { redirect } from 'next/navigation'
import { homePathFor } from '@/lib/auth/access'
import { clearSession, writeSession } from '@/lib/auth/cookie'
import { authenticate } from '@/lib/auth/users'

export type LoginState = { error: string }

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const loginName = String(formData.get('login') ?? '')
  const senha = String(formData.get('senha') ?? '')
  const user = authenticate(loginName, senha)
  if (!user) {
    return { error: 'Login ou senha incorretos.' }
  }
  try {
    await writeSession(user)
  } catch {
    return { error: 'Não foi possível abrir a sessão. Confira o SESSION_SECRET.' }
  }
  redirect(homePathFor(user))
}

export async function logout() {
  await clearSession()
  redirect('/login')
}
