import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { useCurrency } from '../../hooks/useCurrency'
import { formatMoney } from '../../lib/money'

function getPeriodRange(period) {
  const now = new Date()
  let start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let end

  switch (period) {
    case 'hoy':
      end = new Date(start)
      end.setDate(start.getDate() + 1)
      break
    case 'semana': {
      const dayOfWeek = now.getDay()
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff)
      end = new Date(start)
      end.setDate(start.getDate() + 7)
      break
    }
    case 'mes':
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      break
    case 'ano':
      start = new Date(now.getFullYear(), 0, 1)
      end = new Date(now.getFullYear() + 1, 0, 1)
      break
    default:
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  }

  return { start, end }
}

function getPeriodLabel(period) {
  const now = new Date()

  switch (period) {
    case 'hoy':
      return now.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
    case 'semana': {
      const start = new Date(now)
      const diff = now.getDay() === 0 ? -6 : 1 - now.getDay()
      start.setDate(now.getDate() + diff)
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      return `${start.getDate()}/${start.getMonth() + 1} - ${end.getDate()}/${end.getMonth() + 1}`
    }
    case 'mes':
      return now.toLocaleDateString('es-ES', { month: 'long' })
    case 'ano':
      return now.getFullYear().toString()
    default:
      return ''
  }
}

function normalizeToDate(fecha) {
  if (!fecha) return null
  if (fecha instanceof Date) {
    const date = new Date(fecha)
    date.setHours(12, 0, 0, 0)
    return date
  }
  if (typeof fecha === 'string') {
    let normalized = fecha.trim()
    if (!normalized.includes('T') && normalized.includes(' ')) {
      normalized = normalized.replace(' ', 'T')
    }
    normalized = normalized.replace(/\+00(?=$)/, 'Z')
    normalized = normalized.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
    normalized = normalized.replace(/([+-]\d{2})$/, '$1:00')
    let date = new Date(normalized)
    if (Number.isNaN(date.getTime())) {
      date = new Date(`${normalized}Z`)
    }
    if (Number.isNaN(date.getTime())) return null
    date.setHours(12, 0, 0, 0)
    return date
  }
  return null
}

function PeriodButtons({ period, onChange, activeClass }) {
  const options = [
    { value: 'hoy', label: 'Hoy' },
    { value: 'semana', label: 'Semana' },
    { value: 'mes', label: 'Mes' },
    { value: 'ano', label: 'Año' },
  ]

  return (
    <div className="mt-3 flex flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
            period === option.value
              ? `${activeClass} text-white`
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function StatCards({
  ventas = [],
  pagosVentas = [],
  cuentas = [],
  gastosCuentas = [],
  monthlyBalance = [],
}) {
  const { user } = useAuth()
  const currency = useCurrency()
  const tenantId = user?.id || import.meta.env.VITE_OWNER_ID

  const [recargasPeriodo, setRecargasPeriodo] = useState(0)
  const [totalClientes, setTotalClientes] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [selectedServicioId, setSelectedServicioId] = useState('all')
  const [periodoGanancia, setPeriodoGanancia] = useState('mes')
  const [periodoRecargas, setPeriodoRecargas] = useState('mes')

  const periodoGananciaLabel = useMemo(() => getPeriodLabel(periodoGanancia), [periodoGanancia])
  const periodoRecargasLabel = useMemo(() => getPeriodLabel(periodoRecargas), [periodoRecargas])

  const totalCuentas = cuentas.length

  const serviciosCuentas = useMemo(() => {
    const serviciosMap = new Map()

    for (const cuenta of cuentas) {
      const servicioId = cuenta.servicio_id
      const nombre = cuenta.servicios?.nombre || 'Sin servicio'
      if (!serviciosMap.has(servicioId)) {
        serviciosMap.set(servicioId, { id: servicioId, nombre, total: 0 })
      }
      serviciosMap.get(servicioId).total += 1
    }

    return Array.from(serviciosMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [cuentas])

  useEffect(() => {
    if (serviciosCuentas.length === 0) return

    setSelectedServicioId((prev) =>
      serviciosCuentas.some((servicio) => servicio.id === prev)
        ? prev
        : serviciosCuentas[0].id || 'all',
    )
  }, [serviciosCuentas])

  const gananciaNeta = useMemo(() => {
    if (periodoGanancia === 'mes') {
      const now = new Date()
      const currentKey = `${now.getFullYear()}-${now.getMonth()}`
      const currentMonth = monthlyBalance.find((month) => month.key === currentKey)
      return (currentMonth?.ventas || 0) - (currentMonth?.gastos || 0)
    }

    if (periodoGanancia === 'ano') {
      return monthlyBalance.reduce(
        (acc, month) => acc + (Number(month.ventas) || 0) - (Number(month.gastos) || 0),
        0,
      )
    }

    const { start: ventasStart, end: ventasEnd } = getPeriodRange(periodoGanancia)

    const isInVentasPeriod = (fecha) => {
      const date = normalizeToDate(fecha)
      return date && date >= ventasStart && date < ventasEnd
    }

    const pagosSet = new Set((pagosVentas || []).map((pago) => pago.venta_id).filter(Boolean))

    const ingresosPeriodo =
      (pagosVentas || [])
        .filter((pago) => isInVentasPeriod(pago.fecha_pago))
        .reduce((acc, pago) => acc + (Number(pago.monto) || 0), 0) +
      (ventas || [])
        .filter((venta) => !pagosSet.has(venta.id) && isInVentasPeriod(venta.fecha_venta))
        .reduce((acc, venta) => acc + (Number(venta.monto) || 0), 0)

    let gastosPeriodo = 0
    const cuentasConCompraRegistrada = new Set()

    for (const gasto of gastosCuentas || []) {
      const monto = Number(gasto.monto)
      if (!monto || monto <= 0) continue
      const fecha = normalizeToDate(gasto.fecha_gasto)
      if (!fecha || fecha < ventasStart || fecha >= ventasEnd) continue

      if (gasto.tipo === 'compra' && gasto.cuenta_servicio_id) {
        cuentasConCompraRegistrada.add(gasto.cuenta_servicio_id)
      }

      gastosPeriodo += monto
    }

    for (const cuenta of cuentas || []) {
      if (cuentasConCompraRegistrada.has(cuenta.id)) continue

      const monto = Number(cuenta.precio_compra)
      if (!monto || monto <= 0) continue

      const fecha = normalizeToDate(cuenta.fecha_inicio)
      if (!fecha || fecha < ventasStart || fecha >= ventasEnd) continue

      gastosPeriodo += monto
    }

    return ingresosPeriodo - gastosPeriodo
  }, [periodoGanancia, ventas, pagosVentas, cuentas, gastosCuentas, monthlyBalance])

  useEffect(() => {
    if (!tenantId) return

    let cancelled = false

    const fetchStats = async () => {
      setLoading(true)
      setError(null)

      const { start: recargasStart, end: recargasEnd } = getPeriodRange(periodoRecargas)

      const recargasStartIso = recargasStart.toISOString()
      const recargasEndIso = recargasEnd.toISOString()

      const [clientesRes, recargasRes] =
        await Promise.all([
          supabase
            .from('clientes')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', tenantId),
          supabase
            .from('recargas')
            .select('monto_declarado, created_at')
            .eq('tenant_id', tenantId)
            .eq('status', 'approved')
            .gte('created_at', recargasStartIso)
            .lt('created_at', recargasEndIso),
        ])

      if (clientesRes.error) {
        setError((prev) => prev || clientesRes.error.message)
      } else {
        setTotalClientes(clientesRes.count || 0)
      }

      if (recargasRes.error) {
        setError((prev) => prev || recargasRes.error.message)
      } else {
        const totalRecargas = (recargasRes.data || []).reduce(
          (acc, recarga) => acc + (Number(recarga.monto_declarado) || 0),
          0,
        )
        setRecargasPeriodo(totalRecargas)
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
  }, [tenantId, periodoRecargas])

  const gananciaNetaFormatted = formatMoney(gananciaNeta, currency, {
    maximumFractionDigits: 2,
  })
  const recargasPeriodoFormatted = formatMoney(recargasPeriodo, currency, {
    maximumFractionDigits: 2,
  })

  const selectedServicio =
    selectedServicioId === 'all'
      ? null
      : serviciosCuentas.find((servicio) => servicio.id === selectedServicioId) || null

  const cards = [
    {
      label: `Ganancia Neta (${periodoGananciaLabel})`,
      value: loading ? '-' : gananciaNetaFormatted,
      color: 'bg-blue-600',
      icon: '💰',
      type: 'ganancia',
    },
    {
      label: `Recargas (${periodoRecargasLabel})`,
      value: loading ? '-' : recargasPeriodoFormatted,
      color: 'bg-sky-500',
      icon: '💳',
      type: 'recargas',
    },
    {
      label: 'Total Clientes',
      value: loading ? '-' : totalClientes.toString(),
      color: 'bg-emerald-500',
      icon: '👥',
      type: 'clientes',
    },
    {
      label: 'Cuentas',
      value: loading ? '-' : totalCuentas.toString(),
      color: 'bg-violet-500',
      icon: '🔐',
      type: 'cuentas',
    },
  ]

  return (
    <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {card.label}
            </p>
            <p className="mt-2 truncate text-2xl font-semibold text-slate-900">{card.value}</p>

            {card.type === 'ganancia' && (
              <PeriodButtons
                period={periodoGanancia}
                onChange={setPeriodoGanancia}
                activeClass="bg-blue-600"
              />
            )}

            {card.type === 'recargas' && (
              <PeriodButtons
                period={periodoRecargas}
                onChange={setPeriodoRecargas}
                activeClass="bg-sky-500"
              />
            )}

            {card.type === 'cuentas' && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-slate-500">Por servicio:</span>
                  <select
                    value={selectedServicioId || ''}
                    onChange={(e) => setSelectedServicioId(e.target.value)}
                    className="max-w-[170px] rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {serviciosCuentas.map((servicio) => (
                      <option key={servicio.id || 'sin-servicio'} value={servicio.id}>
                        {servicio.nombre}
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

          <div
            className={`${card.color} ml-4 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-xl font-semibold text-white`}
          >
            {card.icon}
          </div>
        </div>
      ))}
    </div>
  )
}
