import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useApp } from '../lib/AppContext'
import {
  LayoutDashboard, ShoppingCart, Package, Layers,
  Coffee, Users, ClipboardList, Settings, LogOut,
  Crown, BookOpen, Download, Receipt, TrendingUp
} from 'lucide-react'
import { dbLogout } from '../lib/supabase'

const MENU_ITEMS = [
  { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard, roles: [] },
  { id: 'ventas', label: 'Ventas', icon: ShoppingCart, roles: [] },
  { id: 'registro_ventas', label: 'Registro', icon: Receipt, roles: [] },
  { id: 'finanzas', label: 'Caja', icon: TrendingUp, roles: ['admin'] },
  { id: 'productos', label: 'Productos', icon: Package, roles: [] },
  { id: 'stock', label: 'Stock', icon: Layers, roles: [] },
  { id: 'buffet', label: 'Buffet', icon: Coffee, roles: [] },
  { id: 'deudores', label: 'Deudores', icon: BookOpen, roles: [] },
  { id: 'empleados', label: 'Empleados', icon: Users, roles: ['admin', 'super_admin'] },
  { id: 'historial', label: 'Historial', icon: ClipboardList, roles: ['admin', 'super_admin'] },
  { id: 'superadmin', label: 'S. Admin', icon: Crown, roles: ['super_admin'] },
  { id: 'configuracion', label: 'Config.', icon: Settings, roles: ['admin', 'super_admin'] },
]

export default function MobileNav() {
  const { hasRole, hasModuleAccess } = useApp()
  const [deferredPrompt, setDeferredPrompt] = useState(null)

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function handleInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') setDeferredPrompt(null)
    }
  }

  async function handleLogout() {
    try {
      await dbLogout()
    } catch (e) {
      console.error('Logout error:', e)
    } finally {
      window.location.reload()
    }
  }

  const visibleItems = MENU_ITEMS.filter(item => {
    if (hasRole('super_admin')) return item.id === 'superadmin'
    return hasModuleAccess(item)
  })

  return (
    <nav className="mobile-nav">
      <div className="mobile-nav-inner">
        {visibleItems.map(item => {
          const Icon = item.icon
          return (
            <NavLink
              to={`/${item.id}`}
              key={item.id}
              className={({ isActive }) => `mobile-nav-btn ${isActive ? 'active' : ''}`}
              style={({ isActive }) => ({
                background: isActive ? 'var(--accent-soft)' : 'none',
                borderRadius: '10px',
                textDecoration: 'none'
              })}
            >
              <Icon />
              {item.label}
            </NavLink>
          )
        })}
        {deferredPrompt && (
          <button
            onClick={handleInstall}
            className="mobile-nav-btn"
            style={{ background: 'var(--success-soft)', borderRadius: '10px', color: 'var(--success)' }}
          >
            <Download />
            Instalar
          </button>
        )}
        <button
          onClick={handleLogout}
          className="mobile-nav-btn"
          style={{ background: 'none', borderRadius: '10px', color: 'var(--danger)' }}
        >
          <LogOut />
          Salir
        </button>
      </div>
    </nav>
  )
}
