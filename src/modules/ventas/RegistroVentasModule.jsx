import { useState, useEffect, useCallback, useMemo } from 'react'
import { useApp } from '../../lib/AppContext'
import {
  sb, dbGetSales, dbCancelSale, dbLogActivity,
  dbUpdateSaleItem, dbDeleteSaleItem, dbMarkAutoconsumo, dbResolveMultipagoSale, dbGetExpenses, dbGetBuffetProducts
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
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('') // '' | 'completed' | 'cancelled'
  const [filterPayment, setFilterPayment] = useState('')
  const [filterOrigin, setFilterOrigin] = useState('') // '' | 'kiosco' | 'buffet' // '' | 'efectivo' | 'transferencia' | 'deudor'

  // Los totales se calculan dinámicamente más abajo con useMemo

  // ===== MODALS =====
  const [detailModal, setDetailModal] = useState({ open: false, sale: null })
  const [cancelModal, setCancelModal] = useState({ open: false, sale: null, reason: '' })
  const [editModal, setEditModal] = useState({ open: false, sale: null, items: [] })
  const [savingEdit, setSavingEdit] = useState(false)
  const [multipagoModal, setMultipagoModal] = useState({ open: false, sale: null, cash: '', transfer: '' })
  const [buffetProducts, setBuffetProducts] = useState([])
  const [displayLimit, setDisplayLimit] = useState(100)

  const loadSales = useCallback(async (showLoading = true) => {
    if (!tenantId) { setLoadingSales(false); return }
    if (showLoading) setLoadingSales(true)
    try {
      const opts = {}
      if (filterDateFrom) opts.dateFrom = new Date(filterDateFrom + 'T00:00:00-03:00').toISOString()
      if (filterDateTo) opts.dateTo = new Date(filterDateTo + 'T23:59:59-03:00').toISOString()
      
      // Si no hay filtro de fechas, limitamos a las últimas 500 ventas para que cargue rapidísimo.
      // Si quieren ver más atrás, simplemente usan el filtro de fechas.
      if (!filterDateFrom && !filterDateTo) {
        opts.limit = 500
      }
      
      const data = await dbGetSales(tenantId, opts)
      
      const exps = await dbGetExpenses(tenantId, { dateFrom: filterDateFrom, dateTo: filterDateTo })
      const incomes = exps.filter(e => e.expense_type === 'ingreso').map(e => ({
        id: e.id,
        created_at: e.created_at,
        total_amount: e.amount,
        total_cost: 0,
        payment_method: 'efectivo',
        status: 'completed',
        is_income: true,
        users: { name: e.users?.name || 'Caja' },
        sale_items: [{ quantity: 1, custom_name: e.description || e.expense_categories?.name || 'Ingreso manual' }]
      }))
      
      const merged = [...data, ...incomes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      setSales(merged)
      setDisplayLimit(100)
    } catch (err) {
      console.error(err)
    } finally {
      if (showLoading) setLoadingSales(false)
    }
  }, [tenantId, filterDateFrom, filterDateTo])

  useEffect(() => {
    loadSales()
    if (!tenantId) return
    const channelSales = sb.channel('registro_ventas_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales', filter: `tenant_id=eq.${tenantId}` }, () => loadSales(false))
      .subscribe()
      
    const channelExpenses = sb.channel('registro_ventas_expenses_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `tenant_id=eq.${tenantId}` }, () => loadSales(false))
      .subscribe()
      
    return () => { 
      sb.removeChannel(channelSales) 
      sb.removeChannel(channelExpenses)
    }
  }, [tenantId, loadSales])

  // ===== FILTRADO =====
  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      if (filterStatus && s.status !== filterStatus) return false
      if (filterPayment && s.payment_method !== filterPayment) return false
      if (filterOrigin && s.sale_items) {
        const hasK = s.sale_items.some(i => !i.buffet_product_id)
        const hasB = s.sale_items.some(i => i.buffet_product_id)
        if (filterOrigin === 'kiosco' && !hasK) return false
        if (filterOrigin === 'buffet' && !hasB) return false
      }
      
      if (filterDateFrom || filterDateTo) {
        const saleDate = new Date(s.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
        if (filterDateFrom && saleDate < filterDateFrom) return false
        if (filterDateTo && saleDate > filterDateTo) return false
      }
      
      if (filterUser && !s.users?.name?.toLowerCase().includes(filterUser.toLowerCase())) return false
      if (filterSearch) {
        const q = filterSearch.toLowerCase()
        const hasItem = (s.sale_items || []).some(i =>
          i.products?.name?.toLowerCase().includes(q) ||
          i.products?.barcode?.includes(q) ||
          i.buffet_products?.name?.toLowerCase().includes(q) ||
          i.buffet_products?.barcode?.includes(q)
        )
        if (!hasItem && !s.id.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [sales, filterStatus, filterPayment, filterDateFrom, filterDateTo, filterUser, filterSearch, filterOrigin])

  // ===== TOTALES (Dinámicos según filtros) =====
  const totals = useMemo(() => {
    const completed = filteredSales.filter(s => s.status === 'completed' && !s.is_income)
    const autoconsumo = filteredSales.filter(s => s.status === 'autoconsumo')
    
    let salesKiosco = 0
    let salesBuffet = 0
    let totalSales = 0

    completed.forEach(s => {
      totalSales += (s.total_amount || 0)
      
      if (s.sale_items && s.sale_items.length > 0) {
        let k = 0
        let b = 0
        s.sale_items.forEach(i => {
          const itemTotal = (i.unit_price || 0) * (i.quantity || 1)
          if (i.buffet_product_id) {
            b += itemTotal
          } else {
            k += itemTotal
          }
        })
        salesKiosco += k
        salesBuffet += b
      } else {
        salesKiosco += (s.total_amount || 0)
      }
    })

    return {
      sales: totalSales,
      salesKiosco,
      salesBuffet,
      profit: completed.reduce((a, s) => a + ((s.total_amount || 0) - (s.total_cost || 0)), 0) - autoconsumo.reduce((a, s) => a + (s.total_cost || 0), 0),
      count: completed.length + autoconsumo.length
    }
  }, [filteredSales])

  // ===== RESOLVER MULTIPAGO =====
  function handleCashChange(e) {
    const val = e.target.value
    setMultipagoModal(prev => {
      const parsed = parseFloat(val)
      const diff = (!isNaN(parsed) && prev.sale) ? Math.max(0, prev.sale.total_amount - parsed) : ''
      return { ...prev, cash: val, transfer: diff.toString() }
    })
  }

  function handleTransferChange(e) {
    const val = e.target.value
    setMultipagoModal(prev => {
      const parsed = parseFloat(val)
      const diff = (!isNaN(parsed) && prev.sale) ? Math.max(0, prev.sale.total_amount - parsed) : ''
      return { ...prev, transfer: val, cash: diff.toString() }
    })
  }

  async function resolveMultipago() {
    const cash = parseFloat(multipagoModal.cash) || 0
    const transfer = parseFloat(multipagoModal.transfer) || 0
    if (cash + transfer !== multipagoModal.sale.total_amount) {
      return toast('La suma debe ser igual al total de la venta', 'warning')
    }
    
    setSavingEdit(true)
    try {
      await dbResolveMultipagoSale(multipagoModal.sale.id, cash, transfer)
      toast('Pago registrado correctamente', 'success')
      setMultipagoModal({ open: false, sale: null, cash: '', transfer: '' })
      loadSales(false)
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    } finally {
      setSavingEdit(false)
    }
  }

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

  async function handleAutoconsumo() {
    if (!editModal.sale) return
    const confirm = window.confirm('¿Seguro que querés marcar esta venta como Autoconsumo? Esto dejará el ingreso en 0 y solo se contabilizará el costo como pérdida/consumo interno.')
    if (!confirm) return
    setSavingEdit(true)
    try {
      await dbMarkAutoconsumo(editModal.sale.id)
      await dbLogActivity(tenantId, userInfo?.id, 'update', 'sale', editModal.sale.id, { reason: 'Marcado como autoconsumo' })
      toast('Venta marcada como autoconsumo', 'success')
      setEditModal({ open: false, sale: null, items: [] })
      setDetailModal({ open: false, sale: null })
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    } finally {
      setSavingEdit(false)
    }
  }

  const activeFilters = !!(filterDateFrom || filterDateTo || filterUser || filterSearch || filterStatus || filterPayment || filterOrigin)

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
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '2px' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>K: {formatMoney(totals.salesKiosco)}</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>B: {formatMoney(totals.salesBuffet)}</span>
            </div>
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
            <label className="form-label">Desde</label>
            <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1', minWidth: '140px' }}>
            <label className="form-label">Hasta</label>
            <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
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
              <option value="autoconsumo">Autoconsumo</option>
            </select>
          </div>
          <div className="form-group" style={{ flex: '1', minWidth: '140px' }}>
            <label className="form-label">Origen</label>
            <select value={filterOrigin} onChange={e => setFilterOrigin(e.target.value)}>
              <option value="">Todos</option>
              <option value="kiosco">Kiosco</option>
              <option value="buffet">Buffet</option>
            </select>
          </div>
          <div className="form-group" style={{ flex: '1', minWidth: '140px' }}>
            <label className="form-label">Método de pago</label>
            <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)}>
              <option value="">Todos</option>
              <option value="efectivo">💵 Efectivo</option>
              <option value="transferencia">📲 Transferencia</option>
              <option value="multipagos">💳 Multipagos</option>
              <option value="deudor">📒 Deudor</option>
            </select>
          </div>
          <button
            onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setFilterUser(''); setFilterSearch(''); setFilterStatus(''); setFilterPayment(''); setFilterOrigin('') }}
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
          <>
          <div className="table-wrap">
            <table style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '12px' }}>Fecha y Hora</th>
                  <th style={{ textAlign: 'left', padding: '12px' }}>Vendedor</th>
                  <th style={{ textAlign: 'left', padding: '12px' }}>Productos</th>
                  <th style={{ textAlign: 'center', padding: '12px' }}>Pago</th>
                  <th style={{ textAlign: 'center', padding: '12px' }}>Estado</th>
                  <th style={{ textAlign: 'right', padding: '12px' }}>Total</th>
                  {isAdmin() && <th style={{ textAlign: 'center', padding: '12px' }}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {filteredSales.slice(0, displayLimit).map(sale => (
                  <SaleRow
                    key={sale.id}
                    sale={sale}
                    isAdmin={isAdmin()}
                    onDetail={() => setDetailModal({ open: true, sale })}
                    onCancel={() => setCancelModal({ open: true, sale, reason: '' })}
                    onEdit={() => openEditModal(sale)}
                    onResolveMultipago={() => setMultipagoModal({ open: true, sale, cash: '', transfer: '' })}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {filteredSales.length > displayLimit && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0', gap: '12px', alignItems: 'center' }}>
              <button
                onClick={() => setDisplayLimit(prev => prev + 100)}
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <ChevronDown size={16} />
                Cargar más ({displayLimit} de {filteredSales.length})
              </button>
              <button
                onClick={() => setDisplayLimit(filteredSales.length)}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.75rem' }}
              >
                Mostrar todas
              </button>
            </div>
          )}
          </>
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
              <div>
                <div className="form-label">Método de pago</div>
                <PaymentBadge method={detailModal.sale.payment_method} debtorName={detailModal.sale.debtors?.name} />
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
                      <td>{item.custom_name || item.products?.name || (Array.isArray(item.buffet_products) ? item.buffet_products[0]?.name : item.buffet_products?.name) || (item.buffet_product_id ? buffetProducts.find(b => b.id === item.buffet_product_id)?.name : null) || '—'}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{item.products?.barcode || item.buffet_products?.barcode || '—'}</td>
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
            <button onClick={handleAutoconsumo} className="btn" style={{ background: '#8b5cf6', color: 'white', border: 'none' }} disabled={savingEdit} title="Marcar venta como consumo interno (costo sin ganancia)">
              {savingEdit ? '...' : <><Package size={14} /> Marcar Autoconsumo</>}
            </button>
            <button onClick={saveEdit} className="btn btn-primary" disabled={savingEdit}>
              {savingEdit ? 'Guardando...' : <><Save size={14} /> Guardar cambios</>}
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
                  {item.products?.name || item.buffet_products?.name || '—'}
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

      {/* ===== MODAL: RESOLVER MULTIPAGO ===== */}
      <Modal
        open={multipagoModal.open}
        onClose={() => setMultipagoModal({ open: false, sale: null, cash: '', transfer: '' })}
        title="Completar Multipago"
        size="sm"
        footer={
          <>
            <button onClick={() => setMultipagoModal({ open: false, sale: null, cash: '', transfer: '' })} className="btn btn-secondary">
              Cancelar
            </button>
            <button onClick={resolveMultipago} className="btn btn-primary" disabled={savingEdit}>
              {savingEdit ? 'Guardando...' : 'Confirmar pago'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total a cubrir</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{formatMoney(multipagoModal.sale?.total_amount)}</div>
          </div>
          
          <div className="form-group">
            <label className="form-label">Efectivo 💵</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>$</span>
              <input type="number" step="0.01" value={multipagoModal.cash} onChange={handleCashChange} style={{ paddingLeft: '24px' }} placeholder="0.00" autoFocus />
            </div>
          </div>
          
          <div className="form-group">
            <label className="form-label">Transferencia / Mercado Pago 📲</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>$</span>
              <input type="number" step="0.01" value={multipagoModal.transfer} onChange={handleTransferChange} style={{ paddingLeft: '24px' }} placeholder="0.00" />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ===== COMPONENTE FILA DE VENTA =====
function SaleRow({ sale, isAdmin, onDetail, onCancel, onEdit, onResolveMultipago, buffetProducts = [] }) {
  const cancelled = sale.status === 'cancelled'
  const isAutoconsumo = sale.status === 'autoconsumo'
  
  // Es multipago pendiente si el método es multipagos y la suma de pagos es menor al total
  const isPendingMultipago = sale.payment_method === 'multipagos' && 
    ((Number(sale.cash_amount) || 0) + (Number(sale.transfer_amount) || 0) < Number(sale.total_amount))
    
  const profit = isAutoconsumo ? -(sale.total_cost || 0) : (sale.total_amount || 0) - (sale.total_cost || 0)

  let bgNormal = isAutoconsumo ? 'rgba(139, 92, 246, 0.1)' : sale.is_income ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg-card)'
  let bgHover = isAutoconsumo ? 'rgba(139, 92, 246, 0.15)' : sale.is_income ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-secondary)'
  
  if (cancelled) {
    bgNormal = 'var(--danger-soft)'
    bgHover = 'var(--danger-soft)'
  } else if (isPendingMultipago) {
    bgNormal = 'rgba(16, 185, 129, 0.3)' // Fondo verde llamativo
    bgHover = 'rgba(16, 185, 129, 0.4)'
  }

  return (
    <tr 
      onClick={isPendingMultipago ? onResolveMultipago : onDetail}
      style={{ 
        cursor: 'pointer',
        opacity: cancelled ? 0.7 : 1,
        background: bgNormal,
        borderBottom: '1px solid var(--border)',
        transition: 'all 0.15s ease'
      }}
      onMouseEnter={e => { e.currentTarget.style.background = bgHover }}
      onMouseLeave={e => { e.currentTarget.style.background = bgNormal }}
    >
      <td style={{ padding: '12px' }}>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatDate(sale.created_at)}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatTime(sale.created_at)}</div>
      </td>
      <td style={{ padding: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%',
            background: cancelled ? 'var(--danger-soft)' : isAutoconsumo ? 'rgba(139, 92, 246, 0.15)' : 'var(--accent-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: cancelled ? 'var(--danger)' : isAutoconsumo ? '#8b5cf6' : 'var(--accent)',
            fontWeight: 700, fontSize: '0.8rem'
          }}>
            {(sale.users?.name || 'U').charAt(0).toUpperCase()}
          </div>
          <span style={{ fontWeight: 500 }}>{sale.users?.name || 'Desconocido'}</span>
        </div>
      </td>
      <td style={{ padding: '12px', fontSize: '0.85rem' }}>
        {(sale.sale_items || []).slice(0, 2).map((i, idx) => {
          let itemName = i.custom_name || i.products?.name || (Array.isArray(i.buffet_products) ? i.buffet_products[0]?.name : i.buffet_products?.name)
          if (!itemName && i.buffet_product_id) {
            const bp = buffetProducts.find(b => b.id === i.buffet_product_id)
            if (bp) itemName = bp.name
          }
          if (!itemName) itemName = 'Desconocido'
          return <div key={idx}>{i.quantity}x {itemName}</div>
        })}
        {(sale.sale_items || []).length > 2 && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '2px' }}>
            + {(sale.sale_items || []).length - 2} productos más...
          </div>
        )}
      </td>
      <td style={{ padding: '12px', textAlign: 'center' }}>
        <PaymentBadge method={sale.payment_method} debtorName={sale.debtors?.name} />
      </td>
      <td style={{ padding: '12px', textAlign: 'center' }}>
        <span className={`badge ${cancelled ? 'badge-danger' : sale.is_income ? 'badge-success' : isAutoconsumo ? 'badge-primary' : isPendingMultipago ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: '0.7rem', background: isAutoconsumo ? '#8b5cf6' : sale.is_income ? 'rgba(16, 185, 129, 0.1)' : undefined, color: isAutoconsumo ? 'white' : sale.is_income ? 'var(--success)' : undefined, border: isAutoconsumo ? 'none' : sale.is_income ? '1px solid rgba(16, 185, 129, 0.3)' : undefined }}>
          {cancelled ? 'ANULADA' : sale.is_income ? 'INGRESO CAJA' : isAutoconsumo ? 'AUTOCONSUMO' : isPendingMultipago ? 'PENDIENTE' : 'COMPLETADA'}
        </span>
      </td>
      <td style={{ padding: '12px', textAlign: 'right' }}>
        <div style={{ fontWeight: 700, fontSize: '1.1rem', textDecoration: cancelled ? 'line-through' : 'none', color: sale.is_income ? 'var(--success)' : isAutoconsumo ? 'var(--text-muted)' : 'inherit' }}>
          {isAutoconsumo ? '$0 (Auto)' : sale.is_income ? `+ ${formatMoney(sale.total_amount)}` : formatMoney(sale.total_amount)}
        </div>
        {!cancelled && isAdmin && !sale.is_income && (
          <div style={{ fontSize: '0.7rem', color: isAutoconsumo ? 'var(--danger)' : 'var(--success)' }}>
            {isAutoconsumo ? '-' : '+'} {formatMoney(Math.abs(profit))}
          </div>
        )}
      </td>
      {isAdmin && (
        <td style={{ padding: '12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
          {!cancelled && !isAutoconsumo && !isPendingMultipago && !sale.is_income ? (
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
              <button onClick={onEdit} className="btn btn-secondary btn-sm" title="Editar / Autoconsumo" style={{ padding: '4px 8px' }}>
                <Edit2 size={12} />
              </button>
              <button onClick={onCancel} className="btn btn-danger btn-sm" title="Anular" style={{ padding: '4px 8px' }}>
                <Trash2 size={12} />
              </button>
            </div>
          ) : isPendingMultipago ? (
             <button onClick={onResolveMultipago} className="btn btn-primary btn-sm" title="Completar" style={{ padding: '4px 12px', fontWeight: 800 }}>
                Completar
             </button>
          ) : (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</span>
          )}
        </td>
      )}
    </tr>
  )
}

// ===== BADGE MÉTODO DE PAGO =====
function PaymentBadge({ method, debtorName }) {
  const map = {
    efectivo:      { label: '💵 Efectivo',       bg: 'rgba(16,185,129,0.12)',  color: '#10b981', border: 'rgba(16,185,129,0.35)' },
    transferencia: { label: '📲 Mercado Pago',  bg: 'rgba(0,158,227,0.12)',   color: '#009EE3', border: 'rgba(0,158,227,0.35)' },
    deudor:        { label: debtorName ? `📒 ${debtorName}` : '📒 Deudor', bg: 'rgba(245,158,11,0.10)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
    multipagos:    { label: '💳 Multipagos',     bg: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: 'rgba(139,92,246,0.45)' }
  }
  const cfg = map[method] || { label: method || '—', bg: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: 'var(--border)' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      whiteSpace: 'nowrap'
    }}>
      {cfg.label}
    </span>
  )
}
