import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Edit2, Trash2, Plus, RefreshCw, SendHorizontal, MessageCircle } from 'lucide-react'
import { FilterableSelect } from '../components/common/FilterableSelect'
import { Modal } from '../components/common/Modal'
import { ConfirmModal } from '../components/common/ConfirmModal'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../hooks/useCurrency'
import { formatMoney } from '../lib/money'
import { openWhatsApp, validateWhatsAppPhone } from '../lib/whatsapp'
import { inferServiceKeyFromName } from '../lib/textUtils'
import * as XLSX from 'xlsx'

function normalizeDateString(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 10)
  try {
    return new Date(value).toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

function formatDateDisplay(value) {
  const raw = normalizeDateString(value)
  if (!raw) return '—'
  const [y, m, d] = raw.split('-')
  if (!y || !m || !d) return raw
  return `${d}/${m}/${y}`
}

function todayInputDate() {
  const hoy = new Date()
  const y = hoy.getFullYear()
  const m = String(hoy.getMonth() + 1).padStart(2, '0')
  const d = String(hoy.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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

async function enrichVentasWithPerfilInfo(ventas) {
  const list = ventas || []
  const perfilIds = [...new Set(list.map((v) => v.perfil_id).filter(Boolean))]
  if (perfilIds.length === 0) return list

  const { data: perfilesData, error } = await supabase
    .from('perfiles_cuentas')
    .select('id, numero, nombre, pin')
    .in('id', perfilIds)

  if (error || !perfilesData) return list

  const map = new Map(perfilesData.map((p) => [p.id, p]))
  return list.map((v) => ({
    ...v,
    perfil_info: v.perfil_id ? map.get(v.perfil_id) || null : null,
  }))
}

function getEstadoVenta(fechaVence) {
  const fechaNorm = normalizeDateString(fechaVence)
  if (!fechaNorm) {
    return { label: 'Sin fecha', color: 'text-slate-600 bg-slate-100 border-slate-200' }
  }

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const [y, m, d] = fechaNorm.split('-')
  const vencimiento = new Date(Number(y), Number(m) - 1, Number(d))
  vencimiento.setHours(0, 0, 0, 0)

  const diffTime = vencimiento - hoy
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  // Distinción:
  // - Vencida: ya pasó -> se gestiona en Reportes
  // - Vencido: vence HOY -> se muestra en Ventas del cliente
  if (diffDays < 0) {
    return { label: 'Vencida', color: 'text-rose-700 bg-rose-100 border-rose-300' }
  } else if (diffDays === 0) {
    return { label: 'Vencido', color: 'text-rose-700 bg-rose-100 border-rose-300' }
  } else if (diffDays <= 2) {
    return { label: 'Por Vencer', color: 'text-amber-700 bg-amber-100 border-amber-300' }
  } else {
    return { label: 'Vigente', color: 'text-emerald-700 bg-emerald-100 border-emerald-300' }
  }
}

export function VentasCliente() {
  const { clienteId } = useParams()
  const { user } = useAuth()
  const currency = useCurrency()
  const location = useLocation()
  const navigate = useNavigate()
  const clienteState = location.state?.cliente

  const [ventas, setVentas] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('all') // all | vigente | por-vencer | vencido
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [fechaSort, setFechaSort] = useState(null) // null | 'asc' | 'desc'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [openDeleteModal, setOpenDeleteModal] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [formError, setFormError] = useState(null)

  const [openImportExportModal, setOpenImportExportModal] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState(null)
  const [importFileName, setImportFileName] = useState('')

  // Nueva venta para este cliente
  const [openNewVenta, setOpenNewVenta] = useState(false)
  const [servicios, setServicios] = useState([])
  const [cuentasServicioSeleccionado, setCuentasServicioSeleccionado] = useState([])
  const [servicioId, setServicioId] = useState('')
  const [cuentaId, setCuentaId] = useState('')
  const [precioVenta, setPrecioVenta] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaVencimientoVenta, setFechaVencimientoVenta] = useState('')
  const [autoCalcVencimiento, setAutoCalcVencimiento] = useState(true)
  const [ventaFormError, setVentaFormError] = useState(null)

  const [modoVenta, setModoVenta] = useState('cuenta') // 'cuenta' | 'perfil'
  const [perfilesDisponibles, setPerfilesDisponibles] = useState([])
  const [perfilId, setPerfilId] = useState('')
  const [cuentasConPerfilVendidoIds, setCuentasConPerfilVendidoIds] = useState([])

  const [openEditVenta, setOpenEditVenta] = useState(false)
  const [ventaEditando, setVentaEditando] = useState(null)
  const [correoEdit, setCorreoEdit] = useState('')
  const [contrasenaEdit, setContrasenaEdit] = useState('')
  const [precioEdit, setPrecioEdit] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editFormError, setEditFormError] = useState(null)

  const [saving, setSaving] = useState(false)

  const [openRenovacionModal, setOpenRenovacionModal] = useState(false)
  const [ventaRenovando, setVentaRenovando] = useState(null)
  const [mesesRenovacion, setMesesRenovacion] = useState(1)
  const [fechaManualRenovacion, setFechaManualRenovacion] = useState('')
  const [montoRenovacion, setMontoRenovacion] = useState('')
  const [savingRenovacion, setSavingRenovacion] = useState(false)
  const [renovacionError, setRenovacionError] = useState(null)
  const [sendingVentaId, setSendingVentaId] = useState(null)
  const [sendingGeneral, setSendingGeneral] = useState(false)

  async function cleanupVentasVencidasCliente() {
    // Antes se borraban ventas vencidas automáticamente.
    // Ahora NO se eliminan: deben pasar a "Reportes" para cambiar credenciales y luego liberar la cuenta.
    return
  }

  useEffect(() => {
    async function fetchVentasCliente() {
      setLoading(true)
      setError(null)


      const { data, error } = await supabase
      .from('ventas')
        .select(`
          id,
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
            precio,
            fecha_vencimiento,
            servicios (id, nombre)
          )
        `)
        .eq('cliente_id', clienteId)
        .order('fecha_venta', { ascending: false })

      if (error) {
        setError(error.message)
      } else {
        const enriquecidas = await enrichVentasWithPerfilInfo(data || [])
        setVentas(enriquecidas)
      }

      setLoading(false)
    }

    fetchVentasCliente()
  }, [clienteId])

  useEffect(() => {
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

    fetchServicios()
  }, [])

  async function fetchCuentasByServicio(id) {
    if (!id) {
      setCuentasServicioSeleccionado([])
      setPerfilesDisponibles([])
      setPerfilId('')
      setCuentasConPerfilVendidoIds([])
      return
    }

    const { data, error } = await supabase
      .from('cuentas_servicios')
      .select('id, correo, contrasena, precio, fecha_vencimiento')
      .eq('servicio_id', id)
      .order('correo', { ascending: true })

    if (error) return

    const hoyISO = new Date().toISOString().slice(0, 10)
    const hoyDate = new Date(`${hoyISO}T00:00:00`)

    const cuentasData = (data || []).filter((cuenta) => {
      const fv = normalizeDateString(cuenta.fecha_vencimiento)
      if (!fv) return true
      const venceDate = new Date(`${fv}T00:00:00`)
      return venceDate >= hoyDate
    })

    const ids = cuentasData.map((c) => c.id)

    let vendidasSet = new Set()
    let perfilVendidoSet = new Set()
    if (ids.length > 0) {
      const { data: ventasData, error: ventasError } = await supabase
        .from('ventas')
        .select('cuenta_servicio_id, perfil_id, liberada')
        .in('cuenta_servicio_id', ids)

      if (!ventasError) {
        for (const v of ventasData || []) {
          if (v.liberada) continue
          if (v.perfil_id) {
            perfilVendidoSet.add(v.cuenta_servicio_id)
          } else {
            vendidasSet.add(v.cuenta_servicio_id)
          }
        }
      }
    }

    const disponibles = cuentasData.filter((cuenta) => !vendidasSet.has(cuenta.id))
    setCuentasServicioSeleccionado(disponibles)
    setPerfilesDisponibles([])
    setPerfilId('')
    setCuentasConPerfilVendidoIds(Array.from(perfilVendidoSet))
  }

  async function fetchPerfilesLibresByCuenta(cuentaId) {
    setPerfilesDisponibles([])
    setPerfilId('')
    if (!cuentaId) return

    const { data, error } = await supabase
      .from('perfiles_cuentas')
      .select('id, numero')
      .eq('cuenta_servicio_id', cuentaId)
      .order('numero', { ascending: true })

    if (error) return

    const { data: ventasData, error: ventasError } = await supabase
      .from('ventas')
      .select('perfil_id, liberada')
      .eq('cuenta_servicio_id', cuentaId)
      .not('perfil_id', 'is', null)

    let vendidosSet = new Set()
    if (!ventasError && ventasData) {
      vendidosSet = new Set((ventasData || []).filter((v) => !v.liberada).map((v) => v.perfil_id))
    }

    const libres = (data || []).filter((p) => !vendidosSet.has(p.id))
    setPerfilesDisponibles(libres)
  }

  const cuentaTienePerfilVendido = cuentaId
    ? cuentasConPerfilVendidoIds.includes(cuentaId)
    : false

  function openNewVentaModal() {
    const hoy = new Date()
    const hoyISO = hoy.toISOString().slice(0, 10)
    setFechaInicio(hoyISO)
    setAutoCalcVencimiento(true)
    setFechaVencimientoVenta(addMonths(hoyISO, 1))
    setServicioId('')
    setCuentaId('')
    setPrecioVenta('')
    setVentaFormError(null)
    setModoVenta('cuenta')
    setPerfilesDisponibles([])
    setPerfilId('')
    setOpenNewVenta(true)
  }

  function resetVentaForm() {
    setServicioId('')
    setCuentaId('')
    setPrecioVenta('')
    setFechaInicio('')
    setAutoCalcVencimiento(true)
    setFechaVencimientoVenta('')
    setVentaFormError(null)
    setModoVenta('cuenta')
    setPerfilesDisponibles([])
    setPerfilId('')
  }

  async function handleSubmitNuevaVenta(e) {
    e.preventDefault()
    setVentaFormError(null)

    if (
      !servicioId ||
      !cuentaId ||
      !precioVenta ||
      !fechaInicio ||
      !fechaVencimientoVenta ||
      (modoVenta === 'perfil' && !perfilId)
    ) {
      setVentaFormError('Todos los campos son obligatorios (incluye el perfil si vendes por perfil)')
      return
    }

    setSaving(true)

    const { data, error } = await supabase
      .from('ventas')
      .insert({
        user_id: user.id,
        cliente_id: clienteId,
        cuenta_servicio_id: cuentaId,
        perfil_id: modoVenta === 'perfil' ? perfilId : null,
        monto: parseFloat(precioVenta),
        fecha_inicio: fechaInicio,
        fecha_vencimiento: fechaVencimientoVenta,
      })
      .select(`
        id,
        cliente_id,
        cuenta_servicio_id,
        perfil_id,
        fecha_venta,
        fecha_inicio,
        fecha_vencimiento,
        monto,
        clientes (id, nombre, apellido, telefono),
        cuentas_servicios (
          id,
          correo,
          contrasena,
          precio,
          fecha_vencimiento,
          servicios (id, nombre)
        )
      `)
      .single()

    setSaving(false)

    if (error) {
      setVentaFormError(error.message)
      return
    }

    const [ventaEnriquecida] = await enrichVentasWithPerfilInfo([data])

    // Registrar ingreso (para métricas / ganancias del dashboard)
    // Nota: requiere tabla pagos_ventas en Supabase.
    try {
      await supabase.from('pagos_ventas').insert({
        user_id: user.id,
        venta_id: data.id,
        monto: Number(data.monto) || 0,
        fecha_pago: new Date().toISOString(),
        tipo: 'venta',
      })
    } catch (e) {
      // Si la tabla no existe aún, no bloqueamos la venta.
      console.warn('No se pudo registrar pago_venta (tabla pagos_ventas no existe o falta permisos).', e)
    }

    try {
      await supabase.functions.invoke('send-notifications', {
        body: {
          ventaId: data.id,
          motivo: 'nueva_venta',
          perfilId: data.perfil_id || null,
        },
      })
    } catch (e) {
      console.error('Error enviando notificación de nueva venta (cliente)', e)
    }

    setVentas((prev) => [ventaEnriquecida, ...prev])
    resetVentaForm()
    setOpenNewVenta(false)
  }

  const ventasFiltradas = useMemo(
    () => {
      const term = searchTerm.trim().toLowerCase()

      const base = ventas.filter((venta) => {
        const cuenta = venta.cuentas_servicios
        const servicioNombre = cuenta?.servicios?.nombre || ''
        const correo = cuenta?.correo || ''
        const contrasena = cuenta?.contrasena || ''

        const matchesSearch =
          !term ||
          servicioNombre.toLowerCase().includes(term) ||
          correo.toLowerCase().includes(term) ||
          contrasena.toLowerCase().includes(term)

        // Solo usamos la fecha de la venta, no la de la cuenta
        const fechaVenceMostrar = venta.fecha_vencimiento || null
        const estadoObj = getEstadoVenta(fechaVenceMostrar)
        const estadoLabel = estadoObj.label.toLowerCase()

        // Si ya está vencida (día siguiente), se gestiona en "Reportes" y no debe mostrarse aquí.
        if (estadoLabel === 'vencida') return false

        const matchesEstado =
          estadoFilter === 'all' ||
          (estadoFilter === 'vigente' && estadoLabel === 'vigente') ||
          (estadoFilter === 'por-vencer' && estadoLabel === 'por vencer') ||
          (estadoFilter === 'vencido' && estadoLabel === 'vencido')

        return matchesSearch && matchesEstado
      })

      if (!fechaSort) return base

      const sorted = [...base].sort((a, b) => {
        const fechaA = a.fecha_vencimiento || null
        const fechaB = b.fecha_vencimiento || null

        const normA = normalizeDateString(fechaA)
        const normB = normalizeDateString(fechaB)

        const da = normA ? new Date(normA) : null
        const db = normB ? new Date(normB) : null

        if (!da && !db) return 0
        if (!da) return 1
        if (!db) return -1

        return fechaSort === 'asc' ? da - db : db - da
      })

      return sorted
    },
    [ventas, searchTerm, estadoFilter, fechaSort]
  )

  useEffect(() => {
    const computedTotalPages = Math.max(1, Math.ceil(ventasFiltradas.length / itemsPerPage))
    setCurrentPage((prev) => Math.min(prev, computedTotalPages))
  }, [ventasFiltradas.length, itemsPerPage])

  const totalItems = ventasFiltradas.length
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage))
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedVentas = ventasFiltradas.slice(startIndex, startIndex + itemsPerPage)

  const cliente = useMemo(() => {
    if (clienteState) return clienteState
    if (ventas.length > 0 && ventas[0].clientes) return ventas[0].clientes
    return null
  }, [clienteState, ventas])

  function confirmDelete(id) {
    setDeleteId(id)
    setOpenDeleteModal(true)
  }

  async function handleDelete() {
    if (!deleteId) return

    const { error } = await supabase.from('ventas').delete().eq('id', deleteId)

    if (error) {
      setFormError('Error al eliminar: ' + error.message)
      return
    }

    setVentas((prev) => prev.filter((v) => v.id !== deleteId))
    setOpenDeleteModal(false)
    setDeleteId(null)
  }

  async function handleReenviarNotificaciones(venta) {
    setSendingVentaId(venta.id)

    try {
      const telefono = cliente?.telefono
      const phoneValidation = validateWhatsAppPhone(telefono)
      if (!phoneValidation.ok) {
        window.alert(phoneValidation.message)
        return
      }

      const cuenta = venta?.cuentas_servicios
      const servicioNombre = cuenta?.servicios?.nombre || 'Servicio'
      const serviceKey = inferServiceKeyFromName(servicioNombre)
      const ocultarCredenciales = serviceKey === 'spotify' || serviceKey === 'youtube'

      const { data: configData } = await supabase
        .from('configuraciones_usuario')
        .select('nombre_negocio')
        .eq('user_id', user.id)
        .maybeSingle()

      const empresa = configData?.nombre_negocio || 'Ventas Pro'
      const clienteNombre = cliente ? `${cliente.nombre} ${cliente.apellido}` : 'cliente'

      const fechaVence = venta?.fecha_vencimiento || null
      const estado = getEstadoVenta(fechaVence)
      const estadoLabel = (estado?.label || '').toLowerCase()

      const tipo = venta?.perfil_id ? 'Perfil' : 'Cuenta completa'
      const perfilLine = venta?.perfil_id
        ? `Perfil: ${venta?.perfil_info?.numero ? `#${venta.perfil_info.numero}` : ''}${venta?.perfil_info?.nombre ? ` (${venta.perfil_info.nombre})` : ''}`.trim()
        : null
      const pinLine = venta?.perfil_id
        ? `Pin: ${venta?.perfil_info?.pin || 'Ninguno'}`
        : null

      const datosAcceso = [
        `Servicio: ${servicioNombre}`,
        `Tipo: ${tipo}`,
        !ocultarCredenciales ? `Cuenta: ${cuenta?.correo || '—'}` : null,
        !ocultarCredenciales ? `Contraseña: ${cuenta?.contrasena || '—'}` : null,
        perfilLine,
        pinLine,
        `Vence: ${formatDateDisplay(fechaVence)}`,
        `Monto: ${formatMoney(venta?.monto || 0, currency, { maximumFractionDigits: 2 })}`,
      ]
        .filter(Boolean)
        .join('\n')

      let msg = ''
      if (estadoLabel === 'vigente') {
        msg = `Hola ${clienteNombre}!\n\nTe saluda ${empresa}. Gracias por tu compra.\n\n${datosAcceso}`
      } else if (estadoLabel === 'por vencer') {
        msg = `Hola ${clienteNombre}!\n\nTe saluda ${empresa}. Recordatorio: tu acceso vencerá pronto.\n\n${datosAcceso}\n\n¿Desea renovar?`
      } else if (estadoLabel === 'vencido') {
        msg = `Hola ${clienteNombre}!\n\nTe saluda ${empresa}. Hoy vence tu acceso. Gracias por tu compra y confianza.\n\n${datosAcceso}\n\n¿Desea renovar?`
      } else {
        msg = `Hola ${clienteNombre}!\n\nTe saluda ${empresa}.\n\n${datosAcceso}`
      }

      const ok = openWhatsApp(telefono, msg)
      if (!ok) {
        window.alert('No se pudo abrir WhatsApp. Revisa el número del cliente.')
      }
    } catch (e) {
      console.error('Error generando WhatsApp para la venta (cliente)', e)
      window.alert('Ocurrió un error preparando el WhatsApp.')
    } finally {
      setSendingVentaId(null)
    }
  }

  async function handleEnvioGeneral() {
    if (!clienteId) return
    // Si no hay ventas, no tiene sentido enviar un resumen
    if (!ventas || ventas.length === 0) return

      const telefono = cliente?.telefono
      const phoneValidation = validateWhatsAppPhone(telefono)
    setSendingGeneral(true)
    try {
      // Mantener el envío por email
      await supabase.functions.invoke('send-notifications', {
        body: { clienteId, motivo: 'envio_general' },
      })

      if (!phoneValidation.ok) {
        window.alert(
          `${phoneValidation.message} Se envió el correo, pero no se pudo abrir WhatsApp.`
        )
        return
      }

      const { data: configData } = await supabase
        .from('configuraciones_usuario')
        .select('nombre_negocio')
        .eq('user_id', user.id)
        .maybeSingle()

      const empresa = configData?.nombre_negocio || 'Ventas Pro'
      const clienteNombre = cliente ? `${cliente.nombre} ${cliente.apellido}` : 'cliente'

      const lines = (ventas || []).map((v, idx) => {
        const cuenta = v.cuentas_servicios
        const servicioNombre = cuenta?.servicios?.nombre || 'Servicio'
        const serviceKey = inferServiceKeyFromName(servicioNombre)
        const ocultarCredenciales = serviceKey === 'spotify' || serviceKey === 'youtube'
        const fechaV = v.fecha_vencimiento || null
        const estado = getEstadoVenta(fechaV).label
        const tipo = v?.perfil_id ? 'Perfil' : 'Cuenta completa'
        const perfilTxt = v?.perfil_id
          ? `${v?.perfil_info?.numero ? `#${v.perfil_info.numero}` : ''}${v?.perfil_info?.nombre ? ` (${v.perfil_info.nombre})` : ''}`.trim()
          : ''
        const pinTxt = v?.perfil_id ? `   Pin: ${v?.perfil_info?.pin || 'Ninguno'}` : null

        return [
          `${idx + 1}) ${servicioNombre} - ${tipo}${perfilTxt ? ` ${perfilTxt}` : ''}`,
          !ocultarCredenciales ? `   Cuenta: ${cuenta?.correo || '—'}` : null,
          !ocultarCredenciales ? `   Contraseña: ${cuenta?.contrasena || '—'}` : null,
          pinTxt,
          `   Vence: ${formatDateDisplay(fechaV)} (${estado})`,
          `   Monto: ${formatMoney(v?.monto || 0, currency, { maximumFractionDigits: 2 })}`,
        ].filter(Boolean).join('\n')
      })

      const msg = `Hola ${clienteNombre}!\n\nTe saluda ${empresa}. Aquí tienes el resumen de tus ventas:\n\n${lines.join('\n\n')}`
      const ok = openWhatsApp(telefono, msg)
      if (!ok) {
        window.alert('No se pudo abrir WhatsApp. Revisa el número del cliente.')
      }
    } catch (e) {
      console.error('Error en envío general', e)
    } finally {
      setSendingGeneral(false)
    }
  }

  function openEditVentaModal(venta) {
    setVentaEditando(venta)
    setCorreoEdit(venta.cuentas_servicios?.correo || '')
    setContrasenaEdit(venta.cuentas_servicios?.contrasena || '')
    const basePrecio =
      venta.monto != null ? venta.monto : venta.cuentas_servicios?.precio || ''
    setPrecioEdit(basePrecio.toString())
    const inicio = venta.fecha_inicio || venta.fecha_venta || null
    const vence = venta.fecha_vencimiento || null
    setFechaInicio(normalizeDateString(inicio))
    setFechaVencimientoVenta(normalizeDateString(vence))
    setEditFormError(null)
    setOpenEditVenta(true)
  }

  async function handleSubmitEditVenta(e) {
    e.preventDefault()
    setEditFormError(null)
    if (!ventaEditando) return

    if (!correoEdit.trim() || !contrasenaEdit.trim()) {
      setEditFormError('Correo y contraseña son obligatorios')
      return
    }

    setSavingEdit(true)

    const { error: cuentaError } = await supabase
      .from('cuentas_servicios')
      .update({
        correo: correoEdit.trim(),
        contrasena: contrasenaEdit.trim(),
      })
      .eq('id', ventaEditando.cuenta_servicio_id)

    if (cuentaError) {
      setSavingEdit(false)
      setEditFormError(cuentaError.message)
      return
    }

    if (!fechaVencimientoVenta) {
      setSavingEdit(false)
      setEditFormError('La fecha de vencimiento es obligatoria')
      return
    }

    const { error } = await supabase
      .from('ventas')
      .update({
        fecha_vencimiento: normalizeDateString(fechaVencimientoVenta),
      })
      .eq('id', ventaEditando.id)

    setSavingEdit(false)

    if (error) {
      setEditFormError(error.message)
      return
    }

    // Avisar si cambiaron las credenciales (correo/contraseña)
    const newCorreo = correoEdit.trim()
    const newContrasena = contrasenaEdit.trim()
    const oldCorreo = ventaEditando.cuentas_servicios?.correo || ''
    const oldContrasena = ventaEditando.cuentas_servicios?.contrasena || ''
    const credencialesCambiadas =
      oldCorreo !== newCorreo || oldContrasena !== newContrasena

    if (credencialesCambiadas) {
      try {
        await supabase.functions.invoke('send-notifications', {
          body: {
            ventaId: ventaEditando.id,
            motivo: 'cambio_credenciales',
            oldCorreo,
            oldContrasena,
            newCorreo,
            newContrasena,
          },
        })
      } catch (e) {
        console.error('Error enviando notificación de cambio de credenciales (cliente)', e)
      }
    }

    // Recargar ventas de este cliente para reflejar cambios en todas las vistas
    const { data: ventasRecargadas, error: ventasError } = await supabase
      .from('ventas')
      .select(`
        id,
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
          precio,
          fecha_vencimiento,
          servicios (id, nombre)
        )
      `)
      .eq('cliente_id', clienteId)
      .order('fecha_venta', { ascending: false })

    if (!ventasError) {
      const enriquecidas = await enrichVentasWithPerfilInfo(ventasRecargadas || [])
      setVentas(enriquecidas)
    }

    setOpenEditVenta(false)
    setVentaEditando(null)
  }

  function openRenovacionModalVenta(venta) {
    setVentaRenovando(venta)
    const baseMonto = Number(
      venta.monto != null ? venta.monto : venta.cuentas_servicios?.precio || 0
    )
    setMesesRenovacion(1)
    setMontoRenovacion(baseMonto ? baseMonto.toFixed(2) : '')
    setFechaManualRenovacion('')
    setRenovacionError(null)
    setOpenRenovacionModal(true)
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

    const baseFecha =
      normalizeDateString(
        ventaRenovando.fecha_vencimiento ||
          ventaRenovando.fecha_inicio ||
          ventaRenovando.fecha_venta
      ) || todayInputDate()

    const fechaInicioRenov = baseFecha
    const fechaVencimientoRenov =
      fechaManualRenovacion || addMonths(baseFecha, meses)

    setSavingRenovacion(true)

    const { data, error } = await supabase
      .from('ventas')
      .update({
        monto,
        fecha_inicio: fechaInicioRenov,
        fecha_vencimiento: fechaVencimientoRenov,
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
        clientes (id, nombre, apellido, telefono),
        cuentas_servicios (
          id,
          correo,
          contrasena,
          precio,
          fecha_vencimiento,
          servicios (id, nombre)
        )
      `)
      .single()

    setSavingRenovacion(false)

    if (error) {
      setRenovacionError(error.message)
      return
    }

    const [ventaRenovEnriquecida] = await enrichVentasWithPerfilInfo([data])

    try {
      await supabase.functions.invoke('send-notifications', {
        body: { ventaId: data.id, motivo: 'renovacion' },
      })
    } catch (e) {
      console.error('Error enviando notificación de renovación (cliente)', e)
    }

    setVentas((prev) => prev.map((v) => (v.id === data.id ? ventaRenovEnriquecida : v)))
    setOpenRenovacionModal(false)
    setVentaRenovando(null)
  }

  function handleDownloadTemplateVentas() {
    const templateRows = [
      {
        Servicio: 'Netflix',
        CorreoCuenta: 'correo@ejemplo.com',
        PrecioVenta: '8.00',
        FechaInicio: '2025-01-01',
        FechaVencimiento: '2025-02-01',
      },
    ]

    const worksheet = XLSX.utils.json_to_sheet(templateRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla')
    XLSX.writeFile(workbook, `plantilla_ventas_cliente.xlsx`)
  }

  function handleExportVentasCliente(clienteObj) {
    if (!ventas || ventas.length === 0) return

    const rows = ventas.map((venta) => {
      const cuenta = venta.cuentas_servicios
      const servicioNombre = cuenta?.servicios?.nombre || ''
      const correo = cuenta?.correo || ''
      const contrasena = cuenta?.contrasena || ''
      const fechaVenceMostrar = venta.fecha_vencimiento || cuenta?.fecha_vencimiento || null
      const estadoObj = getEstadoVenta(fechaVenceMostrar)

      return {
        Servicio: servicioNombre,
        Correo: correo,
        Contraseña: contrasena,
        PrecioVenta: venta.monto != null ? Number(venta.monto).toFixed(2) : '',
        FechaVenta: venta.fecha_venta
          ? new Date(venta.fecha_venta).toISOString().slice(0, 10)
          : '',
        FechaVencimiento: fechaVenceMostrar
          ? new Date(fechaVenceMostrar).toISOString().slice(0, 10)
          : '',
        Estado: estadoObj.label,
      }
    })

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventas')

    const nombreCliente = clienteObj
      ? `${clienteObj.nombre || ''}_${clienteObj.apellido || ''}`.trim().replace(/\s+/g, '_')
      : 'cliente'

    XLSX.writeFile(workbook, `ventas_${nombreCliente}.xlsx`)
  }

  async function handleImportVentasFile(file) {
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

      const servicioPorNombre = new Map(
        servicios.map((s) => [s.nombre.toLowerCase(), s])
      )

      const registrosVentas = []
      const cuentasKeys = []

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

      for (const row of rows) {
        const servicioNombre = String(row.Servicio || '').trim()
        const correoCuenta = String(row.CorreoCuenta || '').trim()
        const precioVentaRow = String(row.PrecioVenta || '').trim()
        const fechaInicioRow = convertExcelDate(row.FechaInicio)
        const fechaVencimientoRow = convertExcelDate(row.FechaVencimiento)

        if (!servicioNombre || !correoCuenta || !precioVentaRow || !fechaInicioRow || !fechaVencimientoRow) {
          continue
        }

        const servicio = servicioPorNombre.get(servicioNombre.toLowerCase())
        if (!servicio) {
          setImportError(`Servicio no encontrado para la fila con servicio "${servicioNombre}"`)
          setImportLoading(false)
          return
        }

        const precioVentaNum = Number(precioVentaRow)
        if (Number.isNaN(precioVentaNum)) {
          setImportError('Precio de venta inválido en alguna fila.')
          setImportLoading(false)
          return
        }

        registrosVentas.push({
          servicio_id: servicio.id,
          correo: correoCuenta,
          monto: precioVentaNum,
          fecha_inicio: fechaInicioRow,
          fecha_vencimiento: fechaVencimientoRow,
        })

        cuentasKeys.push({ servicio_id: servicio.id, correo: correoCuenta.toLowerCase() })
      }

      if (!registrosVentas.length) {
        setImportError('No se encontraron filas válidas para importar.')
        setImportLoading(false)
        return
      }

      const servicioIdsUnicos = [...new Set(cuentasKeys.map((k) => k.servicio_id))]

      const { data: cuentasData, error: cuentasError } = await supabase
        .from('cuentas_servicios')
        .select('id, servicio_id, correo')
        .in('servicio_id', servicioIdsUnicos)

      if (cuentasError) {
        setImportError('Error al buscar cuentas: ' + cuentasError.message)
        setImportLoading(false)
        return
      }

      const cuentasPorClave = new Map()
      for (const c of cuentasData || []) {
        const key = `${c.servicio_id}|${c.correo.toLowerCase()}`
        if (!cuentasPorClave.has(key)) cuentasPorClave.set(key, [])
        cuentasPorClave.get(key).push(c)
      }

      const todasCuentaIds = (cuentasData || []).map((c) => c.id)
      let vendidasSet = new Set()
      if (todasCuentaIds.length > 0) {
        const { data: ventasData, error: ventasError } = await supabase
          .from('ventas')
          .select('cuenta_servicio_id')
          .in('cuenta_servicio_id', todasCuentaIds)

        if (!ventasError) {
          vendidasSet = new Set(ventasData.map((v) => v.cuenta_servicio_id))
        }
      }

      const inserts = []
      for (const reg of registrosVentas) {
        const key = `${reg.servicio_id}|${reg.correo.toLowerCase()}`
        const posibles = cuentasPorClave.get(key) || []
        const disponible = posibles.find((c) => !vendidasSet.has(c.id))

        if (!disponible) {
          setImportError(
            `No se encontró una cuenta disponible para el servicio asociado y correo "${reg.correo}".`
          )
          setImportLoading(false)
          return
        }

        inserts.push({
          user_id: user.id,
          cliente_id: clienteId,
          cuenta_servicio_id: disponible.id,
          monto: reg.monto,
          fecha_inicio: reg.fecha_inicio,
          fecha_vencimiento: reg.fecha_vencimiento,
        })
      }

      const { error: insertError } = await supabase.from('ventas').insert(inserts)

      if (insertError) {
        setImportError('Error al importar ventas: ' + insertError.message)
        setImportLoading(false)
        return
      }

      const { data: ventasRecargadas, error: ventasError2 } = await supabase
        .from('ventas')
        .select(`
          id,
          cliente_id,
          cuenta_servicio_id,
          fecha_venta,
          fecha_inicio,
          fecha_vencimiento,
          monto,
          clientes (id, nombre, apellido, telefono),
          cuentas_servicios (
            id,
            correo,
            contrasena,
            precio,
            fecha_vencimiento,
            servicios (id, nombre)
          )
        `)
        .eq('cliente_id', clienteId)
        .order('fecha_venta', { ascending: false })

      if (!ventasError2) {
        const enriquecidas = await enrichVentasWithPerfilInfo(ventasRecargadas || [])
        setVentas(enriquecidas)
      }

      setImportLoading(false)
      setImportFileName('')
      setOpenImportExportModal(false)
    } catch (e) {
      console.error(e)
      setImportError('Error al leer el archivo. Asegúrate de que es un Excel válido (.xlsx).')
      setImportLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-3 md:px-6 py-4 md:py-5">
          <div className="flex flex-col gap-3 md:gap-4">
            {/* Fila 1: Botón regresar e info del cliente */}
            <div className="flex items-start gap-2 md:gap-4">
              <button
                onClick={() => navigate('/', { state: { initialPage: 'clientes' } })}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 md:px-3 py-2 text-xs md:text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm flex-shrink-0"
              >
                <ArrowLeft size={16} className="md:w-[18px] md:h-[18px]" />
                <span className="hidden sm:inline">Regresar</span>
              </button>
              <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg flex-shrink-0">
                  <span className="text-white font-bold text-base md:text-lg">👥</span>
                </div>
                <div className="space-y-0.5 min-w-0 flex-1">
                  <h1 className="text-base md:text-xl lg:text-2xl font-bold text-slate-900 leading-tight truncate">
                    {cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Cliente'}
                  </h1>
                  <div className="flex flex-wrap items-center gap-x-2 md:gap-x-3 gap-y-1 text-[10px] md:text-xs lg:text-sm text-slate-500">
                    <span className="hidden sm:inline">Historial de ventas</span>
                    {cliente?.telefono && (
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1 w-1 rounded-full bg-slate-300 hidden sm:inline" />
                        <span className="truncate">Tel: {cliente.telefono}</span>
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
                onClick={handleEnvioGeneral}
                disabled={sendingGeneral || !ventas || ventas.length === 0}
                className="inline-flex items-center gap-1.5 md:gap-2 rounded-lg bg-emerald-600 px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                {sendingGeneral ? (
                  <span className="h-3 w-3 md:h-4 md:w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <SendHorizontal size={14} className="md:w-[18px] md:h-[18px]" />
                )}
                <span className="hidden sm:inline">Envío General</span>
                <span className="sm:hidden">Enviar</span>
              </button>
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
                type="button"
                onClick={openNewVentaModal}
                className="inline-flex items-center gap-1.5 md:gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-semibold text-white shadow-sm hover:from-blue-700 hover:to-blue-800 transition-colors flex-shrink-0"
              >
                <Plus size={14} className="md:w-[18px] md:h-[18px]" />
                Nueva Venta
              </button>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600 font-medium">Buscar venta:</span>
              <input
                type="text"
                placeholder="Servicio, correo, contraseña..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setCurrentPage(1)
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs md:text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-52 md:w-72"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs md:text-sm font-medium text-slate-500">Estado:</span>
                <select
                  value={estadoFilter}
                  onChange={(e) => {
                    setEstadoFilter(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs md:text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[120px]"
                >
              <option value="all">Todos</option>
              <option value="vigente">Vigente</option>
              <option value="por-vencer">Por vencer</option>
              <option value="vencido">Vencido (hoy)</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs md:text-sm font-medium text-slate-500">Mostrar:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs md:text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className="text-xs md:text-sm text-slate-500">registros</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabla de ventas del cliente */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700">
              <tr>
                <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">
                  #
                </th>
                <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">
                  Servicio
                </th>
                <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">
                  Producto
                </th>
                <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">
                  Perfil
                </th>
                <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">
                  Precio Venta
                </th>
                <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">
                  Fecha Venta
                </th>
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
                <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">
                  Estado
                </th>
                <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center">
                    <div className="flex items-center justify-center gap-2 text-slate-500">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
                      <span>Cargando ventas...</span>
                    </div>
                  </td>
                </tr>
              )}

              {!loading && error && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-rose-600">
                    Error al cargar ventas: {error}
                  </td>
                </tr>
              )}

              {!loading && !error && ventas.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center">
                    <div className="text-slate-400">
                      📝 Aún no hay ventas registradas para este cliente.
                    </div>
                  </td>
                </tr>
              )}

              {!loading &&
                !error &&
                paginatedVentas.map((venta, index) => {
                  const cuenta = venta.cuentas_servicios
                  const servicioNombre = cuenta?.servicios?.nombre || '—'
                  const fechaVenceMostrar = venta.fecha_vencimiento || null
                  const estado = getEstadoVenta(fechaVenceMostrar)
                  const perfilInfo = venta.perfil_info
                  const perfilLabel = venta.perfil_id
                    ? perfilInfo?.nombre ||
                      (perfilInfo?.numero ? `Perfil ${perfilInfo.numero}` : 'Perfil')
                    : 'Todos los perfiles'

                  return (
                    <tr
                      key={venta.id}
                      className="border-t border-slate-100 hover:bg-gradient-to-r hover:from-blue-50 hover:to-slate-50 transition-all"
                    >
                      <td className="px-4 py-4 text-center">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs">
                          {startIndex + index + 1}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-slate-900 font-medium">{servicioNombre}</td>
                    <td className="px-4 py-4 text-slate-700">
                        {cuenta ? (
                          <div className="space-y-0.5 text-xs">
                            <div className="min-w-0">
                              <span className="font-semibold text-slate-800">Correo:</span>{' '}
                              <span className="font-mono break-all" title={cuenta.correo}>
                                {cuenta.correo}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <span className="font-semibold text-slate-800">Contraseña:</span>{' '}
                              <span className="font-mono break-all" title={cuenta.contrasena}>
                                {cuenta.contrasena}
                              </span>
                            </div>
                            <div>
                              <span
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                  venta.perfil_id
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                              >
                                {venta.perfil_id ? 'Venta por PERFIL' : 'Cuenta COMPLETA'}
                              </span>
                            </div>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-4 text-center text-slate-700 text-xs font-medium">
                        <div className="space-y-0.5">
                          <div>{perfilLabel}</div>
                          <div className="text-[11px] text-slate-500">
                            {venta.perfil_id
                              ? `Pin: ${perfilInfo?.pin || 'Ninguno'}`
                              : 'Pin: Ninguno'}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="inline-flex items-center justify-center px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-sm border border-emerald-200">
                          {formatMoney(venta.monto || 0, currency, { maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center text-slate-700 font-medium">
                        {formatDateDisplay(venta.fecha_venta)}
                      </td>
                      <td className="px-4 py-4 text-center text-slate-700 font-medium">
                        {formatDateDisplay(fechaVenceMostrar)}
                      </td>
                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border-2 ${estado.color}`}
                        >
                          {estado.label === 'Vencida' && '🔴'}
                          {estado.label === 'Por Vencer' && '🟡'}
                          {estado.label === 'Vigente' && '🟢'}
                          {estado.label.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEditVentaModal(venta)}
                            className="p-2 rounded-lg bg-cyan-500 text-white hover:bg-cyan-600 transition-colors shadow-sm"
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => openRenovacionModalVenta(venta)}
                            className="p-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-sm"
                            title="Renovación"
                          >
                            <RefreshCw size={16} />
                          </button>
                          <button
                            onClick={() => handleReenviarNotificaciones(venta)}
                            disabled={sendingVentaId === venta.id}
                            className="p-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                            title="Enviar WhatsApp"
                          >
                            {sendingVentaId === venta.id ? (
                              <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                            ) : (
                              <MessageCircle size={16} />
                            )}
                          </button>
                          <button
                            onClick={() => confirmDelete(venta.id)}
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
            <div className="flex flex-col md:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-gradient-to-r from-slate-50 via-blue-50/40 to-slate-50">
              <p className="text-xs text-slate-600">
                Mostrando{' '}
                <span className="font-semibold text-slate-800">
                  {startIndex + 1}–{Math.min(startIndex + itemsPerPage, totalItems)}
                </span>{' '}
                de{' '}
                <span className="font-semibold text-slate-800">{totalItems}</span> ventas
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

        <ConfirmModal
          open={openDeleteModal}
          onClose={() => {
            setOpenDeleteModal(false)
            setDeleteId(null)
          }}
          onConfirm={handleDelete}
          title="¿Eliminar Venta?"
          message="Esta acción no se puede deshacer. La venta será eliminada permanentemente."
          confirmText="Eliminar"
          type="danger"
        />

        {formError && <p className="text-xs text-rose-500">{formError}</p>}

        <Modal
          open={openImportExportModal}
          title="Exportar / Importar ventas de este cliente"
          onClose={() => {
            setOpenImportExportModal(false)
            setImportError(null)
            setImportFileName('')
          }}
          maxWidthClass="max-w-3xl"
        >
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3 border border-slate-200 rounded-xl p-4 bg-slate-50/60">
              <h3 className="text-sm font-semibold text-slate-800">Exportar</h3>
              <p className="text-xs text-slate-500">
                Descarga un archivo Excel con todas las ventas registradas para este cliente.
              </p>
              <button
                type="button"
                onClick={() => handleExportVentasCliente(cliente)}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 shadow-sm"
              >
                Descargar Excel
              </button>
            </div>

            <div className="space-y-3 border border-slate-200 rounded-xl p-4 bg-slate-50/60">
              <h3 className="text-sm font-semibold text-slate-800">Importar</h3>
              <p className="text-xs text-slate-500">
                Usa la plantilla para cargar varias ventas a la vez. Asegúrate de usar exactamente
                los mismos nombres de servicio y correos de las cuentas.
              </p>
              <button
                type="button"
                onClick={handleDownloadTemplateVentas}
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
                  if (file) handleImportVentasFile(file)
                }}
                onClick={() => {
                  const input = document.getElementById('ventas-import-file-input')
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
                    Archivo seleccionado:{' '}
                    <span className="font-semibold">{importFileName}</span>
                  </p>
                )}
              </div>

              <input
                id="ventas-import-file-input"
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleImportVentasFile(file)
                  e.target.value = ''
                }}
              />

              {importError && (
                <p className="text-[11px] text-rose-500 mt-1">{importError}</p>
              )}
              {importLoading && (
                <p className="text-[11px] text-slate-500 mt-1">Importando ventas...</p>
              )}
            </div>
          </div>
        </Modal>
      </div>

      <Modal
        open={openEditVenta}
        title="Editar Venta de este cliente"
        onClose={() => {
          setOpenEditVenta(false)
          setVentaEditando(null)
        }}
      >
        <form className="space-y-4" onSubmit={handleSubmitEditVenta}>
          <div className="grid gap-4 md:grid-cols-2">
            <input
              type="text"
              disabled
              value={
                ventaEditando?.cuentas_servicios?.servicios?.nombre
                  ? `Servicio: ${ventaEditando.cuentas_servicios.servicios.nombre}`
                  : ''
              }
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 md:col-span-2"
            />

            <input
              type="email"
              placeholder="Correo de la cuenta"
              value={correoEdit}
              onChange={(e) => setCorreoEdit(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Contraseña de la cuenta"
              value={contrasenaEdit}
              onChange={(e) => setContrasenaEdit(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            <input
              type="number"
              step="0.01"
              placeholder="Precio de venta"
              value={precioEdit}
              disabled
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
            />

            <input
              type="date"
              value={normalizeDateString(fechaInicio)}
              disabled
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
            />
            <input
              type="date"
              value={normalizeDateString(fechaVencimientoVenta)}
              onChange={(e) => setFechaVencimientoVenta(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {editFormError && <p className="text-sm text-rose-500">{editFormError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setOpenEditVenta(false)
                setVentaEditando(null)
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingEdit}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {savingEdit ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={openNewVenta}
        title="Nueva Venta para este cliente"
        onClose={() => {
          setOpenNewVenta(false)
          resetVentaForm()
        }}
      >
        <form className="space-y-4" onSubmit={handleSubmitNuevaVenta}>
          <div className="grid gap-4 md:grid-cols-2">
            <select
              value={servicioId}
              onChange={async (e) => {
                const value = e.target.value
                setServicioId(value)
                setCuentaId('')
                setPerfilesDisponibles([])
                setPerfilId('')
                if (value) {
                  await fetchCuentasByServicio(value)
                } else {
                  setCuentasServicioSeleccionado([])
                }
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 md:col-span-2"
            >
              <option value="">Selecciona servicio</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>

            <FilterableSelect
              value={cuentaId}
              onChange={async (value) => {
                const cuenta = cuentasServicioSeleccionado.find((c) => c.id === value)
                setCuentaId(value)
                setPerfilesDisponibles([])
                setPerfilId('')
                if (cuenta) {
                  setPrecioVenta(cuenta.precio.toString())
                  const tienePerfilVendido = cuentasConPerfilVendidoIds.includes(cuenta.id)
                  if (tienePerfilVendido) {
                    setModoVenta('perfil')
                    await fetchPerfilesLibresByCuenta(value)
                  } else if (modoVenta === 'perfil') {
                    await fetchPerfilesLibresByCuenta(value)
                  }
                }
              }}
              options={cuentasServicioSeleccionado}
              placeholder="Escribe o selecciona una cuenta..."
              disabled={!servicioId}
              className="md:col-span-2"
              getOptionValue={(c) => c.id}
              getOptionLabel={(c) => c.correo}
              renderOption={(c) => <span className="font-mono text-xs">{c.correo}</span>}
            />

            <div className="md:col-span-2 grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">Modo de venta</span>
                <select
                  value={modoVenta}
                  onChange={async (e) => {
                    const value = e.target.value
                    // Si ya hay al menos un perfil vendido, no permitimos seleccionar "cuenta completa"
                    if (value === 'cuenta' && cuentaTienePerfilVendido) {
                      return
                    }
                    setModoVenta(value)
                    setPerfilId('')
                    setPerfilesDisponibles([])
                    if (value === 'perfil' && cuentaId) {
                      await fetchPerfilesLibresByCuenta(cuentaId)
                    }
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
>
                  <option value="cuenta" disabled={cuentaTienePerfilVendido}>
                    Cuenta completa
                  </option>
                  <option value="perfil">Perfil</option>
                </select>
              </div>

              {modoVenta === 'perfil' && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-600">Perfil libre</span>
                  <select
                    value={perfilId}
                    onChange={(e) => setPerfilId(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Selecciona perfil</option>
                    {perfilesDisponibles.map((p) => (
                      <option key={p.id} value={p.id}>
                        Perfil {p.numero}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <input
              type="number"
              step="0.01"
              placeholder="Precio de venta"
              value={precioVenta}
              onChange={(e) => setPrecioVenta(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            <input
              type="date"
              value={normalizeDateString(fechaInicio)}
              onChange={(e) => {
                const v = e.target.value
                setFechaInicio(v)
                if (autoCalcVencimiento) {
                  setFechaVencimientoVenta(addMonths(v, 1))
                }
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="date"
              value={normalizeDateString(fechaVencimientoVenta)}
              onChange={(e) => {
                setAutoCalcVencimiento(false)
                setFechaVencimientoVenta(e.target.value)
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {ventaFormError && <p className="text-sm text-rose-500">{ventaFormError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setOpenNewVenta(false)
                resetVentaForm()
              }}
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

      <Modal
        open={openRenovacionModal}
        title="Renovación de cuenta para este cliente"
        onClose={() => {
          setOpenRenovacionModal(false)
          setVentaRenovando(null)
          setRenovacionError(null)
        }}
      >
        <form className="space-y-4" onSubmit={handleRenovacionSubmit}>
          {ventaRenovando && (
            <div className="text-xs text-slate-600 space-y-1">
              <p>
                <span className="font-semibold">Servicio:</span>{' '}
                {ventaRenovando.cuentas_servicios?.servicios?.nombre || '—'}
              </p>
              <p>
                <span className="font-semibold">Cuenta:</span>{' '}
                {ventaRenovando.cuentas_servicios?.correo || '—'}
              </p>
              <p>
                <span className="font-semibold">Vence actual:</span>{' '}
                {formatDateDisplay(ventaRenovando.fecha_vencimiento)}
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
                  if (ventaRenovando) {
                    const baseMonto =
                      Number(
                        ventaRenovando.monto != null
                          ? ventaRenovando.monto
                          : ventaRenovando.cuentas_servicios?.precio || 0
                      ) || 0
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
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-[11px] text-slate-400">
                Por defecto es el precio actual multiplicado por los meses seleccionados.
              </p>
            </div>
          </div>

          {renovacionError && <p className="text-sm text-rose-500">{renovacionError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setOpenRenovacionModal(false)
                setVentaRenovando(null)
                setRenovacionError(null)
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingRenovacion}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {savingRenovacion ? 'Guardando...' : 'Registrar renovación'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
