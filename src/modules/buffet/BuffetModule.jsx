import { useState, useEffect } from 'react'
import { useApp } from '../../lib/AppContext'
import {
  dbGetBuffetProducts, dbCreateBuffetProduct, dbUpdateBuffetProduct,
  dbGetProducts, dbCreateProduct, dbUpdateProduct, dbUpdateProductStock,
  dbSetBuffetIngredients, dbGetBuffetOrders,
  dbCreateBuffetOrder, dbUpdateBuffetOrderStatus, subscribeToBuffetOrders, unsubscribe
} from '../../lib/supabase.js'
import Modal from '../../components/Modal'
import { Coffee, Plus, Edit2, Trash2, ChevronDown, ChevronRight, Clock, Check, X } from 'lucide-react'

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
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  const [productModal, setProductModal] = useState({ open: false, edit: null })
  const [form, setForm] = useState({ name: '', price: '', cost_price: '', description: '', ingredients: [] })
  const [saving, setSaving] = useState(false)

  const [orderModal, setOrderModal] = useState({ open: false })
  const [orderCart, setOrderCart] = useState([])
  const [customerName, setCustomerName] = useState('')

  const [ingredientModal, setIngredientModal] = useState({ open: false, edit: null })
  const [ingForm, setIngForm] = useState({ name: '', unit: 'unidad', cost_price: '', stock: '', min_stock: '' })

  async function load() {
    if (!tenantId) { setLoading(false); return; }
    setLoading(true)
    const [bp, ings, ord] = await Promise.all([
      dbGetBuffetProducts(tenantId),
      dbGetProducts(tenantId, { ingredientMode: 'only' }), // Fetch ONLY ingredients
      dbGetBuffetOrders(tenantId)
    ])
    setBuffetProducts(bp)
    setIngredients(ings)
    setOrders(ord)
    setLoading(false)
  }

  useEffect(() => {
    load()
    const chan = subscribeToBuffetOrders(tenantId, load)
    return () => unsubscribe(chan)
  }, [tenantId])

  function openCreate() {
    setForm({ name: '', price: '', cost_price: '', description: '', ingredients: [] })
    setProductModal({ open: true, edit: null })
  }

  function openEdit(bp) {
    setForm({
      name: bp.name || '',
      price: bp.price || '',
      cost_price: bp.cost_price || '',
      description: bp.description || '',
      ingredients: (bp.buffet_ingredients || []).map(i => ({
        product_id: i.product_id,
        quantity: i.quantity,
        unit: i.unit || 'unidad',
        name: i.products?.name
      }))
    })
    setProductModal({ open: true, edit: bp })
  }

  async function handleSave() {
    if (!form.name.trim()) return toast('El nombre es obligatorio', 'warning')
    if (!form.price) return toast('El precio es obligatorio', 'warning')
    setSaving(true)
    try {
      const payload = {
        tenant_id: tenantId,
        name: form.name.trim(),
        price: parseFloat(form.price),
        cost_price: form.cost_price ? parseFloat(form.cost_price) : 0,
        description: form.description || null,
        is_active: true
      }
      let id
      if (productModal.edit) {
        const updated = await dbUpdateBuffetProduct(productModal.edit.id, payload)
        id = updated.id
        toast('Producto buffet actualizado', 'success')
      } else {
        const created = await dbCreateBuffetProduct(payload)
        id = created.id
        toast('Producto buffet creado', 'success')
      }
      await dbSetBuffetIngredients(id, form.ingredients)
      setProductModal({ open: false, edit: null })
      load()
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    } finally {
      setSaving(false)
    }
  }

  function addIngredient() {
    setForm(f => ({
      ...f,
      ingredients: [...f.ingredients, { product_id: '', quantity: 1, unit: 'unidad', name: '' }]
    }))
  }

  function updateIngredient(i, field, value) {
    setForm(f => {
      const updated = [...f.ingredients]
      updated[i] = { ...updated[i], [field]: value }
      if (field === 'product_id') {
        const found = ingredients.find(p => p.id === value)
        if (found) updated[i].name = found.name
      }
      return { ...f, ingredients: updated }
    })
  }

  function removeIngredient(i) {
    setForm(f => ({ ...f, ingredients: f.ingredients.filter((_, idx) => idx !== i) }))
  }

  // ===== INGREDIENTS CRUD =====
  function openIngCreate() {
    setIngForm({ name: '', unit: 'unidad', cost_price: '', stock: '', min_stock: '' })
    setIngredientModal({ open: true, edit: null })
  }

  function openIngEdit(ing) {
    setIngForm({
      name: ing.name,
      unit: ing.barcode === 'g' || ing.barcode === 'ml' ? ing.barcode : 'unidad', // Guardamos unidad en barcode como hack
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
        price: 0,
        cost_price: parseFloat(ingForm.cost_price || 0),
        stock: parseInt(ingForm.stock || 0),
        min_stock: parseInt(ingForm.min_stock || 0),
        description: '#INGREDIENT#', // ETIQUETA SECRETA
        barcode: ingForm.unit, // Guardamos la unidad acá para no crear columnas
        is_active: true
      }
      if (ingredientModal.edit) {
        await dbUpdateProduct(ingredientModal.edit.id, payload)
        toast('Ingrediente actualizado', 'success')
      } else {
        await dbCreateProduct(payload)
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
      await dbUpdateProduct(id, { is_active: false })
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
      await dbCreateBuffetOrder(tenantId, userInfo?.id, orderCart, customerName || null)
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
      load()
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    }
  }

  const activeOrders = orders.filter(o => o.status !== 'delivered')

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
              <Plus size={16} /> Nuevo producto
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
            { id: 'productos', label: '🍔 Productos Preparados' },
            { id: 'ingredientes', label: '🥗 Ingredientes (Stock)' }
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
          /* ===== PRODUCTOS BUFFET ===== */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
            {buffetProducts.length === 0 ? (
              <div className="empty-state" style={{ gridColumn: '1/-1' }}>
                <Coffee size={40} />
                <h3>Sin productos buffet</h3>
                <p>Creá productos con ingredientes para gestionar el buffet</p>
              </div>
            ) : buffetProducts.map(bp => (
              <div key={bp.id} className="card" style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '1rem' }}>{bp.name}</div>
                    {bp.description && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{bp.description}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: 'var(--accent)', fontWeight: 700 }}>{formatMoney(bp.price)}</div>
                    {bp.cost_price > 0 && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Costo: {formatMoney(bp.cost_price)}</div>}
                  </div>
                </div>

                {/* Ingredientes */}
                {(bp.buffet_ingredients || []).length > 0 && (
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Ingredientes
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {bp.buffet_ingredients.map((ing, i) => (
                        <span key={i} className="badge badge-neutral" style={{ fontSize: '0.72rem' }}>
                          {ing.quantity} {ing.unit} {ing.products?.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {isAdmin() && (
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    <button onClick={() => openEdit(bp)} className="btn btn-secondary btn-sm">
                      <Edit2 size={12} /> Editar
                    </button>
                  </div>
                )}
              </div>
            ))}
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
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mínimo: {ing.min_stock} {ing.barcode || 'unidad'}</div>
                      </td>
                      <td>{formatMoney(ing.cost_price)}</td>
                      <td>
                        <span className={`badge ${ing.stock <= ing.min_stock ? 'badge-danger' : 'badge-success'}`}>
                          {ing.stock} {ing.barcode || 'unidad'}
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
                        {order.customer_name ? `👤 ${order.customer_name}` : 'Pedido'}
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
                          ✓ Listo
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-row">
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Nombre *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Hamburguesa completa" autoFocus />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Precio de venta *</label>
              <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" min="0" />
            </div>
            <div className="form-group">
              <label className="form-label">Costo total</label>
              <input type="number" value={form.cost_price} onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))} placeholder="0.00" min="0" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Descripción</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción breve..." />
          </div>

          {/* Ingredientes */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label className="form-label">Ingredientes</label>
              <button type="button" onClick={addIngredient} className="btn btn-secondary btn-sm">
                <Plus size={12} /> Agregar
              </button>
            </div>
            {form.ingredients.map((ing, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                <select
                  value={ing.product_id}
                  onChange={e => updateIngredient(i, 'product_id', e.target.value)}
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
          <label className="form-label">Productos disponibles</label>
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
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-soft)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-tertiary)' }}
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
              <label className="form-label">Costo por {ingForm.unit}</label>
              <input type="number" value={ingForm.cost_price} onChange={e => setIngForm(f => ({ ...f, cost_price: e.target.value }))} placeholder="0.00" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Stock actual (entero)</label>
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
