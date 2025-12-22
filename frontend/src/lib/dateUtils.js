export function normalizeDateString(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 10)
  try {
    return new Date(value).toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

export function formatDateDisplay(value) {
  const raw = normalizeDateString(value)
  if (!raw) return '—'
  const [y, m, d] = raw.split('-')
  if (!y || !m || !d) return raw
  return `${d}/${m}/${y}`
}
