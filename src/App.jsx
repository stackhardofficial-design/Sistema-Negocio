import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AppProvider, useApp } from './lib/AppContext.jsx'
import { dbGetSession, dbGetUserInfo, dbGetTenant } from './lib/supabase.js'
import Login from './components/Login.jsx'
import Sidebar from './components/Sidebar.jsx'
import MobileNav from './components/MobileNav.jsx'
import ToastContainer from './components/ToastContainer.jsx'
import AIAgent from './components/AIAgent.jsx'
import DashboardModule from './modules/dashboard/DashboardModule.jsx'
import VentasModule from './modules/ventas/VentasModule.jsx'
import RegistroVentasModule from './modules/ventas/RegistroVentasModule.jsx'
import ProductosModule from './modules/productos/ProductosModule.jsx'
import StockModule from './modules/stock/StockModule.jsx'
import BuffetModule from './modules/buffet/BuffetModule.jsx'
import DeudoresModule from './modules/deudores/DeudoresModule.jsx'
import EmpleadosModule from './modules/empleados/EmpleadosModule.jsx'
import HistorialModule from './modules/historial/HistorialModule.jsx'
import SuperAdminModule from './modules/superadmin/SuperAdminModule.jsx'
import ConfiguracionModule from './modules/configuracion/ConfiguracionModule.jsx'
import FinanzasModule from './modules/finanzas/FinanzasModule.jsx'
import './index.css'


function AppShell() {
  const {
    user, setUser,
    userInfo, setUserInfo,
    tenantId, setTenantId,
    tenant, setTenant
  } = useApp()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      try {
        const { data } = await dbGetSession()
        if (data?.session?.user) {
          setUser(data.session.user)
          const info = await dbGetUserInfo(data.session.user.id)
          if (info) {
            setUserInfo(info)
            setTenantId(info.tenant_id)
            if (info.tenant_id) {
              const t = await dbGetTenant(info.tenant_id)
              if (t) setTenant(t)
            }
            if (info.role === 'super_admin') {
              // Now handled by Navigation if necessary
            }
          }
        }
      } catch (err) {
        console.error('Init error:', err)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  if (loading) {
    return (
      <div className="loading-screen">
        <div style={{
          width: '56px', height: '56px', borderRadius: '16px',
          background: 'var(--accent-soft)', border: '1px solid var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '8px', overflow: 'hidden'
        }}>
          <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <div className="spinner" />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Cargando sistema...</span>
      </div>
    )
  }

  if (!user) return <Login />

  return (
    <div className="app-layout">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <main className="workspace">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardModule />} />
          <Route path="/ventas" element={<VentasModule />} />
          <Route path="/registro_ventas" element={<RegistroVentasModule />} />
          <Route path="/productos" element={<ProductosModule />} />
          <Route path="/stock" element={<StockModule />} />
          <Route path="/buffet" element={<BuffetModule />} />
          <Route path="/finanzas" element={<FinanzasModule />} />
          <Route path="/deudores" element={<DeudoresModule />} />
          <Route path="/empleados" element={<EmpleadosModule />} />
          <Route path="/historial" element={<HistorialModule />} />
          <Route path="/superadmin" element={<SuperAdminModule />} />
          <Route path="/configuracion" element={<ConfiguracionModule />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>

      {/* Mobile Bottom Nav */}
      <MobileNav />

      {/* AI Agent Floating */}
      <AIAgent />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppShell />
        <ToastContainer />
      </AppProvider>
    </BrowserRouter>
  )
}
