import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { MainLayout } from './layout/MainLayout'
import { CuentasServicio } from './pages/CuentasServicio'
import { VentasCliente } from './pages/VentasCliente'
import { CuentasProveedor } from './pages/CuentasProveedor'
import { Login } from './pages/Login'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/auth/ProtectedRoute'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          />
          <Route
            path="/servicios/:servicioId/cuentas"
            element={
              <ProtectedRoute>
                <CuentasServicio />
              </ProtectedRoute>
            }
          />
          <Route
            path="/proveedores/:proveedorId/cuentas"
            element={
              <ProtectedRoute>
                <CuentasProveedor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/clientes/:clienteId/ventas"
            element={
              <ProtectedRoute>
                <VentasCliente />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
