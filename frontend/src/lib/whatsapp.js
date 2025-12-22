function extractDigits(raw) {
  return String(raw || '').replace(/\D/g, '')
}

export function normalizePhone(phone) {
  if (!phone) return ''

  const raw = String(phone).trim()

  // Soportar formatos comunes:
  // - +51999999999
  // - 0051999999999
  // - 51999999999
  if (raw.startsWith('+')) {
    return extractDigits(raw)
  }

  if (raw.startsWith('00')) {
    return extractDigits(raw.slice(2))
  }

  return extractDigits(raw)
}

export function validateWhatsAppPhone(phone) {
  const raw = String(phone || '').trim()
  const number = normalizePhone(raw)

  if (!number) {
    return { ok: false, message: 'El cliente no tiene teléfono.' }
  }

  // E.164: máximo 15 dígitos.
  // El mínimo real varía, pero para WhatsApp normalmente no será muy corto.
  if (number.length < 8 || number.length > 15) {
    return {
      ok: false,
      message:
        'El teléfono no parece válido. Usa formato internacional. Ej: +51999999999 (incluye código de país).',
    }
  }

  // Para soportar cualquier país sin adivinar, exigimos que venga con código de país.
  // Heurística:
  // - si viene con + o 00, OK
  // - si es solo números, asumimos que incluye código de país cuando tiene más de 10 dígitos
  const hasExplicitPrefix = raw.startsWith('+') || raw.startsWith('00')
  const looksInternational = hasExplicitPrefix || number.length > 10

  if (!looksInternational) {
    return {
      ok: false,
      message:
        'El teléfono debe incluir código de país. Ej: +5491112345678, +34600111222, +51999999999.',
    }
  }

  return { ok: true, message: null }
}

export function buildWhatsAppUrl(phone, text) {
  const v = validateWhatsAppPhone(phone)
  if (!v.ok) return null

  const number = normalizePhone(phone)
  const encoded = encodeURIComponent(text || '')
  return `https://wa.me/${number}?text=${encoded}`
}

export function openWhatsApp(phone, text) {
  if (typeof window === 'undefined') return false
  const url = buildWhatsAppUrl(phone, text)
  if (!url) return false
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}
