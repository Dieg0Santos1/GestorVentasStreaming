/**
 * Capitaliza un texto: primera letra en mayúscula, resto en minúsculas
 * @param {string} text - Texto a capitalizar
 * @returns {string} Texto capitalizado
 */
export function capitalize(text) {
  if (!text || typeof text !== 'string') return text
  const trimmed = text.trim()
  if (trimmed.length === 0) return trimmed
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
}

/**
 * Capitaliza cada palabra en un texto
 * @param {string} text - Texto a capitalizar
 * @returns {string} Texto con cada palabra capitalizada
 */
export function capitalizeWords(text) {
  if (!text || typeof text !== 'string') return text
  return text
    .trim()
    .split(' ')
    .filter((word) => word.length > 0)
    .map((word) => capitalize(word))
    .join(' ')
}

/**
 * Intenta inferir un service_key estándar (netflix, max, disney, prime, spotify, youtube, etc.)
 * a partir del nombre libre del servicio.
 */
export function inferServiceKeyFromName(name) {
  const n = String(name || '').toLowerCase()

  if (!n) return null
  if (n.includes('netflix')) return 'netflix'
  if (n.includes('disney')) return 'disney'
  if (n.includes('max')) return 'max'
  if (n.includes('prime')) return 'prime'
  if (n.includes('spotify')) return 'spotify'
  if (n.includes('youtube') || n.includes('you tube') || n.includes('yt ')) return 'youtube'
  if (n.includes('vix')) return 'vix'
  if (n.includes('paramount')) return 'paramount'
  if (n.includes('crunchy')) return 'crunchyroll'

  return null
}
