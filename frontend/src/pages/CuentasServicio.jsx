import { useEffect, useState } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { Plus, Edit2, Trash2, ArrowLeft, Calendar, Search } from 'lucide-react'
import { Modal } from '../components/common/Modal'
import { ConfirmModal } from '../components/common/ConfirmModal'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../hooks/useCurrency'
import { formatMoney } from '../lib/money'
import { formatDateDisplay, normalizeDateString } from '../lib/dateUtils'

function todayISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

export function CuentasServicio() {
  const { user } = useAuth()
  const currency = useCurrency()
  const { servicioId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const servicio = location.state?.servicio

  const [openNewCuenta, setOpenNewCuenta] = useState(false)
  const [openEditCuenta, setOpenEditCuenta] = useState(false)
  const [openDeleteModal, setOpenDeleteModal] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [deleteMode, setDeleteMode] = useState('normal') // 'normal' | 'blocked'
  const [cuentas, setCuentas] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('all') // all | activa | vendida | vencido
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)

  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [precioCompra, setPrecioCompra] = useState('')
  const [precioVenta, setPrecioVenta] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  // Estado para gestión de perfiles por cuenta
  const [openPerfilesModal, setOpenPerfilesModal] = useState(false)
  const [perfilesCuenta, setPerfilesCuenta] = useState(null)
  const [perfilesStep, setPerfilesStep] = useState('cantidad') // 'cantidad' | 'detalle' | 'tabla'
  const [perfilesCantidad, setPerfilesCantidad] = useState('')
  const [perfilesDraft, setPerfilesDraft] = useState([])
  const [perfiles, setPerfiles] = useState([])
  const [perfilesLoading, setPerfilesLoading] = useState(false)
  const [perfilesError, setPerfilesError] = useState(null)
  const [openEditPinModal, setOpenEditPinModal] = useState(false)
  const [perfilEditingPin, setPerfilEditingPin] = useState(null)
  const [nuevoNombrePerfil, setNuevoNombrePerfil] = useState('')
  const [nuevoPin, setNuevoPin] = useState('')
  const [editPinSaving, setEditPinSaving] = useState(false)
  const [openDeletePerfilModal, setOpenDeletePerfilModal] = useState(false)
  const [perfilDeleting, setPerfilDeleting] = useState(null)
  const [deletePerfilSaving, setDeletePerfilSaving] = useState(false)

  useEffect(() => {
    fetchCuentas()
    fetchProveedores()
  }, [servicioId])

  async function cleanupVentasVencidas() {
    // Antes se borraban ventas vencidas automáticamente.
    // Ahora NO se eliminan: deben pasar a "Reportes" para cambiar credenciales y luego liberar la cuenta.
    return
  }

  async function fetchProveedores() {
    const { data, error } = await supabase
      .from('proveedores')
      .select('id, usuario')
      .order('usuario', { ascending: true })

    if (!error) {
      setProveedores(data || [])
    }
  }

  async function fetchCuentas() {
    setLoading(true)
    setError(null)


    const { data, error } = await supabase
      .from('cuentas_servicios')
      .select(`
        id, 
        correo, 
        contrasena, 
        precio, 
        precio_compra,
        precio_venta,
        fecha_vencimiento,
        proveedor_id,
        proveedores (usuario)
      `)
      .eq('servicio_id', servicioId)
      .order('fecha_vencimiento', { ascending: true })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const cuentasData = data || []
    const ids = cuentasData.map((c) => c.id)

    let vendidas = []
    if (ids.length > 0) {
      const { data: ventasData, error: ventasError } = await supabase
        .from('ventas')
        .select('cuenta_servicio_id, liberada')
        .in('cuenta_servicio_id', ids)

      if (!ventasError) {
        vendidas = (ventasData || []).filter((v) => !v.liberada)
      }
    }

    const vendidasSet = new Set(vendidas.map((v) => v.cuenta_servicio_id))
    const cuentasConEstado = cuentasData.map((c) => ({ ...c, vendida: vendidasSet.has(c.id) }))

    setCuentas(cuentasConEstado)
    setLoading(false)
  }

  function getEstadoCuenta(fechaVencimiento, vendida) {
    // Estado de la CUENTA (inventario):
    // - Vendida: tiene una venta activa
    // - Vencido: la cuenta ya venció (fecha_vencimiento de la cuenta)
    // - Activa: se puede vender

    const norm = normalizeDateString(fechaVencimiento)
    let vencida = false

    if (norm) {
      const hoy = new Date()
      hoy.setHours(0, 0, 0, 0)
      const [y, m, d] = norm.split('-')
      const vencimiento = new Date(Number(y), Number(m) - 1, Number(d))
      vencimiento.setHours(0, 0, 0, 0)
      const diffDays = Math.ceil((vencimiento - hoy) / (1000 * 60 * 60 * 24))
      vencida = diffDays < 0
    }

    // Si está vendida pero ya venció con el proveedor, debe seguir diciendo "Vendida" pero en rojo
    // y debe entrar en el filtro "vencido".
    if (vendida && vencida) {
      return {
        key: 'vencido',
        label: 'Vendida',
        color: 'text-rose-700 bg-rose-100 border-rose-300',
      }
    }

    if (vendida) {
      return {
        key: 'vendida',
        label: 'Vendida',
        color: 'text-indigo-700 bg-indigo-100 border-indigo-300',
      }
    }

    if (vencida) {
      return {
        key: 'vencido',
        label: 'Vencido',
        color: 'text-rose-700 bg-rose-100 border-rose-300',
      }
    }

    return {
      key: 'activa',
      label: 'Activa',
      color: 'text-emerald-700 bg-emerald-100 border-emerald-300',
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)

    if (!correo.trim() || !contrasena.trim() || !precioCompra || !precioVenta || !proveedorId || !fechaInicio || !fechaVencimiento) {
      setFormError('Todos los campos son obligatorios')
      return
    }

    setSaving(true)
    const precioCompraNum = parseFloat(precioCompra)
    const precioVentaNum = parseFloat(precioVenta)
    const { data, error } = await supabase
      .from('cuentas_servicios')
      .insert({
        user_id: user.id,
        servicio_id: servicioId,
        correo: correo.trim(),
        contrasena: contrasena.trim(),
        precio: precioVentaNum, // compat con código existente
        precio_compra: precioCompraNum,
        precio_venta: precioVentaNum,
        proveedor_id: proveedorId,
        fecha_inicio: fechaInicio,
        fecha_vencimiento: fechaVencimiento
      })
      .select(`
        id, 
        correo, 
        contrasena, 
        precio, 
        precio_compra,
        precio_venta,
        fecha_vencimiento,
        proveedor_id,
        proveedores (usuario)
      `)
      .single()

    setSaving(false)

    if (error) {
      setFormError(error.message)
      return
    }

    setCuentas((prev) => [...prev, data])
    resetForm()
    setOpenNewCuenta(false)
  }

  async function handleEdit(e) {
    e.preventDefault()
    setFormError(null)

    if (!correo.trim() || !contrasena.trim() || !precioCompra || !precioVenta || !proveedorId || !fechaVencimiento) {
      setFormError('Todos los campos son obligatorios')
      return
    }

    setSaving(true)
    const precioCompraNum = parseFloat(precioCompra)
    const precioVentaNum = parseFloat(precioVenta)
    const { error } = await supabase
      .from('cuentas_servicios')
      .update({
        correo: correo.trim(),
        contrasena: contrasena.trim(),
        precio: precioVentaNum,
        precio_compra: precioCompraNum,
        precio_venta: precioVentaNum,
        proveedor_id: proveedorId,
        fecha_vencimiento: fechaVencimiento
      })
      .eq('id', editingId)

    setSaving(false)

    if (error) {
      setFormError(error.message)
      return
    }

    // Refrescar datos
    await fetchCuentas()
    resetForm()
    setEditingId(null)
    setOpenEditCuenta(false)
  }

  function openEditModal(cuenta) {
    setEditingId(cuenta.id)
    setCorreo(cuenta.correo)
    setContrasena(cuenta.contrasena)
    const compra = cuenta.precio_compra ?? cuenta.precio
    const venta = cuenta.precio_venta ?? cuenta.precio
    setPrecioCompra(compra != null ? compra.toString() : '')
    setPrecioVenta(venta != null ? venta.toString() : '')
    setProveedorId(cuenta.proveedor_id)
    setFechaVencimiento(cuenta.fecha_vencimiento)
    setOpenEditCuenta(true)
  }

  function confirmDelete(cuenta) {
    if (cuenta.vendida) {
      // Cuenta ya vendida: mostrar solo mensaje informativo, sin eliminar
      setDeleteId(null)
      setDeleteMode('blocked')
    } else {
      setDeleteId(cuenta.id)
      setDeleteMode('normal')
    }
    setOpenDeleteModal(true)
  }

  async function handleDelete() {
    if (!deleteId) return

    const { error } = await supabase.from('cuentas_servicios').delete().eq('id', deleteId)

    if (error) {
      setFormError('Error al eliminar: ' + error.message)
      return
    }

    setCuentas((prev) => prev.filter((c) => c.id !== deleteId))
    setOpenDeleteModal(false)
    setDeleteId(null)
  }

  function resetForm() {
    setCorreo('')
    setContrasena('')
    setPrecioCompra('')
    setPrecioVenta('')
    setProveedorId('')
    setFechaInicio('')
    setFechaVencimiento('')
    setFormError(null)
  }

  function resetPerfilesState() {
    setPerfilesCuenta(null)
    setPerfilesStep('cantidad')
    setPerfilesCantidad('')
    setPerfilesDraft([])
    setPerfiles([])
    setPerfilesLoading(false)
    setPerfilesError(null)
    setOpenEditPinModal(false)
    setPerfilEditingPin(null)
    setNuevoNombrePerfil('')
    setNuevoPin('')
    setEditPinSaving(false)
    setOpenDeletePerfilModal(false)
    setPerfilDeleting(null)
    setDeletePerfilSaving(false)
  }

  async function handleGestionarPerfiles(cuenta) {
    setPerfilesCuenta(cuenta)
    setPerfilesError(null)
    setPerfilesCantidad('')
    setPerfilesDraft([])
    setPerfiles([])
    setPerfilesLoading(true)

    const { data, error } = await supabase
      .from('perfiles_cuentas')
      .select('id, numero, nombre, tiene_pin, pin')
      .eq('cuenta_servicio_id', cuenta.id)
      .order('numero', { ascending: true })

    let perfilesConEstado = data || []

    if (!error && perfilesConEstado.length > 0) {
      const { data: ventasData, error: ventasError } = await supabase
        .from('ventas')
        .select('perfil_id')
        .eq('cuenta_servicio_id', cuenta.id)
        .not('perfil_id', 'is', null)

      let vendidosSet = new Set()
      if (!ventasError && ventasData) {
        vendidosSet = new Set(ventasData.map((v) => v.perfil_id))
      }

      perfilesConEstado = perfilesConEstado.map((p) => ({
        ...p,
        estado: vendidosSet.has(p.id) ? 'vendida' : 'libre',
      }))
    }

    setPerfilesLoading(false)

    if (error) {
      setPerfilesError(error.message)
      setPerfilesStep('cantidad')
    } else if (perfilesConEstado.length > 0) {
      setPerfiles(perfilesConEstado)
      setPerfilesStep('tabla')
    } else {
      setPerfilesStep('cantidad')
    }

    setOpenPerfilesModal(true)
  }

  function generarPerfilesDraft() {
    const n = Number(perfilesCantidad)
    if (!n || n < 1) {
      setPerfilesError('Ingresa una cantidad válida (al menos 1).')
      return
    }

    const draft = Array.from({ length: n }, (_, idx) => ({
      numero: idx + 1,
      nombre: '',
      tienePin: false,
      pin: '',
    }))

    setPerfilesDraft(draft)
    setPerfilesError(null)
    setPerfilesStep('detalle')
  }

  function updatePerfilDraft(index, changes) {
    setPerfilesDraft((prev) =>
      prev.map((p, idx) =>
        idx === index
          ? {
              ...p,
              ...changes,
              pin:
                changes.tienePin === false
                  ? ''
                  : changes.pin !== undefined
                  ? changes.pin
                  : p.pin,
            }
          : p
      )
    )
  }

  async function handleGuardarPerfiles(e) {
    e.preventDefault()
    if (!perfilesCuenta || perfilesDraft.length === 0) return

    setPerfilesError(null)
    setPerfilesLoading(true)

    const payload = perfilesDraft.map((p) => ({
      cuenta_servicio_id: perfilesCuenta.id,
      numero: p.numero,
      nombre: p.nombre && p.nombre.trim() ? p.nombre.trim() : null,
      tiene_pin: p.tienePin,
      pin: p.tienePin && p.pin.trim() ? p.pin.trim() : null,
    }))

    const payloadWithUser = payload.map((p) => ({ ...p, user_id: user.id }))

    const { data, error } = await supabase
      .from('perfiles_cuentas')
      .insert(payloadWithUser)
      .select('id, numero, nombre, tiene_pin, pin')
      .order('numero', { ascending: true })

    setPerfilesLoading(false)

    if (error) {
      setPerfilesError(error.message)
      return
    }

    const nuevos = (data || []).map((p) => ({ ...p, estado: 'libre' }))
    setPerfiles((prev) => [...prev, ...nuevos])
    setPerfilesDraft([])
    setPerfilesStep('tabla')
  }

  // Filtrar cuentas según búsqueda y estado
  const filteredCuentas = cuentas.filter((cuenta) => {
    const searchLower = searchTerm.toLowerCase()

    const matchesSearch =
      !searchLower ||
      cuenta.correo.toLowerCase().includes(searchLower) ||
      cuenta.proveedores?.usuario.toLowerCase().includes(searchLower) ||
      cuenta.contrasena.toLowerCase().includes(searchLower)

    const estadoObj = getEstadoCuenta(cuenta.fecha_vencimiento, cuenta.vendida)
    const estadoKey = estadoObj.key || estadoObj.label.toLowerCase() // activa | vendida | vencido

    const matchesEstado =
      estadoFilter === 'all' ||
      (estadoFilter === 'activa' && estadoKey === 'activa') ||
      (estadoFilter === 'vendida' && estadoKey === 'vendida') ||
      (estadoFilter === 'vencido' && estadoKey === 'vencido')

    return matchesSearch && matchesEstado
  })

  const totalItems = filteredCuentas.length
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage))
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedCuentas = filteredCuentas.slice(startIndex, startIndex + itemsPerPage)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  navigate('/', { state: { initialPage: 'servicios' } })
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
              >
                <ArrowLeft size={18} />
                Regresar
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
                    <span className="text-white font-bold text-lg">📺</span>
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900">{servicio?.nombre || 'Servicio'}</h1>
                    <p className="text-sm text-slate-500">Gestión de cuentas</p>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                resetForm()
                setFechaInicio(todayISO())
                setOpenNewCuenta(true)
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:from-blue-700 hover:to-blue-800 transition-all"
            >
              <Plus size={18} />
              Nuevo
            </button>
          </div>
        </div>

        {/* Filtros y controles */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600 font-medium">Mostrar</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value))
                  setCurrentPage(1)
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-sm text-slate-600">registros</span>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600 font-medium">Buscar:</span>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="Correo, proveedor..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value)
                      setCurrentPage(1)
                    }}
                    className="pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 w-64"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600 font-medium">Estado:</span>
                <select
                  value={estadoFilter}
                  onChange={(e) => {
                    setEstadoFilter(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="all">Todas</option>
                  <option value="activa">Activas</option>
                  <option value="vendida">Vendidas</option>
                  <option value="vencido">Vencidas</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700">
              <tr>
                <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">#</th>
                <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">Correo</th>
                <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">Contraseña</th>
                <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">Precio Compra</th>
                <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">Precio Venta</th>
                <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">Proveedor</th>
                <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">Fecha Vencimiento</th>
                <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">Estado</th>
                <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">Perfiles</th>
                <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">Acciones</th>
              </tr>
            </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center">
                  <div className="flex items-center justify-center gap-2 text-slate-500">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    <span>Cargando cuentas...</span>
                  </div>
                </td>
              </tr>
            )}

            {!loading && error && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-sm text-rose-600">
                  Error al cargar cuentas: {error}
                </td>
              </tr>
            )}

            {!loading && !error && filteredCuentas.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center">
                  <div className="text-slate-400">
                    {searchTerm ? '🔍 No se encontraron resultados' : '📝 Aún no hay cuentas registradas'}
                  </div>
                </td>
              </tr>
            )}

            {!loading &&
              !error &&
              paginatedCuentas.map((cuenta, index) => {
                const estado = getEstadoCuenta(cuenta.fecha_vencimiento, cuenta.vendida)
                const precioCompra = cuenta.precio_compra ?? cuenta.precio
                const precioVenta = cuenta.precio_venta ?? cuenta.precio
                return (
                  <tr key={cuenta.id} className="border-t border-slate-100 hover:bg-gradient-to-r hover:from-blue-50 hover:to-slate-50 transition-all">
                    <td className="px-4 py-4 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs">
                        {startIndex + index + 1}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-start gap-2">
                        <span
                          className="font-mono text-xs text-slate-900 break-all leading-4 max-w-[260px]"
                          title={cuenta.correo}
                        >
                          {cuenta.correo}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <code className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 font-mono text-xs border border-slate-200">
                        {cuenta.contrasena}
                      </code>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="inline-flex items-center justify-center px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-sm border border-emerald-200">
                        {formatMoney(precioCompra, currency, { maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="inline-flex items-center justify-center px-3 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold text-sm border border-blue-200">
                        {formatMoney(precioVenta, currency, { maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                          {cuenta.proveedores?.usuario?.charAt(0).toUpperCase() || 'P'}
                        </div>
                        <span className="text-slate-700 font-medium">{cuenta.proveedores?.usuario || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-slate-700 font-medium">
                        {formatDateDisplay(cuenta.fecha_vencimiento)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border-2 ${estado.color}`}>
                        {estado.label === 'Vencido' && '🔴'}
                        {estado.label === 'Por Vencer' && '🟡'}
                        {estado.label === 'Activa' && '🟢'}
                        {estado.label === 'Vendida' && '📦'}
                        {estado.label.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={() => handleGestionarPerfiles(cuenta)}
                        className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200 hover:bg-blue-100 transition-colors"
                      >
                        GESTIONAR PERFILES
                      </button>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEditModal(cuenta)}
                          className="p-2 rounded-lg bg-cyan-500 text-white hover:bg-cyan-600 transition-colors shadow-sm"
                          title="Editar"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => confirmDelete(cuenta)}
                          className="p-2 rounded-lg bg-rose-500 text-white hover:bg-rose-600 transition-colors shadow-sm"
                          title="Eliminar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
          </tbody>
          </table>

          {!loading && !error && totalItems > 0 && (
            <div className="flex flex-col md:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-gradient-to-r from-slate-50 via-blue-50/40 to-slate-50">
              <p className="text-xs text-slate-600">
                Mostrando{' '}
                <span className="font-semibold text-slate-800">
                  {startIndex + 1}–{Math.min(startIndex + itemsPerPage, totalItems)}
                </span>{' '}
                de{' '}
                <span className="font-semibold text-slate-800">{totalItems}</span> cuentas
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  ‹ Anterior
                </button>
                <span className="text-xs font-medium text-slate-700 bg-slate-800 text-white px-3 py-1.5 rounded-full shadow-sm">
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="inline-flex items-center gap-1.5 rounded-full border border-blue-500 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Siguiente ›
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Nuevo */}
      <Modal open={openNewCuenta} title="Nueva Cuenta" onClose={() => { setOpenNewCuenta(false); resetForm(); }}>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <input
              type="email"
              placeholder="Correo electrónico"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Contraseña"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Precio de compra"
              value={precioCompra}
              onChange={(e) => setPrecioCompra(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Precio de venta"
              value={precioVenta}
              onChange={(e) => setPrecioVenta(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <select
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Selecciona proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.usuario}
                </option>
              ))}
            </select>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <Calendar className="inline mr-1.5" size={14} />
                Fecha de Inicio
              </label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Por defecto es hoy, pero puedes cambiarla.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <Calendar className="inline mr-1.5" size={14} />
                Fecha de Vencimiento
              </label>
              <input
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {formError && <p className="text-sm text-rose-500">{formError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setOpenNewCuenta(false); resetForm(); }}
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

      {/* Modal gestionar perfiles */}
      <Modal
        open={openPerfilesModal}
        title={
          perfilesCuenta
            ? `Perfiles de la cuenta ${perfilesCuenta.correo}`
            : 'Perfiles de la cuenta'
        }
        maxWidthClass="max-w-3xl"
        onClose={() => {
          setOpenPerfilesModal(false)
          resetPerfilesState()
        }}
      >
        {perfilesLoading && (
          <p className="text-sm text-slate-500 mb-3">Cargando perfiles...</p>
        )}

        {!perfilesLoading && perfilesStep === 'cantidad' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Define cuántos perfiles tendrá esta cuenta. Luego podrás indicar si cada
              perfil tiene PIN y cuál es.
            </p>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-slate-700">Cantidad de perfiles:</label>
              <input
                type="number"
                min={1}
                max={10}
                value={perfilesCantidad}
                onChange={(e) => setPerfilesCantidad(e.target.value)}
                className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {perfilesError && (
              <p className="text-sm text-rose-500">{perfilesError}</p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setOpenPerfilesModal(false)
                  resetPerfilesState()
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={generarPerfilesDraft}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {!perfilesLoading && perfilesStep === 'detalle' && (
          <form className="space-y-4" onSubmit={handleGuardarPerfiles}>
            <p className="text-sm text-slate-600">
              Configura si cada perfil tendrá PIN. Si marcas el check verde, podrás escribir
              el PIN correspondiente.
            </p>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-800 text-white">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide">#</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide">Nombre del perfil</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide">¿Tiene PIN?</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide">PIN</th>
                  </tr>
                </thead>
                <tbody>
                  {perfilesDraft.map((perfil, index) => (
                    <tr key={perfil.numero} className="border-t border-slate-100">
                      <td className="px-4 py-2 text-slate-800 font-medium">Perfil {perfil.numero}</td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          placeholder={`Ej: Perfil ${perfil.numero}`}
                          value={perfil.nombre || ''}
                          onChange={(e) =>
                            updatePerfilDraft(index, { nombre: e.target.value })
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updatePerfilDraft(index, { tienePin: true })}
                            className={`px-2 py-1 rounded-md text-xs font-semibold border flex items-center gap-1 ${
                              perfil.tienePin
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            }`}
                          >
                            ✓ PIN
                          </button>
                          <button
                            type="button"
                            onClick={() => updatePerfilDraft(index, { tienePin: false })}
                            className={`px-2 py-1 rounded-md text-xs font-semibold border flex items-center gap-1 ${
                              !perfil.tienePin
                                ? 'bg-rose-600 text-white border-rose-600'
                                : 'bg-rose-50 text-rose-700 border-rose-300'
                            }`}
                          >
                            ✕ Sin PIN
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          placeholder="PIN (opcional)"
                          value={perfil.pin}
                          disabled={!perfil.tienePin}
                          onChange={(e) => updatePerfilDraft(index, { pin: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {perfilesError && (
              <p className="text-sm text-rose-500">{perfilesError}</p>
            )}

            <div className="flex justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPerfilesStep('cantidad')
                  setPerfilesDraft([])
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Regresar
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setOpenPerfilesModal(false)
                    resetPerfilesState()
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={perfilesLoading}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {perfilesLoading ? 'Guardando...' : 'Guardar perfiles'}
                </button>
              </div>
            </div>
          </form>
        )}

        {!perfilesLoading && perfilesStep === 'tabla' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-1">
              <div>
                <p className="text-sm font-semibold text-slate-800">Perfiles configurados</p>
                <p className="text-xs text-slate-500">
                  Esta cuenta tiene {perfiles.length} perfil(es) registrados.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  // Añadir un solo perfil nuevo, continuando la numeración existente
                  const maxNumero = perfiles.length > 0 ? Math.max(...perfiles.map((p) => p.numero)) : 0
                  const nextNumero = maxNumero + 1
                  setPerfilesDraft([
                    {
                      numero: nextNumero,
                      tienePin: false,
                      pin: '',
                    },
                  ])
                  setPerfilesError(null)
                  setPerfilesStep('detalle')
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-500"
              >
                + Añadir más perfiles
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 text-white">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide">Perfil</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide">Nombre</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide">Tiene PIN</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide">PIN</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide">Estado</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {perfiles.map((perfil) => {
                    const nombreMostrar = perfil.nombre || `Perfil ${perfil.numero}`
                    return (
                      <tr key={perfil.id} className="border-t border-slate-100">
                        <td className="px-4 py-2 text-slate-800 font-medium">{nombreMostrar}</td>
                        <td className="px-4 py-2 text-slate-700 text-xs">Perfil {perfil.numero}</td>
                        <td className="px-4 py-2 text-center">
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border-2 ${
                              perfil.tiene_pin
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                : 'bg-slate-50 text-slate-500 border-slate-200'
                            }`}
                          >
                            {perfil.tiene_pin ? 'CON PIN' : 'SIN PIN'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-slate-800 font-mono text-xs">
                          {perfil.tiene_pin && perfil.pin ? perfil.pin : '—'}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border-2 ${
                              perfil.estado === 'vendida'
                                ? 'bg-rose-50 text-rose-700 border-rose-300'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            }`}
                          >
                            {perfil.estado === 'vendida' ? 'VENDIDA' : 'LIBRE'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setPerfilEditingPin(perfil)
                                setNuevoNombrePerfil(perfil.nombre || '')
                                setNuevoPin(perfil.pin || '')
                                setPerfilesError(null)
                                setOpenEditPinModal(true)
                              }}
                              className="px-2 py-1 rounded-md bg-cyan-600 text-white text-xs font-semibold hover:bg-cyan-500"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              disabled={perfil.estado === 'vendida'}
                              onClick={() => {
                                if (perfil.estado === 'vendida') return
                                setPerfilDeleting(perfil)
                                setPerfilesError(null)
                                setOpenDeletePerfilModal(true)
                              }}
                              className={`px-2 py-1 rounded-md text-xs font-semibold border flex items-center gap-1 ${
                                perfil.estado === 'vendida'
                                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                  : 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                              }`}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {perfilesError && (
              <p className="text-sm text-rose-500">{perfilesError}</p>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setOpenPerfilesModal(false)
                  resetPerfilesState()
                }}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal editar datos de perfil */}
      <Modal
        open={openEditPinModal}
        title={(() => {
          if (!perfilEditingPin) return 'Editar perfil'
          const base = perfilEditingPin.nombre || `Perfil ${perfilEditingPin.numero}`
          return `Editar perfil - ${base}`
        })()}
        onClose={() => {
          setOpenEditPinModal(false)
          setPerfilEditingPin(null)
          setNuevoNombrePerfil('')
          setNuevoPin('')
          setEditPinSaving(false)
        }}
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!perfilEditingPin) return

            const nombreTrim = nuevoNombrePerfil.trim()
            const trimmedPin = nuevoPin.trim()
            const tienePin = trimmedPin !== ''

            setEditPinSaving(true)
            const { error } = await supabase
              .from('perfiles_cuentas')
              .update({
                nombre: nombreTrim || null,
                tiene_pin: tienePin,
                pin: tienePin ? trimmedPin : null,
              })
              .eq('id', perfilEditingPin.id)

            setEditPinSaving(false)

            if (error) {
              setPerfilesError(error.message)
              return
            }

            setPerfiles((prev) =>
              prev.map((p) =>
                p.id === perfilEditingPin.id
                  ? {
                      ...p,
                      nombre: nombreTrim || null,
                      tiene_pin: tienePin,
                      pin: tienePin ? trimmedPin : null,
                    }
                  : p
              )
            )

            setOpenEditPinModal(false)
            setPerfilEditingPin(null)
            setNuevoNombrePerfil('')
            setNuevoPin('')
          }}
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm text-slate-600">Nombre del perfil</p>
              <input
                type="text"
                placeholder={
                  perfilEditingPin ? `Ej: Perfil ${perfilEditingPin.numero}` : 'Nombre del perfil'
                }
                value={nuevoNombrePerfil}
                onChange={(e) => setNuevoNombrePerfil(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-slate-600">
                PIN del perfil (opcional). Deja vacío si quieres que este perfil no tenga PIN
                configurado.
              </p>
              <input
                type="text"
                placeholder="PIN (opcional)"
                value={nuevoPin}
                onChange={(e) => setNuevoPin(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setOpenEditPinModal(false)
                setPerfilEditingPin(null)
                setNuevoNombrePerfil('')
                setNuevoPin('')
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={editPinSaving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {editPinSaving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal eliminar perfil */}
      <ConfirmModal
        open={openDeletePerfilModal}
        onClose={() => {
          setOpenDeletePerfilModal(false)
          setPerfilDeleting(null)
          setDeletePerfilSaving(false)
        }}
        onConfirm={async () => {
          if (!perfilDeleting || perfilDeleting.estado === 'vendida') {
            setOpenDeletePerfilModal(false)
            setPerfilDeleting(null)
            return
          }

          setDeletePerfilSaving(true)
          const { error } = await supabase
            .from('perfiles_cuentas')
            .delete()
            .eq('id', perfilDeleting.id)

          setDeletePerfilSaving(false)

          if (error) {
            setPerfilesError(error.message)
            return
          }

          setPerfiles((prev) => prev.filter((p) => p.id !== perfilDeleting.id))
          setOpenDeletePerfilModal(false)
          setPerfilDeleting(null)
        }}
        title="¿Eliminar Perfil?"
        message="Esta acción no se puede deshacer. El perfil será eliminado permanentemente."
        confirmText={deletePerfilSaving ? 'Eliminando...' : 'Eliminar'}
        type="danger"
      />

      {/* Modal Editar */}
      <Modal open={openEditCuenta} title="Editar Cuenta" onClose={() => { setOpenEditCuenta(false); resetForm(); }}>
        <form className="space-y-4" onSubmit={handleEdit}>
          <div className="grid gap-4 md:grid-cols-2">
            <input
              type="email"
              placeholder="Correo electrónico"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Contraseña"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Precio de compra (lo que pagas)"
              value={precioCompra}
              onChange={(e) => setPrecioCompra(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Precio de venta (a tus clientes)"
              value={precioVenta}
              onChange={(e) => setPrecioVenta(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <select
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Selecciona proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.usuario}
                </option>
              ))}
            </select>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <Calendar className="inline mr-1.5" size={14} />
                Fecha de Vencimiento
              </label>
              <input
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {formError && <p className="text-sm text-rose-500">{formError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setOpenEditCuenta(false); resetForm(); }}
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

      {/* Modal de Confirmación de Eliminación */}
      <ConfirmModal
        open={openDeleteModal}
        onClose={() => {
          setOpenDeleteModal(false)
          setDeleteId(null)
          setDeleteMode('normal')
        }}
        onConfirm={deleteMode === 'normal' ? handleDelete : () => {
          setOpenDeleteModal(false)
          setDeleteMode('normal')
        }}
        title={
          deleteMode === 'normal'
            ? '¿Eliminar Cuenta?'
            : 'No se puede eliminar esta cuenta'
        }
        message={
          deleteMode === 'normal'
            ? 'Esta acción no se puede deshacer. La cuenta será eliminada permanentemente.'
            : 'Esta cuenta ya ha sido vendida y no se puede eliminar.'
        }
        confirmText={deleteMode === 'normal' ? 'Eliminar' : 'Entendido'}
        type={deleteMode === 'normal' ? 'danger' : 'info'}
      />
    </div>
  )
}
