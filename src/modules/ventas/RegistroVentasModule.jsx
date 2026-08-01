import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../../lib/AppContext'
import {
  sb, dbGetSales, dbCancelSale, dbLogActivity,
  dbUpdateSaleItem, dbDeleteSaleItem
} from '../../lib/supabase'
import Modal from '../../components/Modal'
import {
  ClipboardList, Filter, X, User, Package, Calendar,
  Trash2, Edit2, ChevronDown, ChevronUp, Search,
  TrendingUp, DollarSign, ShoppingBag, CheckCircle, XCircle,
  Minus, Plus, Save, AlertTriangle
} from 'lucide-react'

function formatMoney(n) {
  return `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
}
function formatTime(d) {
  return new Date(d).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
function formatDate(d) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function formatDateTime(d) {
  return `${formatDate(d)} ${formatTime(d)}`
}

export default function RegistroVentasModule() {
  const { tenantId, userInfo, toast, isAdmin } = useApp()

  // ===== DATOS =====
  const [sales, setSales] = useState([])
  const [loadingSales, setLoadingSales] = useState(true)

  // ===== FILTROS =====
  const [showFilters, setShowFilters] = useState(false)
  const [filterDate, setFilterDate] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('') // '' | 'completed' | 'cancelled'

  // ===== TOTALES =====
  const [totals, setTotals] = useState({ sales: 0, profit: 0, count: 0 })

  // ===== MODALS =====
  const [detailModal, setDetailModal] = useState({ open: false, sale: null })
  const [cancelModal, setCancelModal] = useState({ open: false, sale: null, reason: '' })
  const [editModal, setEditModal] = useState({ open: false, sale: null, items: [] })
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    loadSales()
    if (!tenantId) return
    const channel = sb.channel('registro_ventas_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales', filter: `tenant_id=eq.${tenantId}` }, () => loadSales(false))
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [tenantId])

  async function loadSales(showLoading = true) {
    if (!tenantId) { setLoadingSales(false); return }
    if (showLoading) setLoadingSales(true)
    const data = await dbGetSales(tenantId, { limit: 500 })
    setSales(data)
    if (showLoading) setLoadingSales(false)

    const completed = data.filter(s => s.status === 'completed')
    setTotals({
      sales: completed.reduce((a, s) => a + (s.total_amount || 0), 0),
      profit: completed.reduce((a, s) => a + ((s.total_amount || 0) - (s.total_cost || 0)), 0),
      count: completed.length
    })
  }

  // ===== FILTRADO =====
  const filteredSales = sales.filter(s => {
    if (filterStatus && s.status !== filterStatus) return false
    if (filterDate && !s.created_at.startsWith(filterDate)) return false
    if (filterUser && !s.users?.name?.toLowerCase().includes(filterUser.toLowerCase())) return false
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      const hasItem = (s.sale_items || []).some(i =>
        i.products?.name?.toLowerCase().includes(q) ||
        i.products?.barcode?.includes(q)
      )
      if (!hasItem && !s.id.toLowerCase().includes(q)) return false
    }
    return true
  })

  // ===== ANULAR VENTA =====
  async function handleCancel() {
    if (!cancelModal.sale || !cancelModal.reason.trim()) return toast('Ingresá un motivo', 'warning')
    try {
      await dbCancelSale(cancelModal.sale.id, userInfo?.id, cancelModal.reason)
      await dbLogActivity(tenantId, userInfo?.id, 'cancel', 'sale', cancelModal.sale.id, { reason: cancelModal.reason })
      toast('Venta anulada correctamente', 'success')
      setCancelModal({ open: false, sale: null, reason: '' })
      setDetailModal({ open: false, sale: null })
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    }
  }

  // ===== EDITAR VENTA =====
  function openEditModal(sale) {
    setEditModal({
      open: true,
      sale,
      items: (sale.sale_items || []).map(i => ({
        ...i,
        newQuantity: i.quantity,
        toDelete: false
      }))
    })
  }

  function updateItemQty(itemId, delta) {
    setEditModal(prev => ({
      ...prev,
      items: prev.items.map(i =>
        i.id === itemId
          ? { ...i, newQuantity: Math.max(1, i.newQuantity + delta) }
          : i
      )
    }))
  }

  function setItemQty(itemId, val) {
    setEditModal(prev => ({
      ...prev,
      items: prev.items.map(i =>
        i.id === itemId
          ? { ...i, newQuantity: Math.max(1, parseInt(val) || 1) }
          : i
      )
    }))
  }

  function toggleDeleteItem(itemId) {
    setEditModal(prev => ({
      ...prev,
      items: prev.items.map(i =>
        i.id === itemId ? { ...i, toDelete: !i.toDelete } : i
      )
    }))
  }

  async function saveEdit() {
    if (!editModal.sale) return
    const toDelete = editModal.items.filter(i => i.toDelete)
    const toUpdate = editModal.items.filter(i => !i.toDelete && i.newQuantity !== i.quantity)

    if (toDelete.length === 0 && toUpdate.length === 0) {
      return toast('No hay cambios para guardar', 'warning')
    }

    setSavingEdit(true)
    try {
      for (const item of toDelete) {
        await dbDeleteSaleItem(item.id)
      }
      for (const item of toUpdate) {
        await dbUpdateSaleItem(item.id, item.newQuantity)
      }
      await dbLogActivity(tenantId, userInfo?.id, 'update', 'sale', editModal.sale.id, {
        deleted: toDelete.length, updated: toUpdate.length
      })
      toast('Venta modificada correctamente', 'success')
      setEditModal({ open: false, sale: null, items: [] })
      setDetailModal({ open: false, sale: null })
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    } finally {
      setSavingEdit(false)
    }
  }

  const activeFilters = !!(filterDate || filterUser || filterSearch || filterStatus)

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* ===== HEADER ===== */}
      <div style={{
        padding: '20px 24px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ClipboardList size={20} color="var(--accent)" />
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Registro de Ventas</h2>
        </div>

        {/* Stats rápidas */}
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total vendido</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)' }}>{formatMoney(totals.sales)}</div>
          </div>
          <div style={{ width: '1px', height: '32px', background: 'var(--border)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ganancia</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--success)' }}>{formatMoney(totals.profit)}</div>
          </div>
          <div style={{ width: '1px', height: '32px', background: 'var(--border)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Transacciones</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{totals.count}</div>
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className="btn btn-secondary btn-sm"
            style={{ marginLeft: '8px' }}
          >
            <Filter size={14} /> Filtros
            {activeFilters && (
              <span className="badge badge-warning" style={{ padding: '1px 6px', fontSize: '0.65rem' }}>!</span>
            )}
          </button>
        </div>
      </div>

      {/* ===== FILTROS ===== */}
      {showFilters && (
        <div className="fade-in" style={{
          padding: '14px 24px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-tertiary)',
          display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end'
        }}>
          <div className="form-group" style={{ flex: '1', minWidth: '140px' }}>
            <label className="form-label">Fecha</label>
            <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1', minWidth: '140px' }}>
            <label className="form-label">Vendedor</label>
            <input type="text" value={filterUser} onChange={e => setFilterUser(e.target.value)} placeholder="Nombre..." />
          </div>
          <div className="form-group" style={{ flex: '1', minWidth: '140px' }}>
            <label className="form-label">Producto / Código</label>
            <input type="text" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Buscar..." />
          </div>
          <div className="form-group" style={{ flex: '1', minWidth: '140px' }}>
            <label className="form-label">Estado</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="completed">Completadas</option>
              <option value="cancelled">Anuladas</option>
            </select>
          </div>
          <button
            onClick={() => { setFilterDate(''); setFilterUser(''); setFilterSearch(''); setFilterStatus('') }}
            className="btn btn-secondary btn-sm"
          >
            <X size={14} /> Limpiar
          </button>
        </div>
      )}

      {/* ===== LISTA DE VENTAS ===== */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        {loadingSales ? (
          <div className="empty-state"><div className="spinner" /></div>
        ) : filteredSales.length === 0 ? (
          <div className="empty-state">
            <ShoppingBag size={40} />
            <h3>Sin ventas</h3>
            <p style={{ fontSize: '0.85rem' }}>No hay ventas que coincidan con los filtros</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {filteredSales.map(sale => (
              <SaleRow
                key={sale.id}
                sale={sale}
                isAdmin={isAdmin()}
                onDetail={() => setDetailModal({ open: true, sale })}
                onCancel={() => setCancelModal({ open: true, sale, reason: '' })}
                onEdit={() => openEditModal(sale)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ===== MODAL: DETALLE ===== */}
      <Modal
        open={detailModal.open}
        onClose={() => setDetailModal({ open: false, sale: null })}
        title="Detalle de venta"
        size="md"
      >
        {detailModal.sale && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Info básica */}
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <div>
                <div className="form-label">Vendedor</div>
                <div style={{ fontWeight: 600 }}>{detailModal.sale.users?.name || '—'}</div>
              </div>
              <div>
                <div className="form-label">Fecha y hora</div>
                <div>{formatDateTime(detailModal.sale.created_at)}</div>
              </div>
              <div>
                <div className="form-label">Estado</div>
                <span className={`badge ${detailModal.sale.status === 'completed' ? 'badge-success' : 'badge-danger'}`}>
                  {detailModal.sale.status === 'completed' ? 'Completada' : 'Anulada'}
                </span>
              </div>
            </div>

            {/* Items */}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Código</th>
                    <th style={{ textAlign: 'right' }}>Cant.</th>
                    <th style={{ textAlign: 'right' }}>P. Unit.</th>
                    <th style={{ textAlign: 'right' }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(detailModal.sale.sale_items || []).map((item, i) => (
                    <tr key={i}>
                      <td>{item.products?.name || '—'}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{item.products?.barcode || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                      <td style={{ textAlign: 'right' }}>{formatMoney(item.unit_price)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totales */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', padding: '14px 16px',
              background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)'
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total vendido</div>
                <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{formatMoney(detailModal.sale.total_amount)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ganancia</div>
                <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--success)' }}>
                  {formatMoney((detailModal.sale.total_amount || 0) - (detailModal.sale.total_cost || 0))}
                </div>
              </div>
            </div>

            {detailModal.sale.cancel_reason && (
              <div style={{
                padding: '10px 14px', background: 'var(--danger-soft)',
                borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', color: 'var(--danger)',
                display: 'flex', gap: '8px', alignItems: 'flex-start'
              }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>Motivo de anulación: <strong>{detailModal.sale.cancel_reason}</strong></span>
              </div>
            )}

            {/* Acciones (solo admin + completada) */}
            {isAdmin() && detailModal.sale.status === 'completed' && (
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setDetailModal({ open: false, sale: null }); openEditModal(detailModal.sale) }}
                  className="btn btn-secondary"
                >
                  <Edit2 size={14} /> Modificar
                </button>
                <button
                  onClick={() => { setDetailModal({ open: false, sale: null }); setCancelModal({ open: true, sale: detailModal.sale, reason: '' }) }}
                  className="btn btn-danger"
                >
                  <Trash2 size={14} /> Anular venta
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ===== MODAL: ANULAR ===== */}
      <Modal
        open={cancelModal.open}
        onClose={() => setCancelModal({ open: false, sale: null, reason: '' })}
        title="Anular venta"
        footer={
          <>
            <button onClick={() => setCancelModal({ open: false, sale: null, reason: '' })} className="btn btn-secondary">
              Cancelar
            </button>
            <button onClick={handleCancel} className="btn btn-danger">
              <Trash2 size={14} /> Confirmar anulación
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{
            padding: '12px', background: 'var(--danger-soft)',
            borderRadius: 'var(--radius-md)', fontSize: '0.85rem', color: 'var(--danger)',
            display: 'flex', gap: '8px'
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
            Esta acción quedará registrada en el historial completo del sistema.
          </div>
          {cancelModal.sale && (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Venta de <strong>{cancelModal.sale.users?.name || 'usuario'}</strong> por{' '}
              <strong>{formatMoney(cancelModal.sale.total_amount)}</strong>{' '}
              ({formatDateTime(cancelModal.sale?.created_at || '')})
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Motivo de anulación *</label>
            <textarea
              value={cancelModal.reason}
              onChange={e => setCancelModal(prev => ({ ...prev, reason: e.target.value }))}
              placeholder="Ej: Error en el escaneo, producto devuelto..."
              rows={3}
            />
          </div>
        </div>
      </Modal>

      {/* ===== MODAL: EDITAR ===== */}
      <Modal
        open={editModal.open}
        onClose={() => setEditModal({ open: false, sale: null, items: [] })}
        title="Modificar venta"
        size="md"
        footer={
          <>
            <button onClick={() => setEditModal({ open: false, sale: null, items: [] })} className="btn btn-secondary">
              Cancelar
            </button>
            <button onClick={saveEdit} className="btn btn-primary" disabled={savingEdit}>
              {savingEdit ? '⏳ Guardando...' : <><Save size={14} /> Guardar cambios</>}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
            Ajustá las cantidades o eliminá items de la venta. Los cambios actualizan el total y el stock.
          </p>
          {editModal.items.map(item => (
            <div
              key={item.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px', borderRadius: 'var(--radius-md)',
                background: item.toDelete ? 'var(--danger-soft)' : 'var(--bg-tertiary)',
                border: `1px solid ${item.toDelete ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                opacity: item.toDelete ? 0.7 : 1, transition: 'all 0.15s'
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: item.toDelete ? 'var(--danger)' : 'var(--text-primary)' }}>
                  {item.products?.name || '—'}
                  {item.toDelete && <span style={{ marginLeft: '8px', fontSize: '0.75rem' }}>● A eliminar</span>}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {formatMoney(item.unit_price)} c/u → {formatMoney(item.unit_price * item.newQuantity)}
                </div>
              </div>

              {!item.toDelete && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    onClick={() => updateItemQty(item.id, -1)}
                    disabled={item.newQuantity <= 1}
                    style={{
                      width: '28px', height: '28px', borderRadius: '6px',
                      background: 'var(--bg)', border: '1px solid var(--border)',
                      cursor: item.newQuantity <= 1 ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--text-muted)'
                    }}
                  >
                    <Minus size={12} />
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={item.newQuantity}
                    onChange={e => setItemQty(item.id, e.target.value)}
                    style={{
                      width: '52px', textAlign: 'center', fontWeight: 700,
                      height: '28px', borderRadius: '6px',
                      border: '1px solid var(--border)', background: 'var(--bg)',
                      color: item.newQuantity !== item.quantity ? 'var(--accent)' : 'var(--text-primary)',
                      fontSize: '0.9rem'
                    }}
                  />
                  <button
                    onClick={() => updateItemQty(item.id, 1)}
                    style={{
                      width: '28px', height: '28px', borderRadius: '6px',
                      background: 'var(--accent-soft)', border: '1px solid rgba(245,158,11,0.3)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--accent)'
                    }}
                  >
                    <Plus size={12} />
                  </button>
                </div>
              )}

              <button
                onClick={() => toggleDeleteItem(item.id)}
                style={{
                  width: '30px', height: '30px', borderRadius: '6px',
                  background: item.toDelete ? 'var(--danger)' : 'var(--bg)',
                  border: `1px solid ${item.toDelete ? 'var(--danger)' : 'var(--border)'}`,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: item.toDelete ? 'white' : 'var(--danger)', transition: 'all 0.15s'
                }}
                title={item.toDelete ? 'Cancelar eliminación' : 'Eliminar item'}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}

// ===== COMPONENTE FILA DE VENTA =====
function SaleRow({ sale, isAdmin, onDetail, onCancel, onEdit }) {
  const itemsCount = (sale.sale_items || []).reduce((a, i) => a + (i.quantity || 0), 0)
  const profit = (sale.total_amount || 0) - (sale.total_cost || 0)
  const cancelled = sale.status === 'cancelled'

  return (
    <div
      onClick={onDetail}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 16px',
        background: 'var(--bg-card)',
        border: `1px solid ${cancelled ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer', transition: 'all 0.15s',
        opacity: cancelled ? 0.65 : 1
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--bg-tertiary)'
        e.currentTarget.style.borderColor = cancelled ? 'rgba(239,68,68,0.4)' : 'var(--border-light)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'var(--bg-card)'
        e.currentTarget.style.borderColor = cancelled ? 'rgba(239,68,68,0.2)' : 'var(--border)'
      }}
    >
      {/* Estado dot */}
      <div style={{
        width: '8px', height: '8px', borderRadius: '50%',
        background: cancelled ? 'var(--danger)' : 'var(--success)',
        flexShrink: 0
      }} />

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '0.82rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-primary)', fontWeight: 500 }}>
            <User size={13} color="var(--text-muted)" /> {sale.users?.name || 'Desconocido'}
          </span>
          <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Package size={13} />
            {(sale.sale_items || []).length} producto{(sale.sale_items || []).length !== 1 ? 's' : ''} · {itemsCount} unid.
          </span>
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
          {formatDateTime(sale.created_at)}
          {cancelled && <span style={{ marginLeft: '8px', color: 'var(--danger)', fontWeight: 600 }}>● Anulada</span>}
        </div>
      </div>

      {/* Monto */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{
          fontWeight: 700, fontSize: '0.95rem',
          color: cancelled ? 'var(--text-muted)' : 'var(--text-primary)',
          textDecoration: cancelled ? 'line-through' : 'none'
        }}>
          {formatMoney(sale.total_amount)}
        </div>
        {!cancelled && (
          <div style={{ fontSize: '0.72rem', color: 'var(--success)' }}>
            +{formatMoney(profit)}
          </div>
        )}
      </div>

      {/* Acciones rápidas (admin) */}
      {isAdmin && !cancelled && (
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={onEdit}
            className="btn btn-secondary btn-sm"
            title="Modificar venta"
            style={{ padding: '5px 8px' }}
          >
            <Edit2 size={13} />
          </button>
          <button
            onClick={onCancel}
            className="btn btn-danger btn-sm"
            title="Anular venta"
            style={{ padding: '5px 8px' }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
