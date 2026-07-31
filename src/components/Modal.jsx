import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export default function Modal({ open, onClose, title, children, footer, size = 'md', noPad = false }) {
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const maxWidths = { sm: '380px', md: '500px', lg: '700px', xl: '900px', full: '95vw' }

  return createPortal(
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal fade-in" style={{ maxWidth: maxWidths[size] || maxWidths.md }}>
        <div className="modal-header">
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '6px', cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex', alignItems: 'center'
            }}
          >
            <X size={16} />
          </button>
        </div>
        {!noPad ? (
          <div className="modal-body">{children}</div>
        ) : (
          <div>{children}</div>
        )}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
