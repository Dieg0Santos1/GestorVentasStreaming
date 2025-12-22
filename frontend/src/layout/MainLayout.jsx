import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useCurrentPage } from '../hooks/useCurrentPage'
import { Sidebar } from '../components/layout/Sidebar'
import { TopBar } from '../components/layout/TopBar'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { Dashboard } from '../pages/Dashboard'
import { Proveedores } from '../pages/Proveedores'
import { Clientes } from '../pages/Clientes'
import { Servicios } from '../pages/Servicios'
import { Ventas } from '../pages/Ventas'
import { Reportes } from '../pages/Reportes'
import { Configuracion } from '../pages/Configuracion'

export function MainLayout() {
  const { user } = useAuth()
  const location = useLocation()
  const initialPage = location.state?.initialPage || 'dashboard'
  const { current, setCurrent } = useCurrentPage(initialPage)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [reportesCount, setReportesCount] = useState(0)

  useEffect(() => {
    if (!user?.id) return

    let cancelled = false

    async function fetchReportesCount() {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      const hoyISO = d.toISOString().slice(0, 10)

      // Contar SOLO ventas vencidas (día siguiente) que aún no hayan sido liberadas.
      // Si el usuario no ha ejecutado la migración de "liberada", hacemos fallback al conteo antiguo.
      let count = 0
      const primary = await supabase
        .from('ventas')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .lt('fecha_vencimiento', hoyISO)
        .eq('liberada', false)

      if (cancelled) return

      if (primary.error) {
        const fallback = await supabase
          .from('ventas')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .lt('fecha_vencimiento', hoyISO)

        if (cancelled) return
        if (fallback.error) {
          setReportesCount(0)
          return
        }

        count = fallback.count || 0
      } else {
        count = primary.count || 0
      }

      setReportesCount(count)
    }

    fetchReportesCount()

    const interval = window.setInterval(fetchReportesCount, 60_000)

    function handleUpdated() {
      fetchReportesCount()
    }

    window.addEventListener('reportes-updated', handleUpdated)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener('reportes-updated', handleUpdated)
    }
  }, [user?.id, current])

  return (
    <div className="h-screen overflow-hidden flex bg-slate-50 text-slate-900">
      <Sidebar
        current={current}
        onChange={setCurrent}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
        reportesCount={reportesCount}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar current={current} />

        <main className="flex-1 p-4 md:p-8 bg-gradient-to-br from-slate-50 via-slate-50 to-slate-100 overflow-y-auto overflow-x-hidden">
          {current === 'dashboard' && <Dashboard />}
          {current === 'proveedores' && <Proveedores />}
          {current === 'clientes' && <Clientes />}
          {current === 'servicios' && <Servicios />}
          {current === 'ventas' && <Ventas />}
          {current === 'reportes' && <Reportes />}
          {current === 'configuracion' && <Configuracion />}
        </main>
      </div>
    </div>
  )
}
