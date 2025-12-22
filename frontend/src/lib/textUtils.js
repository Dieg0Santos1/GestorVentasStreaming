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
    .filter(word => word.length > 0)
    .map(word => capitalize(word))
    .join(' ')
}
