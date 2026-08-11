import { useState, useEffect, useMemo } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Menu, ShieldAlert } from 'lucide-react'
import { AppProvider, useApp } from './lib/AppContext.jsx'
import { dbGetSession, dbGetUserInfo, dbGetTenant, sb } from './lib/supabase.js'
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
import IAModule from './modules/ia/IAModule.jsx'
import './index.css'

// Map of route id -> { component, roles (from Sidebar MENU_ITEMS logic) }
const ROUTE_MAP = [
  { id: 'dashboard', component: DashboardModule, roles: [] },
  { id: 'ventas', component: VentasModule, roles: [] },
  { id: 'registro_ventas', component: RegistroVentasModule, roles: [] },
  { id: 'productos', component: ProductosModule, roles: [] },
  { id: 'stock', component: StockModule, roles: [] },
  { id: 'buffet', component: BuffetModule, roles: [] },
  { id: 'finanzas', component: FinanzasModule, roles: ['admin'] },
  { id: 'deudores', component: DeudoresModule, roles: [] },
  { id: 'empleados', component: EmpleadosModule, roles: ['admin', 'super_admin'] },
  { id: 'historial', component: HistorialModule, roles: ['admin', 'super_admin'] },
  { id: 'superadmin', component: SuperAdminModule, roles: ['super_admin'] },
  { id: 'configuracion', component: ConfiguracionModule, roles: ['admin', 'super_admin'] },
  { id: 'ia', component: IAModule, roles: [] },
]

function AccessDenied() {
  return (
    <div style={{ 
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '60vh', gap: '16px', color: 'var(--text-muted)'
    }}>
      <ShieldAlert size={48} color="var(--danger)" />
      <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>Acceso Denegado</h2>
      <p style={{ margin: 0, fontSize: '0.9rem' }}>No tenés permiso para ver este apartado.</p>
    </div>
  )
}

function ProtectedRoute({ routeItem, children }) {
  const { hasModuleAccess, hasRole } = useApp()

  const hasAccess = hasModuleAccess(routeItem)
  if (!hasAccess) return <AccessDenied />
  return children
}

function SmartRedirect() {
  const { userInfo, hasModuleAccess, hasRole } = useApp()

  if (!userInfo) return <Navigate to="/ventas" replace />

  // Super admin siempre va a /superadmin
  if (hasRole('super_admin')) return <Navigate to="/superadmin" replace />

  // Buscar el primer módulo al que tiene acceso
  const firstAllowed = ROUTE_MAP.find(r => hasModuleAccess(r))
  if (firstAllowed) return <Navigate to={`/${firstAllowed.id}`} replace />

  // Fallback extremo
  return <Navigate to="/ventas" replace />
}

function AppShell() {
  const {
    user, setUser,
    userInfo, setUserInfo,
    tenantId, setTenantId,
    tenant, setTenant,
    sidebarCollapsed, setSidebarCollapsed
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

  // Realtime: escuchar cambios en los permisos del usuario logueado
  useEffect(() => {
    if (!user?.id) return

    const channel = sb.channel('user-permissions-sync')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: `id=eq.${user.id}`
      }, (payload) => {
        const updated = payload.new
        if (updated) {
          setUserInfo(prev => ({
            ...prev,
            access_modules: updated.access_modules,
            role: updated.role,
            name: updated.name,
          }))
        }
      })
      .subscribe()

    return () => { sb.removeChannel(channel) }
  }, [user?.id])

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

      {/* Floating Menu Button when Sidebar is fully closed */}
      {sidebarCollapsed && (
        <button
          className="sidebar-desktop"
          onClick={() => setSidebarCollapsed(false)}
          style={{
            position: 'absolute', top: '16px', left: '16px', zIndex: 900,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '10px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}
        >
          <Menu size={20} color="var(--text-primary)" />
        </button>
      )}

      {/* Main Content */}
      <main className="workspace">
        <Routes>
          <Route path="/" element={<SmartRedirect />} />
          {ROUTE_MAP.map(r => (
            <Route 
              key={r.id} 
              path={`/${r.id}`} 
              element={
                <ProtectedRoute routeItem={r}>
                  <r.component />
                </ProtectedRoute>
              } 
            />
          ))}
          <Route path="*" element={<SmartRedirect />} />
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
