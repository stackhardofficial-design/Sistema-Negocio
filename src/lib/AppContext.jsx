import { createContext, useContext, useState, useCallback } from 'react'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userInfo, setUserInfo] = useState(null)  // { name, role, roles[], tenant_id, tenants{} }
  const [tenantId, setTenantId] = useState(null)
  const [tenant, setTenant] = useState(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [themeColor, setThemeColor] = useState('amber')

  // Global toast notifications
  const [toasts, setToasts] = useState([])

  const toast = useCallback((message, type = 'success', duration = 3500) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // Roles helpers
  const hasRole = useCallback((role) => {
    if (!userInfo) return false
    const roles = userInfo.roles || []
    if (userInfo.role) roles.push(userInfo.role)
    return roles.includes(role)
  }, [userInfo])

  const isSuperAdmin = useCallback(() => hasRole('super_admin'), [hasRole])
  const isAdmin = useCallback(() => hasRole('admin') || hasRole('super_admin'), [hasRole])
  const isVendedor = useCallback(() => true, []) // All logged-in users can sell

  const hasModuleAccess = useCallback((item) => {
    if (!userInfo) return false
    if (hasRole('super_admin')) return true

    // Si tiene accesos explícitos configurados
    if (userInfo.access_modules && Array.isArray(userInfo.access_modules)) {
      return userInfo.access_modules.includes(item.id)
    }

    // Fallback a lógica legacy por roles
    if (item.roles && item.roles.length > 0) return item.roles.some(r => hasRole(r))
    return !hasRole('super_admin')
  }, [userInfo, hasRole])

  return (
    <AppContext.Provider value={{
      user, setUser,
      userInfo, setUserInfo,
      tenantId, setTenantId,
      tenant, setTenant,
      sidebarCollapsed, setSidebarCollapsed,
      mobileNavOpen, setMobileNavOpen,
      aiOpen, setAiOpen,
      themeColor, setThemeColor,
      toasts, toast, dismissToast,
      hasRole, isSuperAdmin, isAdmin, isVendedor, hasModuleAccess
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
