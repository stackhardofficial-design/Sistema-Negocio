import { useState, useEffect } from 'react'
import { AppProvider, useApp } from './lib/AppContext'
import { dbGetSession, dbGetUserInfo, dbGetTenant } from './lib/supabase'
import Login from './components/Login'
import Sidebar from './components/Sidebar'
import MobileNav from './components/MobileNav'
import ToastContainer from './components/ToastContainer'
import AIAgent from './components/AIAgent'
import DashboardModule from './modules/dashboard/DashboardModule'
import VentasModule from './modules/ventas/VentasModule'
import ProductosModule from './modules/productos/ProductosModule'
import StockModule from './modules/stock/StockModule'
import BuffetModule from './modules/buffet/BuffetModule'
import DeudoresModule from './modules/deudores/DeudoresModule'
import EmpleadosModule from './modules/empleados/EmpleadosModule'
import HistorialModule from './modules/historial/HistorialModule'
import SuperAdminModule from './modules/superadmin/SuperAdminModule'
import ConfiguracionModule from './modules/configuracion/ConfiguracionModule'
import './index.css'

const MODULE_MAP = {
  dashboard: DashboardModule,
  ventas: VentasModule,
  productos: ProductosModule,
  stock: StockModule,
  buffet: BuffetModule,
  deudores: DeudoresModule,
  empleados: EmpleadosModule,
  historial: HistorialModule,
  superadmin: SuperAdminModule,
  configuracion: ConfiguracionModule
}

function AppShell() {
  const {
    user, setUser,
    userInfo, setUserInfo,
    tenantId, setTenantId,
    tenant, setTenant,
    currentModule
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
              setCurrentModule('superadmin')
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
          marginBottom: '8px'
        }}>
          <span style={{ fontSize: '28px' }}>🛒</span>
        </div>
        <div className="spinner" />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Cargando sistema...</span>
      </div>
    )
  }

  if (!user) return <Login />

  const ActiveModule = MODULE_MAP[currentModule] || DashboardModule

  return (
    <div className="app-layout">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <main className="workspace">
        <ActiveModule />
      </main>

      {/* Mobile Bottom Nav */}
      <MobileNav />

      {/* AI Agent Floating */}
      <AIAgent />

      {/* Toast Notifications */}
      <ToastContainer />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  )
}
