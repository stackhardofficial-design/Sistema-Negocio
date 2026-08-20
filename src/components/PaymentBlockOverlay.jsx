import { useState, useEffect } from 'react'
import { useApp } from '../lib/AppContext'
import { dbCheckTenantPaymentStatus, subscribeToTenantPayments, unsubscribe, dbLogout, dbLogActivity } from '../lib/supabase'
import { AlertTriangle, RefreshCw, LogOut } from 'lucide-react'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

export default function PaymentBlockOverlay() {
  const { userInfo, tenantId, hasRole } = useApp()
  const [blocked, setBlocked] = useState(false)
  const [paymentInfo, setPaymentInfo] = useState(null)
  const [checking, setChecking] = useState(true)

  // No bloquear al super_admin
  const isSuperAdmin = hasRole('super_admin')

  async function handleLogout() {
    try {
      if (userInfo?.tenant_id) {
        await dbLogActivity(userInfo.tenant_id, userInfo.id, 'logout', 'user', userInfo.id)
      }
      await dbLogout()
    } catch (e) {
      console.error('Logout error:', e)
    } finally {
      window.location.reload()
    }
  }

  async function checkPayment() {
    if (!tenantId || isSuperAdmin) {
      setBlocked(false)
      setChecking(false)
      return
    }
    try {
      const status = await dbCheckTenantPaymentStatus(tenantId)
      setBlocked(status.isBlocked)
      setPaymentInfo(status)
    } catch (err) {
      console.error('Error checking payment status:', err)
      // En caso de error, no bloquear
      setBlocked(false)
    } finally {
      setChecking(false)
    }
  }

  // Chequear al montar
  useEffect(() => {
    checkPayment()
  }, [tenantId, isSuperAdmin])

  // Suscripción Realtime: cuando el super admin pague, el overlay desaparece al instante
  useEffect(() => {
    if (!tenantId || isSuperAdmin) return

    const channel = subscribeToTenantPayments(tenantId, (payload) => {
      // Cuando llega un cambio, re-evaluar el estado
      const record = payload.new
      if (record) {
        const now = new Date()
        const currentYear = now.getFullYear()
        const currentMonth = now.getMonth() + 1

        // Si el cambio es para el mes actual
        if (record.year === currentYear && record.month === currentMonth) {
          if (record.is_paid) {
            // ¡Pagado! Quitar el overlay instantáneamente
            setBlocked(false)
            setPaymentInfo(prev => prev ? { ...prev, isPaid: true, isBlocked: false } : prev)
          } else {
            // Marcado como no pagado, re-evaluar
            checkPayment()
          }
        }
      }
    })

    return () => { unsubscribe(channel) }
  }, [tenantId, isSuperAdmin])

  // No mostrar nada si no está bloqueado o está cargando
  if (checking || !blocked || isSuperAdmin) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 99999,
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      animation: 'fadeIn 0.4s ease'
    }}>
      <div style={{
        background: 'var(--bg-primary)',
        borderRadius: '20px',
        padding: '40px',
        maxWidth: '480px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.4)',
        border: '1px solid var(--border)',
        animation: 'slideUp 0.5s ease'
      }}>
        {/* Icon */}
        <div style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(239, 68, 68, 0.15))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px'
        }}>
          <AlertTriangle size={36} color="#f59e0b" />
        </div>

        {/* Title */}
        <h2 style={{
          fontSize: '1.3rem',
          fontWeight: 700,
          color: 'var(--text-primary)',
          margin: '0 0 12px',
          lineHeight: 1.3
        }}>
          Renovar plan de base de datos
        </h2>

        {/* Subtitle */}
        <p style={{
          fontSize: '0.95rem',
          color: 'var(--text-secondary)',
          margin: '0 0 8px',
          lineHeight: 1.5
        }}>
          Para seguir trabajando con normalidad, es necesario renovar el plan del mes de{' '}
          <strong style={{ color: 'var(--accent)' }}>
            {paymentInfo ? MONTH_NAMES[paymentInfo.month - 1] : ''} {paymentInfo?.year}
          </strong>.
        </p>

        <p style={{
          fontSize: '0.85rem',
          color: 'var(--text-muted)',
          margin: '0 0 28px',
          lineHeight: 1.5
        }}>
          Contacta al administrador del sistema para habilitar tu acceso.
          <br />
          <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>
            El acceso se restaurará automáticamente una vez que el pago sea registrado.
          </span>
        </p>

        {/* Info badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 20px',
          borderRadius: '12px',
          background: 'var(--accent-soft)',
          color: 'var(--accent)',
          fontSize: '0.8rem',
          fontWeight: 500,
          marginBottom: '24px'
        }}>
          <RefreshCw size={14} style={{ animation: 'spin 2s linear infinite' }} />
          Esperando confirmación de pago...
        </div>

        {/* Botón de cerrar sesión */}
        <div>
          <button
            onClick={handleLogout}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '8px 16px', borderRadius: '10px',
              background: 'transparent', color: 'var(--text-muted)',
              border: '1px solid var(--border)', cursor: 'pointer',
              fontSize: '0.875rem', transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
