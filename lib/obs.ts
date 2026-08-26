export function clipObs(value: string | null | undefined, max = 280) {
  if (!value) return null
  const text = value.replace(/\s+/g, ' ').trim()
  if (!text) return null
  return text.length > max ? `${text.slice(0, max - 3)}...` : text
}

export function hintLines(
  lines: (string | null | undefined | false)[],
  observacao?: string | null,
) {
  const out = lines.filter((line): line is string => Boolean(line && String(line).trim()))
  const obs = clipObs(observacao)
  if (obs) out.push(`Obs.: ${obs}`)
  return out.join('\n')
}
