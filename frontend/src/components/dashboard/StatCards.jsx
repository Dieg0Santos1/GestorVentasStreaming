import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { useCurrency } from '../../hooks/useCurrency'
import { formatMoney } from '../../lib/money'

export function StatCards() {
  const { user } = useAuth()
  const currency = useCurrency()

  const [gananciaMes, setGananciaMes] = useState(0)
  const [totalClientes, setTotalClientes] = useState(0)
  const [totalCuentas, setTotalCuentas] = useState(0)
  const [totalProveedores, setTotalProveedores] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [serviciosCuentas, setServiciosCuentas] = useState([])
  const [selectedServicioId, setSelectedServicioId] = useState('all')

  const monthLabel = useMemo(() => {
    const now = new Date()
    return now.toLocaleDateString('es-ES', { month: 'long' })
  }, [])

  useEffect(() => {
    if (!user?.id) return

    async function fetchStats() {
      setLoading(true)
      setError(null)

      const [ventasRes, clientesRes, cuentasRes, proveedoresRes, pagosRes, gastosRes] = await Promise.all([
        // Fallback de ingresos (si no hay pagos_ventas)
        supabase
          .from('ventas')
          .select('monto, fecha_venta')
          .eq('user_id', user.id),
        supabase
          .from('clientes')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),
        supabase
          .from('cuentas_servicios')
          .select('id, servicio_id, precio_compra, fecha_inicio, servicios (id, nombre)')
          .eq('user_id', user.id),
        supabase
          .from('proveedores')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),
        // pagos_ventas: ingresos reales (incluye renovaciones). Si no existe, usamos ventas como fallback.
        supabase
          .from('pagos_ventas')
          .select('monto, fecha_pago')
          .eq('user_id', user.id),
        // gastos_cuentas: gastos reales (compra inicial + renovaciones de cuentas con proveedor).
        supabase
          .from('gastos_cuentas')
          .select('monto, fecha_gasto')
          .eq('user_id', user.id),
      ])

      // Ganancia del mes actual = ingresos del mes - gastos del mes
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)

      const inMonth = (fecha) => {
        if (!fecha) return false
        const d = new Date(fecha)
        return d >= start && d < end
      }

      const ingresosData = (pagosRes && !pagosRes.error && (pagosRes.data || []).length > 0)
        ? (pagosRes.data || []).map((p) => ({ fecha: p.fecha_pago, monto: p.monto }))
        : (ventasRes.data || []).map((v) => ({ fecha: v.fecha_venta, monto: v.monto }))

      const ingresosMes = ingresosData
        .filter((x) => inMonth(x.fecha))
        .reduce((acc, x) => acc + (Number(x.monto) || 0), 0)

      let gastosMes = 0

      if (gastosRes && !gastosRes.error && (gastosRes.data || []).length > 0) {
        gastosMes = (gastosRes.data || [])
          .filter((g) => inMonth(g.fecha_gasto))
          .reduce((acc, g) => acc + (Number(g.monto) || 0), 0)
      } else {
        gastosMes = (cuentasRes.data || [])
          .filter((c) => inMonth(c.fecha_inicio))
          .reduce((acc, c) => acc + (Number(c.precio_compra) || 0), 0)
      }

      setGananciaMes(ingresosMes - gastosMes)

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

      setLoading(false)
    }

    fetchStats()
  }, [user?.id])

  const gananciaMesFormatted = formatMoney(gananciaMes, currency, {
    maximumFractionDigits: 2,
  })

  const selectedServicio =
    selectedServicioId === 'all'
      ? null
      : serviciosCuentas.find((s) => s.id === selectedServicioId) || null

  const cards = [
    {
      label: `Ganancia Por Mes (${monthLabel})`,
      value: loading ? '—' : gananciaMesFormatted,
      color: 'bg-blue-600',
      icon: '💰',
      type: 'ganancia-mes',
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

            {error && card.type === 'ganancia-mes' && !loading && (
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
