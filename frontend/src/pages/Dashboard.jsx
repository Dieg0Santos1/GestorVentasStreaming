import { useEffect, useMemo, useState } from 'react'
import { StatCards } from '../components/dashboard/StatCards'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../hooks/useCurrency'
import { formatMoney } from '../lib/money'

// Estado de la VENTA (después de ser vendida): vigente / por-vencer / vencida
function getEstadoVenta(fechaVencimiento) {
  if (!fechaVencimiento) return 'sin-fecha'

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const vencimiento = new Date(fechaVencimiento)
  vencimiento.setHours(0, 0, 0, 0)

  const diffTime = vencimiento - hoy
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return 'vencida'
  if (diffDays <= 2) return 'por-vencer'
  return 'vigente'
}

export function Dashboard() {
  const { user } = useAuth()
  const currency = useCurrency()
  // Preferimos el id del usuario logueado; si no hay sesión, caemos al OWNER_ID.
  const TENANT_ID = user?.id || import.meta.env.VITE_OWNER_ID

  const [ventas, setVentas] = useState([])
  const [pagosVentas, setPagosVentas] = useState([])
  const [cuentas, setCuentas] = useState([])
  const [gastosCuentas, setGastosCuentas] = useState([])
  const [servicios, setServicios] = useState([])
  const [selectedServicioId, setSelectedServicioId] = useState('all')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!TENANT_ID) return

    async function fetchDashboardData() {
      setLoading(true)
      setError(null)

      const [ventasRes, cuentasRes, pagosRes, gastosRes] = await Promise.all([
        supabase
          .from('ventas')
          .select('id, monto, fecha_venta, fecha_vencimiento, cuenta_servicio_id')
          .eq('user_id', TENANT_ID)
          .order('fecha_venta', { ascending: true }),
        supabase
          .from('cuentas_servicios')
          .select('id, servicio_id, precio_compra, fecha_inicio, servicios (id, nombre)')
          .eq('user_id', TENANT_ID),
        // pagos_ventas es la fuente de ingresos reales (incluye renovaciones).
        // Si no existe la tabla, lo manejamos con fallback abajo.
        supabase
          .from('pagos_ventas')
          .select('id, venta_id, monto, fecha_pago')
          .eq('user_id', TENANT_ID)
          .order('fecha_pago', { ascending: true }),
        // gastos_cuentas: registro explícito de gastos (compra inicial + renovaciones con proveedor).
        supabase
          .from('gastos_cuentas')
          .select('id, cuenta_servicio_id, monto, fecha_gasto, tipo')
          .eq('user_id', TENANT_ID)
          .order('fecha_gasto', { ascending: true }),
      ])

      if (ventasRes.error) {
        setError(ventasRes.error.message)
      } else {
        setVentas(ventasRes.data || [])
      }

      // pagos_ventas: si falla, no detenemos dashboard; usamos ventas como fallback.
      if (pagosRes?.error) {
        setPagosVentas([])
      } else {
        setPagosVentas(pagosRes?.data || [])
      }

      // gastos_cuentas: si falla, usamos solo precio_compra de cuentas como fallback.
      if (gastosRes?.error) {
        setGastosCuentas([])
      } else {
        setGastosCuentas(gastosRes?.data || [])
      }

      if (cuentasRes.error) {
        setError((prev) => prev || cuentasRes.error.message)
      } else {
        const cuentasData = cuentasRes.data || []
        setCuentas(cuentasData)

        const serviciosMap = new Map()
        for (const c of cuentasData) {
          if (c.servicios) {
            serviciosMap.set(c.servicios.id, c.servicios)
          }
        }
        const serviciosArr = Array.from(serviciosMap.values()).sort((a, b) =>
          a.nombre.localeCompare(b.nombre)
        )
        setServicios(serviciosArr)
        if (serviciosArr.length > 0) {
          setSelectedServicioId(serviciosArr[0].id)
        }
      }

      setLoading(false)
    }

    fetchDashboardData()
  }, [TENANT_ID])

  const monthlyBalance = useMemo(() => {
    const now = new Date()
    const year = now.getFullYear()
    const buckets = []
    const map = new Map()

    for (let month = 0; month < 12; month++) {
      const date = new Date(year, month, 1)
      const key = `${year}-${month}`
      const label = date.toLocaleDateString('es-ES', { month: 'short' })
      buckets.push({ key, label, ventas: 0, gastos: 0 })
      map.set(key, buckets[buckets.length - 1])
    }

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
        const d = new Date(f)
        if (Number.isNaN(d.getTime())) return null
        d.setHours(12, 0, 0, 0)
        return d
      }
      return null
    }

    // Ventas (ingresos): usamos pagos_ventas; sumamos ventas que no tengan pago asociado para evitar duplicados.
    const pagosSet = new Set((pagosVentas || []).map((p) => p.venta_id).filter(Boolean))
    const ingresos = [
      ...(pagosVentas || []).map((p) => ({ fecha: p.fecha_pago, monto: p.monto })),
      ...ventas
        .filter((v) => !pagosSet.has(v.id))
        .map((v) => ({ fecha: v.fecha_venta, monto: v.monto })),
    ]

    for (const p of ingresos) {
      const fecha = normalizeToDate(p.fecha)
      if (!fecha) continue
      if (fecha.getFullYear() !== year) continue
      const key = `${fecha.getFullYear()}-${fecha.getMonth()}`
      if (map.has(key)) {
        map.get(key).ventas += Number(p.monto) || 0
      }
    }

    // Gastos:
    // 1) Preferimos registros explícitos en gastos_cuentas (compra inicial + renovaciones).
    // 2) Si no hay datos, usamos como fallback precio_compra/fecha_inicio de las cuentas.
    const cuentasConCompraRegistrada = new Set()

    for (const g of gastosCuentas || []) {
      const monto = Number(g.monto)
      if (!monto || monto <= 0) continue
      const fecha = normalizeToDate(g.fecha_gasto)
      if (!fecha) continue

      if (g.tipo === 'compra' && g.cuenta_servicio_id) {
        cuentasConCompraRegistrada.add(g.cuenta_servicio_id)
      }

      if (fecha.getFullYear() !== year) continue
      const key = `${fecha.getFullYear()}-${fecha.getMonth()}`
      if (map.has(key)) {
        map.get(key).gastos += monto
      }
    }

    for (const c of cuentas) {
      if (cuentasConCompraRegistrada.has(c.id)) continue
      const monto = Number(c.precio_compra)
      if (!monto || monto <= 0) continue
      const fecha = normalizeToDate(c.fecha_inicio)
      if (!fecha) continue
      if (fecha.getFullYear() !== year) continue
      const key = `${fecha.getFullYear()}-${fecha.getMonth()}`
      if (map.has(key)) {
        map.get(key).gastos += monto
      }
    }

    return buckets
  }, [ventas, pagosVentas, cuentas, gastosCuentas])

  const maxMonthlyTotal = useMemo(() => {
    const values = monthlyBalance.flatMap((m) => [m.ventas, m.gastos])
    return Math.max(0, ...values)
  }, [monthlyBalance])

  const cuentasFiltradas = useMemo(() => {
    if (selectedServicioId === 'all') return cuentas
    return cuentas.filter((c) => c.servicio_id === selectedServicioId)
  }, [cuentas, selectedServicioId])

  // Mapa de ventas activas por cuenta para saber si una cuenta está vendida
  const ventasPorCuenta = useMemo(() => {
    const map = new Map()
    for (const v of ventas) {
      if (v.cuenta_servicio_id) {
        map.set(v.cuenta_servicio_id, v)
      }
    }
    return map
  }, [ventas])

  // Distribución de estados por servicio
  const estadosCounts = useMemo(() => {
    // Antes de ser vendidas: solo "Activa" (se puede vender)
    // Después de ser vendidas: Vigente / Por vencer / Vencida (según la venta)
    const counts = { activa: 0, vigente: 0, 'por-vencer': 0, vencida: 0 }

    for (const c of cuentasFiltradas) {
      const venta = ventasPorCuenta.get(c.id)

      // Cuenta sin venta -> Activa (inventario)
      if (!venta) {
        counts.activa += 1
        continue
      }

      // Cuenta vendida -> clasificar por estado de la venta
      const estadoVenta = getEstadoVenta(venta.fecha_vencimiento)
      if (estadoVenta === 'vigente') counts.vigente += 1
      else if (estadoVenta === 'por-vencer') counts['por-vencer'] += 1
      else if (estadoVenta === 'vencida') counts.vencida += 1
    }

    return counts
  }, [cuentasFiltradas, ventasPorCuenta])

  const donutData = useMemo(() => {
    const total =
      estadosCounts.activa +
      estadosCounts.vigente +
      estadosCounts['por-vencer'] +
      estadosCounts.vencida

    if (total === 0) {
      return {
        gradient: 'conic-gradient(#e5e7eb 0deg 360deg)',
        total: 0,
      }
    }

    const slice = (value) => (value / total) * 360
    let start = 0
    const segments = []

    const activaAngle = slice(estadosCounts.activa)
    if (activaAngle > 0) {
      segments.push(
        `#22c55e ${start}deg ${start + activaAngle}deg` // emerald-500 (Activas)
      )
      start += activaAngle
    }

    const vigenteAngle = slice(estadosCounts.vigente)
    if (vigenteAngle > 0) {
      segments.push(
        `#3b82f6 ${start}deg ${start + vigenteAngle}deg` // blue-500 (Vigentes)
      )
      start += vigenteAngle
    }

    const porVencerAngle = slice(estadosCounts['por-vencer'])
    if (porVencerAngle > 0) {
      segments.push(
        `#f59e0b ${start}deg ${start + porVencerAngle}deg` // amber-500 (Por vencer)
      )
      start += porVencerAngle
    }

    const vencidaAngle = slice(estadosCounts.vencida)
    if (vencidaAngle > 0) {
      segments.push(`#f97373 ${start}deg ${start + vencidaAngle}deg`) // rojo (Vencidas)
    }

    return {
      gradient: `conic-gradient(${segments.join(', ')})`,
      total,
    }
  }, [estadosCounts])

  const servicioSeleccionado =
    selectedServicioId === 'all'
      ? null
      : servicios.find((s) => s.id === selectedServicioId) || null

  return (
    <div className="space-y-6">
      <StatCards />

      {/* Balance por mes */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              Balance por Mes
            </h2>
            <p className="text-xs text-slate-500">Año actual</p>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-600">
            <div className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
              <span className="font-medium">Ventas</span>
            </div>
            <div className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              <span className="font-medium">Gastos</span>
            </div>
            {loading && (
              <span className="text-xs text-slate-400">Cargando...</span>
            )}
          </div>
        </div>

        <div className="relative h-72 md:h-80">
          <div className="absolute inset-0 bg-gradient-to-t from-slate-500/10 via-transparent to-transparent rounded-xl border border-slate-300/30" />
          <div className="absolute inset-0 overflow-x-auto md:overflow-x-visible">
            <div className="absolute inset-y-6 left-4 right-4 md:inset-x-4 flex items-end justify-between gap-2 min-w-[600px] md:min-w-0">
              {monthlyBalance.map((month) => {
              const rVentas = maxMonthlyTotal ? month.ventas / maxMonthlyTotal : 0
              const rGastos = maxMonthlyTotal ? month.gastos / maxMonthlyTotal : 0
              const hVentas = rVentas > 0 ? 28 + rVentas * 150 : 0
              const hGastos = rGastos > 0 ? 28 + rGastos * 150 : 0

              const fmt = (n) =>
                formatMoney(Number(n) || 0, currency, {
                  maximumFractionDigits: 0,
                })

              return (
                <div key={month.key} className="flex-1 flex flex-col items-center gap-2 min-w-[14px]">
                  <div className="flex items-end justify-center gap-1.5">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[10px] font-medium text-slate-500">
                        {month.ventas > 0 ? fmt(month.ventas) : ''}
                      </span>
                      <div
                        title={`Ventas: ${month.ventas.toFixed(2)}`}
                        style={{ height: `${hVentas}px` }}
                        className="w-[8px] md:w-[10px] rounded-full bg-gradient-to-t from-blue-600 to-cyan-400 shadow-sm transition-all duration-700 ease-out"
                      />
                    </div>

                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[10px] font-medium text-slate-500">
                        {month.gastos > 0 ? fmt(month.gastos) : ''}
                      </span>
                      <div
                        title={`Gastos: ${month.gastos.toFixed(2)}`}
                        style={{ height: `${hGastos}px` }}
                        className="w-[8px] md:w-[10px] rounded-full bg-gradient-to-t from-rose-600 to-rose-300 shadow-sm transition-all duration-700 ease-out"
                      />
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-slate-600">{month.label}</span>
                </div>
              )
              })}
            </div>
          </div>
        </div>
        <p className="text-[10px] text-slate-400 text-center mt-2 md:hidden">
          Desliza horizontalmente para ver todos los meses
        </p>
      </section>

      {/* Gráfico circular de cuentas por estado */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              Estado de Cuentas por Servicio
            </h2>
            <p className="text-xs text-slate-500">
              Distribución de cuentas activas (sin vender) y vendidas por estado: vigentes, por vencer y vencidas
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Servicio:</span>
            <select
              value={selectedServicioId}
              onChange={(e) => setSelectedServicioId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[180px]"
            >
              <option value="all">Todos los servicios</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-8 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-center">
          <div className="flex items-center justify-center">
            <div
              key={selectedServicioId}
              className="relative h-48 w-48 md:h-56 md:w-56 flex items-center justify-center transition-all duration-700 ease-out"
            >
              <div
                className="h-full w-full rounded-full shadow-inner border border-slate-200 transition-all duration-700 ease-out"
                style={{ backgroundImage: donutData.gradient }}
              />
              <div className="absolute h-28 w-28 md:h-32 md:w-32 bg-white rounded-full flex flex-col items-center justify-center border border-slate-100 shadow-sm transition-all duration-700 ease-out">
                <span className="text-[11px] text-slate-500 uppercase tracking-wide">
                  Cuentas
                </span>
                <span className="text-xl font-bold text-slate-900">
                  {donutData.total}
                </span>
                {servicioSeleccionado && (
                  <span className="mt-1 text-[10px] text-slate-500 text-center px-2 line-clamp-2">
                    {servicioSeleccionado.nombre}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <div>
                  <p className="text-xs font-medium text-emerald-700">Activas (sin vender)</p>
                  <p className="text-base font-semibold text-emerald-800">
                    {estadosCounts.activa}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                <div>
                  <p className="text-xs font-medium text-blue-700">Vigentes (vendidas)</p>
                  <p className="text-base font-semibold text-blue-800">
                    {estadosCounts.vigente}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <div>
                  <p className="text-xs font-medium text-amber-700">Por vencer (vendidas)</p>
                  <p className="text-base font-semibold text-amber-800">
                    {estadosCounts['por-vencer']}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                <div>
                  <p className="text-xs font-medium text-rose-700">Vencidas (vendidas)</p>
                  <p className="text-base font-semibold text-rose-800">
                    {estadosCounts.vencida}
                  </p>
                </div>
              </div>
            </div>

            {loading && (
              <p className="text-xs text-slate-400">Cargando datos de cuentas...</p>
            )}

            {!loading && cuentasFiltradas.length === 0 && (
              <p className="text-xs text-slate-400">
                No hay cuentas registradas para este servicio.
              </p>
            )}
          </div>
        </div>

        {error && (
          <p className="mt-4 text-xs text-rose-500">Error al cargar dashboard: {error}</p>
        )}
      </section>
    </div>
  )
}
