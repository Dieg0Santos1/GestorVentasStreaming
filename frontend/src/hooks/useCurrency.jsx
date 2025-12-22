import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { DEFAULT_CURRENCY, getStoredCurrency, setStoredCurrency } from '../lib/money'

export function useCurrency() {
  const { user } = useAuth()
  const [currency, setCurrency] = useState(getStoredCurrency())

  useEffect(() => {
    if (!user?.id) return

    let cancelled = false

    async function fetchCurrency() {
      // Intentamos leer moneda desde configuraciones_usuario.
      // Si la columna no existe aún, mantenemos el valor por defecto/localStorage.
      const { data, error } = await supabase
        .from('configuraciones_usuario')
        .select('moneda')
        .eq('user_id', user.id)
        .maybeSingle()

      if (cancelled) return

      if (error) {
        // Si la columna no existe, Supabase devuelve error; no bloqueamos la app.
        setCurrency(getStoredCurrency())
        return
      }

      const newCurrency = data?.moneda || getStoredCurrency() || DEFAULT_CURRENCY
      setCurrency(newCurrency)
      setStoredCurrency(newCurrency)
    }

    fetchCurrency()

    function handleConfigUpdated() {
      fetchCurrency()
    }

    window.addEventListener('config-updated', handleConfigUpdated)
    return () => {
      cancelled = true
      window.removeEventListener('config-updated', handleConfigUpdated)
    }
  }, [user?.id])

  return currency
}
