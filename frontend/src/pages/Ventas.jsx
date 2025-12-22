import { useEffect, useMemo, useState } from 'react'
import { Plus, Edit2, Trash2, RefreshCw, MessageCircle } from 'lucide-react'
import { Modal } from '../components/common/Modal'
import { ConfirmModal } from '../components/common/ConfirmModal'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../hooks/useCurrency'
import { formatMoney } from '../lib/money'
import { openWhatsApp, validateWhatsAppPhone } from '../lib/whatsapp'

function normalizeDateString(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 10)
  // Fallback por si llegara un Date u otro tipo compatible
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

function getEstadoVenta(fechaVencimiento) {
  const fechaNorm = normalizeDateString(fechaVencimiento)
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
  // - Vencida: ya pasó (día siguiente y más) -> se gestiona en Reportes
  // - Vencido: vence HOY (mostrar en Ventas)
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

export function Ventas() {
  const { user } = useAuth()
  const currency = useCurrency()
  const [ventas, setVentas] = useState([])
  const [clientes, setClientes] = useState([])
  const [servicios, setServicios] = useState([])
  const [cuentasServicioSeleccionado, setCuentasServicioSeleccionado] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [openNewVenta, setOpenNewVenta] = useState(false)
  const [openEditVenta, setOpenEditVenta] = useState(false)
  const [openDeleteModal, setOpenDeleteModal] = useState(false)
  const [openRenovacionModal, setOpenRenovacionModal] = useState(false)

  const [editingId, setEditingId] = useState(null)

  const [clienteId, setClienteId] = useState('')
  const [servicioId, setServicioId] = useState('')
  const [cuentaId, setCuentaId] = useState('')
  const [precioVenta, setPrecioVenta] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaVencimientoVenta, setFechaVencimientoVenta] = useState('')
  const [autoCalcVencimiento, setAutoCalcVencimiento] = useState(true)
  const [deleteId, setDeleteId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('all') // all | vigente | por-vencer | vencido
  const [servicioFilter, setServicioFilter] = useState('all') // id del servicio o 'all'
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [fechaSort, setFechaSort] = useState(null) // null | 'asc' | 'desc'

  const [modoVenta, setModoVenta] = useState('cuenta') // 'cuenta' | 'perfil'
  const [perfilesDisponibles, setPerfilesDisponibles] = useState([])
  const [perfilId, setPerfilId] = useState('')
  const [cuentaCorreo, setCuentaCorreo] = useState('')
  const [cuentaContrasena, setCuentaContrasena] = useState('')
  const [oldCuentaCorreo, setOldCuentaCorreo] = useState('')
  const [oldCuentaContrasena, setOldCuentaContrasena] = useState('')

  const [ventaRenovando, setVentaRenovando] = useState(null)
  const [mesesRenovacion, setMesesRenovacion] = useState(1)
  const [fechaManualRenovacion, setFechaManualRenovacion] = useState('')
  const [montoRenovacion, setMontoRenovacion] = useState('')
  const [savingRenovacion, setSavingRenovacion] = useState(false)
  const [renovacionError, setRenovacionError] = useState(null)
  const [sendingVentaId, setSendingVentaId] = useState(null)

  // Cuentas que ya tienen una venta de cuenta completa (no por perfil)
  const cuentasVendidasIds = useMemo(() => {
    const ids = new Set()
    for (const v of ventas) {
      // Si la venta ya fue liberada, no debe bloquear la cuenta.
      if (v?.liberada) continue
      if (v.cuenta_servicio_id && !v.perfil_id) ids.add(v.cuenta_servicio_id)
    }
    return ids
  }, [ventas])

  // Cuentas que ya tienen al menos un perfil vendido
  const cuentasConPerfilVendidoIds = useMemo(() => {
    const ids = new Set()
    for (const v of ventas) {
      if (v?.liberada) continue
      if (v.cuenta_servicio_id && v.perfil_id) ids.add(v.cuenta_servicio_id)
    }
    return ids
  }, [ventas])

  async function cleanupVentasVencidas() {
    // Antes se borraban ventas vencidas automáticamente.
    // Ahora NO se eliminan: deben pasar a "Reportes" para cambiar credenciales y luego liberar la cuenta.
    return
  }

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)


      const [clientesRes, serviciosRes, ventasRes] = await Promise.all([
        supabase
          .from('clientes')
          .select('id, nombre, apellido, telefono')
          .eq('user_id', user.id)
          .order('nombre', { ascending: true }),
        supabase
          .from('servicios')
          .select('id, nombre')
          .eq('user_id', user.id)
          .order('nombre', { ascending: true }),
        supabase
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
          .order('fecha_venta', { ascending: false }),
      ])

      if (clientesRes.error) {
        setError(clientesRes.error.message)
      } else {
        setClientes(clientesRes.data || [])
      }

      if (serviciosRes.error) {
        setError((prev) => prev || serviciosRes.error.message)
      } else {
        setServicios(serviciosRes.data || [])
      }

      if (ventasRes.error) {
        setError((prev) => prev || ventasRes.error.message)
      } else {
        setVentas(ventasRes.data || [])
      }

      setLoading(false)
    }

    fetchData()
  }, [])

  async function fetchCuentasByServicio(id) {
    if (!id) {
      setCuentasServicioSeleccionado([])
      setPerfilesDisponibles([])
      setPerfilId('')
      return
    }

    const { data, error } = await supabase
      .from('cuentas_servicios')
      .select('id, correo, contrasena, precio, fecha_vencimiento')
      .eq('servicio_id', id)
      .order('correo', { ascending: true })

    if (!error) {
      const hoy = todayInputDate()
      const hoyDate = new Date(`${hoy}T00:00:00`)

      const disponibles = (data || [])
        // No permitir vender cuentas completas ya vendidas
        .filter((cuenta) => !cuentasVendidasIds.has(cuenta.id))
        // No permitir seleccionar cuentas vencidas (estado de cuenta, no de venta)
        .filter((cuenta) => {
          const fv = normalizeDateString(cuenta.fecha_vencimiento)
          if (!fv) return true
          const venceDate = new Date(`${fv}T00:00:00`)
          return venceDate >= hoyDate
        })

      setCuentasServicioSeleccionado(disponibles)
      setPerfilesDisponibles([])
      setPerfilId('')
    }
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

  const cuentaSeleccionada = cuentasServicioSeleccionado.find((c) => c.id === cuentaId)
  const cuentaTienePerfilVendido = cuentaSeleccionada
    ? cuentasConPerfilVendidoIds.has(cuentaSeleccionada.id)
    : false

  const ventasFiltradas = useMemo(
    () => {
      const term = searchTerm.trim().toLowerCase()

    const base = ventas.filter((venta) => {
        const cliente = venta.clientes
        const cuenta = venta.cuentas_servicios
        const servicio = cuenta?.servicios

        // Buscar por texto
        const servicioNombre = servicio?.nombre || ''
        const correo = cuenta?.correo || ''
        const contrasena = cuenta?.contrasena || ''
        const nombreCliente = cliente ? `${cliente.nombre} ${cliente.apellido}` : ''
        const telefono = cliente?.telefono || ''

        const matchesSearch = !term
          ? true
          : (
              servicioNombre.toLowerCase().includes(term) ||
              correo.toLowerCase().includes(term) ||
              contrasena.toLowerCase().includes(term) ||
              nombreCliente.toLowerCase().includes(term) ||
              telefono.toLowerCase().includes(term)
            )

        // Filtro por estado (solo usamos la fecha de la venta, no la de la cuenta)
        const fechaInicioMostrar = venta.fecha_inicio || venta.fecha_venta || null
        const fechaVenceMostrar = venta.fecha_vencimiento || null
        const estadoObj = getEstadoVenta(fechaVenceMostrar)
        const estadoLabel = estadoObj.label.toLowerCase() // 'vigente' | 'por vencer' | 'vencido' | 'vencida'

        // Si ya está vencida (día siguiente), se gestiona en "Reportes" y no debe mostrarse en Ventas.
        if (estadoLabel === 'vencida') return false

        const matchesEstado =
          estadoFilter === 'all' ||
          (estadoFilter === 'vigente' && estadoLabel === 'vigente') ||
          (estadoFilter === 'por-vencer' && estadoLabel === 'por vencer') ||
          (estadoFilter === 'vencido' && estadoLabel === 'vencido')

        // Filtro por servicio
        const matchesServicio =
          servicioFilter === 'all' || (servicio && String(servicio.id) === servicioFilter)

        return matchesSearch && matchesEstado && matchesServicio
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
    [ventas, searchTerm, estadoFilter, servicioFilter, fechaSort]
  )

  useEffect(() => {
    const computedTotalPages = Math.max(1, Math.ceil(ventasFiltradas.length / itemsPerPage))
    setCurrentPage((prev) => Math.min(prev, computedTotalPages))
  }, [ventasFiltradas.length, itemsPerPage])

  const totalItems = ventasFiltradas.length
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage))
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedVentas = ventasFiltradas.slice(startIndex, startIndex + itemsPerPage)

  function resetForm() {
    setClienteId('')
    setServicioId('')
    setCuentaId('')
    setPrecioVenta('')
    setFechaInicio('')
    setAutoCalcVencimiento(true)
    setFechaVencimientoVenta('')
    setEditingId(null)
    setFormError(null)
    setModoVenta('cuenta')
    setPerfilesDisponibles([])
    setPerfilId('')
    setCuentaCorreo('')
    setCuentaContrasena('')
    setOldCuentaCorreo('')
    setOldCuentaContrasena('')
  }

  function openNewVentaModal() {
    const hoy = todayInputDate()
    setFechaInicio(hoy)
    setAutoCalcVencimiento(true)
    setFechaVencimientoVenta(addMonths(hoy, 1))
    setClienteId('')
    setServicioId('')
    setCuentaId('')
    setPrecioVenta('')
    setEditingId(null)
    setFormError(null)
    setModoVenta('cuenta')
    setPerfilesDisponibles([])
    setPerfilId('')
    setCuentaCorreo('')
    setCuentaContrasena('')
    setOldCuentaCorreo('')
    setOldCuentaContrasena('')
    setOpenNewVenta(true)
  }

  function openEditModal(venta) {
    const servicioFromVenta = venta.cuentas_servicios?.servicios?.id || null
    const cuentaFromVenta = venta.cuentas_servicios?.id || venta.cuenta_servicio_id || ''

    setEditingId(venta.id)
    setClienteId(venta.cliente_id || venta.clientes?.id || '')
    setServicioId(servicioFromVenta || '')
    setCuentaId(cuentaFromVenta || '')
    setModoVenta(venta.perfil_id ? 'perfil' : 'cuenta')
    setPerfilId(venta.perfil_id || '')
    setPrecioVenta(
      (venta.monto != null ? venta.monto : venta.cuentas_servicios?.precio || '').toString()
    )
    const correoActual = venta.cuentas_servicios?.correo || ''
    const contrasenaActual = venta.cuentas_servicios?.contrasena || ''
    setCuentaCorreo(correoActual)
    setCuentaContrasena(contrasenaActual)
    setOldCuentaCorreo(correoActual)
    setOldCuentaContrasena(contrasenaActual)

    const inicio = venta.fecha_inicio || venta.fecha_venta || null
    const vence = venta.fecha_vencimiento || null
    setFechaInicio(normalizeDateString(inicio))
    setFechaVencimientoVenta(normalizeDateString(vence))

    if (servicioFromVenta) {
      fetchCuentasByServicio(servicioFromVenta)
    }

    setOpenEditVenta(true)
  }

  function confirmDelete(id) {
    setDeleteId(id)
    setOpenDeleteModal(true)
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

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)

    if (
      !clienteId ||
      !servicioId ||
      !cuentaId ||
      !precioVenta ||
      !fechaInicio ||
      !fechaVencimientoVenta ||
      (modoVenta === 'perfil' && !perfilId)
    ) {
      setFormError('Todos los campos son obligatorios (incluye el perfil si vendes por perfil)')
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
      .single()

    setSaving(false)

    if (error) {
      setFormError(error.message)
      return
    }

    // Registrar ingreso (para métricas / renovaciones)
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

    // Enviar notificación automática por nueva venta (no bloqueante)
    try {
      await supabase.functions.invoke('send-notifications', {
        body: {
          ventaId: data.id,
          motivo: 'nueva_venta',
          perfilId: data.perfil_id || null,
        },
      })
    } catch (e) {
      console.error('Error enviando notificación de nueva venta', e)
    }

    setVentas((prev) => [data, ...prev])
    resetForm()
    setOpenNewVenta(false)
  }

  async function handleEdit(e) {
    e.preventDefault()
    setFormError(null)

    if (!editingId) return

    if (
      !clienteId ||
      !servicioId ||
      !cuentaId ||
      !fechaInicio ||
      !fechaVencimientoVenta ||
      (modoVenta === 'perfil' && !perfilId)
    ) {
      setFormError('Todos los campos son obligatorios (incluye el perfil si vendes por perfil)')
      return
    }

    if (!cuentaCorreo.trim() || !cuentaContrasena.trim()) {
      setFormError('Correo y contraseña de la cuenta son obligatorios')
      return
    }

    setSaving(true)

    // Actualizar credenciales de la cuenta para que se reflejen en todo el sistema
    const { error: cuentaError } = await supabase
      .from('cuentas_servicios')
      .update({
        correo: cuentaCorreo.trim(),
        contrasena: cuentaContrasena.trim(),
      })
      .eq('id', cuentaId)

    if (cuentaError) {
      setSaving(false)
      setFormError(cuentaError.message)
      return
    }

    const { error } = await supabase
      .from('ventas')
      .update({
        cliente_id: clienteId,
        cuenta_servicio_id: cuentaId,
        perfil_id: modoVenta === 'perfil' ? perfilId : null,
        fecha_inicio: fechaInicio,
        fecha_vencimiento: fechaVencimientoVenta,
      })
      .eq('id', editingId)

    setSaving(false)

    if (error) {
      setFormError(error.message)
      return
    }

    // Si cambiaron las credenciales, enviar notificación al cliente
    const newCorreo = cuentaCorreo.trim()
    const newContrasena = cuentaContrasena.trim()
    const credencialesCambiadas =
      oldCuentaCorreo !== newCorreo || oldCuentaContrasena !== newContrasena

    if (credencialesCambiadas) {
      try {
        await supabase.functions.invoke('send-notifications', {
          body: {
            ventaId: editingId,
            motivo: 'cambio_credenciales',
            oldCorreo: oldCuentaCorreo,
            oldContrasena: oldCuentaContrasena,
            newCorreo,
            newContrasena,
          },
        })
      } catch (e) {
        console.error('Error enviando notificación de cambio de credenciales', e)
      }
    }

    // Volver a cargar ventas para tener los joins actualizados
    const { data, error: ventasError } = await supabase
      .from('ventas')
      .select(`
        id,
        cliente_id,
        cuenta_servicio_id,
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
      .order('fecha_venta', { ascending: false })

    if (!ventasError) {
      setVentas(data || [])
    }

    resetForm()
    setOpenEditVenta(false)
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
      const cliente = venta?.clientes
      const cuenta = venta?.cuentas_servicios
      const servicioNombre = cuenta?.servicios?.nombre || 'Servicio'
      const telefono = cliente?.telefono

      const phoneValidation = validateWhatsAppPhone(telefono)
      if (!phoneValidation.ok) {
        window.alert(phoneValidation.message)
        return
      }

      const { data: configData } = await supabase
        .from('configuraciones_usuario')
        .select('nombre_negocio')
        .eq('user_id', user.id)
        .maybeSingle()

      const empresa = configData?.nombre_negocio || 'Ventas Pro'
      const clienteNombre = cliente ? `${cliente.nombre} ${cliente.apellido}` : 'cliente'

      let perfilInfo = null
      if (venta?.perfil_id) {
        const { data: p } = await supabase
          .from('perfiles_cuentas')
          .select('id, numero, nombre, pin')
          .eq('id', venta.perfil_id)
          .maybeSingle()
        perfilInfo = p || null
      }

      const fechaVence = venta?.fecha_vencimiento || null
      const estado = getEstadoVenta(fechaVence)
      const estadoLabel = (estado?.label || '').toLowerCase()

      const tipo = venta?.perfil_id ? 'Perfil' : 'Cuenta completa'
      const perfilLine = venta?.perfil_id
        ? `Perfil: ${perfilInfo?.numero ? `#${perfilInfo.numero}` : ''}${perfilInfo?.nombre ? ` (${perfilInfo.nombre})` : ''}`.trim()
        : null
      const pinLine = venta?.perfil_id
        ? `Pin: ${perfilInfo?.pin || 'Ninguno'}`
        : null

      const datosAcceso = [
        `Servicio: ${servicioNombre}`,
        `Tipo: ${tipo}`,
        `Cuenta: ${cuenta?.correo || '—'}`,
        `Contraseña: ${cuenta?.contrasena || '—'}`,
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
        window.alert('No se pudo abrir WhatsApp. Revisa el teléfono (formato internacional).')
      }
    } catch (e) {
      console.error('Error generando WhatsApp para la venta', e)
      window.alert('Ocurrió un error preparando el WhatsApp.')
    } finally {
      setSendingVentaId(null)
    }
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
      .single()

    setSavingRenovacion(false)

    if (error) {
      setRenovacionError(error.message)
      return
    }

    // Registrar ingreso de renovación (para que sume en estadísticas)
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

    try {
      await supabase.functions.invoke('send-notifications', {
        body: { ventaId: data.id, motivo: 'renovacion' },
      })
    } catch (e) {
      console.error('Error enviando notificación de renovación', e)
    }

    setVentas((prev) => prev.map((v) => (v.id === data.id ? data : v)))
    setOpenRenovacionModal(false)
    setVentaRenovando(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Ventas</h2>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition-colors"
          onClick={() => openNewVentaModal()}
        >
          <Plus size={18} />
          Nueva Venta
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Buscador */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Buscar:</span>
          <input
            type="text"
            placeholder="Cliente, servicio, correo..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setCurrentPage(1)
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs md:text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-52 md:w-72"
          />
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Filtro por estado */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Estado:</span>
            <select
              value={estadoFilter}
              onChange={(e) => {
                setEstadoFilter(e.target.value)
                setCurrentPage(1)
              }}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs md:text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">Todos</option>
              <option value="vigente">Vigente</option>
              <option value="por-vencer">Por vencer</option>
              <option value="vencido">Vencido (hoy)</option>
            </select>
          </div>

          {/* Filtro por servicio */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Servicio:</span>
            <select
              value={servicioFilter}
              onChange={(e) => {
                setServicioFilter(e.target.value)
                setCurrentPage(1)
              }}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs md:text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[140px]"
            >
              <option value="all">Todos</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Tamaño de página */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Mostrar:</span>
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
            <span className="text-xs text-slate-500">registros</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700">
            <tr>
              <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">#</th>
              <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">Cliente</th>
              <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">Teléfono</th>
              <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">Servicio</th>
              <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">Cuenta</th>
              <th className="px-4 py-4 text-left font-bold text-white uppercase tracking-wide text-xs">Contraseña</th>
              <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">Precio</th>
              <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">Fecha Inicio</th>
              <th className="px-4 py-4 text-center font-bold text-white uppercase tracking-wide text-xs">
                <div className="inline-flex items-center justify-center gap-1">
                  <span>Fecha Vence.</span>
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
                <td colSpan={11} className="px-4 py-8 text-center">
                  <div className="flex items-center justify-center gap-2 text-slate-500">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    <span>Cargando ventas...</span>
                  </div>
                </td>
              </tr>
            )}

            {!loading && error && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-sm text-rose-600">
                  Error al cargar ventas: {error}
                </td>
              </tr>
            )}

            {!loading && !error && ventas.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center">
                  <div className="text-slate-400">📝 Aún no hay ventas registradas.</div>
                </td>
              </tr>
            )}

            {!loading && !error &&
              paginatedVentas.map((venta, index) => {
                const cliente = venta.clientes
                const cuenta = venta.cuentas_servicios
                const servicioNombre = cuenta?.servicios?.nombre || '—'
                const fechaInicioMostrar = venta.fecha_inicio || venta.fecha_venta || null
                const fechaVenceMostrar = venta.fecha_vencimiento || cuenta?.fecha_vencimiento || null
                const estado = getEstadoVenta(fechaVenceMostrar)
                const esVentaPorPerfil = !!venta.perfil_id

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
                    <td className="px-4 py-4 text-slate-900 font-medium">
                      {cliente ? `${cliente.nombre} ${cliente.apellido}` : '—'}
                    </td>
                    <td className="px-4 py-4 text-slate-600">{cliente?.telefono || '—'}</td>
                    <td className="px-4 py-4 text-slate-900 font-medium">{servicioNombre}</td>
                    <td className="px-4 py-4 text-slate-900 font-mono text-xs">
                      <div className="flex flex-col gap-1">
                        <span>{cuenta?.correo || '—'}</span>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            esVentaPorPerfil
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {esVentaPorPerfil ? 'Venta por PERFIL' : 'Cuenta COMPLETA'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <code className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 font-mono text-xs border border-slate-200">
                        {cuenta?.contrasena || '—'}
                      </code>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="inline-flex items-center justify-center px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-sm border border-emerald-200">
                        {formatMoney(venta.monto || 0, currency, { maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center text-slate-700 font-medium">
                      {formatDateDisplay(fechaInicioMostrar)}
                    </td>
                    <td className="px-4 py-4 text-center text-slate-700 font-medium">
                      {formatDateDisplay(fechaVenceMostrar)}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border-2 ${estado.color}`}>
                        {estado.label.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEditModal(venta)}
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

      <Modal open={openNewVenta} title="Nueva Venta" onClose={() => { setOpenNewVenta(false); resetForm(); }}>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <select
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Selecciona cliente</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} {c.apellido} {c.telefono ? `(${c.telefono})` : ''}
                </option>
              ))}
            </select>

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
                }
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Selecciona servicio</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>

            <select
              value={cuentaId}
              onChange={async (e) => {
                const value = e.target.value
                setCuentaId(value)
                setPerfilesDisponibles([])
                setPerfilId('')
                const cuenta = cuentasServicioSeleccionado.find((c) => c.id === value)
                if (cuenta) {
                  setPrecioVenta(cuenta.precio.toString())
                  // La fecha de vencimiento de la VENTA es independiente de la fecha de vencimiento de la CUENTA.
                  // Se calcula por defecto desde la fecha de inicio, pero es editable.
                  const tienePerfilVendido = cuentasConPerfilVendidoIds.has(cuenta.id)
                  if (tienePerfilVendido) {
                    // Si ya hay perfiles vendidos, forzamos modo perfil y cargamos perfiles libres
                    setModoVenta('perfil')
                    await fetchPerfilesLibresByCuenta(value)
                  } else if (modoVenta === 'perfil') {
                    await fetchPerfilesLibresByCuenta(value)
                  }
                }
              }}
              disabled={!servicioId}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 md:col-span-2 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">Selecciona cuenta</option>
              {cuentasServicioSeleccionado.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.correo} - vence {new Date(c.fecha_vencimiento).toLocaleDateString('es-ES')}
                </option>
              ))}
            </select>

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
              value={fechaInicio}
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
              value={fechaVencimientoVenta}
              onChange={(e) => {
                setAutoCalcVencimiento(false)
                setFechaVencimientoVenta(e.target.value)
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {formError && <p className="text-sm text-rose-500">{formError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setOpenNewVenta(false)
                resetForm()
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

      <Modal open={openEditVenta} title="Editar Venta" onClose={() => { setOpenEditVenta(false); resetForm(); }}>
        <form className="space-y-4" onSubmit={handleEdit}>
          <div className="grid gap-4 md:grid-cols-2">
            <select
              value={clienteId}
              disabled
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
            >
              <option value="">Selecciona cliente</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} {c.apellido} {c.telefono ? `(${c.telefono})` : ''}
                </option>
              ))}
            </select>

            <select
              value={servicioId}
              disabled
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
            >
              <option value="">Selecciona servicio</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>

            <select
              value={cuentaId}
              disabled
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 md:col-span-2"
            >
              <option value="">Selecciona cuenta</option>
              {cuentasServicioSeleccionado.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.correo} - vence {new Date(c.fecha_vencimiento).toLocaleDateString('es-ES')}
                </option>
              ))}
            </select>

            <input
              type="email"
              placeholder="Correo de la cuenta"
              value={cuentaCorreo}
              onChange={(e) => setCuentaCorreo(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Contraseña de la cuenta"
              value={cuentaContrasena}
              onChange={(e) => setCuentaContrasena(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            <input
              type="number"
              step="0.01"
              placeholder="Precio de venta"
              value={precioVenta}
              disabled
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
            />

            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              disabled
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
            />
            <input
              type="date"
              value={fechaVencimientoVenta}
              onChange={(e) => setFechaVencimientoVenta(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {formError && <p className="text-sm text-rose-500">{formError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setOpenEditVenta(false)
                resetForm()
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
              {saving ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={openRenovacionModal}
        title="Renovación de cuenta"
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
    </div>
  )
}
