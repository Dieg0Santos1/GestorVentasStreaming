export const DEFAULT_CURRENCY = 'USD'
export const CURRENCY_STORAGE_KEY = 'gestorventas.currency'

export const CURRENCIES = [
  { code: 'USD', label: 'USD - Dólar (US$)' },
  { code: 'EUR', label: 'EUR - Euro (€)' },
  { code: 'MXN', label: 'MXN - Peso Mexicano' },
  { code: 'COP', label: 'COP - Peso Colombiano' },
  { code: 'PEN', label: 'PEN - Sol (S/)' },
]

export function getStoredCurrency() {
  if (typeof window === 'undefined') return DEFAULT_CURRENCY
  const v = window.localStorage.getItem(CURRENCY_STORAGE_KEY)
  return v || DEFAULT_CURRENCY
}

export function setStoredCurrency(currency) {
  if (typeof window === 'undefined') return
  if (!currency) return
  window.localStorage.setItem(CURRENCY_STORAGE_KEY, currency)
}

export function formatMoney(amount, currency = DEFAULT_CURRENCY, options = {}) {
  const value = Number(amount) || 0
  const opts = {
    style: 'currency',
    currency,
    ...options,
  }

  try {
    return new Intl.NumberFormat('es-ES', opts).format(value)
  } catch {
    // Fallback si Intl no soporta la moneda por alguna razón
    return `${value.toFixed(2)} ${currency}`
  }
}
