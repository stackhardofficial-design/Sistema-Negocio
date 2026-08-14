import { useState, useEffect } from 'react'
import { useApp } from '../../lib/AppContext'
import { sb, dbGetProducts, dbUpdateProductStock, dbLogActivity, dbCreateExpense, dbEnsureExpenseCategory } from '../../lib/supabase'
import Modal from '../../components/Modal'
import { Layers, AlertTriangle, Search, Edit2, Check, X, RefreshCw, ShoppingCart } from 'lucide-react'

function formatMoney(n) { return `$${Number(n || 0).toLocaleString('es-AR')}` }

export default function StockModule() {
  const { tenantId, userInfo, toast, isAdmin } = useApp()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [view, setView] = useState('all') // 'all' | 'low' | 'out'
  const [displayLimit, setDisplayLimit] = useState(100)

  // Modal de confirmación de gasto por ingreso de mercadería
  const [expenseConfirmModal, setExpenseConfirmModal] = useState({ open: false, product: null, added: 0, cost: 0, newStock: 0 })
  const [savingExpense, setSavingExpense] = useState(false)

  async function load(showLoading = true) {
    if (!tenantId) { setLoading(false); return; }
    if (showLoading) setLoading(true)
    const data = await dbGetProducts(tenantId, { includeInactive: false })
    setProducts(data)
    if (showLoading) setLoading(false)
  }

  useEffect(() => {
    load()

    if (!tenantId) return
    const channel = sb.channel('stock_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `tenant_id=eq.${tenantId}` }, () => {
        load(false) // Reload quietly
      })
      .subscribe()

    return () => { sb.removeChannel(channel) }
  }, [tenantId])

  async function saveStock(product) {
    const newStock = parseInt(editValue)
    if (isNaN(newStock) || newStock < 0) return toast('Valor inválido', 'warning')

    const oldStock = product.stock ?? 0
    const added = newStock - oldStock
    // Si se está modificando stock mostrar modal de confirmación, tenga costo previo o no
    if (added !== 0) {
      const suggestedCost = (product.cost_price && product.cost_price > 0) ? (product.cost_price * added) : ''
      setExpenseConfirmModal({
        open: true,
        product,
        added,
        cost: suggestedCost,
        newStock
      })
      return
    }

    // Si no hubo cambios → guardar directo
    await commitStockUpdate(product, newStock, oldStock)
  }

  async function commitStockUpdate(product, newStock, oldStock) {
    try {
      await dbUpdateProductStock(product.id, newStock)
      await dbLogActivity(tenantId, userInfo?.id, 'update_stock', 'product', product.id, {
        name: product.name, barcode: product.barcode, old: oldStock, new: newStock
      })
      toast(`Stock de "${product.name}" actualizado a ${newStock}`, 'success')
      setEditingId(null)
      load()
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    }
  }

  async function handleConfirmExpense(registerExpense) {
    let { product, added, cost, newStock } = expenseConfirmModal
    const oldStock = product.stock ?? 0
    if (registerExpense) {
      if (isNaN(cost)) return toast('Por favor, ingresá un valor numérico válido', 'warning')
      if (added > 0 && cost <= 0) return toast('El costo debe ser mayor a 0 para ingresos', 'warning')
      if (added < 0 && cost >= 0) return toast('El ajuste debe ser negativo (ej: -500) para devoluciones', 'warning')
    }
    setSavingExpense(true)
    try {
      // 1. Actualizar el stock
      await commitStockUpdate(product, newStock, oldStock)

      // 2. Si el usuario confirmó registrar el gasto en Caja
      if (registerExpense) {
        const category = await dbEnsureExpenseCategory(tenantId, 'Compra Mercadería')
        await dbCreateExpense({
          tenant_id: tenantId,
          user_id: userInfo?.id,
          category_id: category.id,
          amount: cost,
          description: JSON.stringify({
            _type: 'stock_restock',
            qty: added,
            name: product.name,
            barcode: product.barcode || '',
            unit_cost: product.cost_price
          }),
          expense_date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }),
          expense_type: 'variable'
        })
        toast(`Gasto de ${formatMoney(cost)} registrado en Caja `, 'success')
      }
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    } finally {
      setSavingExpense(false)
      setExpenseConfirmModal({ open: false, product: null, added: 0, cost: 0, newStock: 0 })
    }
  }

  let filtered = products.filter(p => {
    if (search) {
      const q = search.toLowerCase()
      return p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q)
    }
    return true
  })

  if (view === 'low') filtered = filtered.filter(p => p.stock !== null && p.min_stock !== null && p.stock <= p.min_stock && p.stock > 0)
  if (view === 'out') filtered = filtered.filter(p => p.stock !== null && p.stock === 0)

  const lowCount = products.filter(p => p.stock !== null && p.min_stock !== null && p.stock <= p.min_stock && p.stock > 0).length
  const outCount = products.filter(p => p.stock !== null && p.stock === 0).length

  return (
    <div className="fade-in">
      <div className="module-header">
        <h1>
          <span className="icon-wrap"><Layers size={20} /></span>
          Control de Stock
        </h1>
        <button onClick={load} className="btn btn-secondary btn-sm">
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="module-content">
        {/* KPIs */}
        <div className="kpi-grid" style={{ marginBottom: '20px' }}>
          <div className="kpi-card">
            <div className="kpi-label">Total productos</div>
            <div className="kpi-value">{products.length}</div>
          </div>
          <div className="kpi-card" style={{ borderColor: lowCount > 0 ? 'rgba(245,158,11,0.3)' : undefined }}>
            <div className="kpi-label">Bajo stock</div>
            <div className="kpi-value" style={{ color: lowCount > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>{lowCount}</div>
          </div>
          <div className="kpi-card" style={{ borderColor: outCount > 0 ? 'rgba(239,68,68,0.3)' : undefined }}>
            <div className="kpi-label">Sin stock</div>
            <div className="kpi-value" style={{ color: outCount > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>{outCount}</div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div className="search-wrap" style={{ flex: 1, minWidth: '200px' }}>
            <Search size={16} />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setDisplayLimit(100); }}
              placeholder="Buscar producto..."
            />
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {[
              { id: 'all', label: 'Todos' },
              { id: 'low', label: <span style={{display:'flex', alignItems:'center', gap:'4px'}}><AlertTriangle size={14}/> Bajo (${lowCount})</span> },
              { id: 'out', label: ` Sin stock (${outCount})` }
            ].map(v => (
              <button
                key={v.id}
                onClick={() => { setView(v.id); setDisplayLimit(100); }}
                className={`btn btn-sm ${view === v.id ? 'btn-primary' : 'btn-secondary'}`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="empty-state"><div className="spinner" /></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Código</th>
                  <th>Categoría</th>
                  <th style={{ textAlign: 'right' }}>Costo unit.</th>
                  <th style={{ textAlign: 'right' }}>Stock actual</th>
                  <th style={{ textAlign: 'right' }}>Stock mín.</th>
                  <th>Estado</th>
                  <th>Editar stock</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, displayLimit).map(p => {
                  const isLow = p.stock !== null && p.min_stock !== null && p.stock <= p.min_stock && p.stock > 0
                  const isOut = p.stock !== null && p.stock === 0
                  const isEditing = editingId === p.id
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 500 }}>{p.name}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {p.barcode || '—'}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        {p.categories?.name || '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: '0.85rem', color: p.cost_price > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {p.cost_price > 0 ? formatMoney(p.cost_price) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {isEditing ? (
                          <input
                            type="number"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveStock(p); if (e.key === 'Escape') setEditingId(null) }}
                            style={{ width: '80px', textAlign: 'right', padding: '4px 8px', fontSize: '0.85rem' }}
                            autoFocus
                          />
                        ) : (
                          <span style={{
                            fontWeight: 700,
                            color: isOut ? 'var(--danger)' : isLow ? 'var(--warning)' : 'var(--text-primary)'
                          }}>
                            {p.stock ?? '∞'}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{p.min_stock ?? '—'}</td>
                      <td>
                        {isOut ? <span className="badge badge-danger">Sin stock</span>
                          : isLow ? <span className="badge badge-warning" style={{display:'flex', alignItems:'center', gap:'4px'}}><AlertTriangle size={12}/> Bajo</span>
                          : p.stock === null ? <span className="badge badge-neutral">Ilimitado</span>
                          : <span className="badge badge-success">OK</span>}
                      </td>
                      <td>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button onClick={() => saveStock(p)} className="btn btn-success btn-sm">
                              <Check size={12} />
                            </button>
                            <button onClick={() => setEditingId(null)} className="btn btn-secondary btn-sm">
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingId(p.id); setEditValue(p.stock ?? '') }}
                            className="btn btn-secondary btn-sm"
                          >
                            <Edit2 size={12} /> Ajustar
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            
            {filtered.length > displayLimit && (
              <div style={{ padding: '16px', textAlign: 'center', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '8px' }}>
                  Mostrando {displayLimit} de {filtered.length} productos
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  <button 
                    className="btn btn-secondary btn-sm"
                    onClick={() => setDisplayLimit(prev => prev + 100)}
                  >
                    Cargar más
                  </button>
                  <button 
                    className="btn btn-outline btn-sm"
                    onClick={() => setDisplayLimit(filtered.length)}
                  >
                    Ver todos
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Confirmación Gasto por Mercadería */}
      <Modal
        open={expenseConfirmModal.open}
        onClose={() => !savingExpense && setExpenseConfirmModal({ open: false, product: null, added: 0, cost: 0, newStock: 0 })}
        title={expenseConfirmModal.added > 0 ? "Ingreso de Mercadería Detectado" : "Reducción de Mercadería Detectada"}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{
            padding: '16px', borderRadius: '12px',
            background: expenseConfirmModal.added > 0 ? 'var(--accent-soft)' : 'var(--danger-soft)', border: `1px solid ${expenseConfirmModal.added > 0 ? 'var(--accent)' : 'var(--danger)'}`,
            display: 'flex', gap: '12px', alignItems: 'flex-start'
          }}>
            <ShoppingCart size={22} color={expenseConfirmModal.added > 0 ? "var(--accent)" : "var(--danger)"} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontWeight: 600, marginBottom: '6px' }}>
                Estás {expenseConfirmModal.added > 0 ? 'sumando' : 'restando'} {Math.abs(expenseConfirmModal.added)} unidades de<br />
                <span style={{ color: expenseConfirmModal.added > 0 ? 'var(--accent)' : 'var(--danger)' }}>"{expenseConfirmModal.product?.name}"</span>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Costo unitario registrado: <strong>{formatMoney(expenseConfirmModal.product?.cost_price)}</strong><br />
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {expenseConfirmModal.added > 0 ? 'Costo total de esta compra:' : 'Ajuste a favor en Caja (negativo):'}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>$</span>
                    <input 
                      type="number" 
                      value={expenseConfirmModal.cost} 
                      onChange={e => setExpenseConfirmModal(prev => ({ ...prev, cost: e.target.value ? parseFloat(e.target.value) : '' }))}
                      className="input-sm"
                      style={{ fontSize: '1.1rem', fontWeight: 700, width: '120px' }}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            ¿Querés registrar automáticamente este importe como {expenseConfirmModal.added > 0 ? 'gasto de' : 'ajuste de'} <em>Compra de Mercadería</em> en la Caja?
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              onClick={() => handleConfirmExpense(true)}
              disabled={savingExpense}
              className="btn btn-primary"
            >
              {savingExpense ? 'Guardando...' : ` Sí, registrar ${expenseConfirmModal.added > 0 ? 'gasto' : 'ajuste'}${expenseConfirmModal.cost ? ` de ${formatMoney(expenseConfirmModal.cost)}` : ''}`}
            </button>
            <button
              onClick={() => handleConfirmExpense(false)}
              disabled={savingExpense}
              className="btn btn-secondary"
            >
              Solo actualizar stock, sin registrar gasto
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
