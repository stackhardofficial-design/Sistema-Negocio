import { useState, useEffect } from 'react'
import { useApp } from '../../lib/AppContext'
import {
  sb, dbGetBuffetProducts, dbCreateBuffetProduct, dbUpdateBuffetProduct,
  dbGetIngredients, dbCreateIngredient, dbUpdateIngredient, dbDeleteIngredient,
  dbSetBuffetIngredients, dbGetBuffetOrders, dbGetProducts, dbSetBuffetProductComponents,
  dbCreateBuffetOrder, dbUpdateBuffetOrderStatus, dbLogActivity
} from '../../lib/supabase'
import Modal from '../../components/Modal'
import { Coffee, Plus, Edit2, Trash2, Clock, Utensils, User, Package as PkgIcon, AlertTriangle } from 'lucide-react'

function formatMoney(n) { return `$${Number(n || 0).toLocaleString('es-AR')}` }
function formatTime(d) { return new Date(d).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) }

const STATUS_LABELS = {
  pending: { label: 'Pendiente', color: 'var(--warning)', badge: 'badge-warning' },
  preparing: { label: 'Preparando', color: 'var(--info)', badge: 'badge-info' },
  ready: { label: 'Listo', color: 'var(--success)', badge: 'badge-success' },
  delivered: { label: 'Entregado', color: 'var(--text-muted)', badge: 'badge-neutral' }
}

export default function BuffetModule() {
  const { tenantId, userInfo, toast, isAdmin } = useApp()
  const [tab, setTab] = useState('productos') // productos | pedidos | ingredientes
  const [buffetProducts, setBuffetProducts] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  const [productModal, setProductModal] = useState({ open: false, edit: null })
  const [productTypeTab, setProductTypeTab] = useState('simple') // 'simple' | 'combo'
  const [form, setForm] = useState({ name: '', barcode: '', price: '', cost_price: '', stock: '', min_stock: '', description: '', ingredients: [], components: [] })
  const [saving, setSaving] = useState(false)

  const [orderModal, setOrderModal] = useState({ open: false })
  const [orderCart, setOrderCart] = useState([])
  const [customerName, setCustomerName] = useState('')

  const [ingredientModal, setIngredientModal] = useState({ open: false, edit: null })
  const [ingForm, setIngForm] = useState({ name: '', unit: 'unidad', cost_price: '', stock: '', min_stock: '' })

  async function load(showLoading = true) {
    if (!tenantId) { setLoading(false); return; }
    if (showLoading) setLoading(true)
    const [bp, ings, ord, stdProds] = await Promise.all([
      dbGetBuffetProducts(tenantId),
      dbGetIngredients(tenantId),
      dbGetBuffetOrders(tenantId),
      dbGetProducts(tenantId)
    ])
    setBuffetProducts(bp)
    setIngredients(ings)
    setOrders(ord)
    setProducts(stdProds)
    if (showLoading) setLoading(false)
  }

  useEffect(() => {
    load()
    if (!tenantId) return
    const channel = sb.channel('buffet_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buffet_orders', filter: `tenant_id=eq.${tenantId}` }, () => load(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buffet_products', filter: `tenant_id=eq.${tenantId}` }, () => load(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buffet_product_components', filter: `tenant_id=eq.${tenantId}` }, () => load(false))
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [tenantId])

  function openCreate() {
    setForm({ name: '', barcode: '', price: '', cost_price: '', stock: '', min_stock: '', description: '', ingredients: [], components: [] })
    setProductTypeTab('simple')
    setProductModal({ open: true, edit: null })
  }

  function openEdit(bp) {
    setForm({
      name: bp.name || '',
      barcode: bp.barcode || '',
      price: bp.price || '',
      cost_price: bp.cost_price || '',
      stock: bp.stock ?? '',
      min_stock: bp.min_stock ?? '',
      description: bp.description || '',
      ingredients: (bp.buffet_ingredients || []).map(i => ({
        ingredient_id: i.ingredient_id,
        quantity: i.quantity,
        unit: i.unit || 'unidad',
        name: i.ingredients?.name
      })),
      components: (bp.buffet_product_components || []).map(c => ({
        is_buffet: !!c.component_buffet_product_id,
        component_id: c.component_buffet_product_id || c.component_product_id,
        quantity: c.quantity,
        name: c.products?.name || c.buffet_products?.name || 'Desconocido',
        cost: c.products?.cost_price || c.buffet_products?.cost_price || 0
      }))
    })
    setProductTypeTab(bp.is_composite ? 'combo' : 'simple')
    setProductModal({ open: true, edit: bp })
  }

  async function handleSave() {
    if (!form.name.trim()) return toast('El nombre es obligatorio', 'warning')
    if (!form.price) return toast('El precio es obligatorio', 'warning')
    
    if (form.barcode && form.barcode.trim()) {
      const existing = buffetProducts.find(p => p.barcode === form.barcode.trim() && p.id !== productModal.edit?.id)
      if (existing) {
        return toast(`El código de barras ya existe en el producto "${existing.name}". Usa otro.`, 'error')
      }
    }

    setSaving(true)
    try {
      const is_composite = productTypeTab === 'combo'
      const payload = {
        tenant_id: tenantId,
        name: form.name.trim(),
        barcode: form.barcode.trim() || null,
        price: parseFloat(form.price),
        cost_price: form.cost_price ? parseFloat(form.cost_price) : 0,
        stock: is_composite ? null : (form.stock !== '' ? parseInt(form.stock) : null),
        min_stock: is_composite ? null : (form.min_stock !== '' ? parseInt(form.min_stock) : null),
        description: form.description || null,
        is_composite,
        is_active: true
      }
      let id
      if (productModal.edit) {
        const updated = await dbUpdateBuffetProduct(productModal.edit.id, payload)
        id = updated.id
        await dbLogActivity(tenantId, userInfo?.id, 'update', 'buffet_product', id, { name: form.name.trim() })
        toast('Producto actualizado', 'success')
      } else {
        const created = await dbCreateBuffetProduct(payload)
        id = created.id
        await dbLogActivity(tenantId, userInfo?.id, 'create', 'buffet_product', id, { name: form.name.trim() })
        toast('Producto creado', 'success')
      }
      
      if (is_composite) {
        await dbSetBuffetProductComponents(id, form.components, tenantId)
        await dbSetBuffetIngredients(id, [])
        // Calculate cost based on components
        const totalCost = form.components.reduce((acc, c) => acc + (parseFloat(c.cost || 0) * c.quantity), 0)
        await dbUpdateBuffetProduct(id, { cost_price: totalCost })
      } else {
        await dbSetBuffetIngredients(id, form.ingredients)
        await dbSetBuffetProductComponents(id, [], tenantId)
      }

      setProductModal({ open: false, edit: null })
      load(false)
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    } finally {
      setSaving(false)
    }
  }

  // Ingredients helpers
  function addIngredient() { setForm(f => ({ ...f, ingredients: [...f.ingredients, { ingredient_id: '', quantity: 1, unit: 'unidad', name: '' }] })) }
  function updateIngredient(i, field, value) {
    setForm(f => {
      const updated = [...f.ingredients]; updated[i] = { ...updated[i], [field]: value }
      if (field === 'ingredient_id') {
        const found = ingredients.find(p => p.id === value)
        if (found) { updated[i].name = found.name; updated[i].unit = found.unit }
      }
      return { ...f, ingredients: updated }
    })
  }
  function removeIngredient(i) { setForm(f => ({ ...f, ingredients: f.ingredients.filter((_, idx) => idx !== i) })) }

  // Components helpers
  function addComponent() { setForm(f => ({ ...f, components: [...f.components, { is_buffet: false, component_id: '', quantity: 1, name: '', cost: 0 }] })) }
  function updateComponent(i, field, value) {
    setForm(f => {
      const updated = [...f.components]; updated[i] = { ...updated[i], [field]: value }
      if (field === 'component_id' || field === 'is_buffet') {
        const isBuf = updated[i].is_buffet
        const list = isBuf ? buffetProducts : products
        const found = list.find(p => p.id === updated[i].component_id)
        if (found) { updated[i].name = found.name; updated[i].cost = found.cost_price || 0 }
      }
      return { ...f, components: updated }
    })
  }
  function removeComponent(i) { setForm(f => ({ ...f, components: f.components.filter((_, idx) => idx !== i) })) }

  // ===== INGREDIENTS CRUD =====
  function openIngCreate() {
    setIngForm({ name: '', unit: 'unidad', cost_price: '', stock: '', min_stock: '' })
    setIngredientModal({ open: true, edit: null })
  }

  function openIngEdit(ing) {
    setIngForm({
      name: ing.name,
      unit: ing.unit,
      cost_price: ing.cost_price,
      stock: ing.stock,
      min_stock: ing.min_stock
    })
    setIngredientModal({ open: true, edit: ing })
  }

  async function handleSaveIngredient() {
    if (!ingForm.name.trim()) return toast('El nombre es obligatorio', 'warning')
    setSaving(true)
    try {
      const payload = {
        tenant_id: tenantId,
        name: ingForm.name.trim(),
        unit: ingForm.unit,
        cost_price: parseFloat(ingForm.cost_price || 0),
        stock: parseFloat(ingForm.stock || 0),
        min_stock: parseFloat(ingForm.min_stock || 0)
      }
      if (ingredientModal.edit) {
        await dbUpdateIngredient(ingredientModal.edit.id, payload)
        await dbLogActivity(tenantId, userInfo?.id, 'update', 'ingredient', ingredientModal.edit.id, { name: ingForm.name.trim() })
        toast('Ingrediente actualizado', 'success')
      } else {
        const created = await dbCreateIngredient(payload)
        await dbLogActivity(tenantId, userInfo?.id, 'create', 'ingredient', created.id, { name: ingForm.name.trim() })
        toast('Ingrediente creado', 'success')
      }
      setIngredientModal({ open: false, edit: null })
      load()
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteIngredient(id) {
    if (!confirm('¿Eliminar este ingrediente?')) return
    try {
      await dbDeleteIngredient(id)
      await dbLogActivity(tenantId, userInfo?.id, 'delete', 'ingredient', id)
      toast('Ingrediente eliminado', 'info')
      load()
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    }
  }

  // ===== ORDERS =====
  function addToOrderCart(bp) {
    setOrderCart(prev => {
      const ex = prev.find(i => i.buffet_product_id === bp.id)
      if (ex) return prev.map(i => i.buffet_product_id === bp.id ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.unit_price } : i)
      return [...prev, { buffet_product_id: bp.id, name: bp.name, unit_price: bp.price, quantity: 1, subtotal: bp.price }]
    })
  }

  async function placeOrder() {
    if (orderCart.length === 0) return toast('El pedido está vacío', 'warning')
    try {
      const created = await dbCreateBuffetOrder(tenantId, userInfo?.id, orderCart, customerName || null)
      await dbLogActivity(tenantId, userInfo?.id, 'create', 'buffet_order', created.id, { items: orderCart.length })
      setOrderCart([])
      setCustomerName('')
      setOrderModal({ open: false })
      toast('Pedido registrado', 'success')
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    }
  }

  async function changeOrderStatus(orderId, status) {
    try {
      await dbUpdateBuffetOrderStatus(orderId, status)
      await dbLogActivity(tenantId, userInfo?.id, 'update', 'buffet_order', orderId, { status })
      load()
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    }
  }

  const activeOrders = orders.filter(o => o.status !== 'delivered')

  const getDisplayCost = (p) => {
    if (p.is_composite) {
      return (p.buffet_product_components || []).reduce((acc, c) => {
        const cost = c.products?.cost_price || c.buffet_products?.cost_price || 0
        return acc + (cost * c.quantity)
      }, 0)
    }
    return p.cost_price || 0
  }

  const getDisplayStock = (p) => {
    if (p.is_composite) return null // Combos don't have stock themselves, it's calculated on demand
    return p.stock
  }

  return (
    <div className="fade-in">
      <div className="module-header">
        <h1>
          <span className="icon-wrap"><Coffee size={20} /></span>
          Buffet
        </h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          {tab === 'pedidos' && (
            <button onClick={() => setOrderModal({ open: true })} className="btn btn-primary">
              <Plus size={16} /> Nuevo pedido
            </button>
          )}
          {tab === 'productos' && isAdmin() && (
            <button onClick={openCreate} className="btn btn-primary">
              <Plus size={16} /> Nuevo producto buffet
            </button>
          )}
          {tab === 'ingredientes' && isAdmin() && (
            <button onClick={openIngCreate} className="btn btn-primary">
              <Plus size={16} /> Nuevo ingrediente
            </button>
          )}
        </div>
      </div>

      <div className="module-content">
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'var(--bg-secondary)', padding: '4px', borderRadius: 'var(--radius-md)', width: 'fit-content' }}>
          {[
            { id: 'pedidos', label: `📋 Pedidos ${activeOrders.length > 0 ? `(${activeOrders.length})` : ''}` },
            { id: 'productos', label: <span style={{display:'flex', alignItems:'center', gap:'6px'}}><Utensils size={16}/> Stock & Productos Buffet</span> },
            { id: 'ingredientes', label: '🥗 Ingredientes' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ border: 'none' }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="empty-state"><div className="spinner" /></div>
        ) : tab === 'productos' ? (
          /* ===== PRODUCTOS BUFFET (TABLE VIEW) ===== */
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Código</th>
                  <th style={{ textAlign: 'right' }}>Precio</th>
                  <th style={{ textAlign: 'right' }}>Costo</th>
                  <th style={{ textAlign: 'right' }}>Stock</th>
                  <th>Tipo</th>
                  {isAdmin() && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {buffetProducts.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin() ? 7 : 6}>
                      <div className="empty-state">
                        <Coffee size={32} />
                        <p>Sin productos en buffet</p>
                      </div>
                    </td>
                  </tr>
                ) : buffetProducts.map(bp => {
                  const dispStock = getDisplayStock(bp)
                  const isLowStock = !bp.is_composite && bp.stock !== null && bp.min_stock !== null && bp.stock <= bp.min_stock
                  return (
                    <tr key={bp.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{bp.name}</div>
                        {bp.description && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{bp.description}</div>}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {bp.barcode || '—'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }}>{formatMoney(bp.price)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{formatMoney(getDisplayCost(bp))}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ color: isLowStock ? 'var(--danger)' : 'var(--text-primary)', fontWeight: isLowStock ? 700 : 400 }}>
                          {dispStock ?? '—'}
                          {isLowStock && <AlertTriangle size={14} style={{marginLeft: 6, color:'var(--warning)'}}/>}
                        </span>
                      </td>
                      <td>
                        {bp.is_composite 
                          ? <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>Combo</span>
                          : <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>Simple</span>
                        }
                      </td>
                      {isAdmin() && (
                        <td>
                          <button onClick={() => openEdit(bp)} className="btn btn-secondary btn-sm">
                            <Edit2 size={12} />
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : tab === 'ingredientes' ? (
          /* ===== INGREDIENTES ===== */
          <div className="card" style={{ padding: '0' }}>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Costo</th>
                    <th>Stock</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {ingredients.length === 0 ? (
                    <tr><td colSpan="4" style={{ textAlign: 'center', padding: '40px' }}>Sin ingredientes</td></tr>
                  ) : ingredients.map(ing => (
                    <tr key={ing.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{ing.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mínimo: {ing.min_stock} {ing.unit}</div>
                      </td>
                      <td>{ing.cost_price > 0 ? formatMoney(ing.cost_price) : <span style={{color: 'var(--text-muted)'}}>-</span>}</td>
                      <td>
                        <span className={`badge ${ing.stock <= ing.min_stock ? 'badge-danger' : 'badge-success'}`}>
                          {ing.stock} {ing.unit}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {isAdmin() && (
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                            <button onClick={() => openIngEdit(ing)} className="btn btn-secondary btn-sm"><Edit2 size={14}/></button>
                            <button onClick={() => handleDeleteIngredient(ing.id)} className="btn btn-danger btn-sm"><Trash2 size={14}/></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ===== PEDIDOS ===== */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {orders.length === 0 ? (
              <div className="empty-state">
                <Clock size={40} />
                <h3>Sin pedidos activos</h3>
              </div>
            ) : orders.map(order => {
              const st = STATUS_LABELS[order.status] || STATUS_LABELS.pending
              return (
                <div key={order.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {order.customer_name ? <span style={{display:'flex', alignItems:'center', gap:'4px'}}><User size={14}/> {order.customer_name}</span> : 'Pedido'}
                        <span className={`badge ${st.badge}`}>{st.label}</span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {formatTime(order.created_at)} · {order.users?.name}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{formatMoney(order.total_amount)}</span>
                      {order.status === 'pending' && (
                        <button onClick={() => changeOrderStatus(order.id, 'preparing')} className="btn btn-secondary btn-sm">
                          Preparar
                        </button>
                      )}
                      {order.status === 'preparing' && (
                        <button onClick={() => changeOrderStatus(order.id, 'ready')} className="btn btn-success btn-sm">
                          Listo
                        </button>
                      )}
                      {order.status === 'ready' && (
                        <button onClick={() => changeOrderStatus(order.id, 'delivered')} className="btn btn-primary btn-sm">
                          Entregar
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {(order.buffet_order_items || []).map((item, i) => (
                      <span key={i} className="badge badge-neutral">
                        {item.quantity}x {item.buffet_products?.name}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ===== MODAL Producto Buffet ===== */}
      <Modal
        open={productModal.open}
        onClose={() => setProductModal({ open: false, edit: null })}
        title={productModal.edit ? 'Editar producto buffet' : 'Nuevo producto buffet'}
        size="lg"
        footer={
          <>
            <button onClick={() => setProductModal({ open: false, edit: null })} className="btn btn-secondary">Cancelar</button>
            <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', gap: '4px', marginBottom: '14px', background: 'var(--bg-secondary)', padding: '4px', borderRadius: 'var(--radius-md)', width: 'fit-content' }}>
          <button
            onClick={() => setProductTypeTab('simple')}
            className={`btn btn-sm ${productTypeTab === 'simple' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ border: 'none' }}
          >
            Producto Simple
          </button>
          <button
            onClick={() => setProductTypeTab('combo')}
            className={`btn btn-sm ${productTypeTab === 'combo' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ border: 'none' }}
          >
            Combo / Compuesto
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-row">
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Nombre *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Hamburguesa completa" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Código (Opcional)</label>
              <input value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} placeholder="Código de barras..." />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Precio de venta *</label>
              <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" min="0" />
            </div>
            <div className="form-group">
              <label className="form-label">Costo total {productTypeTab === 'combo' && '(Calculado auto)'}</label>
              <input type="number" value={form.cost_price} onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))} placeholder="0.00" min="0" disabled={productTypeTab === 'combo'} />
            </div>
          </div>
          
          {productTypeTab === 'simple' && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Stock Actual</label>
                <input type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Stock Mínimo</label>
                <input type="number" value={form.min_stock} onChange={e => setForm(f => ({ ...f, min_stock: e.target.value }))} placeholder="0" />
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Descripción</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción breve..." />
          </div>

          {productTypeTab === 'simple' ? (
            /* Ingredientes */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label className="form-label">Ingredientes de preparación</label>
                <button type="button" onClick={addIngredient} className="btn btn-secondary btn-sm">
                  <Plus size={12} /> Agregar ingrediente
                </button>
              </div>
              {form.ingredients.map((ing, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                  <select
                    value={ing.ingredient_id}
                    onChange={e => updateIngredient(i, 'ingredient_id', e.target.value)}
                    style={{ flex: 2 }}
                  >
                    <option value="">Seleccionar ingrediente...</option>
                    {ingredients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input
                    type="number"
                    value={ing.quantity}
                    onChange={e => updateIngredient(i, 'quantity', parseFloat(e.target.value))}
                    style={{ width: '70px' }}
                    min="0" step="0.5"
                  />
                  <select
                    value={ing.unit}
                    onChange={e => updateIngredient(i, 'unit', e.target.value)}
                    style={{ width: '100px' }}
                  >
                    {['unidad', 'gramos', 'ml', 'porciones'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <button type="button" onClick={() => removeIngredient(i)} className="btn btn-danger btn-sm">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            /* Componentes de Combo */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label className="form-label">Componentes del Combo</label>
                <button type="button" onClick={addComponent} className="btn btn-secondary btn-sm">
                  <Plus size={12} /> Agregar producto
                </button>
              </div>
              {form.components.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                  <select
                    value={c.is_buffet ? 'buffet' : 'standard'}
                    onChange={e => {
                      updateComponent(i, 'is_buffet', e.target.value === 'buffet');
                      updateComponent(i, 'component_id', '');
                    }}
                    style={{ width: '120px' }}
                  >
                    <option value="buffet">Buffet</option>
                    <option value="standard">Kiosco</option>
                  </select>
                  <select
                    value={c.component_id}
                    onChange={e => updateComponent(i, 'component_id', e.target.value)}
                    style={{ flex: 2 }}
                  >
                    <option value="">Seleccionar producto...</option>
                    {(c.is_buffet ? buffetProducts : products).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input
                    type="number"
                    value={c.quantity}
                    onChange={e => updateComponent(i, 'quantity', parseInt(e.target.value))}
                    style={{ width: '70px' }}
                    min="1"
                  />
                  <button type="button" onClick={() => removeComponent(i)} className="btn btn-danger btn-sm">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* ===== MODAL Nuevo Pedido ===== */}
      <Modal
        open={orderModal.open}
        onClose={() => { setOrderModal({ open: false }); setOrderCart([]); setCustomerName('') }}
        title="Nuevo pedido"
        size="lg"
        footer={
          <>
            <button onClick={() => { setOrderModal({ open: false }); setOrderCart([]) }} className="btn btn-secondary">Cancelar</button>
            <button onClick={placeOrder} className="btn btn-primary" disabled={orderCart.length === 0}>
              Confirmar pedido ({formatMoney(orderCart.reduce((a, i) => a + i.subtotal, 0))})
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label className="form-label">Nombre del cliente (opcional)</label>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Ej: Juan..." />
          </div>
          <label className="form-label">Productos buffet disponibles</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {buffetProducts.map(bp => (
              <button
                key={bp.id}
                onClick={() => addToOrderCart(bp)}
                style={{
                  padding: '10px 14px', background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                  cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}
              >
                <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{bp.name}</span>
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{formatMoney(bp.price)}</span>
              </button>
            ))}
          </div>
          {orderCart.length > 0 && (
            <div>
              <label className="form-label">Pedido actual</label>
              {orderCart.map(item => (
                <div key={item.buffet_product_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span>{item.quantity}x {item.name}</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{formatMoney(item.subtotal)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* ===== MODAL INGREDIENTE ===== */}
      <Modal
        open={ingredientModal.open}
        onClose={() => setIngredientModal({ open: false, edit: null })}
        title={ingredientModal.edit ? 'Editar ingrediente' : 'Nuevo ingrediente'}
        footer={
          <>
            <button onClick={() => setIngredientModal({ open: false, edit: null })} className="btn btn-secondary">Cancelar</button>
            <button onClick={handleSaveIngredient} className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label className="form-label">Nombre del ingrediente *</label>
            <input value={ingForm.name} onChange={e => setIngForm(f => ({ ...f, name: e.target.value }))} autoFocus />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Unidad de medida</label>
              <select value={ingForm.unit} onChange={e => setIngForm(f => ({ ...f, unit: e.target.value }))}>
                <option value="unidad">Unidades</option>
                <option value="gramos">Gramos</option>
                <option value="ml">Mililitros</option>
                <option value="porciones">Porciones</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Costo por {ingForm.unit} (opcional)</label>
              <input type="number" value={ingForm.cost_price} onChange={e => setIngForm(f => ({ ...f, cost_price: e.target.value }))} placeholder="0.00" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Stock actual</label>
              <input type="number" value={ingForm.stock} onChange={e => setIngForm(f => ({ ...f, stock: e.target.value }))} placeholder="0" />
            </div>
            <div className="form-group">
              <label className="form-label">Stock mínimo (alerta)</label>
              <input type="number" value={ingForm.min_stock} onChange={e => setIngForm(f => ({ ...f, min_stock: e.target.value }))} placeholder="0" />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
