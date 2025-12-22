import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!email.trim() || !password.trim()) {
      setError('Correo y contraseña son obligatorios')
      return
    }

    setLoading(true)
    try {
      await signIn(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      console.error(err)
      setError(err.message || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white/95 rounded-2xl shadow-xl border border-slate-200 p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-blue-600 to-emerald-500 flex items-center justify-center text-white font-bold text-xl shadow-md">
            V
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
              Ventas Pro
            </h1>
            <p className="text-xs text-slate-500">Panel de gestión de ventas y cuentas</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Correo electrónico</label>
            <input
              type="email"
              autoComplete="email"
              placeholder="tucorreo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Contraseña</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white pl-3 pr-10 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Ingresando...' : 'Iniciar sesión'}
          </button>
        </form>

        <p className="text-[11px] text-slate-400 text-center pt-2">
          Acceso exclusivo para administradores del sistema.
        </p>
      </div>
    </div>
  )
}
