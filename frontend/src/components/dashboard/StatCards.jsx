import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { useCurrency } from '../../hooks/useCurrency'
import { formatMoney } from '../../lib/money'

export function StatCards() {
  const { user } = useAuth()
  const currency = useCurrency()
  // Usamos el ID del usuario logueado; si no hay sesión (p.ej. build estático de vista pública),
  // caemos al OWNER_ID configurado.
  const TENANT_ID = user?.id || import.meta.env.VITE_OWNER_ID

  const [gananciaMes, setGananciaMes] = useState(0)
  const [totalClientes, setTotalClientes] = useState(0)
  const [totalCuentas, setTotalCuentas] = useState(0)
  const [totalProveedores, setTotalProveedores] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [serviciosCuentas, setServiciosCuentas] = useState([])
  const [selectedServicioId, setSelectedServicioId] = useState('all')
  const [periodoGanancia, setPeriodoGanancia] = useState('mes') // 'hoy' | 'semana' | 'mes' | 'año'

  const periodoLabel = useMemo(() => {
    const now = new Date()
    switch (periodoGanancia) {
      case 'hoy':
        return now.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
      case 'semana':
        const inicioSemana = new Date(now)
        inicioSemana.setDate(now.getDate() - now.getDay() + 1) // Lunes
        const finSemana = new Date(inicioSemana)
        finSemana.setDate(inicioSemana.getDate() + 6) // Domingo
        return `${inicioSemana.getDate()}/${inicioSemana.getMonth() + 1} - ${finSemana.getDate()}/${finSemana.getMonth() + 1}`
      case 'mes':
        return now.toLocaleDateString('es-ES', { month: 'long' })
      case 'año':
        return now.getFullYear().toString()
      default:
        return ''
    }
  }, [periodoGanancia])

  useEffect(() => {
    if (!TENANT_ID) return

    let cancelled = false

    const fetchStats = async () => {
      setLoading(true)
      setError(null)

      const now = new Date()
      let start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      let end

      switch (periodoGanancia) {
        case 'hoy':
          end = new Date(start)
          end.setDate(start.getDate() + 1)
          break
        case 'semana': {
          const dayOfWeek = now.getDay()
          const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek // lunes como inicio
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff)
          end = new Date(start)
          end.setDate(start.getDate() + 7)
          break
        }
        case 'mes':
          start = new Date(now.getFullYear(), now.getMonth(), 1)
          end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
          break
        case 'año':
          start = new Date(now.getFullYear(), 0, 1)
          end = new Date(now.getFullYear() + 1, 0, 1)
          break
        default:
          start = new Date(now.getFullYear(), now.getMonth(), 1)
          end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      }

      const startIso = start.toISOString()
      const endIso = end.toISOString()

      const [ventasRes, pagosRes, gastosRes, clientesRes, cuentasRes, proveedoresRes] = await Promise.all([
        supabase
          .from('ventas')
          .select('id, monto, fecha_venta')
          .eq('user_id', TENANT_ID)
          .gte('fecha_venta', startIso)
          .lt('fecha_venta', endIso),
        supabase
          .from('pagos_ventas')
          .select('user_id, venta_id, monto, fecha_pago, tipo')
          .eq('user_id', TENANT_ID),
        supabase
          .from('gastos_cuentas')
          .select('monto, fecha_gasto')
          .eq('user_id', TENANT_ID)
          .gte('fecha_gasto', startIso)
          .lt('fecha_gasto', endIso),
        supabase
          .from('clientes')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', TENANT_ID),
        supabase
          .from('cuentas_servicios')
          .select('id, servicio_id, precio_compra, fecha_inicio, servicios (id, nombre)')
          .eq('user_id', TENANT_ID),
        supabase
          .from('proveedores')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', TENANT_ID),
      ])

      const normalizeToDate = (fecha) => {
        if (!fecha) return null
        if (fecha instanceof Date) {
          const d = new Date(fecha)
          d.setHours(12, 0, 0, 0)
          return d
        }
        if (typeof fecha === 'string') {
          let f = fecha.trim()
          if (!f.includes('T') && f.includes(' ')) f = f.replace(' ', 'T')
          // Normalizar zona horaria: +00 -> Z, +0000 -> +00:00, +05 -> +05:00
          f = f.replace(/\+00(?=$)/, 'Z')
          f = f.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
          f = f.replace(/([+-]\d{2})$/, '$1:00')
          let d = new Date(f)
          if (Number.isNaN(d.getTime())) {
            d = new Date(f + 'Z') // último intento
          }
          if (Number.isNaN(d.getTime())) return null
          d.setHours(12, 0, 0, 0)
          return d
        }
        return null
      }

      const inPeriod = (fecha) => {
        const d = normalizeToDate(fecha)
        return d && d >= start && d < end
      }

      const pagosData = pagosRes?.data || []
      const pagosSet = new Set(pagosData.map((p) => p.venta_id).filter(Boolean))
      const ventasData = ventasRes?.data || []

      const ingresosPeriodo =
        pagosData
          .filter((p) => inPeriod(p.fecha_pago))
          .reduce((acc, p) => acc + (Number(p.monto) || 0), 0) +
        ventasData
          .filter((v) => !pagosSet.has(v.id) && inPeriod(v.fecha_venta))
          .reduce((acc, v) => acc + (Number(v.monto) || 0), 0)

      // Mostrar ingreso bruto del periodo (sumar columna monto)
      setGananciaMes(ingresosPeriodo)

      if (clientesRes.error) {
        setError((prev) => prev || clientesRes.error.message)
      } else {
        setTotalClientes(clientesRes.count || 0)
      }

      if (cuentasRes.error) {
        setError((prev) => prev || cuentasRes.error.message)
      } else {
        const cuentas = cuentasRes.data || []
        setTotalCuentas(cuentas.length)

        const map = new Map()
        for (const c of cuentas) {
          const servicioId = c.servicio_id
          const nombre = c.servicios?.nombre || 'Sin servicio'
          if (!map.has(servicioId)) {
            map.set(servicioId, { id: servicioId, nombre, total: 0 })
          }
          map.get(servicioId).total += 1
        }
        const arr = Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
        setServiciosCuentas(arr)
        if (arr.length > 0) {
          setSelectedServicioId(arr[0].id || 'all')
        }
      }

      if (proveedoresRes.error) {
        setError((prev) => prev || proveedoresRes.error.message)
      } else {
        setTotalProveedores(proveedoresRes.count || 0)
      }

      if (!cancelled) {
        setLoading(false)
      }
    }

    fetchStats()
    const onUpdate = () => fetchStats()
    window.addEventListener('pagos-updated', onUpdate)

    return () => {
      cancelled = true
      window.removeEventListener('pagos-updated', onUpdate)
    }
  }, [TENANT_ID, periodoGanancia])

  const gananciaMesFormatted = formatMoney(gananciaMes, currency, {
    maximumFractionDigits: 2,
  })

  const selectedServicio =
    selectedServicioId === 'all'
      ? null
      : serviciosCuentas.find((s) => s.id === selectedServicioId) || null

  const cards = [
    {
      label: `Ganancia Total (${periodoLabel})`,
      value: loading ? '—' : gananciaMesFormatted,
      color: 'bg-blue-600',
      icon: '💰',
      type: 'ganancia',
    },
    {
      label: 'Total Clientes',
      value: loading ? '—' : totalClientes.toString(),
      color: 'bg-emerald-500',
      icon: '👥',
      type: 'clientes',
    },
    {
      label: 'Cuentas',
      value: loading ? '—' : totalCuentas.toString(),
      color: 'bg-violet-500',
      icon: '🔐',
      type: 'cuentas',
    },
    {
      label: 'Proveedores',
      value: loading ? '—' : totalProveedores.toString(),
      color: 'bg-sky-500',
      icon: '🚚',
      type: 'proveedores',
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-8">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl border border-slate-200 bg-white px-6 py-5 flex items-center justify-between shadow-sm"
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {card.label}
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 truncate">
              {card.value}
            </p>

            {card.type === 'ganancia' && (
              <div className="mt-3 flex flex-wrap gap-1">
                <button
                  onClick={() => setPeriodoGanancia('hoy')}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    periodoGanancia === 'hoy'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Hoy
                </button>
                <button
                  onClick={() => setPeriodoGanancia('semana')}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    periodoGanancia === 'semana'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Semana
                </button>
                <button
                  onClick={() => setPeriodoGanancia('mes')}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    periodoGanancia === 'mes'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Mes
                </button>
                <button
                  onClick={() => setPeriodoGanancia('año')}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    periodoGanancia === 'año'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Año
                </button>
              </div>
            )}

            {card.type === 'cuentas' && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-slate-500">Por servicio:</span>
                  <select
                    value={selectedServicioId || ''}
                    onChange={(e) => setSelectedServicioId(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[170px]"
                  >
                    {serviciosCuentas.map((s) => (
                      <option key={s.id || 'sin-servicio'} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedServicio && (
                  <p className="text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-700">{selectedServicio.total}</span>{' '}
                    cuentas en <span className="font-medium">{selectedServicio.nombre}</span>
                  </p>
                )}
              </div>
            )}

            {error && card.type === 'ganancia' && !loading && (
              <p className="mt-2 text-[11px] text-rose-500">{error}</p>
            )}
          </div>
          <div className={`${card.color} h-12 w-12 rounded-2xl flex items-center justify-center text-white text-xl font-semibold ml-4 flex-shrink-0`}>
            {card.icon}
          </div>
        </div>
      ))}
    </div>
  )
}
