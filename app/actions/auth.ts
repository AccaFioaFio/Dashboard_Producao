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
  } catch (error) {
    console.error('Falha ao gravar a sessão de login.', error)
    return { error: 'Não foi possível abrir a sessão. Recarregue a página e tente de novo.' }
  }
  redirect(homePathFor(user))
}

export async function logout() {
  await clearSession()
  redirect('/login')
}
