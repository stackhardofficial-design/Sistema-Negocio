import { useState, useEffect, useCallback, useRef } from 'react'
import { useApp } from '../../lib/AppContext'
import {
  dbGetSales, dbCreateSale, dbCancelSale, dbGetProductByBarcode,
  dbGetProducts, subscribeToSales, unsubscribe, dbLogActivity
} from '../../lib/supabase'
import BarcodeScanner from '../../components/BarcodeScanner'
import Modal from '../../components/Modal'
import {
  ShoppingCart, Search, Trash2, Plus, Minus, Zap,
  TrendingUp, DollarSign, Filter, X, Camera,
  Calendar, User, Package, ChevronDown, CheckCircle
} from 'lucide-react'

function formatMoney(n) {
  return `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
}
function formatTime(d) {
  return new Date(d).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
function formatDate(d) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default function VentasModule() {
  const { tenantId, userInfo, toast, isAdmin } = useApp()

  // ===== CART (venta actual) =====
  const [cart, setCart] = useState([])
  const [barcodeInput, setBarcodeInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [loadingProduct, setLoadingProduct] = useState(false)
  const [processingPayment, setProcessingPayment] = useState(false)
  const barcodeRef = useRef(null)

  // ===== HISTORIAL VENTAS =====
  const [sales, setSales] = useState([])
  const [loadingSales, setLoadingSales] = useState(true)
  const [filterDate, setFilterDate] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // ===== MODALS =====
  const [cancelModal, setCancelModal] = useState({ open: false, sale: null, reason: '' })
  const [saleDetailModal, setSaleDetailModal] = useState({ open: false, sale: null })

  // ===== Totales acumulados =====
  const [totals, setTotals] = useState({ today_sales: 0, today_profit: 0, today_count: 0 })

  useEffect(() => {
    loadSales()
    const chan = subscribeToSales(tenantId, () => loadSales())
    return () => unsubscribe(chan)
  }, [tenantId])

  async function loadSales() {
    if (!tenantId) return
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const data = await dbGetSales(tenantId, { dateFrom: today.toISOString(), limit: 200 })
    setSales(data)
    setLoadingSales(false)

    // Calcular totales
    const completed = data.filter(s => s.status === 'completed')
    setTotals({
      today_sales: completed.reduce((a, s) => a + (s.total_amount || 0), 0),
      today_profit: completed.reduce((a, s) => a + ((s.total_amount || 0) - (s.total_cost || 0)), 0),
      today_count: completed.length
    })
  }

  // ===== ESCANEO / BÚSQUEDA =====
  const scanBarcode = useCallback(async (code) => {
    if (!code || !tenantId) return
    setLoadingProduct(true)
    try {
      const product = await dbGetProductByBarcode(tenantId, code)
      if (product) {
        addToCart(product)
        setBarcodeInput('')
        barcodeRef.current?.focus()
      } else {
        toast(`Producto con código "${code}" no encontrado`, 'warning')
      }
    } catch (err) {
      toast('Error al buscar producto', 'danger')
    } finally {
      setLoadingProduct(false)
    }
  }, [tenantId])

  async function handleBarcodeSubmit(e) {
    e.preventDefault()
    if (!barcodeInput.trim()) return
    await scanBarcode(barcodeInput.trim())
  }

  async function handleSearch(q) {
    setSearchQuery(q)
    if (!q.trim() || q.length < 2) { setSearchResults([]); return }
    const results = await dbGetProducts(tenantId, { search: q })
    setSearchResults(results.slice(0, 8))
  }

  // ===== CARRITO =====
  function addToCart(product, qty = 1) {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id)
      if (existing) {
        return prev.map(i =>
          i.product_id === product.id
            ? { ...i, quantity: i.quantity + qty }
            : i
        )
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        barcode: product.barcode,
        unit_price: product.price,
        unit_cost: product.cost_price || 0,
        quantity: qty
      }]
    })
    // Flash effect
    toast(`✓ ${product.name} agregado`, 'success', 1500)
  }

  function updateQty(productId, delta) {
    setCart(prev => prev
      .map(i => i.product_id === productId ? { ...i, quantity: i.quantity + delta } : i)
      .filter(i => i.quantity > 0)
    )
  }

  function removeFromCart(productId) {
    setCart(prev => prev.filter(i => i.product_id !== productId))
  }

  function clearCart() { setCart([]) }

  const cartTotal = cart.reduce((a, i) => a + i.unit_price * i.quantity, 0)
  const cartCost = cart.reduce((a, i) => a + i.unit_cost * i.quantity, 0)
  const cartProfit = cartTotal - cartCost

  // ===== CONFIRMAR VENTA =====
  async function confirmSale() {
    if (cart.length === 0) return toast('El carrito está vacío', 'warning')
    setProcessingPayment(true)
    try {
      const sale = await dbCreateSale(
        tenantId,
        userInfo?.id,
        cart,
        cartTotal,
        cartCost
      )
      await dbLogActivity(tenantId, userInfo?.id, 'create', 'sale', sale.id, {
        items: cart.length,
        total: cartTotal
      })
      setCart([])
      toast(`Venta registrada: ${formatMoney(cartTotal)}`, 'success')
      barcodeRef.current?.focus()
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    } finally {
      setProcessingPayment(false)
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
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    }
  }

  // ===== FILTROS =====
  const filteredSales = sales.filter(s => {
    if (filterDate && !s.created_at.startsWith(filterDate)) return false
    if (filterUser && !s.users?.name?.toLowerCase().includes(filterUser.toLowerCase())) return false
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      const hasItem = (s.sale_items || []).some(i =>
        i.products?.name?.toLowerCase().includes(q) ||
        i.products?.barcode?.includes(q)
      )
      if (!hasItem && !s.id.includes(q)) return false
    }
    return true
  })

  return (
    <div className="fade-in" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* ===== PANEL IZQUIERDO: Registrar venta ===== */}
      <div style={{
        width: '380px',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-secondary)',
        flexShrink: 0
      }}>
        {/* Header */}
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', fontSize: '1rem' }}>
            <Zap size={18} color="var(--accent)" /> Nueva Venta
          </h2>

          {/* Barcode Input */}
          <form onSubmit={handleBarcodeSubmit}>
            <div style={{ position: 'relative', marginBottom: '8px' }}>
              <input
                ref={barcodeRef}
                type="text"
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                placeholder="Escanear código de barras..."
                style={{
                  paddingRight: '90px',
                  background: 'var(--bg)',
                  borderColor: 'var(--accent)',
                  boxShadow: '0 0 0 1px var(--accent-soft)'
                }}
                autoFocus
                autoComplete="off"
              />
              <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '4px' }}>
                <BarcodeScanner onScan={scanBarcode} active={true} showCamera={true} />
              </div>
            </div>
          </form>

          {/* Product search */}
          <div className="search-wrap">
            <Search size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Buscar producto por nombre..."
            />
          </div>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div style={{
              position: 'absolute',
              zIndex: 100,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              marginTop: '4px',
              maxHeight: '200px',
              overflowY: 'auto',
              width: '338px',
              boxShadow: 'var(--shadow-lg)'
            }}>
              {searchResults.map(p => (
                <button
                  key={p.id}
                  onClick={() => { addToCart(p); setSearchQuery(''); setSearchResults([]) }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', background: 'none', border: 'none',
                    borderBottom: '1px solid var(--border)', cursor: 'pointer',
                    color: 'var(--text-primary)', fontSize: '0.85rem',
                    transition: 'background 0.1s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <span>{p.name}</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{formatMoney(p.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cart Items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {cart.length === 0 ? (
            <div className="empty-state">
              <ShoppingCart size={40} />
              <p style={{ fontSize: '0.875rem' }}>Escaneá un producto para empezar</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {cart.map(item => (
                <div
                  key={item.product_id}
                  className="fade-in"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 12px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {formatMoney(item.unit_price)} c/u
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      onClick={() => updateQty(item.product_id, -1)}
                      className="btn-icon"
                      style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px', cursor: 'pointer', color: 'var(--text-muted)' }}
                    >
                      <Minus size={12} />
                    </button>
                    <span style={{ fontWeight: 600, minWidth: '20px', textAlign: 'center', fontSize: '0.9rem' }}>
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQty(item.product_id, 1)}
                      className="btn-icon"
                      style={{ background: 'var(--accent-soft)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '6px', padding: '4px', cursor: 'pointer', color: 'var(--accent)' }}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <div style={{ fontWeight: 700, minWidth: '70px', textAlign: 'right', fontSize: '0.9rem' }}>
                    {formatMoney(item.unit_price * item.quantity)}
                  </div>
                  <button
                    onClick={() => removeFromCart(item.product_id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cart Footer */}
        <div style={{ padding: '16px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span>Subtotal ({cart.reduce((a, i) => a + i.quantity, 0)} items)</span>
            <span>{formatMoney(cartTotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', fontSize: '0.8rem', color: 'var(--success)' }}>
            <span>Ganancia estimada</span>
            <span>{formatMoney(cartProfit)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>Total</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)' }}>{formatMoney(cartTotal)}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {cart.length > 0 && (
              <button onClick={clearCart} className="btn btn-secondary btn-sm" style={{ flex: 0 }}>
                <Trash2 size={14} />
              </button>
            )}
            <button
              onClick={confirmSale}
              className="btn btn-primary"
              disabled={cart.length === 0 || processingPayment}
              style={{ flex: 1, justifyContent: 'center', fontSize: '1rem', fontWeight: 700 }}
            >
              {processingPayment ? '⏳ Registrando...' : `✓ Registrar ${formatMoney(cartTotal)}`}
            </button>
          </div>
        </div>
      </div>

      {/* ===== PANEL DERECHO: Historial de ventas ===== */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Totales del día */}
        <div style={{
          display: 'flex', gap: '16px', padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vendido hoy</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)' }}>{formatMoney(totals.today_sales)}</div>
          </div>
          <div style={{ width: '1px', background: 'var(--border)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ganado hoy</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--success)' }}>{formatMoney(totals.today_profit)}</div>
          </div>
          <div style={{ width: '1px', background: 'var(--border)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Transacciones</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{totals.today_count}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setShowFilters(v => !v)}
              className="btn btn-secondary btn-sm"
            >
              <Filter size={14} /> Filtros
              {(filterDate || filterUser || filterSearch) && (
                <span className="badge badge-warning" style={{ padding: '1px 6px', fontSize: '0.65rem' }}>!</span>
              )}
            </button>
          </div>
        </div>

        {/* Filtros expandibles */}
        {showFilters && (
          <div className="fade-in" style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-tertiary)',
            display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end'
          }}>
            <div className="form-group" style={{ flex: '1', minWidth: '150px' }}>
              <label className="form-label">Fecha</label>
              <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: '1', minWidth: '150px' }}>
              <label className="form-label">Vendedor</label>
              <input type="text" value={filterUser} onChange={e => setFilterUser(e.target.value)} placeholder="Nombre..." />
            </div>
            <div className="form-group" style={{ flex: '2', minWidth: '200px' }}>
              <label className="form-label">Producto / Código</label>
              <input type="text" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Buscar en items..." />
            </div>
            <button
              onClick={() => { setFilterDate(''); setFilterUser(''); setFilterSearch('') }}
              className="btn btn-secondary btn-sm"
            >
              <X size={14} /> Limpiar
            </button>
          </div>
        )}

        {/* Sales list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
          {loadingSales ? (
            <div className="empty-state"><div className="spinner" /></div>
          ) : filteredSales.length === 0 ? (
            <div className="empty-state">
              <ShoppingCart size={40} />
              <h3>Sin ventas</h3>
              <p style={{ fontSize: '0.85rem' }}>No hay ventas que coincidan con el filtro</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {filteredSales.map(sale => (
                <div
                  key={sale.id}
                  onClick={() => setSaleDetailModal({ open: true, sale })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 14px',
                    background: 'var(--bg-card)',
                    border: `1px solid ${sale.status === 'cancelled' ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    opacity: sale.status === 'cancelled' ? 0.6 : 1
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-light)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = sale.status === 'cancelled' ? 'rgba(239,68,68,0.2)' : 'var(--border)'}
                >
                  <div style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: sale.status === 'completed' ? 'var(--success)' : 'var(--danger)',
                    flexShrink: 0
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <User size={12} /> {sale.users?.name || 'Desconocido'}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Package size={12} /> {(sale.sale_items || []).length} items
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {formatDate(sale.created_at)} · {formatTime(sale.created_at)}
                    </div>
                    {sale.status === 'cancelled' && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--danger)' }}>● Anulada</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontWeight: 700,
                      color: sale.status === 'cancelled' ? 'var(--text-muted)' : 'var(--text-primary)',
                      textDecoration: sale.status === 'cancelled' ? 'line-through' : 'none'
                    }}>
                      {formatMoney(sale.total_amount)}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--success)' }}>
                      +{formatMoney((sale.total_amount || 0) - (sale.total_cost || 0))}
                    </div>
                  </div>
                  {isAdmin() && sale.status === 'completed' && (
                    <button
                      onClick={e => { e.stopPropagation(); setCancelModal({ open: true, sale, reason: '' }) }}
                      className="btn btn-danger btn-sm"
                      style={{ flexShrink: 0 }}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== MODAL: Detalle venta ===== */}
      <Modal
        open={saleDetailModal.open}
        onClose={() => setSaleDetailModal({ open: false, sale: null })}
        title={`Detalle de venta`}
        size="md"
      >
        {saleDetailModal.sale && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <div className="form-label">Vendedor</div>
                <div>{saleDetailModal.sale.users?.name || '—'}</div>
              </div>
              <div>
                <div className="form-label">Fecha</div>
                <div>{formatDate(saleDetailModal.sale.created_at)} {formatTime(saleDetailModal.sale.created_at)}</div>
              </div>
              <div>
                <div className="form-label">Estado</div>
                <span className={`badge ${saleDetailModal.sale.status === 'completed' ? 'badge-success' : 'badge-danger'}`}>
                  {saleDetailModal.sale.status === 'completed' ? 'Completada' : 'Anulada'}
                </span>
              </div>
            </div>

            <div className="table-wrap" style={{ marginTop: '8px' }}>
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
                  {(saleDetailModal.sale.sale_items || []).map((item, i) => (
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

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total vendido</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{formatMoney(saleDetailModal.sale.total_amount)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ganancia</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--success)' }}>
                  {formatMoney((saleDetailModal.sale.total_amount || 0) - (saleDetailModal.sale.total_cost || 0))}
                </div>
              </div>
            </div>

            {saleDetailModal.sale.cancel_reason && (
              <div style={{ padding: '10px', background: 'var(--danger-soft)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', color: 'var(--danger)' }}>
                Motivo de anulación: {saleDetailModal.sale.cancel_reason}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ===== MODAL: Anular venta ===== */}
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
              <Trash2 size={14} /> Anular venta
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Esta acción quedará registrada en el historial completo del sistema.
          </p>
          <div className="form-group">
            <label className="form-label">Motivo de anulación *</label>
            <textarea
              value={cancelModal.reason}
              onChange={e => setCancelModal(prev => ({ ...prev, reason: e.target.value }))}
              placeholder="Ej: El cliente cambió de opinión..."
              rows={3}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
