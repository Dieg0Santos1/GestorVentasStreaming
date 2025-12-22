import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { CURRENCIES, DEFAULT_CURRENCY, getStoredCurrency, setStoredCurrency } from '../lib/money'

export function Configuracion() {
  const { user } = useAuth()
  const [nombreNegocio, setNombreNegocio] = useState('')
  const [emailRemitente, setEmailRemitente] = useState('')
  const [whatsappRemitente, setWhatsappRemitente] = useState('')
  const [moneda, setMoneda] = useState(getStoredCurrency() || DEFAULT_CURRENCY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    if (!user) return

    async function fetchConfig() {
      setLoading(true)
      setError(null)

      // Intentamos incluir "moneda". Si la columna aún no existe, hacemos fallback.
      let query = supabase
        .from('configuraciones_usuario')
        .select('id, nombre_negocio, email_remitente, whatsapp_remitente, moneda')
        .eq('user_id', user.id)
        .maybeSingle()

      let { data, error } = await query

      if (error && (error.message || '').toLowerCase().includes('moneda')) {
        ;({ data, error } = await supabase
          .from('configuraciones_usuario')
          .select('id, nombre_negocio, email_remitente, whatsapp_remitente')
          .eq('user_id', user.id)
          .maybeSingle())
      }

      if (error && error.code !== 'PGRST116') {
        setError(error.message)
      } else if (data) {
        setNombreNegocio(data.nombre_negocio || '')
        setEmailRemitente(data.email_remitente || '')
        setWhatsappRemitente(data.whatsapp_remitente || '')
        if (data.moneda) {
          setMoneda(data.moneda)
          setStoredCurrency(data.moneda)
        }
      }

      setLoading(false)
    }

    fetchConfig()
  }, [user])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!user) {
      setError('No hay usuario autenticado')
      return
    }

    setSaving(true)

    const { error } = await supabase.from('configuraciones_usuario').upsert(
      {
        user_id: user.id,
        nombre_negocio: nombreNegocio.trim() || null,
        email_remitente: emailRemitente.trim() || null,
        whatsapp_remitente: whatsappRemitente.trim() || null,
        moneda: moneda || DEFAULT_CURRENCY,
      },
      { onConflict: 'user_id' },
    )

    setSaving(false)

    if (error) {
      if ((error.message || '').toLowerCase().includes('moneda')) {
        setError(
          'Tu base de datos aún no tiene la columna "moneda". Ejecuta el archivo migracion_moneda_configuracion.sql en Supabase y vuelve a guardar.'
        )
      } else {
        setError(error.message)
      }
      return
    }

    setStoredCurrency(moneda || DEFAULT_CURRENCY)

    setSuccess('Configuración guardada correctamente')
    // Notificar al resto de la app (TopBar + moneda)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('config-updated'))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-2 text-slate-500">
          <div className="h-6 w-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          <span className="text-sm">Cargando configuración...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-6 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-blue-600 to-emerald-500 flex items-center justify-center text-white font-bold text-xl shadow-md">
            ⚙️
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-semibold text-slate-900 tracking-tight">
              Configuración de notificaciones
            </h2>
            <p className="text-xs md:text-sm text-slate-500">
              Define desde qué correo y número se enviarán los mensajes a tus clientes.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">
                Nombre del negocio
              </label>
              <input
                type="text"
                placeholder="Ej. Ventas Pro Store"
                value={nombreNegocio}
                onChange={(e) => setNombreNegocio(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">
                Correo remitente (desde donde se envían los emails)
              </label>
              <input
                type="email"
                placeholder="notificaciones@tudominio.com"
                value={emailRemitente}
                onChange={(e) => setEmailRemitente(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-[11px] text-slate-400">
              </p>
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium text-slate-700">
                Número de WhatsApp remitente
              </label>
              <input
                type="text"
                placeholder="Ej. 51999999999"
                value={whatsappRemitente}
                onChange={(e) => setWhatsappRemitente(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-[11px] text-slate-400">
              </p>
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium text-slate-700">Moneda del sistema</label>
              <select
                value={moneda}
                onChange={(e) => setMoneda(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">
                Se usará para mostrar precios y ganancias en todo el sistema.
              </p>
            </div>
          </div>

          {error && <p className="text-sm text-rose-500">{error}</p>}
          {success && <p className="text-sm text-emerald-600">{success}</p>}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
