import { useApp } from '../lib/AppContext'
import {
  LayoutDashboard, ShoppingCart, Package, Layers,
  Coffee, Users, ClipboardList, Settings, LogOut,
  ChevronLeft, ChevronRight, ShoppingBag, Crown,
  BookOpen, TrendingUp
} from 'lucide-react'
import { dbLogout } from '../lib/supabase'

const MENU_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: [] },
  { id: 'ventas', label: 'Ventas', icon: ShoppingCart, roles: [] },
  { id: 'productos', label: 'Productos', icon: Package, roles: [] },
  { id: 'stock', label: 'Stock', icon: Layers, roles: [] },
  { id: 'buffet', label: 'Buffet', icon: Coffee, roles: [] },
  { id: 'deudores', label: 'Deudores', icon: BookOpen, roles: [] },
  { id: 'empleados', label: 'Empleados', icon: Users, roles: ['admin', 'super_admin'] },
  { id: 'historial', label: 'Historial', icon: ClipboardList, roles: ['admin', 'super_admin'] },
  { id: 'superadmin', label: 'Super Admin', icon: Crown, roles: ['super_admin'] },
  { id: 'configuracion', label: 'Configuración', icon: Settings, roles: ['admin', 'super_admin'] },
]

export default function Sidebar() {
  const { currentModule, setCurrentModule, sidebarCollapsed, setSidebarCollapsed,
    userInfo, tenant, hasRole } = useApp()

  const visibleItems = MENU_ITEMS.filter(item =>
    item.roles.length === 0 || item.roles.some(r => hasRole(r))
  )

  async function handleLogout() {
    await dbLogout()
  }

  return (
    <aside style={{
      width: sidebarCollapsed ? '64px' : '240px',
      minHeight: '100vh',
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.25s ease',
      position: 'relative',
      zIndex: 100,
      flexShrink: 0
    }}
    className="sidebar-desktop"
    >
      {/* Header */}
      <div style={{
        padding: sidebarCollapsed ? '20px 14px' : '20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        overflow: 'hidden'
      }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '10px',
          background: 'var(--accent-soft)',
          border: '1px solid var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          overflow: 'hidden'
        }}>
          <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        {!sidebarCollapsed && (
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              {tenant?.name || 'StackHard Sistema Negocio'}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>StackHard</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {visibleItems.map(item => {
            const Icon = item.icon
            const active = currentModule === item.id
            return (
              <button
                key={item.id}
                onClick={() => setCurrentModule(item.id)}
                title={sidebarCollapsed ? item.label : ''}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: sidebarCollapsed ? '10px 14px' : '10px 14px',
                  borderRadius: '10px',
                  background: active ? 'var(--accent-soft)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                  border: active ? '1px solid rgba(245,158,11,0.2)' : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  fontWeight: active ? 600 : 400,
                  fontSize: '0.875rem',
                  width: '100%',
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
                onMouseEnter={e => {
                  if (!active) {
                    e.currentTarget.style.background = 'var(--bg-tertiary)'
                    e.currentTarget.style.color = 'var(--text-primary)'
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = 'var(--text-secondary)'
                  }
                }}
              >
                <Icon size={18} style={{ flexShrink: 0 }} />
                {!sidebarCollapsed && item.label}
                {item.id === 'superadmin' && !sidebarCollapsed && (
                  <span className="badge badge-warning" style={{ marginLeft: 'auto', fontSize: '0.65rem', padding: '2px 6px' }}>SA</span>
                )}
              </button>
            )
          })}
        </div>
      </nav>

      {/* User + Collapse */}
      <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {/* User info */}
        {!sidebarCollapsed && userInfo && (
          <div style={{
            padding: '10px 12px',
            borderRadius: '10px',
            background: 'var(--bg-tertiary)',
            marginBottom: '4px'
          }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {userInfo.name || userInfo.email?.split('@')[0]}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
              {userInfo.role || 'vendedor'}
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 14px', borderRadius: '10px',
            background: 'transparent', color: 'var(--text-muted)',
            border: '1px solid transparent', cursor: 'pointer',
            fontSize: '0.875rem', width: '100%',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <LogOut size={18} />
          {!sidebarCollapsed && 'Cerrar sesión'}
        </button>

        <button
          onClick={() => setSidebarCollapsed(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '8px', borderRadius: '8px',
            background: 'var(--bg-tertiary)', color: 'var(--text-muted)',
            border: '1px solid var(--border)', cursor: 'pointer',
            transition: 'all 0.15s ease', width: '100%'
          }}
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span style={{ fontSize: '0.75rem', marginLeft: '6px' }}>Colapsar</span></>}
        </button>
      </div>
    </aside>
  )
}
