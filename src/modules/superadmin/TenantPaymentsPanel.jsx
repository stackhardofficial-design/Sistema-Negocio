import { useState, useEffect } from 'react'
import { useApp } from '../../lib/AppContext'
import {
  dbGetAllTenants,
  dbGetAllTenantPayments,
  dbSetTenantPaymentStatus,
  sb
} from '../../lib/supabase'
import { CalendarCheck, ChevronLeft, ChevronRight, Check, X } from 'lucide-react'

const MONTH_NAMES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
]

const MONTH_FULL = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

export default function TenantPaymentsPanel() {
  const { toast, user } = useApp()
  const [tenants, setTenants] = useState([])
  const [payments, setPayments] = useState([]) // flat array of all payments for the year
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(null) // "tenantId-month" while toggling

  async function load() {
    setLoading(true)
    try {
      const [t, p] = await Promise.all([
        dbGetAllTenants(),
        dbGetAllTenantPayments(year)
      ])
      setTenants(t)
      setPayments(p)
    } catch (err) {
      toast('Error al cargar datos de facturación', 'danger')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [year])

  // Realtime: escuchar cambios en tenant_payments para el año actual
  useEffect(() => {
    const channel = sb.channel('superadmin_payments_sync')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tenant_payments'
      }, () => load())
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [year])

  function isMonthPaid(tenantId, month) {
    return payments.some(p =>
      p.tenant_id === tenantId && p.month === month && p.is_paid === true
    )
  }

  function getPaymentInfo(tenantId, month) {
    return payments.find(p =>
      p.tenant_id === tenantId && p.month === month
    )
  }

  async function togglePayment(tenantId, month) {
    const key = `${tenantId}-${month}`
    setToggling(key)
    try {
      const currentlyPaid = isMonthPaid(tenantId, month)
      await dbSetTenantPaymentStatus(tenantId, year, month, !currentlyPaid, user?.id)
      // Actualizar localmente para feedback inmediato
      if (currentlyPaid) {
        setPayments(prev => prev.map(p =>
          p.tenant_id === tenantId && p.month === month
            ? { ...p, is_paid: false, paid_at: null }
            : p
        ))
      } else {
        const exists = payments.find(p => p.tenant_id === tenantId && p.month === month)
        if (exists) {
          setPayments(prev => prev.map(p =>
            p.tenant_id === tenantId && p.month === month
              ? { ...p, is_paid: true, paid_at: new Date().toISOString() }
              : p
          ))
        } else {
          setPayments(prev => [...prev, {
            tenant_id: tenantId, year, month,
            is_paid: true, paid_at: new Date().toISOString()
          }])
        }
      }
      toast(
        `${MONTH_FULL[month - 1]} ${year} - ${currentlyPaid ? 'Marcado como NO pagado' : 'Marcado como PAGADO'}`,
        currentlyPaid ? 'warning' : 'success'
      )
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    } finally {
      setToggling(null)
    }
  }

  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()
  const currentDay = now.getDate()

  return (
    <div>
      {/* Year selector */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '16px',
        marginBottom: '24px', justifyContent: 'center'
      }}>
        <button
          onClick={() => setYear(y => y - 1)}
          className="btn btn-secondary btn-sm"
          style={{ padding: '8px' }}
        >
          <ChevronLeft size={16} />
        </button>
        <h2 style={{
          margin: 0, fontSize: '1.4rem', fontWeight: 700,
          color: 'var(--text-primary)', minWidth: '80px', textAlign: 'center'
        }}>
          {year}
        </h2>
        <button
          onClick={() => setYear(y => y + 1)}
          className="btn btn-secondary btn-sm"
          style={{ padding: '8px' }}
          disabled={year >= currentYear}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', gap: '20px', marginBottom: '20px',
        fontSize: '0.8rem', color: 'var(--text-muted)',
        justifyContent: 'center', flexWrap: 'wrap'
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            width: '14px', height: '14px', borderRadius: '4px',
            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
            display: 'inline-block'
          }} />
          Pagado
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            width: '14px', height: '14px', borderRadius: '4px',
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            display: 'inline-block'
          }} />
          No pagado
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            width: '14px', height: '14px', borderRadius: '4px',
            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
            display: 'inline-block'
          }} />
          Vencido (día &gt; 10)
        </span>
      </div>

      {loading ? (
        <div className="empty-state"><div className="spinner" /></div>
      ) : tenants.length === 0 ? (
        <div className="empty-state">
          <CalendarCheck size={40} />
          <p>No hay negocios registrados</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {tenants.map(t => {
            // Count paid months
            const paidCount = Array.from({ length: 12 }, (_, i) => i + 1)
              .filter(m => isMonthPaid(t.id, m)).length

            return (
              <div key={t.id} className="card" style={{ padding: '16px' }}>
                {/* Tenant header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  marginBottom: '12px'
                }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '10px',
                    background: 'var(--accent-soft)', color: 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '1.1rem', flexShrink: 0
                  }}>
                    {t.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{t.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      @{t.slug} · {paidCount}/12 meses pagados
                    </div>
                  </div>
                  <span className={`badge ${t.is_active ? 'badge-success' : 'badge-neutral'}`}
                    style={{ fontSize: '0.7rem' }}>
                    {t.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                {/* Month grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))',
                  gap: '6px'
                }}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
                    const paid = isMonthPaid(t.id, month)
                    const isCurrentMonth = year === currentYear && month === currentMonth
                    const isPastDue = year < currentYear ||
                      (year === currentYear && month < currentMonth) ||
                      (isCurrentMonth && currentDay > 10)
                    const isOverdue = !paid && isPastDue
                    const isTogglingThis = toggling === `${t.id}-${month}`
                    const isFutureMonth = year > currentYear ||
                      (year === currentYear && month > currentMonth)

                    let bg, color, borderColor
                    if (paid) {
                      bg = 'linear-gradient(135deg, #22c55e, #16a34a)'
                      color = '#fff'
                      borderColor = '#16a34a'
                    } else if (isOverdue) {
                      bg = 'linear-gradient(135deg, #ef4444, #dc2626)'
                      color = '#fff'
                      borderColor = '#dc2626'
                    } else {
                      bg = 'var(--bg-tertiary)'
                      color = 'var(--text-secondary)'
                      borderColor = 'var(--border)'
                    }

                    return (
                      <button
                        key={month}
                        onClick={() => togglePayment(t.id, month)}
                        disabled={isTogglingThis}
                        title={`${MONTH_FULL[month - 1]} ${year} - ${paid ? 'PAGADO' : 'NO PAGADO'}${isOverdue ? ' (VENCIDO)' : ''}`}
                        style={{
                          padding: '8px 4px',
                          borderRadius: '8px',
                          background: bg,
                          color,
                          border: isCurrentMonth
                            ? '2px solid var(--accent)'
                            : `1px solid ${borderColor}`,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '2px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          opacity: isFutureMonth && !paid ? 0.5 : 1,
                          position: 'relative',
                          outline: isCurrentMonth ? '2px solid var(--accent)' : 'none',
                          outlineOffset: '1px'
                        }}
                        onMouseEnter={e => {
                          if (!paid && !isOverdue) {
                            e.currentTarget.style.background = 'var(--accent-soft)'
                            e.currentTarget.style.borderColor = 'var(--accent)'
                          }
                        }}
                        onMouseLeave={e => {
                          if (!paid && !isOverdue) {
                            e.currentTarget.style.background = 'var(--bg-tertiary)'
                            e.currentTarget.style.borderColor = isCurrentMonth ? 'var(--accent)' : 'var(--border)'
                          }
                        }}
                      >
                        {isTogglingThis ? (
                          <div className="spinner" style={{ width: '14px', height: '14px' }} />
                        ) : (
                          <>
                            {paid ? <Check size={14} /> : isOverdue ? <X size={14} /> : null}
                            <span>{MONTH_NAMES[month - 1]}</span>
                          </>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
