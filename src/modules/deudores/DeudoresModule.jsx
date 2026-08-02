import { useState, useEffect } from 'react'
import { useApp } from '../../lib/AppContext'
import {
  sb, dbGetDebtors, dbCreateDebtor, dbAddDebtorPayment,
  dbAddDebtorCharge, dbSettleDebtor, dbLogActivity
} from '../../lib/supabase'
import Modal from '../../components/Modal'
import { BookOpen, Plus, Search, DollarSign, UserCheck, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'

function formatMoney(n) { return `$${Number(n || 0).toLocaleString('es-AR')}` }
function formatDate(d) { return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) }

export default function DeudoresModule() {
  const { tenantId, userInfo, toast } = useApp()
  const [debtors, setDebtors] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showSettled, setShowSettled] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const [newModal, setNewModal] = useState(false)
  const [payModal, setPayModal] = useState({ open: false, debtor: null })
  const [chargeModal, setChargeModal] = useState({ open: false, debtor: null })

  const [newForm, setNewForm] = useState({ name: '', phone: '', note: '' })
  const [payForm, setPayForm] = useState({ amount: '', note: '' })
  const [chargeForm, setChargeForm] = useState({ amount: '', note: '' })
  const [saving, setSaving] = useState(false)

  async function load(showLoading = true) {
    if (!tenantId) { setLoading(false); return; }
    if (showLoading) setLoading(true)
    const data = await dbGetDebtors(tenantId, { includeSettled: showSettled })
    setDebtors(data)
    if (showLoading) setLoading(false)
  }

  useEffect(() => {
    load()
    if (!tenantId) return
    const channel = sb.channel('deudores_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debtors', filter: `tenant_id=eq.${tenantId}` }, () => load(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debt_payments' }, () => load(false))
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [tenantId, showSettled])

  async function handleCreate() {
    if (!newForm.name.trim()) return toast('El nombre es obligatorio', 'warning')
    setSaving(true)
    try {
      const created = await dbCreateDebtor(tenantId, newForm)
      await dbLogActivity(tenantId, userInfo?.id, 'create', 'debtor', created.id, { name: newForm.name })
      toast('Deudor registrado', 'success')
      setNewModal(false)
      setNewForm({ name: '', phone: '', note: '' })
      load()
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    } finally {
      setSaving(false)
    }
  }

  async function handlePay() {
    if (!payForm.amount || parseFloat(payForm.amount) <= 0) return toast('Monto inválido', 'warning')
    setSaving(true)
    try {
      await dbAddDebtorPayment(payModal.debtor.id, parseFloat(payForm.amount), payForm.note)
      await dbLogActivity(tenantId, userInfo?.id, 'update', 'debtor', payModal.debtor.id, { action: 'payment', amount: payForm.amount })
      toast('Pago registrado', 'success')
      setPayModal({ open: false, debtor: null })
      setPayForm({ amount: '', note: '' })
      load()
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    } finally {
      setSaving(false)
    }
  }

  async function handleCharge() {
    if (!chargeForm.amount || parseFloat(chargeForm.amount) <= 0) return toast('Monto inválido', 'warning')
    setSaving(true)
    try {
      await dbAddDebtorCharge(chargeModal.debtor.id, parseFloat(chargeForm.amount), chargeForm.note)
      await dbLogActivity(tenantId, userInfo?.id, 'update', 'debtor', chargeModal.debtor.id, { action: 'charge', amount: chargeForm.amount })
      toast('Cargo registrado', 'success')
      setChargeModal({ open: false, debtor: null })
      setChargeForm({ amount: '', note: '' })
      load()
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    } finally {
      setSaving(false)
    }
  }

  async function handleSettle(debtor) {
    if (!confirm(`¿Marcar a "${debtor.name}" como saldado?`)) return
    try {
      await dbSettleDebtor(debtor.id)
      await dbLogActivity(tenantId, userInfo?.id, 'update', 'debtor', debtor.id, { action: 'settle' })
      toast('Deuda saldada', 'success')
      load()
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    }
  }

  const filtered = debtors.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    (d.phone || '').includes(search)
  )

  const totalDebt = filtered.filter(d => !d.is_settled).reduce((a, d) => a + (d.total_debt || 0), 0)

  return (
    <div className="fade-in">
      <div className="module-header">
        <h1>
          <span className="icon-wrap"><BookOpen size={20} /></span>
          Deudores
        </h1>
        <button onClick={() => setNewModal(true)} className="btn btn-primary">
          <Plus size={16} /> Nuevo deudor
        </button>
      </div>

      <div className="module-content">
        {/* Summary */}
        <div className="kpi-grid" style={{ marginBottom: '20px' }}>
          <div className="kpi-card" style={{ borderColor: totalDebt > 0 ? 'rgba(239,68,68,0.3)' : undefined }}>
            <div className="kpi-label">Total adeudado</div>
            <div className="kpi-value" style={{ color: totalDebt > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
              {formatMoney(totalDebt)}
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Deudores activos</div>
            <div className="kpi-value">{filtered.filter(d => !d.is_settled).length}</div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-wrap" style={{ flex: 1, minWidth: '200px' }}>
            <Search size={16} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre o teléfono..."
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={showSettled} onChange={e => setShowSettled(e.target.checked)} style={{ width: 'auto' }} />
            Ver saldados
          </label>
        </div>

        {/* List */}
        {loading ? (
          <div className="empty-state"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <BookOpen size={40} />
            <h3>Sin deudores</h3>
            <p>¡Excelente! No hay deudas pendientes</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(d => {
              const isExpanded = expanded === d.id
              const debt = d.total_debt || 0
              const payments = (d.debtor_payments || []).reduce((a, p) => a + p.amount, 0)
              return (
                <div
                  key={d.id}
                  className="card"
                  style={{ borderColor: !d.is_settled && debt > 0 ? 'rgba(239,68,68,0.2)' : 'var(--border)' }}
                >
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                    onClick={() => setExpanded(isExpanded ? null : d.id)}
                  >
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '50%',
                      background: d.is_settled ? 'var(--success-soft)' : 'var(--danger-soft)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: d.is_settled ? 'var(--success)' : 'var(--danger)',
                      fontWeight: 700, fontSize: '1rem', flexShrink: 0
                    }}>
                      {d.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {d.name}
                        {d.is_settled && <span className="badge badge-success">Saldado</span>}
                      </div>
                      {d.phone && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{d.phone}</div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: d.is_settled ? 'var(--success)' : 'var(--danger)', fontSize: '1.1rem' }}>
                        {formatMoney(debt)}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Pagado: {formatMoney(payments)}
                      </div>
                    </div>
                    {!d.is_settled && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={e => { e.stopPropagation(); setChargeModal({ open: true, debtor: d }) }}
                          className="btn btn-danger btn-sm"
                          title="Agregar cargo"
                        >
                          <Plus size={12} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setPayModal({ open: true, debtor: d }) }}
                          className="btn btn-success btn-sm"
                          title="Registrar pago"
                        >
                          <DollarSign size={12} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleSettle(d) }}
                          className="btn btn-secondary btn-sm"
                          title="Marcar como saldado"
                        >
                          <UserCheck size={12} />
                        </button>
                      </div>
                    )}
                    {isExpanded ? <ChevronDown size={16} color="var(--text-muted)" /> : <ChevronRight size={16} color="var(--text-muted)" />}
                  </div>

                  {/* Payments detail */}
                  {isExpanded && (d.debtor_payments || []).length > 0 && (
                    <div className="fade-in" style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                        Historial de pagos
                      </div>
                      {d.debtor_payments.map((pay, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.85rem', borderBottom: '1px solid var(--border)' }}>
                          <div>
                            <span style={{ color: 'var(--success)', fontWeight: 600 }}>+{formatMoney(pay.amount)}</span>
                            {pay.note && <span style={{ marginLeft: '8px', color: 'var(--text-muted)' }}>{pay.note}</span>}
                          </div>
                          <span style={{ color: 'var(--text-muted)' }}>{formatDate(pay.paid_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal: Nuevo deudor */}
      <Modal
        open={newModal}
        onClose={() => setNewModal(false)}
        title="Nuevo deudor"
        footer={
          <>
            <button onClick={() => setNewModal(false)} className="btn btn-secondary">Cancelar</button>
            <button onClick={handleCreate} className="btn btn-primary" disabled={saving}>Registrar</button>
          </>
        }
      >
        <div className="form-group"><label className="form-label">Nombre *</label>
          <input value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre completo" autoFocus /></div>
        <div className="form-group"><label className="form-label">Teléfono</label>
          <input value={newForm.phone} onChange={e => setNewForm(f => ({ ...f, phone: e.target.value }))} placeholder="Ej: 11-1234-5678" /></div>
        <div className="form-group"><label className="form-label">Nota</label>
          <input value={newForm.note} onChange={e => setNewForm(f => ({ ...f, note: e.target.value }))} placeholder="Observaciones..." /></div>
      </Modal>

      {/* Modal: Pago */}
      <Modal
        open={payModal.open}
        onClose={() => { setPayModal({ open: false, debtor: null }); setPayForm({ amount: '', note: '' }) }}
        title={`Registrar pago · ${payModal.debtor?.name}`}
        footer={
          <>
            <button onClick={() => setPayModal({ open: false, debtor: null })} className="btn btn-secondary">Cancelar</button>
            <button onClick={handlePay} className="btn btn-success" disabled={saving}>Registrar pago</button>
          </>
        }
      >
        <div className="form-group"><label className="form-label">Monto *</label>
          <input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" min="0" autoFocus /></div>
        <div className="form-group"><label className="form-label">Nota</label>
          <input value={payForm.note} onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))} placeholder="Observación..." /></div>
      </Modal>

      {/* Modal: Cargo */}
      <Modal
        open={chargeModal.open}
        onClose={() => { setChargeModal({ open: false, debtor: null }); setChargeForm({ amount: '', note: '' }) }}
        title={`Agregar cargo · ${chargeModal.debtor?.name}`}
        footer={
          <>
            <button onClick={() => setChargeModal({ open: false, debtor: null })} className="btn btn-secondary">Cancelar</button>
            <button onClick={handleCharge} className="btn btn-danger" disabled={saving}>Agregar cargo</button>
          </>
        }
      >
        <div className="form-group"><label className="form-label">Monto *</label>
          <input type="number" value={chargeForm.amount} onChange={e => setChargeForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" min="0" autoFocus /></div>
        <div className="form-group"><label className="form-label">Descripción</label>
          <input value={chargeForm.note} onChange={e => setChargeForm(f => ({ ...f, note: e.target.value }))} placeholder="Qué consumió..." /></div>
      </Modal>
    </div>
  )
}
