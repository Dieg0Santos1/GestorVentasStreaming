import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Edit2, Search } from 'lucide-react'
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

    setConfirmMsg('Credenciales actualizadas. La cuenta quedó liberada y la venta se mantuvo como historial (no se descuenta el dinero).')
    setOpenConfirm(true)

    resetModal()
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
        <table className="min-w-full text-sm">
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
                  <td className="px-4 py-4 text-center">
                    <button
                      type="button"
                      onClick={() => openEditModal(r)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-sm text-xs font-semibold"
                    >
                      <Edit2 size={16} />
                      Cambiar credenciales
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
