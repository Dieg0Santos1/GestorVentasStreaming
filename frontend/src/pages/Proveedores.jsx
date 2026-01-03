import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../components/common/Modal'
import { ConfirmModal } from '../components/common/ConfirmModal'
import { supabase } from '../lib/supabaseClient'
import { Plus, Edit2, Trash2, Settings } from 'lucide-react'
import { capitalize } from '../lib/textUtils'
import { useAuth } from '../context/AuthContext'

export function Proveedores() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [openNewProveedor, setOpenNewProveedor] = useState(false)
  const [openEditProveedor, setOpenEditProveedor] = useState(false)
  const [openDeleteModal, setOpenDeleteModal] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [deleteMode, setDeleteMode] = useState('normal') // 'normal' | 'blocked'
  const [proveedores, setProveedores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [usuario, setUsuario] = useState('')
  const [telefono, setTelefono] = useState('')
  const [correo, setCorreo] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  useEffect(() => {
    async function fetchProveedores() {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('proveedores')
        .select('id, usuario, telefono, correo, creado_en')
        .order('creado_en', { ascending: false })

      if (error) {
        setError(error.message)
      } else {
        setProveedores(data || [])
      }

      setLoading(false)
    }

    fetchProveedores()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)

    if (!usuario.trim()) {
      setFormError('El usuario es obligatorio')
      return
    }

    setSaving(true)
    const { data, error } = await supabase
      .from('proveedores')
      .insert({ 
        user_id: user.id,
        usuario: capitalize(usuario.trim()), 
        telefono: telefono.trim() || null,
        correo: correo.trim() || null,
      })
      .select('id, usuario, telefono, correo, creado_en')
      .single()

    setSaving(false)

    if (error) {
      setFormError(error.message)
      return
    }

    setProveedores((prev) => [data, ...prev])
    setUsuario('')
    setTelefono('')
    setCorreo('')
    setOpenNewProveedor(false)
  }

  async function handleEdit(e) {
    e.preventDefault()
    setFormError(null)

    if (!usuario.trim()) {
      setFormError('El usuario es obligatorio')
      return
    }

    setSaving(true)
    const { error } = await supabase
      .from('proveedores')
      .update({ 
        usuario: capitalize(usuario.trim()), 
        telefono: telefono.trim() || null,
        correo: correo.trim() || null,
      })
      .eq('id', editingId)

    setSaving(false)

    if (error) {
      setFormError(error.message)
      return
    }

    setProveedores((prev) =>
      prev.map((p) => 
        p.id === editingId 
          ? { 
              ...p, 
              usuario: capitalize(usuario.trim()), 
              telefono: telefono.trim() || null,
              correo: correo.trim() || null,
            } 
          : p
      )
    )
    setUsuario('')
    setTelefono('')
    setCorreo('')
    setEditingId(null)
    setOpenEditProveedor(false)
  }

  function openEditModal(proveedor) {
    setEditingId(proveedor.id)
    setUsuario(proveedor.usuario)
    setTelefono(proveedor.telefono || '')
    setCorreo(proveedor.correo || '')
    setOpenEditProveedor(true)
  }

  function confirmDelete(id) {
    setDeleteId(id)
    setDeleteMode('normal')
    setOpenDeleteModal(true)
  }

  function handleGestionarCuentas(proveedor) {
    navigate(`/proveedores/${proveedor.id}/cuentas`, { state: { proveedor } })
  }

  async function handleDelete() {
    if (!deleteId) return

    // Verificar si el proveedor tiene cuentas asociadas
    const { count, error: cuentasError } = await supabase
      .from('cuentas_servicios')
      .select('id', { count: 'exact', head: true })
      .eq('proveedor_id', deleteId)

    if (!cuentasError && (count || 0) > 0) {
      const msg = 'No se puede eliminar este proveedor porque tiene cuentas registradas. Primero elimina o reasigna todas las cuentas de este proveedor.'
      setFormError(msg)
      setDeleteMode('blocked')
      return
    }

    const { error } = await supabase.from('proveedores').delete().eq('id', deleteId)

    if (error) {
      setFormError('Error al eliminar: ' + error.message)
      setOpenDeleteModal(false)
      setDeleteMode('normal')
      setDeleteId(null)
      return
    }

    setProveedores((prev) => prev.filter((p) => p.id !== deleteId))
    setOpenDeleteModal(false)
    setDeleteId(null)
    setDeleteMode('normal')
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Proveedores</h2>
        <button
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition-colors"
          onClick={() => setOpenNewProveedor(true)}
        >
          <Plus size={18} />
          Nuevo Proveedor
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-md">
        <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700">
            <tr>
              <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">#</th>
              <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">Usuario</th>
              <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">Teléfono</th>
              <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">Correo</th>
              <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">Gestionar Cuentas</th>
              <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center">
                  <div className="flex items-center justify-center gap-2 text-slate-500">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    <span>Cargando proveedores...</span>
                  </div>
                </td>
              </tr>
            )}

            {!loading && error && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-rose-600">
                  Error al cargar proveedores: {error}
                </td>
              </tr>
            )}

            {!loading && !error && proveedores.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center">
                  <div className="text-slate-400">📝 Aún no hay proveedores registrados.</div>
                </td>
              </tr>
            )}

            {!loading && !error &&
              proveedores.map((proveedor, index) => (
                <tr key={proveedor.id} className="border-t border-slate-100 hover:bg-gradient-to-r hover:from-purple-50 hover:to-slate-50 transition-all">
                  <td className="px-4 py-4 text-center">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs">
                      {index + 1}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                        {proveedor.usuario.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-slate-900 font-medium">{proveedor.usuario}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{proveedor.telefono || '—'}</td>
                  <td className="px-4 py-4 text-slate-600">{proveedor.correo || '—'}</td>
                  <td className="px-4 py-4 text-center">
                    <button
                      onClick={() => handleGestionarCuentas(proveedor)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/70 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100 transition-all shadow-sm"
                    >
                      Gestionar Cuentas
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={() => openEditModal(proveedor)}
                        className="p-2 rounded-lg bg-cyan-500 text-white hover:bg-cyan-600 transition-colors shadow-sm"
                        title="Editar"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => confirmDelete(proveedor.id)}
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

      <Modal open={openNewProveedor} title="Nuevo Proveedor" onClose={() => setOpenNewProveedor(false)}>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <input
              placeholder="Usuario"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              placeholder="Teléfono"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="email"
              placeholder="Correo (opcional)"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 md:col-span-2"
            />
          </div>

          {formError && (
            <p className="text-sm text-rose-500">{formError}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOpenNewProveedor(false)}
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

      <Modal open={openEditProveedor} title="Editar Proveedor" onClose={() => setOpenEditProveedor(false)}>
        <form className="space-y-4" onSubmit={handleEdit}>
          <div className="grid gap-4 md:grid-cols-2">
            <input
              placeholder="Usuario"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              placeholder="Teléfono"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="email"
              placeholder="Correo (opcional)"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 md:col-span-2"
            />
          </div>

          {formError && (
            <p className="text-sm text-rose-500">{formError}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOpenEditProveedor(false)}
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
            ? '¿Eliminar Proveedor?'
            : 'No se puede eliminar este proveedor'
        }
        message={
          deleteMode === 'normal'
            ? 'Esta acción no se puede deshacer. El proveedor será eliminado permanentemente.'
            : 'Este proveedor tiene cuentas registradas y no se puede eliminar. Primero elimina o reasigna todas las cuentas asociadas.'
        }
        confirmText={deleteMode === 'normal' ? 'Eliminar' : 'Entendido'}
        type={deleteMode === 'normal' ? 'danger' : 'info'}
      />
    </div>
  )
}
