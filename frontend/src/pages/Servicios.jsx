import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Edit2, Trash2, Settings } from 'lucide-react'
import { Modal } from '../components/common/Modal'
import { ConfirmModal } from '../components/common/ConfirmModal'
import { supabase } from '../lib/supabaseClient'
import { capitalize, inferServiceKeyFromName } from '../lib/textUtils'
import { useAuth } from '../context/AuthContext'

export function Servicios() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [openNewServicio, setOpenNewServicio] = useState(false)
  const [openEditServicio, setOpenEditServicio] = useState(false)
  const [openDeleteModal, setOpenDeleteModal] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [deleteMode, setDeleteMode] = useState('normal') // 'normal' | 'blocked'
  const [servicios, setServicios] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [nombre, setNombre] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  useEffect(() => {
    fetchServicios()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  async function fetchServicios() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('servicios')
      .select('id, nombre, creado_en')
      .eq('user_id', user.id)
      .order('creado_en', { ascending: false })

    if (error) {
      setError(error.message)
    } else {
      setServicios(data || [])
    }
    setLoading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)

    if (!nombre.trim()) {
      setFormError('El nombre del servicio es obligatorio')
      return
    }

    setSaving(true)
    const rawName = nombre.trim()
    const capitalized = capitalize(rawName)
    const serviceKey = inferServiceKeyFromName(rawName)

    const insertPayload = {
      nombre: capitalized,
      user_id: user.id,
      ...(serviceKey ? { service_key: serviceKey } : {}),
    }

    const { data, error } = await supabase
      .from('servicios')
      .insert(insertPayload)
      .select('id, nombre, creado_en')
      .single()

    setSaving(false)

    if (error) {
      // Código 23505 = constraint unique violation en PostgreSQL
      if (error.code === '23505') {
        setFormError('Ya tienes un servicio con ese nombre. Usa otro nombre.')
      } else {
        setFormError(error.message)
      }
      return
    }

    setServicios((prev) => [data, ...prev])
    setNombre('')
    setOpenNewServicio(false)
  }

  async function handleEdit(e) {
    e.preventDefault()
    setFormError(null)

    if (!nombre.trim()) {
      setFormError('El nombre del servicio es obligatorio')
      return
    }

    setSaving(true)
    const rawName = nombre.trim()
    const capitalized = capitalize(rawName)
    const serviceKey = inferServiceKeyFromName(rawName)

    const updatePayload = {
      nombre: capitalized,
      ...(serviceKey ? { service_key: serviceKey } : {}),
    }

    const { error } = await supabase
      .from('servicios')
      .update(updatePayload)
      .eq('id', editingId)

    setSaving(false)

    if (error) {
      setFormError(error.message)
      return
    }

    setServicios((prev) =>
      prev.map((s) => (s.id === editingId ? { ...s, nombre: capitalize(nombre.trim()) } : s))
    )
    setNombre('')
    setEditingId(null)
    setOpenEditServicio(false)
  }

  function openEditModal(servicio) {
    setEditingId(servicio.id)
    setNombre(servicio.nombre)
    setOpenEditServicio(true)
  }

  function confirmDelete(id) {
    setDeleteId(id)
    setDeleteMode('normal')
    setOpenDeleteModal(true)
  }

  async function handleDelete() {
    if (!deleteId) return

    // Verificar si el servicio tiene cuentas asociadas
    const { count, error: cuentasError } = await supabase
      .from('cuentas_servicios')
      .select('id', { count: 'exact', head: true })
      .eq('servicio_id', deleteId)

    if (!cuentasError && (count || 0) > 0) {
      const msg = 'No se puede eliminar este servicio porque tiene cuentas registradas. Primero elimina o reasigna todas las cuentas de este servicio.'
      setFormError(msg)
      setDeleteMode('blocked')
      return
    }

    const { error } = await supabase.from('servicios').delete().eq('id', deleteId)

    if (error) {
      setFormError('Error al eliminar: ' + error.message)
      setOpenDeleteModal(false)
      setDeleteMode('normal')
      setDeleteId(null)
      return
    }

    setServicios((prev) => prev.filter((s) => s.id !== deleteId))
    setOpenDeleteModal(false)
    setDeleteId(null)
    setDeleteMode('normal')
  }

  function handleGestionarCuentas(servicio) {
    navigate(`/servicios/${servicio.id}/cuentas`, { state: { servicio } })
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Servicios</h2>
        <button 
          onClick={() => setOpenNewServicio(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition-colors"
        >
          <Plus size={18} />
          Nuevo Servicio
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
        <table className="min-w-[700px] w-full text-sm">
          <thead className="bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700">
            <tr>
              <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">#</th>
              <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">Servicio</th>
              <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">Productos</th>
              <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                  Cargando servicios...
                </td>
              </tr>
            )}

            {!loading && error && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-rose-500">
                  Error al cargar servicios: {error}
                </td>
              </tr>
            )}

            {!loading && !error && servicios.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                  Aún no hay servicios registrados.
                </td>
              </tr>
            )}

            {!loading && !error &&
              servicios.map((servicio, index) => (
                <tr key={servicio.id} className="border-t border-slate-100 hover:bg-gradient-to-r hover:from-blue-50 hover:to-slate-50 transition-all">
                  <td className="px-4 py-4 text-center">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs">
                      {index + 1}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-slate-900 font-medium">{servicio.nombre}</td>
                  <td className="px-4 py-4">
                    <button 
                      onClick={() => handleGestionarCuentas(servicio)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/70 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100 transition-all shadow-sm"
                    >
                      <Settings size={14} />
                      Gestionar Cuentas
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => openEditModal(servicio)}
                        className="p-2 rounded-lg bg-cyan-500 text-white hover:bg-cyan-600 transition-colors shadow-sm"
                        title="Editar"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => confirmDelete(servicio.id)}
                        className="p-2 rounded-lg bg-rose-500 text-white hover:bg-rose-600 transition-colors shadow-sm"
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        </div>
      </div>

      <Modal open={openNewServicio} title="Nuevo Servicio" onClose={() => setOpenNewServicio(false)}>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <input
            placeholder="Nombre del servicio"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          {formError && <p className="text-sm text-rose-500">{formError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOpenNewServicio(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={openEditServicio} title="Editar Servicio" onClose={() => setOpenEditServicio(false)}>
        <form className="space-y-4" onSubmit={handleEdit}>
          <input
            placeholder="Nombre del servicio"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          {formError && <p className="text-sm text-rose-500">{formError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOpenEditServicio(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={openDeleteModal}
        onClose={() => {
          setOpenDeleteModal(false)
          setDeleteId(null)
          setDeleteMode('normal')
        }}
        onConfirm={
          deleteMode === 'normal'
            ? handleDelete
            : () => {
                setOpenDeleteModal(false)
                setDeleteMode('normal')
                setDeleteId(null)
              }
        }
        title={
          deleteMode === 'normal'
            ? '¿Eliminar Servicio?'
            : 'No se puede eliminar este servicio'
        }
        message={
          deleteMode === 'normal'
            ? 'Esta acción no se puede deshacer. El servicio será eliminado permanentemente.'
            : 'Este servicio tiene cuentas registradas y no se puede eliminar. Primero elimina o reasigna todas las cuentas asociadas.'
        }
        confirmText={deleteMode === 'normal' ? 'Eliminar' : 'Entendido'}
        type={deleteMode === 'normal' ? 'danger' : 'info'}
      />
    </div>
  )
}
