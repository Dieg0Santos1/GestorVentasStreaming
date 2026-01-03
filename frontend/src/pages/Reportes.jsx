import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Edit2, Search, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { Modal } from '../components/common/Modal'
import { ConfirmModal } from '../components/common/ConfirmModal'
import { formatDateDisplay, normalizeDateString } from '../lib/dateUtils'

function todayISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

function addMonths(dateStr, months) {
  const norm = normalizeDateString(dateStr)
  if (!norm) return ''
  const [y, m, d] = norm.split('-')
  const base = new Date(Number(y), Number(m) - 1, Number(d))
  base.setMonth(base.getMonth() + Number(months || 0))
  const ny = base.getFullYear()
  const nm = String(base.getMonth() + 1).padStart(2, '0')
  const nd = String(base.getDate()).padStart(2, '0')
  return `${ny}-${nm}-${nd}`
}

export function Reportes() {
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [rows, setRows] = useState([])
  const [searchTerm, setSearchTerm] = useState('')

  const [openEdit, setOpenEdit] = useState(false)
  const [editingVenta, setEditingVenta] = useState(null)
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  const [openConfirm, setOpenConfirm] = useState(false)
  const [confirmMsg, setConfirmMsg] = useState('')

  // Estados para renovación
  const [openRenovacion, setOpenRenovacion] = useState(false)
  const [ventaRenovando, setVentaRenovando] = useState(null)
  const [mesesRenovacion, setMesesRenovacion] = useState(1)
  const [fechaManualRenovacion, setFechaManualRenovacion] = useState('')
  const [montoRenovacion, setMontoRenovacion] = useState('')
  const [savingRenovacion, setSavingRenovacion] = useState(false)
  const [renovacionError, setRenovacionError] = useState(null)

  async function fetchData() {
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('ventas')
      .select(`
        id,
        user_id,
        cliente_id,
        cuenta_servicio_id,
        perfil_id,
        fecha_venta,
        fecha_inicio,
        fecha_vencimiento,
        monto,
        liberada,
        clientes (id, nombre, apellido, telefono),
        cuentas_servicios (
          id,
          correo,
          contrasena,
          servicios (id, nombre)
        )
      `)
      .eq('user_id', user.id)
      .order('fecha_vencimiento', { ascending: true })

    if (error) {
      setError(error.message)
      setRows([])
      setLoading(false)
      return
    }

    // Reportes: ventas que ya vencieron (desde el día siguiente)
    const hoy = todayISO()
    const expired = (data || []).filter((v) => {
      const fv = normalizeDateString(v.fecha_vencimiento)
      return fv && fv < hoy && !v.liberada
    })

    setRows(expired)
    setLoading(false)
  }

  useEffect(() => {
    if (!user?.id) return
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return rows

    return rows.filter((r) => {
      const cliente = r.clientes
      const cuenta = r.cuentas_servicios
      const servicio = cuenta?.servicios
      const hay = `${cliente?.nombre ?? ''} ${cliente?.apellido ?? ''} ${cliente?.telefono ?? ''} ${cuenta?.correo ?? ''} ${servicio?.nombre ?? ''}`
        .toLowerCase()
      return hay.includes(q)
    })
  }, [rows, searchTerm])

  function openEditModal(venta) {
    setEditingVenta(venta)
    setCorreo(venta.cuentas_servicios?.correo || '')
    setContrasena(venta.cuentas_servicios?.contrasena || '')
    setFormError(null)
    setOpenEdit(true)
  }

  function resetModal() {
    setOpenEdit(false)
    setEditingVenta(null)
    setCorreo('')
    setContrasena('')
    setSaving(false)
    setFormError(null)
  }

  async function handleSave(e) {
    e.preventDefault()
    setFormError(null)

    if (!editingVenta?.cuenta_servicio_id) return
    if (!correo.trim() || !contrasena.trim()) {
      setFormError('Correo y contraseña son obligatorios')
      return
    }

    setSaving(true)

    // 1) Actualiza credenciales de la cuenta
    const { error: cuentaErr } = await supabase
      .from('cuentas_servicios')
      .update({
        correo: correo.trim(),
        contrasena: contrasena.trim(),
      })
      .eq('id', editingVenta.cuenta_servicio_id)

    if (cuentaErr) {
      setSaving(false)
      setFormError(cuentaErr.message)
      return
    }

    // 2) Libera la cuenta SIN eliminar la venta (para NO descontar ingresos).
    // La venta queda como historial y ya no bloqueará la cuenta en el sistema.
    const { error: liberarErr } = await supabase
      .from('ventas')
      .update({ liberada: true })
      .eq('id', editingVenta.id)

    setSaving(false)

    if (liberarErr) {
      setFormError(liberarErr.message)
      return
    }

    setConfirmMsg('Credenciales actualizadas. La cuenta quedó liberada y ahora la puedes volver a vender.')
    setOpenConfirm(true)

    resetModal()
    await fetchData()

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('reportes-updated'))
    }
  }

  function openRenovacionModal(venta) {
    setVentaRenovando(venta)
    const baseMonto = Number(venta.monto || 0)
    setMesesRenovacion(1)
    setMontoRenovacion(baseMonto ? baseMonto.toFixed(2) : '')
    setFechaManualRenovacion('')
    setRenovacionError(null)
    setOpenRenovacion(true)
  }

  function resetRenovacionModal() {
    setOpenRenovacion(false)
    setVentaRenovando(null)
    setMesesRenovacion(1)
    setFechaManualRenovacion('')
    setMontoRenovacion('')
    setSavingRenovacion(false)
    setRenovacionError(null)
  }

  async function handleRenovacionSubmit(e) {
    e.preventDefault()
    setRenovacionError(null)
    if (!ventaRenovando) return

    const meses = Number(mesesRenovacion) || 1
    const monto = parseFloat(montoRenovacion)
    if (!monto || monto <= 0) {
      setRenovacionError('El monto de la renovación debe ser mayor a 0')
      return
    }

    // Toma la fecha de vencimiento original como base
    const fechaVencimientoOriginal = normalizeDateString(ventaRenovando.fecha_vencimiento) || todayISO()

    // La nueva fecha de inicio es la fecha de vencimiento anterior
    const fechaInicioRenov = fechaVencimientoOriginal
    // La nueva fecha de vencimiento se calcula desde la fecha de vencimiento anterior + meses
    const fechaVencimientoRenov = fechaManualRenovacion || addMonths(fechaVencimientoOriginal, meses)

    setSavingRenovacion(true)

    // Actualizar la venta: nuevas fechas, nuevo monto, y quitarle el flag liberada
    const { data, error } = await supabase
      .from('ventas')
      .update({
        monto,
        fecha_inicio: fechaInicioRenov,
        fecha_vencimiento: fechaVencimientoRenov,
        liberada: false, // La venta vuelve a estar activa
      })
      .eq('id', ventaRenovando.id)
      .select(`
        id,
        cliente_id,
        cuenta_servicio_id,
        perfil_id,
        fecha_venta,
        fecha_inicio,
        fecha_vencimiento,
        monto,
        liberada
      `)
      .single()

    setSavingRenovacion(false)

    if (error) {
      setRenovacionError(error.message)
      return
    }

    // Registrar ingreso de renovación (para estadísticas)
    try {
      await supabase.from('pagos_ventas').insert({
        user_id: user.id,
        venta_id: data.id,
        monto: monto,
        fecha_pago: new Date().toISOString(),
        tipo: 'renovacion',
      })
    } catch (e) {
      console.warn('No se pudo registrar pago_renovacion (tabla pagos_ventas no existe o falta permisos).', e)
    }

    // Enviar notificación
    try {
      await supabase.functions.invoke('send-notifications', {
        body: { ventaId: data.id, motivo: 'renovacion' },
      })
    } catch (e) {
      console.error('Error enviando notificación de renovación', e)
    }

    setConfirmMsg('Venta renovada exitosamente. Ahora volverá a aparecer en la página de Ventas con las nuevas fechas.')
    setOpenConfirm(true)

    resetRenovacionModal()
    await fetchData()

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('reportes-updated'))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 inline-flex items-center gap-2">
            <AlertTriangle className="text-amber-500" size={20} />
            Reportes
          </h2>
          <p className="text-xs text-slate-500">
            Aquí aparecen las ventas que vencieron (desde el día siguiente) y requieren cambiar credenciales antes de volver a vender.
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Buscar cliente, correo, servicio..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 w-72"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700">
            <tr>
              <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">#</th>
              <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">Cliente</th>
              <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">Servicio</th>
              <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">Cuenta</th>
              <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">Venció</th>
              <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Cargando reportes...
                </td>
              </tr>
            )}

            {!loading && error && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-rose-600">
                  Error: {error}
                </td>
              </tr>
            )}

            {!loading && !error && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No hay ventas vencidas pendientes.
                </td>
              </tr>
            )}

            {!loading && !error && filtered.map((r, idx) => {
              const cliente = r.clientes
              const cuenta = r.cuentas_servicios
              const servicio = cuenta?.servicios

              return (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-gradient-to-r hover:from-amber-50 hover:to-slate-50 transition-all">
                  <td className="px-4 py-4 text-center">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs">
                      {idx + 1}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-slate-900 font-medium">
                    {cliente ? `${cliente.nombre} ${cliente.apellido}` : '—'}
                    <div className="text-[11px] text-slate-500">{cliente?.telefono || ''}</div>
                  </td>
                  <td className="px-4 py-4 text-slate-800">
                    {servicio?.nombre || '—'}
                  </td>
                  <td className="px-4 py-4">
                    <code className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 font-mono text-xs border border-slate-200">
                      {cuenta?.correo || '—'}
                    </code>
                  </td>
                  <td className="px-4 py-4 text-center text-slate-700 font-medium">
                    {formatDateDisplay(r.fecha_vencimiento)}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => openRenovacionModal(r)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shadow-sm text-xs font-semibold"
                        title="Renovar venta"
                      >
                        <RefreshCw size={16} />
                        Renovar
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(r)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-sm text-xs font-semibold"
                        title="Cambiar credenciales y liberar"
                      >
                        <Edit2 size={16} />
                        Liberar
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>

      <Modal open={openEdit} title="Actualizar credenciales" onClose={resetModal}>
        <form className="space-y-4" onSubmit={handleSave}>
          <p className="text-xs text-slate-600">
            Al guardar, se actualizarán las credenciales de la cuenta y se liberará la cuenta para volver a venderse.
            La venta NO se eliminará (se mantiene como historial).
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <input
              type="email"
              placeholder="Nuevo correo"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Nueva contraseña"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {formError && <p className="text-sm text-rose-500">{formError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={resetModal}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando...' : 'Guardar y liberar'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={openRenovacion}
        title="Renovación de venta vencida"
        onClose={resetRenovacionModal}
      >
        <form className="space-y-4" onSubmit={handleRenovacionSubmit}>
          {ventaRenovando && (
            <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <p>
                <span className="font-semibold">Cliente:</span>{' '}
                {ventaRenovando.clientes
                  ? `${ventaRenovando.clientes.nombre} ${ventaRenovando.clientes.apellido}`
                  : '—'}
              </p>
              <p>
                <span className="font-semibold">Cuenta:</span>{' '}
                {ventaRenovando.cuentas_servicios?.correo || '—'}
              </p>
              <p>
                <span className="font-semibold">Venció el:</span>{' '}
                {formatDateDisplay(ventaRenovando.fecha_vencimiento)}
              </p>
            </div>
          )}

          <p className="text-xs text-slate-600">
            Al renovar, la fecha de inicio será la fecha de vencimiento anterior y se contarán los meses desde ahí. La venta volverá a la página de Ventas como activa.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">Meses a renovar</span>
              <select
                value={mesesRenovacion}
                onChange={(e) => {
                  const value = Number(e.target.value) || 1
                  setMesesRenovacion(value)
                  if (ventaRenovando) {
                    const baseMonto = Number(ventaRenovando.monto || 0)
                    if (baseMonto > 0) {
                      setMontoRenovacion((baseMonto * value).toFixed(2))
                    }
                  }
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value={1}>1 mes</option>
                <option value={2}>2 meses</option>
                <option value={3}>3 meses</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">
                Fecha de vencimiento (opcional, manual)
              </span>
              <input
                type="date"
                value={fechaManualRenovacion}
                onChange={(e) => setFechaManualRenovacion(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-[11px] text-slate-400">
                Si no eliges una fecha, se calculará desde la fecha de vencimiento original sumando los meses seleccionados.
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">Monto de renovación</span>
              <input
                type="number"
                step="0.01"
                value={montoRenovacion}
                onChange={(e) => setMontoRenovacion(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-[11px] text-slate-400">
                Por defecto es el precio original multiplicado por los meses seleccionados.
              </p>
            </div>
          </div>

          {renovacionError && <p className="text-sm text-rose-500">{renovacionError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={resetRenovacionModal}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingRenovacion}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {savingRenovacion ? 'Guardando...' : 'Registrar renovación'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={openConfirm}
        onClose={() => setOpenConfirm(false)}
        onConfirm={() => setOpenConfirm(false)}
        title="Listo"
        message={confirmMsg}
        confirmText="Entendido"
        type="info"
      />
    </div>
  )
}
