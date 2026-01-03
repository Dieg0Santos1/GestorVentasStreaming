import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'

const titles = {
  dashboard: 'Dashboard',
  proveedores: 'Proveedores',
  clientes: 'Clientes',
  servicios: 'Servicios',
  ventas: 'Ventas',
  reportes: 'Reportes',
  configuracion: 'Configuración',
}

export function TopBar({ current, onToggleSidebarMobile }) {
  const { user, signOut } = useAuth()
  const [empresaNombre, setEmpresaNombre] = useState(null)
  const [avatarOpen, setAvatarOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetchConfig() {
      if (!user) {
        setEmpresaNombre(null)
        return
      }

      const { data, error } = await supabase
        .from('configuraciones_usuario')
        .select('nombre_negocio')
        .eq('user_id', user.id)
        .maybeSingle()

      if (cancelled) return

      if (!error && data) {
        setEmpresaNombre(data.nombre_negocio || null)
      }
    }

    fetchConfig()

    function handleUpdated() {
      fetchConfig()
    }

    window.addEventListener('config-updated', handleUpdated)

    return () => {
      cancelled = true
      window.removeEventListener('config-updated', handleUpdated)
    }
  }, [user])

  const displayNombre = empresaNombre || 'Administrador'
  const inicial = (empresaNombre || 'A').trim().charAt(0).toUpperCase() || 'A'

  async function handleLogout() {
    setAvatarOpen(false)
    await signOut()
  }

  return (
    <header className="h-16 border-b border-slate-200 flex items-center justify-between px-4 md:px-8 bg-white/80 backdrop-blur relative z-10">
      <div className="flex items-center gap-3">
        {onToggleSidebarMobile && (
          <button
            type="button"
            onClick={onToggleSidebarMobile}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-slate-700 shadow-sm md:hidden"
            aria-label="Abrir menú"
          >
            ☰
          </button>
        )}
        <h1 className="text-lg md:text-2xl font-semibold tracking-tight text-slate-900">{titles[current]}</h1>
      </div>
      <div className="flex items-center gap-3 relative">
        <span className="text-xs text-slate-500 hidden sm:inline max-w-[160px] truncate">
          {displayNombre}
        </span>
        <button
          type="button"
          onClick={() => setAvatarOpen((prev) => !prev)}
          className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-600 to-emerald-500 text-white flex items-center justify-center font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white"
        >
          {inicial}
        </button>

        {avatarOpen && (
          <div className="absolute right-0 top-11 w-44 rounded-xl border border-slate-200 bg-white shadow-lg py-1 text-sm">
            <div className="px-3 py-2 border-b border-slate-100 text-[11px] text-slate-500">
              Sesión iniciada como
              <div className="font-semibold text-slate-800 truncate">{displayNombre}</div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full text-left px-3 py-2 text-[12px] text-rose-600 hover:bg-rose-50 flex items-center gap-2"
            >
              <span>⏏</span>
              <span>Cerrar sesión</span>
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
