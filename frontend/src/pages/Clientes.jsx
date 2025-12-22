import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../components/common/Modal'
import { ConfirmModal } from '../components/common/ConfirmModal'
import { supabase } from '../lib/supabaseClient'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import { capitalize } from '../lib/textUtils'
import { validateWhatsAppPhone } from '../lib/whatsapp'
import { useAuth } from '../context/AuthContext'

export function Clientes() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [openNewCliente, setOpenNewCliente] = useState(false)
  const [openEditCliente, setOpenEditCliente] = useState(false)
  const [openDeleteModal, setOpenDeleteModal] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [telefono, setTelefono] = useState('')
  const [correo, setCorreo] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  useEffect(() => {
    async function fetchClientes() {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre, apellido, telefono, correo, creado_en')
        .order('creado_en', { ascending: false })

      if (error) {
        setError(error.message)
      } else {
        setClientes(data || [])
      }

      setLoading(false)
    }

    fetchClientes()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)

    if (!nombre.trim() || !apellido.trim()) {
      setFormError('Nombre y apellido son obligatorios')
      return
    }

    if (telefono.trim()) {
      const v = validateWhatsAppPhone(telefono)
      if (!v.ok) {
        setFormError(v.message)
        return
      }
    }

    setSaving(true)
    const { data, error } = await supabase
      .from('clientes')
      .insert({ 
        user_id: user.id,
        nombre: capitalize(nombre.trim()), 
        apellido: capitalize(apellido.trim()), 
        telefono: telefono.trim() || null,
        correo: correo.trim() || null,
      })
      .select('id, nombre, apellido, telefono, correo, creado_en')
      .single()

    setSaving(false)

    if (error) {
      setFormError(error.message)
      return
    }

    setClientes((prev) => [data, ...prev])
    setNombre('')
    setApellido('')
    setTelefono('')
    setCorreo('')
    setOpenNewCliente(false)
  }

  async function handleEdit(e) {
    e.preventDefault()
    setFormError(null)

    if (!nombre.trim() || !apellido.trim()) {
      setFormError('Nombre y apellido son obligatorios')
      return
    }

    if (telefono.trim()) {
      const v = validateWhatsAppPhone(telefono)
      if (!v.ok) {
        setFormError(v.message)
        return
      }
    }

    setSaving(true)
    const { error } = await supabase
      .from('clientes')
      .update({ 
        nombre: capitalize(nombre.trim()), 
        apellido: capitalize(apellido.trim()), 
        telefono: telefono.trim() || null,
        correo: correo.trim() || null,
      })
      .eq('id', editingId)

    setSaving(false)

    if (error) {
      setFormError(error.message)
      return
    }

    setClientes((prev) =>
      prev.map((c) => 
        c.id === editingId 
          ? { 
              ...c,
              nombre: capitalize(nombre.trim()),
              apellido: capitalize(apellido.trim()),
              telefono: telefono.trim() || null,
              correo: correo.trim() || null,
            } 
          : c
      )
    )
    setNombre('')
    setApellido('')
    setTelefono('')
    setCorreo('')
    setEditingId(null)
    setOpenEditCliente(false)
  }

  function openEditModal(cliente) {
    setEditingId(cliente.id)
    setNombre(cliente.nombre)
    setApellido(cliente.apellido)
    setTelefono(cliente.telefono || '')
    setCorreo(cliente.correo || '')
    setOpenEditCliente(true)
  }

  function confirmDelete(id) {
    setDeleteId(id)
    setOpenDeleteModal(true)
  }

  function handleGestionarVentas(cliente) {
    navigate(`/clientes/${cliente.id}/ventas`, { state: { cliente } })
  }

  async function handleDelete() {
    if (!deleteId) return

    const { error } = await supabase.from('clientes').delete().eq('id', deleteId)

    if (error) {
      setFormError('Error al eliminar: ' + error.message)
      setOpenDeleteModal(false)
      return
    }

    setClientes((prev) => prev.filter((c) => c.id !== deleteId))
    setOpenDeleteModal(false)
    setDeleteId(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Clientes</h2>
        <button
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition-colors"
          onClick={() => setOpenNewCliente(true)}
        >
          <Plus size={18} />
          Nuevo Cliente
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700">
            <tr>
              <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">#</th>
              <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">Nombre</th>
              <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">Apellido</th>
              <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">Teléfono</th>
              <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">Correo</th>
              <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">Ventas</th>
              <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                  Cargando clientes...
                </td>
              </tr>
            )}

            {!loading && error && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-rose-500">
                  Error al cargar clientes: {error}
                </td>
              </tr>
            )}

            {!loading && !error && clientes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                  Aún no hay clientes registrados.
                </td>
              </tr>
            )}

            {!loading && !error &&
              clientes.map((cliente, index) => (
                <tr key={cliente.id} className="border-t border-slate-100 hover:bg-gradient-to-r hover:from-blue-50 hover:to-slate-50 transition-all">
                  <td className="px-4 py-4 text-center">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs">
                      {index + 1}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                        {cliente.nombre.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-slate-900 font-medium">{cliente.nombre}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-900 font-medium">{cliente.apellido}</td>
                  <td className="px-4 py-4 text-slate-600">{cliente.telefono || '—'}</td>
                  <td className="px-4 py-4 text-slate-600">{cliente.correo || '—'}</td>
                  <td className="px-4 py-4 text-center">
                    <button
                      onClick={() => handleGestionarVentas(cliente)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/70 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100 transition-all shadow-sm"
                    >
                      Gestionar Ventas
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={() => openEditModal(cliente)}
                        className="p-2 rounded-lg bg-cyan-500 text-white hover:bg-cyan-600 transition-colors shadow-sm"
                        title="Editar"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => confirmDelete(cliente.id)}
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

      <Modal open={openNewCliente} title="Nuevo Cliente" onClose={() => setOpenNewCliente(false)}>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <input
              placeholder="Nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              placeholder="Apellido"
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="space-y-1">
              <input
                placeholder="Teléfono (formato internacional)"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-[11px] text-slate-500">
                Usa código de país. Ej: +51987654321, 51987654321
              </p>
            </div>
            <input
              type="email"
              placeholder="Correo"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {formError && (
            <p className="text-sm text-rose-500">{formError}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOpenNewCliente(false)}
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

      <Modal open={openEditCliente} title="Editar Cliente" onClose={() => setOpenEditCliente(false)}>
        <form className="space-y-4" onSubmit={handleEdit}>
          <div className="grid gap-4 md:grid-cols-2">
            <input
              placeholder="Nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              placeholder="Apellido"
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="space-y-1">
              <input
                placeholder="Teléfono (formato internacional)"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-[11px] text-slate-500">
                Usa código de país. Ej: +5491112345678, +34600111222, +51999999999
              </p>
            </div>
            <input
              type="email"
              placeholder="Correo (opcional)"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {formError && (
            <p className="text-sm text-rose-500">{formError}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOpenEditCliente(false)}
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
        onClose={() => { setOpenDeleteModal(false); setDeleteId(null); }}
        onConfirm={handleDelete}
        title="¿Eliminar Cliente?"
        message="Esta acción no se puede deshacer. El cliente será eliminado permanentemente."
        confirmText="Eliminar"
        type="danger"
      />
    </div>
  )
}
