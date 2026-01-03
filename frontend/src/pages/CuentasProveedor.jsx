import { useEffect, useMemo, useState } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { Plus, Edit2, Trash2, ArrowLeft, Search, RefreshCw } from 'lucide-react'
import { Modal } from '../components/common/Modal'
import { ConfirmModal } from '../components/common/ConfirmModal'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import * as XLSX from 'xlsx'
import { useCurrency } from '../hooks/useCurrency'
import { formatMoney } from '../lib/money'
import { formatDateDisplay, normalizeDateString } from '../lib/dateUtils'

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

export function CuentasProveedor() {
  const { user } = useAuth()
  const currency = useCurrency()
  const { proveedorId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const proveedor = location.state?.proveedor

  const [openNewCuenta, setOpenNewCuenta] = useState(false)
  const [openEditCuenta, setOpenEditCuenta] = useState(false)
  const [openDeleteModal, setOpenDeleteModal] = useState(false)
  const [openImportExportModal, setOpenImportExportModal] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [deleteMode, setDeleteMode] = useState('normal') // 'normal' | 'blocked'

  const [cuentas, setCuentas] = useState([])
  const [servicios, setServicios] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('all') // all | activa | vendida | vencido
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [fechaSort, setFechaSort] = useState(null) // null | 'asc' | 'desc'

  const [servicioId, setServicioId] = useState('')
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [precioCompra, setPrecioCompra] = useState('')
  const [precioVenta, setPrecioVenta] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [vencimientoIndefinido, setVencimientoIndefinido] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  // Renovación con proveedor (gastos_cuentas)
  const [openRenovacionModal, setOpenRenovacionModal] = useState(false)
  const [cuentaRenovando, setCuentaRenovando] = useState(null)
  const [mesesRenovacion, setMesesRenovacion] = useState(1)
  const [fechaManualRenovacion, setFechaManualRenovacion] = useState('')
  const [montoRenovacion, setMontoRenovacion] = useState('')
  const [savingRenovacion, setSavingRenovacion] = useState(false)
  const [renovacionError, setRenovacionError] = useState(null)

  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState(null)
  const [importFileName, setImportFileName] = useState('')

  useEffect(() => {
    fetchServicios()
    fetchCuentas()
  }, [proveedorId, user?.id])

  async function fetchServicios() {
    const { data, error } = await supabase
      .from('servicios')
      .select('id, nombre')
      .eq('user_id', user.id)
      .order('nombre', { ascending: true })

    if (!error) {
      setServicios(data || [])
    }
  }

  async function fetchCuentas() {
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('cuentas_servicios')
      .select(`
        id,
        servicio_id,
        correo,
        contrasena,
        precio,
        precio_compra,
        precio_venta,
        fecha_inicio,
        fecha_vencimiento,
        servicios (id, nombre)
      `)
      .eq('proveedor_id', proveedorId)
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

  function resetForm() {
    setServicioId('')
    setCorreo('')
    setContrasena('')
    setPrecioCompra('')
    setPrecioVenta('')
    setFechaInicio('')
    setFechaVencimiento('')
    setVencimientoIndefinido(false)
    setFormError(null)
    setEditingId(null)
  }

  function todayISO() {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.toISOString().slice(0, 10)
  }

  function openRenovacionModalCuenta(cuenta) {
    if (!cuenta) return

    setCuentaRenovando(cuenta)

    const baseMonto =
      Number(
        cuenta.precio_compra != null
          ? cuenta.precio_compra
          : cuenta.precio_venta != null
          ? cuenta.precio_venta
          : cuenta.precio || 0
      ) || 0

    setMesesRenovacion(1)
    setMontoRenovacion(baseMonto ? baseMonto.toFixed(2) : '')
    setFechaManualRenovacion('')
    setRenovacionError(null)
    setOpenRenovacionModal(true)
  }

  async function handleRenovacionCuentaSubmit(e) {
    e.preventDefault()
    setRenovacionError(null)
    if (!cuentaRenovando) return

    const meses = Number(mesesRenovacion) || 1
    const monto = parseFloat(montoRenovacion)
    if (!monto || monto <= 0) {
      setRenovacionError('El monto de la renovación debe ser mayor a 0')
      return
    }

    const baseFecha =
      normalizeDateString(cuentaRenovando.fecha_vencimiento) || todayISO()

    const fechaVencimientoRenov =
      fechaManualRenovacion || addMonths(baseFecha, meses)

    setSavingRenovacion(true)

    const { error } = await supabase
      .from('cuentas_servicios')
      .update({
        fecha_vencimiento: fechaVencimientoRenov,
      })
      .eq('id', cuentaRenovando.id)

    setSavingRenovacion(false)

    if (error) {
      setRenovacionError(error.message)
      return
    }

    try {
      await supabase.from('gastos_cuentas').insert({
        user_id: user.id,
        cuenta_servicio_id: cuentaRenovando.id,
        monto,
        fecha_gasto: new Date().toISOString(),
        tipo: 'renovacion',
      })
    } catch (e) {
      console.warn('No se pudo registrar gasto de renovación (gastos_cuentas).', e)
    }

    await fetchCuentas()
    setOpenRenovacionModal(false)
    setCuentaRenovando(null)
  }

  function openEditModal(cuenta) {
    setEditingId(cuenta.id)
    setServicioId(cuenta.servicio_id || cuenta.servicios?.id || '')
    setCorreo(cuenta.correo)
    setContrasena(cuenta.contrasena)
    const compra = cuenta.precio_compra ?? cuenta.precio
    const venta = cuenta.precio_venta ?? cuenta.precio
    setPrecioCompra(compra != null ? compra.toString() : '')
    setPrecioVenta(venta != null ? venta.toString() : '')
    setFechaInicio(cuenta.fecha_inicio || '')
    setFechaVencimiento(cuenta.fecha_vencimiento || '')
    setVencimientoIndefinido(!cuenta.fecha_vencimiento)
    setOpenEditCuenta(true)
  }

  function confirmDelete(cuenta) {
    if (cuenta.vendida) {
      // Cuenta ya vendida: solo mostramos mensaje informativo
      setDeleteId(null)
      setDeleteMode('blocked')
    } else {
      setDeleteId(cuenta.id)
      setDeleteMode('normal')
    }
    setOpenDeleteModal(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)

    if (
      !servicioId ||
      !correo.trim() ||
      !contrasena.trim() ||
      !precioCompra ||
      !precioVenta ||
      !fechaInicio ||
      (!fechaVencimiento && !vencimientoIndefinido)
    ) {
      setFormError('Todos los campos son obligatorios (o marca vencimiento indefinido)')
      return
    }

    setSaving(true)

    const { data, error } = await supabase
      .from('cuentas_servicios')
      .insert({
        user_id: user.id,
        servicio_id: servicioId,
        proveedor_id: proveedorId,
        correo: correo.trim(),
        contrasena: contrasena.trim(),
        precio: parseFloat(precioVenta), // compat con código existente
        precio_compra: parseFloat(precioCompra),
        precio_venta: parseFloat(precioVenta),
        fecha_inicio: fechaInicio,
        fecha_vencimiento: vencimientoIndefinido ? null : fechaVencimiento,
      })
      .select(`
        id,
        servicio_id,
        correo,
        contrasena,
        precio,
        precio_compra,
        precio_venta,
        fecha_inicio,
        fecha_vencimiento,
        servicios (id, nombre)
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

    if (!editingId) return

    if (
      !servicioId ||
      !correo.trim() ||
      !contrasena.trim() ||
      !precioCompra ||
      !precioVenta ||
      !fechaInicio ||
      (!fechaVencimiento && !vencimientoIndefinido)
    ) {
      setFormError('Todos los campos son obligatorios (o marca vencimiento indefinido)')
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from('cuentas_servicios')
      .update({
        servicio_id: servicioId,
        correo: correo.trim(),
        contrasena: contrasena.trim(),
        precio: parseFloat(precioVenta),
        precio_compra: parseFloat(precioCompra),
        precio_venta: parseFloat(precioVenta),
        fecha_inicio: fechaInicio,
        fecha_vencimiento: vencimientoIndefinido ? null : fechaVencimiento,
      })
      .eq('id', editingId)

    setSaving(false)

    if (error) {
      setFormError(error.message)
      return
    }

    await fetchCuentas()
    resetForm()
    setOpenEditCuenta(false)
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

  function handleDownloadTemplate() {
    const templateRows = [
      {
        Servicio: 'Netflix',
        Correo: 'correo@ejemplo.com',
        Contraseña: 'password123',
        PrecioCompra: '5.00',
        PrecioVenta: '8.00',
        FechaInicio: '2025-01-01',
        // Deja esta columna vacía si la cuenta no tiene fecha de vencimiento (indefinida)
        FechaVencimiento: '2025-02-01',
      },
    ]

    const worksheet = XLSX.utils.json_to_sheet(templateRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla')
    XLSX.writeFile(workbook, `plantilla_cuentas_proveedor.xlsx`)
  }

  function handleExportCuentas() {
    if (!cuentas || cuentas.length === 0) return

    const rows = cuentas.map((cuenta) => {
      const servicioNombre = cuenta.servicios?.nombre || ''
      const compra = cuenta.precio_compra ?? cuenta.precio
      const venta = cuenta.precio_venta ?? cuenta.precio
      const estado = getEstadoCuenta(cuenta.fecha_vencimiento, cuenta.vendida).label

      return {
        Servicio: servicioNombre,
        Correo: cuenta.correo,
        Contraseña: cuenta.contrasena,
        PrecioCompra: compra != null ? Number(compra).toFixed(2) : '',
        PrecioVenta: venta != null ? Number(venta).toFixed(2) : '',
        FechaInicio: cuenta.fecha_inicio || '',
        FechaVencimiento: cuenta.fecha_vencimiento || '',
        Estado: estado,
      }
    })

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Cuentas')
    const nombreProveedor = proveedor?.usuario?.replace(/\s+/g, '_') || 'proveedor'
    XLSX.writeFile(workbook, `cuentas_${nombreProveedor}.xlsx`)
  }

  async function handleImportFile(file) {
    if (!file) return
    setImportError(null)
    setImportLoading(true)
    setImportFileName(file.name)

    try {
      const fileData = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => resolve(e.target.result)
        reader.onerror = (e) => reject(e)
        reader.readAsArrayBuffer(file)
      })

      const workbook = XLSX.read(fileData, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' })

      if (!rows.length) {
        setImportError('El archivo no contiene datos.')
        setImportLoading(false)
        return
      }

      // Función para convertir fecha serial de Excel a formato YYYY-MM-DD
      const convertExcelDate = (value) => {
        if (!value) return ''
        
        // Si ya es una fecha en formato ISO o similar
        if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
          return value
        }
        
        // Si es un número (fecha serial de Excel)
        if (typeof value === 'number') {
          // Excel almacena fechas como días desde 1900-01-01 (con ajuste por error en 1900)
          const date = new Date((value - 25569) * 86400 * 1000)
          const year = date.getUTCFullYear()
          const month = String(date.getUTCMonth() + 1).padStart(2, '0')
          const day = String(date.getUTCDate()).padStart(2, '0')
          return `${year}-${month}-${day}`
        }
        
        // Intentar parsear como fecha
        const parsed = new Date(value)
        if (!isNaN(parsed.getTime())) {
          const year = parsed.getFullYear()
          const month = String(parsed.getMonth() + 1).padStart(2, '0')
          const day = String(parsed.getDate()).padStart(2, '0')
          return `${year}-${month}-${day}`
        }
        
        return String(value).trim()
      }

      const registros = []
      for (const row of rows) {
        const servicioNombre = String(row.Servicio || '').trim()
        const correoRow = String(row.Correo || '').trim()
        const contrasenaRow = String(row.Contraseña || '').trim()
        const precioCompraRow = String(row.PrecioCompra || '').trim()
        const precioVentaRow = String(row.PrecioVenta || '').trim()
        const fechaInicioRow = convertExcelDate(row.FechaInicio)
        const fechaVencimientoRow = convertExcelDate(row.FechaVencimiento)
        const fechaEsIndefinida = !fechaVencimientoRow

        if (!servicioNombre || !correoRow || !contrasenaRow || !precioCompraRow || !precioVentaRow || !fechaInicioRow) {
          continue // ignorar filas incompletas (FechaVencimiento ahora puede ir vacía para cuentas indefinidas)
        }

        const servicio = servicios.find(
          (s) => s.nombre.toLowerCase() === servicioNombre.toLowerCase()
        )
        if (!servicio) {
          setImportError(`Servicio no encontrado para la fila con servicio "${servicioNombre}"`)
          setImportLoading(false)
          return
        }

        const precioCompraNum = Number(precioCompraRow)
        const precioVentaNum = Number(precioVentaRow)
        if (Number.isNaN(precioCompraNum) || Number.isNaN(precioVentaNum)) {
          setImportError('Precio compra/venta inválido en alguna fila.')
          setImportLoading(false)
          return
        }

        registros.push({
          servicio_id: servicio.id,
          proveedor_id: proveedorId,
          correo: correoRow,
          contrasena: contrasenaRow,
          precio: precioVentaNum,
          precio_compra: precioCompraNum,
          precio_venta: precioVentaNum,
          fecha_inicio: fechaInicioRow,
          fecha_vencimiento: fechaEsIndefinida ? null : fechaVencimientoRow,
        })
      }

      if (!registros.length) {
        setImportError('No se encontraron filas válidas para importar.')
        setImportLoading(false)
        return
      }

      const registrosConUser = registros.map((r) => ({ ...r, user_id: user.id }))

      const { error } = await supabase.from('cuentas_servicios').insert(registrosConUser)

      if (error) {
        setImportError('Error al importar: ' + error.message)
        setImportLoading(false)
        return
      }

      await fetchCuentas()
      setImportLoading(false)
      setImportFileName('')
      setOpenImportExportModal(false)
    } catch (e) {
      console.error(e)
      setImportError('Error al leer el archivo. Asegúrate de que es un Excel válido (.xlsx).')
      setImportLoading(false)
    }
  }

  const filteredCuentas = useMemo(() => {
    const searchLower = searchTerm.toLowerCase()

    const base = cuentas.filter((cuenta) => {
      const servicioNombre = cuenta.servicios?.nombre || ''

      const matchesSearch =
        !searchLower ||
        cuenta.correo.toLowerCase().includes(searchLower) ||
        cuenta.contrasena.toLowerCase().includes(searchLower) ||
        servicioNombre.toLowerCase().includes(searchLower)

      const estadoObj = getEstadoCuenta(cuenta.fecha_vencimiento, cuenta.vendida)
      const estadoKey = estadoObj.key || estadoObj.label.toLowerCase()

      const matchesEstado =
        estadoFilter === 'all' ||
        (estadoFilter === 'activa' && estadoKey === 'activa') ||
        (estadoFilter === 'vendida' && estadoKey === 'vendida') ||
        (estadoFilter === 'vencido' && estadoKey === 'vencido')

      return matchesSearch && matchesEstado
    })

    if (!fechaSort) return base

    const sorted = [...base].sort((a, b) => {
      const da = a.fecha_vencimiento ? new Date(a.fecha_vencimiento) : null
      const db = b.fecha_vencimiento ? new Date(b.fecha_vencimiento) : null

      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1

      return fechaSort === 'asc' ? da - db : db - da
    })

    return sorted
  }, [cuentas, searchTerm, estadoFilter, fechaSort])

  useEffect(() => {
    const computedTotalPages = Math.max(1, Math.ceil(filteredCuentas.length / itemsPerPage))
    setCurrentPage((prev) => Math.min(prev, computedTotalPages))
  }, [filteredCuentas.length, itemsPerPage])

  const totalItems = filteredCuentas.length
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage))
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedCuentas = filteredCuentas.slice(startIndex, startIndex + itemsPerPage)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-3 md:px-6 py-4 md:py-5">
          <div className="flex flex-col gap-3 md:gap-4">
            {/* Fila 1: Botón regresar e info del proveedor */}
            <div className="flex items-start gap-2 md:gap-4">
              <button
                onClick={() => {
                  navigate('/', { state: { initialPage: 'proveedores' } })
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 md:px-3 py-2 text-xs md:text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm flex-shrink-0"
              >
                <ArrowLeft size={16} className="md:w-[18px] md:h-[18px]" />
                <span className="hidden sm:inline">Regresar</span>
              </button>
              <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg flex-shrink-0">
                  <span className="text-white font-bold text-base md:text-lg">
                    {proveedor?.usuario?.charAt(0).toUpperCase() || 'P'}
                  </span>
                </div>
                <div className="space-y-0.5 min-w-0 flex-1">
                  <h1 className="text-base md:text-xl lg:text-2xl font-bold text-slate-900 leading-tight truncate">
                    {proveedor?.usuario || 'Proveedor'}
                  </h1>
                  <div className="flex flex-wrap items-center gap-x-2 md:gap-x-3 gap-y-1 text-[10px] md:text-xs lg:text-sm text-slate-500">
                    <span className="hidden sm:inline">Cuentas que provee</span>
                    {proveedor?.telefono && (
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1 w-1 rounded-full bg-slate-300 hidden sm:inline" />
                        <span className="truncate">Tel: {proveedor.telefono}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Fila 2: Botones de acción */}
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              <button
                type="button"
                onClick={() => {
                  setOpenImportExportModal(true)
                  setImportError(null)
                  setImportFileName('')
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition-colors flex-shrink-0"
              >
                <span className="hidden sm:inline">Exportar / Importar</span>
                <span className="sm:hidden">Importar</span>
              </button>
              <button
                onClick={() => setOpenNewCuenta(true)}
                className="inline-flex items-center gap-1.5 md:gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-purple-700 px-3 md:px-5 py-1.5 md:py-2.5 text-xs md:text-sm font-semibold text-white shadow-lg hover:from-purple-700 hover:to-purple-800 transition-all flex-shrink-0"
              >
                <Plus size={14} className="md:w-[18px] md:h-[18px]" />
                Añadir cuenta
              </button>
            </div>
          </div>
        </div>

        {/* Filtros y controles */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-600 font-medium">Mostrar</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className="text-sm text-slate-600">registros</span>
              </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600 font-medium">Buscar:</span>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="Servicio, correo..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value)
                      setCurrentPage(1)
                    }}
                    className="pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200 w-64"
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
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
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
          <div className="overflow-x-auto">
            <table className="min-w-[1000px] w-full text-sm">
            <thead className="bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700">
              <tr>
                <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">#</th>
                <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">Servicio</th>
                <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">Correo</th>
                <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">Contraseña</th>
                <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">Precio Compra</th>
                <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">Precio Venta</th>
                <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">Fecha Inicio</th>
                <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">
                  <div className="inline-flex items-center justify-center gap-1">
                    <span>Vence el</span>
                    <div className="flex flex-col leading-none">
                      <button
                        type="button"
                        onClick={() => setFechaSort('asc')}
                        className={`h-3 w-3 text-[8px] leading-none flex items-center justify-center rounded-sm transition-colors ${
                          fechaSort === 'asc' ? 'text-slate-100' : 'text-slate-400'
                        }`}
                        title="Ordenar por más próximas"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => setFechaSort('desc')}
                        className={`h-3 w-3 text-[8px] leading-none flex items-center justify-center rounded-sm transition-colors ${
                          fechaSort === 'desc' ? 'text-slate-100' : 'text-slate-400'
                        }`}
                        title="Ordenar por más lejanas"
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                </th>
                <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">Estado</th>
                <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center">
                    <div className="flex items-center justify-center gap-2 text-slate-500">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
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
                      {searchTerm ? '🔍 No se encontraron resultados' : '📝 Aún no hay cuentas registradas para este proveedor.'}
                    </div>
                  </td>
                </tr>
              )}

              {!loading && !error &&
                paginatedCuentas.map((cuenta, index) => {
                  const estado = getEstadoCuenta(cuenta.fecha_vencimiento, cuenta.vendida)
                  const servicioNombre = cuenta.servicios?.nombre || '—'
                  const compra = cuenta.precio_compra ?? cuenta.precio
                  const venta = cuenta.precio_venta ?? cuenta.precio

                  return (
                    <tr key={cuenta.id} className="border-t border-slate-100 hover:bg-gradient-to-r hover:from-purple-50 hover:to-slate-50 transition-all">
                      <td className="px-4 py-4 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs">
                          {startIndex + index + 1}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-slate-900 font-medium">{servicioNombre}</td>
                      <td className="px-4 py-4 text-slate-900">
                        <span className="font-mono text-xs break-all" title={cuenta.correo}>
                          {cuenta.correo}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <code className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 font-mono text-xs border border-slate-200">
                          {cuenta.contrasena}
                        </code>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="inline-flex items-center justify-center px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-xs border border-emerald-200">
                          {formatMoney(compra != null ? Number(compra) : 0, currency, { maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="inline-flex items-center justify-center px-3 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold text-xs border border-blue-200">
                          {formatMoney(venta != null ? Number(venta) : 0, currency, { maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center text-slate-700 font-medium">
                        {formatDateDisplay(cuenta.fecha_inicio)}
                      </td>
                      <td className="px-4 py-4 text-center text-slate-700 font-medium">
                        {formatDateDisplay(cuenta.fecha_vencimiento)}
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
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => openRenovacionModalCuenta(cuenta)}
                        className="p-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-sm"
                        title="Registrar renovación con proveedor"
                      >
                        <RefreshCw size={16} />
                      </button>
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
          </div>
          {!loading && !error && totalItems > 0 && (
            <div className="flex flex-col md:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-gradient-to-r from-slate-50 via-purple-50/40 to-slate-50">
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
                  className="inline-flex items-center gap-1.5 rounded-full border border-purple-500 bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-purple-500 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Siguiente ›
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Renovación proveedor */}
        <Modal
          open={openRenovacionModal}
          title="Renovación de cuenta con proveedor"
          onClose={() => {
            setOpenRenovacionModal(false)
            setCuentaRenovando(null)
            setRenovacionError(null)
          }}
        >
          <form className="space-y-4" onSubmit={handleRenovacionCuentaSubmit}>
            {cuentaRenovando && (
              <div className="text-xs text-slate-600 space-y-1">
                <p>
                  <span className="font-semibold">Servicio:</span>{' '}
                  {cuentaRenovando.servicios?.nombre || '—'}
                </p>
                <p>
                  <span className="font-semibold">Cuenta:</span>{' '}
                  {cuentaRenovando.correo || '—'}
                </p>
                <p>
                  <span className="font-semibold">Vence actual:</span>{' '}
                  {formatDateDisplay(cuentaRenovando.fecha_vencimiento)}
                </p>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">Meses a renovar</span>
                <select
                  value={mesesRenovacion}
                  onChange={(e) => {
                    const value = Number(e.target.value) || 1
                    setMesesRenovacion(value)
                    if (cuentaRenovando) {
                      const baseMonto =
                        Number(
                          cuentaRenovando.precio_compra != null
                            ? cuentaRenovando.precio_compra
                            : cuentaRenovando.precio_venta != null
                            ? cuentaRenovando.precio_venta
                            : cuentaRenovando.precio || 0
                        ) || 0
                      if (baseMonto > 0) {
                        setMontoRenovacion((baseMonto * value).toFixed(2))
                      }
                    }
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
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
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <p className="text-[11px] text-slate-400">
                  Si no eliges una fecha, se calculará sumando los meses al vencimiento actual.
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">Monto de renovación</span>
                <input
                  type="number"
                  step="0.01"
                  value={montoRenovacion}
                  onChange={(e) => setMontoRenovacion(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <p className="text-[11px] text-slate-400">
                  Por defecto es el precio de compra actual multiplicado por los meses seleccionados.
                </p>
              </div>
            </div>

            {renovacionError && <p className="text-sm text-rose-500">{renovacionError}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setOpenRenovacionModal(false)
                  setCuentaRenovando(null)
                  setRenovacionError(null)
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingRenovacion}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {savingRenovacion ? 'Guardando...' : 'Registrar renovación'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal Nueva cuenta */}
        <Modal
          open={openNewCuenta}
          title="Añadir cuenta de este proveedor"
          onClose={() => {
            setOpenNewCuenta(false)
            resetForm()
          }}
        >
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <select
                value={servicioId}
                onChange={(e) => setServicioId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 md:col-span-2"
              >
                <option value="">Selecciona servicio</option>
                {servicios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>

              <input
                type="email"
                placeholder="Correo de la cuenta"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <input
                type="text"
                placeholder="Contraseña"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />

              <input
                type="number"
                step="0.01"
                placeholder="Precio compra (lo que pagas)"
                value={precioCompra}
                onChange={(e) => setPrecioCompra(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Precio venta (a tus clientes)"
                value={precioVenta}
                onChange={(e) => setPrecioVenta(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />

              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <div className="space-y-2">
                <input
                  type="date"
                  value={fechaVencimiento}
                  onChange={(e) => setFechaVencimiento(e.target.value)}
                  disabled={vencimientoIndefinido}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-slate-50 disabled:text-slate-400"
                />
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={vencimientoIndefinido}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setVencimientoIndefinido(checked)
                      if (checked) setFechaVencimiento('')
                    }}
                    className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                  />
                  <span>Sin fecha de vencimiento (indefinida)</span>
                </label>
              </div>
            </div>

            {formError && <p className="text-sm text-rose-500">{formError}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setOpenNewCuenta(false)
                  resetForm()
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal Editar cuenta */}
        <Modal
          open={openEditCuenta}
          title="Editar cuenta de este proveedor"
          onClose={() => {
            setOpenEditCuenta(false)
            resetForm()
          }}
        >
          <form className="space-y-4" onSubmit={handleEdit}>
            <div className="grid gap-4 md:grid-cols-2">
              <select
                value={servicioId}
                onChange={(e) => setServicioId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 md:col-span-2"
              >
                <option value="">Selecciona servicio</option>
                {servicios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>

              <input
                type="email"
                placeholder="Correo de la cuenta"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <input
                type="text"
                placeholder="Contraseña"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />

              <input
                type="number"
                step="0.01"
                placeholder="Precio compra (lo que pagas)"
                value={precioCompra}
                onChange={(e) => setPrecioCompra(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Precio venta (a tus clientes)"
                value={precioVenta}
                onChange={(e) => setPrecioVenta(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />

              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <div className="space-y-2">
                <input
                  type="date"
                  value={fechaVencimiento}
                  onChange={(e) => setFechaVencimiento(e.target.value)}
                  disabled={vencimientoIndefinido}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-slate-50 disabled:text-slate-400"
                />
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={vencimientoIndefinido}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setVencimientoIndefinido(checked)
                      if (checked) setFechaVencimiento('')
                    }}
                    className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                  />
                  <span>Sin fecha de vencimiento (indefinida)</span>
                </label>
              </div>
            </div>

            {formError && <p className="text-sm text-rose-500">{formError}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setOpenEditCuenta(false)
                  resetForm()
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
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
              ? 'Esta acción no se puede deshacer. La cuenta dejará de estar registrada para este proveedor.'
              : 'Esta cuenta ya ha sido vendida y no se puede eliminar.'
          }
          confirmText={deleteMode === 'normal' ? 'Eliminar' : 'Entendido'}
          type={deleteMode === 'normal' ? 'danger' : 'info'}
        />

        <Modal
          open={openImportExportModal}
          title="Exportar / Importar cuentas de este proveedor"
          onClose={() => {
            setOpenImportExportModal(false)
            setImportError(null)
            setImportFileName('')
          }}
          maxWidthClass="max-w-3xl"
        >
          <div className="grid gap-6 md:grid-cols-2">
            {/* Exportar */}
            <div className="space-y-3 border border-slate-200 rounded-xl p-4 bg-slate-50/60">
              <h3 className="text-sm font-semibold text-slate-800">Exportar</h3>
              <p className="text-xs text-slate-500">
                Descarga un archivo Excel con todas las cuentas de este proveedor.
              </p>
              <button
                type="button"
                onClick={handleExportCuentas}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 shadow-sm"
              >
                Descargar Excel
              </button>
            </div>

            {/* Importar */}
            <div className="space-y-3 border border-slate-200 rounded-xl p-4 bg-slate-50/60">
              <h3 className="text-sm font-semibold text-slate-800">Importar</h3>
              <p className="text-xs text-slate-500">
                Usa la plantilla para cargar varias cuentas a la vez. Asegúrate de usar
                exactamente los mismos nombres de servicio que ves en el sistema.
              </p>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 shadow-sm"
              >
                Descargar plantilla
              </button>

              <div
                className="mt-2 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const file = e.dataTransfer.files?.[0]
                  if (file) handleImportFile(file)
                }}
                onClick={() => {
                  const input = document.getElementById('cuentas-import-file-input')
                  if (input) input.click()
                }}
              >
                <p className="text-xs font-medium text-slate-700">
                  Arrastra y suelta el archivo Excel aquí,
                  <span className="text-blue-600"> o haz clic para seleccionarlo</span>.
                </p>
                <p className="text-[11px] text-slate-500">Formato soportado: .xlsx</p>
                {importFileName && (
                  <p className="mt-1 text-[11px] text-slate-600 break-all">
                    Archivo seleccionado: <span className="font-semibold">{importFileName}</span>
                  </p>
                )}
              </div>

              <input
                id="cuentas-import-file-input"
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleImportFile(file)
                  e.target.value = ''
                }}
              />

              {importError && (
                <p className="text-[11px] text-rose-500 mt-1">{importError}</p>
              )}
              {importLoading && (
                <p className="text-[11px] text-slate-500 mt-1">Importando cuentas...</p>
              )}
            </div>
          </div>
        </Modal>
      </div>
    </div>
  )
}
