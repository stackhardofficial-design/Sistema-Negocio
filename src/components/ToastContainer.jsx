import { useApp } from '../lib/AppContext'
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'

const ICONS = {
  success: CheckCircle,
  danger: AlertCircle,
  warning: AlertTriangle,
  info: Info
}

const COLORS = {
  success: 'var(--success)',
  danger: 'var(--danger)',
  warning: 'var(--warning)',
  info: 'var(--info)'
}

const BG = {
  success: 'var(--success-soft)',
  danger: 'var(--danger-soft)',
  warning: 'var(--warning-soft)',
  info: 'var(--info-soft)'
}

export default function ToastContainer() {
  const { toasts, dismissToast } = useApp()

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      maxWidth: '360px'
    }}>
      {toasts.map(t => {
        const Icon = ICONS[t.type] || Info
        return (
          <div
            key={t.id}
            className="fade-in"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '14px 16px',
              background: 'var(--bg-secondary)',
              border: `1px solid ${COLORS[t.type] || 'var(--border)'}`,
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
              animation: 'slideUp 0.2s ease'
            }}
          >
            <Icon size={18} style={{ color: COLORS[t.type], flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', flex: 1 }}>
              {t.message}
            </span>
            <button
              onClick={() => dismissToast(t.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', display: 'flex', padding: 0
              }}
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
