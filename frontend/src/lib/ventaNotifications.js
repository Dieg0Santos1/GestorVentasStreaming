
import { validateWhatsAppPhone } from './whatsapp'

function normalizeDateString(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 10)
  try {
    return new Date(value).toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

function parseDate(value) {
  const raw = normalizeDateString(value)
  if (!raw) return null
  const [y, m, d] = raw.split('-')
  if (!y || !m || !d) return null
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  date.setHours(12, 0, 0, 0)
  return date
}

function inferMonthsBetween(start, end) {
  const startDate = parseDate(start)
  const endDate = parseDate(end)
  if (!startDate || !endDate) return 1

  const months =
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth())

  return Math.max(months || 1, 1)
}

function getEstadoVenta(fechaVencimiento) {
  const fechaNorm = normalizeDateString(fechaVencimiento)
  if (!fechaNorm) return 'sin-fecha'

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const [y, m, d] = fechaNorm.split('-')
  const vencimiento = new Date(Number(y), Number(m) - 1, Number(d))
  vencimiento.setHours(0, 0, 0, 0)

  const diffTime = vencimiento - hoy
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return 'vencida'
  if (diffDays === 0) return 'vencido'
  if (diffDays <= 1) return 'por-vencer'
  return 'vigente'
}

async function loadPerfilInfo(supabase, venta) {
  if (!venta?.perfil_id) return null
  if (venta?.perfil_info) return venta.perfil_info

  const { data } = await supabase
    .from('perfiles_cuentas')
    .select('id, numero, nombre, pin')
    .eq('id', venta.perfil_id)
    .maybeSingle()

  return data || null
}
function buildWhatsAppPayload(venta, motivo, perfilInfo, extra = {}) {
  const cliente = venta?.clientes
  const cuenta = venta?.cuentas_servicios
  const servicioNombre = cuenta?.servicios?.nombre || 'Servicio'
  const fechaInicio = venta?.fecha_inicio || venta?.fecha_venta || null
  const fechaVence = venta?.fecha_vencimiento || cuenta?.fecha_vencimiento || null
  const meses = inferMonthsBetween(fechaInicio, fechaVence)
  const estado = getEstadoVenta(fechaVence)

  let kind = 'compra'
  if (motivo === 'renovacion') {
    kind = 'renovacion'
  } else if (motivo === 'manual') {
    kind = estado === 'vigente' ? 'compra' : 'alerta'
  } else if (motivo === 'cambio_credenciales') {
    kind = 'cambio_credenciales'
  }

  return {
    kind,
    telefono: cliente?.telefono?.replace('+', '') ?? '',
    clienteNombre: [cliente?.nombre, cliente?.apellido].filter(Boolean).join(' ').trim(),
    servicio: servicioNombre,
    meses,
    vence: fechaVence,
    monto: Number(venta?.monto ?? cuenta?.precio ?? 0),
    correo: extra.newCorreo ?? cuenta?.correo ?? '',
    contrasena: extra.newContrasena ?? cuenta?.contrasena ?? '',
    perfil: perfilInfo?.numero ?? null,
    pin: perfilInfo?.pin ?? null,
    oldCorreo: extra.oldCorreo ?? null,
    oldContrasena: extra.oldContrasena ?? null,
    newCorreo: extra.newCorreo ?? null,
    newContrasena: extra.newContrasena ?? null,
  }
}
export async function sendVentaAutomaticNotification({
  supabase,
  venta,
  motivo,
  extra = {},
}) {
  const telefono = venta?.clientes?.telefono
  const validation = validateWhatsAppPhone(telefono)

  if (!validation.ok) {
    throw new Error(validation.message)
  }

  const perfilInfo = await loadPerfilInfo(supabase, venta)
  const body = buildWhatsAppPayload(venta, motivo, perfilInfo, extra)

  const { data, error } = await supabase.functions.invoke('wamundo-send', { body })

  if (!error) {
    return { provider: 'wamundo-send', data }
  }

  throw error
}
