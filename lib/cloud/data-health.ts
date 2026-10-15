/**
 * Aviso transitório da última tentativa de restaurar/sincronizar dados da nuvem.
 * Só é preenchido em falha; o caminho feliz deixa null e a UI não muda.
 */
let warning: string | null = null

export function setDataHealthWarning(message: string) {
  warning = message
}

export function clearDataHealthWarning() {
  warning = null
}

export function getDataHealthWarning(): string | null {
  return warning
}
