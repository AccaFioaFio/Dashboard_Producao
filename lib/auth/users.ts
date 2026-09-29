import 'server-only'
import { getSqlite } from '@/db'
import { normalizeLogin } from '@/lib/auth/access'
import { verifyPassword } from '@/lib/auth/password'
import type { SessionUser } from '@/lib/auth/types'

const DUMMY_HASH =
  'scrypt:00112233445566778899aabbccddeeff:00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

type UsuarioRow = {
  id: number
  login: string
  senha_hash: string
  acessos: string
}

export function authenticate(login: string, senha: string): SessionUser | null {
  const loginNorm = normalizeLogin(login)
  if (!loginNorm || !senha) {
    verifyPassword(senha || ' ', DUMMY_HASH)
    return null
  }

  const row = getSqlite()
    .prepare(
      'SELECT id, login, senha_hash, acessos FROM usuario WHERE login_norm = ?',
    )
    .get(loginNorm) as UsuarioRow | undefined

  if (!row || !verifyPassword(senha, row.senha_hash)) {
    if (!row) verifyPassword(senha, DUMMY_HASH)
    return null
  }

  let acessos: string[]
  try {
    const parsed = JSON.parse(row.acessos) as unknown
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
      return null
    }
    acessos = parsed
  } catch {
    return null
  }

  return { id: row.id, login: row.login, acessos }
}
