const navigation = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'proveedores', label: 'Proveedores', icon: '🚚' },
  { id: 'clientes', label: 'Clientes', icon: '👥' },
  { id: 'servicios', label: 'Servicios', icon: '🧩' },
  { id: 'ventas', label: 'Ventas', icon: '💵' },
  { id: 'reportes', label: 'Reportes', icon: '⚠️' },
  { id: 'configuracion', label: 'Configuración', icon: '⚙️' },
]

export function Sidebar({ current, onChange, collapsed = false, onToggle, reportesCount = 0, mobile = false }) {
  const baseClasses = 'border-r border-blue-900/30 bg-gradient-to-b from-blue-900 via-blue-800 to-emerald-800 flex flex-col text-slate-50 h-screen sticky top-0 transition-all duration-200'
  const visibility = mobile ? '' : 'hidden md:flex'
  const width = collapsed && !mobile ? 'w-20' : 'w-64'

  return (
    <aside
      className={`${baseClasses} ${visibility} ${width}`}
    >
      <div
        className={`px-4 border-b border-blue-900/40 ${
          collapsed ? 'h-28 py-3' : 'h-16 flex items-center'
        }`}
      >
        <div
          className={`w-full ${
            collapsed ? 'flex flex-col items-center justify-center gap-2' : 'flex items-center justify-between gap-2'
          }`}
        >
          <div className={`flex items-center ${collapsed ? 'flex-col gap-2' : 'gap-2'}`}>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white border border-white/30 font-semibold">
              V
            </span>
            {!collapsed && (
              <div>
                <p className="font-semibold tracking-tight">Ventas Pro</p>
                <p className="text-xs text-slate-200">Gestor de Cuentas Streaming</p>
              </div>
            )}
          </div>

          {onToggle && (
            <button
              type="button"
              onClick={onToggle}
              className={`inline-flex items-center justify-center rounded-xl border shadow-sm transition-all bg-white/10 text-white border-white/30 hover:bg-white/15 ring-1 ring-white/10 ${
                collapsed ? 'h-12 w-full flex-col gap-0.5 px-0' : 'h-10 px-3 gap-2'
              }`}
              aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
              title={collapsed ? 'Expandir menú' : 'Contraer menú'}
            >
              <span aria-hidden className={collapsed ? 'text-base leading-none' : 'leading-none'}>
                {collapsed ? '☰' : '«'}
              </span>
              <span
                className={`${collapsed ? 'text-[10px] leading-none max-w-full px-1 truncate' : 'text-xs'} font-semibold`}
              >
                Menú
              </span>
            </button>
          )}
        </div>
      </div>
      <nav className="flex-1 py-4 space-y-1">
        {navigation.map((item) => {
          const active = current === item.id
          const isReportes = item.id === 'reportes'
          const showBadge = isReportes && Number(reportesCount) > 0

          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={`w-full flex items-center ${
                collapsed ? 'justify-center px-0' : 'justify-start px-5'
              } gap-3 py-3 text-sm font-medium transition-colors ${
                active
                  ? 'bg-white/10 text-white border-r-4 border-emerald-300'
                  : 'text-slate-100/80 hover:bg-white/5'
              }`}
            >
              <span className="text-lg relative" aria-hidden>
                {item.icon}
                {showBadge && collapsed && (
                  <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-amber-400 text-slate-900 text-[10px] font-bold flex items-center justify-center border border-white/40">
                    {reportesCount}
                  </span>
                )}
              </span>
              {!collapsed && (
                <span className="flex-1 flex items-center justify-between gap-2">
                  <span>{item.label}</span>
                  {showBadge && (
                    <span className="min-w-[20px] h-5 px-2 rounded-full bg-amber-400 text-slate-900 text-[11px] font-bold flex items-center justify-center border border-white/30">
                      {reportesCount}
                    </span>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
