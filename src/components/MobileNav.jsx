import { useApp } from '../lib/AppContext'
import {
  LayoutDashboard, ShoppingCart, Package, Coffee,
  BookOpen, Users, ClipboardList
} from 'lucide-react'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard },
  { id: 'ventas', label: 'Ventas', icon: ShoppingCart },
  { id: 'productos', label: 'Productos', icon: Package },
  { id: 'buffet', label: 'Buffet', icon: Coffee },
  { id: 'deudores', label: 'Deudores', icon: BookOpen },
]

export default function MobileNav() {
  const { currentModule, setCurrentModule } = useApp()

  return (
    <nav className="mobile-nav">
      <div className="mobile-nav-inner">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon
          const active = currentModule === item.id
          return (
            <button
              key={item.id}
              onClick={() => setCurrentModule(item.id)}
              className={`mobile-nav-btn ${active ? 'active' : ''}`}
              style={{
                background: active ? 'var(--accent-soft)' : 'none',
                borderRadius: '10px'
              }}
            >
              <Icon />
              {item.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
