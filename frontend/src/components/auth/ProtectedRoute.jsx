import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="flex flex-col items-center gap-3 text-slate-600">
          <div className="h-8 w-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          <p className="text-sm font-medium">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return children
}
