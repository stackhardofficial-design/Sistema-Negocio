import { useState, useEffect, useRef } from 'react'
import { useApp } from '../../lib/AppContext'
import {
  sb, dbGetProducts, dbGetCategories, dbCreateProduct,
  dbUpdateProduct, dbDeleteProduct, lookupBarcode, dbLogActivity,
  dbCreateCategory, dbDeleteCategory, dbCreateExpense, dbEnsureExpenseCategory, dbSetProductComponents
} from '../../lib/supabase'
import Modal from '../../components/Modal'
import BarcodeScanner from '../../components/BarcodeScanner'
import {  Package, Plus, Search, Edit2, Trash2, Barcode, RefreshCw, ExternalLink, Tag , AlertTriangle } from 'lucide-react'

function formatMoney(n) {
  return `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
}

const EMPTY_PRODUCT = {
  name: '', barcode: '', category_id: '',
  price: '', cost_price: '', stock: '', min_stock: '',
  description: '', is_active: true, register_initial_expense: false,
  is_composite: false, components: []
}

function SearchableCategorySelect({ value, onChange, categories }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selected = categories.find(c => c.id === value)
  const filtered = categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }}>
      <div 
        onClick={() => { setOpen(!open); setSearch('') }}
        style={{
          border: '1px solid var(--border)', padding: '9px 12px', borderRadius: 'var(--radius-md)',
          background: 'var(--bg-primary)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', minHeight: '38px', fontSize: '0.9rem'
        }}
      >
        <span style={{ color: selected ? 'var(--text-primary)' : 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {selected ? selected.name : 'Seleccionar categoría...'}
        </span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '8px' }}>▼</span>
      </div>
      
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
          marginTop: '4px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', maxHeight: '250px', display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ padding: '8px', borderBottom: '1px solid var(--border-soft)' }}>
            <input 
              type="text" 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.85rem' }}
              autoFocus
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <div
               onClick={() => { onChange(''); setOpen(false) }}
               style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-soft)', color: 'var(--text-muted)', fontSize: '0.85rem' }}
            >
              Sin categoría
            </div>
            {filtered.map(c => (
              <div 
                key={c.id} 
                onClick={() => { onChange(c.id); setOpen(false) }}
                style={{ 
                  padding: '10px 12px', cursor: 'pointer', fontSize: '0.85rem',
                  background: value === c.id ? 'var(--accent-soft)' : 'transparent',
                  color: value === c.id ? 'var(--accent)' : 'var(--text-primary)'
                }}
              >
                {c.name}
              </div>
            ))}
            {filtered.length === 0 && <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No se encontraron categorías</div>}
          </div>
        </div>
      )}
    </div>
  )
}


export default function ProductosModule() {
  const { tenantId, userInfo, toast, isAdmin } = useApp()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [modal, setModal] = useState({ open: false, edit: null })
  const [form, setForm] = useState(EMPTY_PRODUCT)
  const [saving, setSaving] = useState(false)
  const barcodeInputRef = useRef(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [catModal, setCatModal] = useState({ open: false, name: '' })
  const [expenseConfirmModal, setExpenseConfirmModal] = useState({ open: false, product: null, added: 0, cost: 0 })
  const [savingExpense, setSavingExpense] = useState(false)

  const [savingCat, setSavingCat] = useState(false)

  async function handleConfirmExpense(registerExpense) {
    let { product, added, cost } = expenseConfirmModal
    if (registerExpense) {
      if (isNaN(cost)) return toast('Por favor, ingresá un valor numérico válido', 'warning')
      if (added > 0 && cost <= 0) return toast('El costo debe ser mayor a 0 para ingresos', 'warning')
      if (added < 0 && cost >= 0) return toast('El ajuste debe ser negativo (ej: -500) para devoluciones', 'warning')
    }
    setSavingExpense(true)
    try {
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
            unit_cost: product.cost_price || 0
          }),
          expense_date: new Date().toISOString().split('T')[0],
          expense_type: 'variable'
        })
        toast(`Gasto de ${formatMoney(cost)} registrado en Caja `, 'success')
      }
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    } finally {
      setSavingExpense(false)
      setExpenseConfirmModal({ open: false, product: null, added: 0, cost: 0 })
    }
  }

  async function handleSaveCategory() {
    if (!catModal.name.trim()) return toast('El nombre es obligatorio', 'warning')
    setSavingCat(true)
    try {
      const result = await dbCreateCategory(tenantId, catModal.name.trim())
      console.log('Category created:', result)
      toast('Categoría creada ', 'success')
      setCatModal({ open: false, name: '' })
      load()
    } catch (err) {
      console.error('Error creating category:', err)
      const msg = err?.message || err?.details || err?.hint || JSON.stringify(err)
      toast(`Error al guardar categoría: ${msg}`, 'danger')
    } finally {
      setSavingCat(false)
    }
  }

  async function handleDeleteCategory(id, name) {
    if (!confirm(`¿Eliminar categoría "${name}"?`)) return
    try {
      await dbDeleteCategory(id)
      toast('Categoría eliminada', 'success')
      load()
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    }
  }

  async function load(showLoading = true) {
    if (!tenantId) { setLoading(false); return; }
    if (showLoading) setLoading(true)
    const [p, c] = await Promise.all([
      dbGetProducts(tenantId, { includeInactive: true }),
      dbGetCategories(tenantId)
    ])
    setProducts(p)
    setCategories(c)
    if (showLoading) setLoading(false)
  }

  useEffect(() => {
    load()
    if (!tenantId) return
    const channel = sb.channel('productos_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `tenant_id=eq.${tenantId}` }, () => load(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_categories', filter: `tenant_id=eq.${tenantId}` }, () => load(false))
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [tenantId])

  function openCreate() {
    const lastCategory = localStorage.getItem('last_product_category') || ''
    setForm({ ...EMPTY_PRODUCT, category_id: lastCategory, is_composite: false })
    setModal({ open: true, edit: null, type: 'normal' })
  }

  function openCreateCombo() {
    const lastCategory = localStorage.getItem('last_product_category') || ''
    setForm({ ...EMPTY_PRODUCT, category_id: lastCategory, is_composite: true, components: [{ component_product_id: '', quantity: 1 }] })
    setModal({ open: true, edit: null, type: 'combo' })
  }

  function openEdit(product) {
    setForm({
      name: product.name || '',
      barcode: product.barcode || '',
      category_id: product.category_id || '',
      price: product.price || '',
      cost_price: product.cost_price || '',
      stock: product.stock ?? '',
      min_stock: product.min_stock ?? '',
      description: product.description || '',
      is_active: product.is_active ?? true,
      is_composite: product.is_composite ?? false,
      components: product.product_components ? product.product_components.map(c => ({
        component_product_id: c.component_product_id,
        quantity: c.quantity
      })) : []
    })
    setModal({ open: true, edit: product, type: (product.is_composite ?? false) ? 'combo' : 'normal' })
  }

  async function handleLookupBarcode() {
    if (!form.barcode) return toast('Ingresá un código de barras', 'warning')
    setLookingUp(true)
    try {
      const info = await lookupBarcode(form.barcode)
      if (info) {
        setForm(prev => ({
          ...prev,
          name: info.name || prev.name,
        }))
        toast(`Producto encontrado: ${info.name}`, 'success')
      } else {
        toast('Código no encontrado en la base de datos', 'warning')
      }
    } finally {
      setLookingUp(false)
    }
  }

  async function handleSave() {
    if (!form.name.trim()) return toast('El nombre es obligatorio', 'warning')
    if (!form.price) return toast('El precio de venta es obligatorio', 'warning')

    localStorage.setItem('last_product_category', form.category_id || '')
    setSaving(true)
    try {
      const payload = {
        tenant_id: tenantId,
        name: form.name.trim(),
        barcode: form.barcode.trim() || null,
        category_id: form.category_id || null,
        price: parseFloat(form.price),
        cost_price: form.cost_price ? parseFloat(form.cost_price) : 0,
        stock: form.is_composite ? null : (form.stock !== '' ? parseInt(form.stock) : null),
        min_stock: form.is_composite ? null : (form.min_stock !== '' ? parseInt(form.min_stock) : null),
        description: form.description || null,
        is_active: form.is_active,
        is_composite: form.is_composite
      }

      let createdProduct = null;
      if (modal.edit) {
        await dbUpdateProduct(modal.edit.id, payload)
        await dbLogActivity(tenantId, userInfo?.id, 'update', 'product', modal.edit.id, { name: form.name, barcode: form.barcode, price: form.price })
        toast('Producto actualizado', 'success')
        createdProduct = { ...modal.edit, ...payload }
      } else {
        const created = await dbCreateProduct(payload)
        await dbLogActivity(tenantId, userInfo?.id, 'create', 'product', created.id, { name: form.name, barcode: form.barcode, price: form.price })
        toast('Producto creado', 'success')
        createdProduct = { ...payload, id: created.id }
      }

      if (form.is_composite) {
        await dbSetProductComponents(createdProduct.id, form.components)
        const totalCost = form.components.reduce((acc, c) => {
          const p = products.find(prod => prod.id === c.component_product_id)
          return acc + (p ? parseFloat(p.cost_price || 0) * c.quantity : 0)
        }, 0)
        await dbUpdateProduct(createdProduct.id, { cost_price: totalCost })
        createdProduct.cost_price = totalCost
      }

      const oldStock = modal.edit && modal.edit.stock !== null && modal.edit.stock !== undefined ? modal.edit.stock : 0;
      const newStock = !form.is_composite && form.stock !== '' ? parseInt(form.stock) : 0;
      const added = newStock - oldStock;

      if (!form.is_composite && added !== 0) {
        const suggestedCost = form.cost_price ? (form.cost_price * added) : ''
        setModal({ open: false, edit: null, type: null })
        setExpenseConfirmModal({
          open: true,
          product: createdProduct,
          added,
          cost: suggestedCost
        })
        load()
        return
      }

      setModal({ open: false, edit: null, type: null })
      load()
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(product) {
    if (!confirm(`¿Desactivar "${product.name}"?`)) return
    try {
      await dbDeleteProduct(product.id)
      await dbLogActivity(tenantId, userInfo?.id, 'delete', 'product', product.id, { name: product.name, barcode: product.barcode })
      toast('Producto desactivado', 'success')
      load()
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    }
  }

  const filtered = products.filter(p => {
    if (filterCat && p.category_id !== filterCat) return false
    if (search) {
      const q = search.toLowerCase()
      return p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q)
    }
    return true
  })

  const margin = (p) => {
    const cost = getDisplayCost(p)
    if (!p.price || !cost || cost === 0) return null
    return (((p.price - cost) / p.price) * 100).toFixed(1)
  }

  const markup = (p) => {
    const cost = getDisplayCost(p)
    if (!p.price || !cost || cost === 0) return null
    return (((p.price - cost) / cost) * 100).toFixed(1)
  }

  const getDisplayCost = (p) => {
    if (p.is_composite) {
      return p.product_components?.reduce((acc, c) => {
        const compProd = products.find(prod => prod.id === c.component_product_id)
        return acc + (compProd ? parseFloat(compProd.cost_price || 0) * c.quantity : 0)
      }, 0) || 0
    }
    return p.cost_price || 0
  }

  const getDisplayStock = (p) => {
    if (p.is_composite) {
      if (!p.product_components || p.product_components.length === 0) return 0
      let minStock = Infinity
      for (let c of p.product_components) {
        const compProd = products.find(prod => prod.id === c.component_product_id)
        if (compProd) {
          const s = Math.floor((compProd.stock || 0) / c.quantity)
          if (s < minStock) minStock = s
        } else {
          minStock = 0
        }
      }
      return minStock === Infinity ? 0 : minStock
    }
    return p.stock
  }

  const totalInvertido = products.reduce((acc, p) => {
    if (p.is_composite) return acc // Evitar contar doble
    const cost = parseFloat(p.cost_price || 0)
    const stock = p.stock && p.stock > 0 ? p.stock : 0
    return acc + (cost * stock)
  }, 0)

  const gananciaEsperada = products.reduce((acc, p) => {
    if (p.is_composite) return acc // Evitar contar doble
    const cost = parseFloat(p.cost_price || 0)
    const price = parseFloat(p.price || 0)
    const stock = p.stock && p.stock > 0 ? p.stock : 0
    return acc + ((price - cost) * stock)
  }, 0)

  return (
    <div className="fade-in">
      <div className="module-header">
        <h1>
          <span className="icon-wrap"><Package size={20} /></span>
          Productos
        </h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={load} className="btn btn-secondary btn-sm">
            <RefreshCw size={14} />
          </button>
          <button onClick={openCreate} className="btn btn-primary">
            <Plus size={16} /> Nuevo producto
          </button>
          <button onClick={openCreateCombo} className="btn btn-secondary" style={{ border: '1px solid var(--accent)', color: 'var(--accent)' }}>
            <Package size={16} /> Nuevo combo
          </button>
        </div>
      </div>

      <div className="module-content">
        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div className="search-wrap" style={{ flex: 1, minWidth: '200px' }}>
            <Search size={16} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre o código..."
            />
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <select
              value={filterCat}
              onChange={e => setFilterCat(e.target.value)}
              style={{ width: 'auto', minWidth: '150px' }}
            >
              <option value="">Todas las categorías</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button 
              onClick={() => setCatModal({ open: true, name: '' })} 
              className="btn btn-secondary"
              style={{ padding: '8px 12px' }}
              title="Gestionar categorías"
            >
              <Tag size={16} /> <span className="hide-on-mobile">Categorías</span>
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <span className="badge badge-neutral">{filtered.length} productos</span>
          <span className="badge badge-warning">{products.filter(p => p.stock !== null && p.min_stock !== null && p.stock <= p.min_stock).length} bajo stock</span>
          <span className="badge badge-success">{products.filter(p => p.is_active).length} activos</span>
        </div>

        {/* Financial Stats */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ padding: '8px 14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Plata costo invertida: </span>
            <strong style={{ color: 'var(--text-primary)' }}>{formatMoney(totalInvertido)}</strong>
          </div>
          <div style={{ padding: '8px 14px', background: 'var(--success-soft)', borderRadius: 'var(--radius-md)', fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--text-primary)' }}>Ganancia esperada: </span>
            <strong style={{ color: 'var(--success)' }}>{formatMoney(gananciaEsperada)}</strong>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="empty-state"><div className="spinner" /></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Código</th>
                  <th>Categoría</th>
                  <th style={{ textAlign: 'right' }}>Precio</th>
                  <th style={{ textAlign: 'right' }}>Costo</th>
                  <th style={{ textAlign: 'right' }} title="Ganancia sobre costo">Ganancia</th>
                  <th style={{ textAlign: 'right' }} title="Margen sobre venta">Margen</th>
                  <th style={{ textAlign: 'right' }}>Stock</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <div className="empty-state">
                        <Package size={32} />
                        <p>Sin productos</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.map(p => {
                  const mg = margin(p)
                  const mk = markup(p)
                  const dispStock = getDisplayStock(p)
                  const isLowStock = !p.is_composite && p.stock !== null && p.min_stock !== null && p.stock <= p.min_stock
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {p.name}
                          {p.is_composite && <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>Combo</span>}
                        </div>
                        {p.description && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.description}</div>}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {p.barcode || '—'}
                        </span>
                      </td>
                      <td>
                        {p.categories?.name
                          ? <span className="badge badge-neutral"><Tag size={10} /> {p.categories.name}</span>
                          : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                        }
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }}>{formatMoney(p.price)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{formatMoney(getDisplayCost(p))}</td>
                      <td style={{ textAlign: 'right' }}>
                        {mk !== null
                          ? <span style={{ color: parseFloat(mk) >= 30 ? 'var(--success)' : 'var(--warning)', fontWeight: 500 }}>{mk}%</span>
                          : '—'
                        }
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {mg !== null
                          ? <span style={{ color: parseFloat(mg) >= 20 ? 'var(--success)' : 'var(--warning)', fontWeight: 500 }}>{mg}%</span>
                          : '—'
                        }
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ color: isLowStock ? 'var(--danger)' : 'var(--text-primary)', fontWeight: isLowStock ? 700 : 400 }}>
                          {dispStock ?? '∞'}
                          {isLowStock && <AlertTriangle size={14} style={{marginLeft: 6, color:'var(--warning)'}}/>}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${p.is_active ? 'badge-success' : 'badge-neutral'}`}>
                          {p.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => openEdit(p)} className="btn btn-secondary btn-sm">
                            <Edit2 size={12} />
                          </button>
                          <button onClick={() => handleDelete(p)} className="btn btn-danger btn-sm">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== MODAL Producto ===== */}
      <Modal
        open={modal.open}
        onClose={() => setModal({ open: false, edit: null, type: null })}
        title={modal.edit ? (modal.type === 'combo' ? 'Editar Combo' : 'Editar producto') : (modal.type === 'combo' ? 'Nuevo Combo' : 'Nuevo producto')}
        size="lg"
        footer={
          <>
            <button onClick={() => setModal({ open: false, edit: null, type: null })} className="btn btn-secondary">Cancelar</button>
            <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : modal.edit ? 'Guardar cambios' : (modal.type === 'combo' ? 'Crear combo' : 'Crear producto')}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-row">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">{modal.type === 'combo' ? 'Nombre del combo *' : 'Nombre del producto *'}</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder={modal.type === 'combo' ? 'Ej: Café con 2 medialunas' : 'Ej: Coca Cola 500ml'}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Código de barras</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  ref={barcodeInputRef}
                  value={form.barcode}
                  onChange={e => setForm(p => ({ ...p, barcode: e.target.value }))}
                  placeholder="Ej: 7790001234567"
                  style={{ flex: 1 }}
                />
                <BarcodeScanner 
                  onScan={(code) => setForm(p => ({ ...p, barcode: code }))} 
                  active={modal.open} 
                  showCamera={true}
                  autoStart={modal.open}
                />
                <button
                  type="button"
                  onClick={handleLookupBarcode}
                  className="btn btn-secondary btn-sm"
                  disabled={lookingUp || !form.barcode}
                  title="Buscar en base de datos de productos"
                  style={{ flexShrink: 0 }}
                >
                  {lookingUp ? '...' : <ExternalLink size={14} />}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Categoría</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <SearchableCategorySelect
                  value={form.category_id}
                  onChange={(val) => setForm(p => ({ ...p, category_id: val }))}
                  categories={categories}
                />
                <button
                  type="button"
                  onClick={() => setCatModal({ open: true, name: '' })}
                  className="btn btn-secondary btn-sm"
                  title="Gestionar categorías"
                  style={{ flexShrink: 0 }}
                >
                  <Tag size={14} />
                </button>
              </div>
            </div>
          </div>

          {form.is_composite && (
            <div style={{ border: '1px solid var(--border)', padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                ¿De qué productos está compuesto este combo?
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                Seleccioná los productos base e indicá cuántas unidades se necesitan por combo.
              </p>
              
              {form.components.map((c, i) => {
                const p = products.find(prod => prod.id === c.component_product_id)
                return (
                  <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                    <select
                      value={c.component_product_id}
                      onChange={e => {
                        const newC = [...form.components]
                        newC[i].component_product_id = e.target.value
                        setForm(prev => ({ ...prev, components: newC }))
                      }}
                      style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}
                    >
                      <option value="">Seleccionar un producto cargado...</option>
                      {products.filter(prod => !prod.is_composite && prod.is_active).map(prod => (
                        <option key={prod.id} value={prod.id}>{prod.name} (Disp: {prod.stock ?? '∞'} - Costo: {formatMoney(prod.cost_price)})</option>
                      ))}
                    </select>
                    
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Cant:</span>
                    <input
                      type="number"
                      value={c.quantity}
                      onChange={e => {
                        const newC = [...form.components]
                        newC[i].quantity = parseInt(e.target.value) || 1
                        setForm(prev => ({ ...prev, components: newC }))
                      }}
                      style={{ width: '70px', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}
                      min="1"
                    />
                    
                    <button type="button" onClick={() => setForm(prev => ({ ...prev, components: prev.components.filter((_, idx) => idx !== i) }))} className="btn btn-danger btn-sm" title="Quitar producto" style={{ padding: '8px' }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                )
              })}
              
              <button type="button" onClick={() => setForm(prev => ({ ...prev, components: [...prev.components, { component_product_id: '', quantity: 1 }] }))} className="btn btn-secondary btn-sm" style={{ marginTop: '12px' }}>
                <Plus size={14} /> Agregar otro producto al combo
              </button>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Precio de venta *</label>
              <input
                type="number"
                value={form.price}
                onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                placeholder="0.00"
                min="0" step="0.01"
              />
            </div>
            {!form.is_composite && (
              <div className="form-group">
                <label className="form-label">Precio de costo</label>
                <input
                  type="number"
                  value={form.cost_price}
                  onChange={e => setForm(p => ({ ...p, cost_price: e.target.value }))}
                  placeholder="0.00"
                  min="0" step="0.01"
                />
              </div>
            )}
          </div>

          {form.price && form.cost_price && (
            <div style={{
              padding: '10px 14px', background: 'var(--success-soft)',
              borderRadius: 'var(--radius-md)', fontSize: '0.85rem',
              display: 'flex', gap: '20px'
            }}>
              <span title="Ganancia neta (Pesos)">Ganancia: <strong style={{ color: 'var(--success)' }}>{formatMoney(form.price - form.cost_price)}</strong></span>
              <span title="Ganancia sobre costo (Markup)">Ganancia %: <strong style={{ color: 'var(--success)' }}>{(((form.price - form.cost_price) / form.cost_price) * 100).toFixed(1)}%</strong></span>
              <span title="Margen sobre venta">Margen: <strong style={{ color: 'var(--success)' }}>{(((form.price - form.cost_price) / form.price) * 100).toFixed(1)}%</strong></span>
            </div>
          )}

          {!form.is_composite && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Stock actual</label>
                <input
                  type="number"
                  value={form.stock}
                  onChange={e => setForm(p => ({ ...p, stock: e.target.value }))}
                  placeholder="Dejar vacío si es ilimitado"
                  min="0"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Stock mínimo (alerta)</label>
                <input
                  type="number"
                  value={form.min_stock}
                  onChange={e => setForm(p => ({ ...p, min_stock: e.target.value }))}
                  placeholder="Ej: 5"
                  min="0"
                />
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Descripción (opcional)</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Descripción breve del producto"
            />
          </div>

          {modal.edit && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="checkbox"
                id="is_active"
                checked={form.is_active}
                onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))}
                style={{ width: 'auto' }}
              />
              <label htmlFor="is_active" className="form-label" style={{ cursor: 'pointer' }}>
                Producto activo
              </label>
            </div>
          )}
        </div>
      </Modal>

      {/* ===== MODAL Categorías ===== */}
      <Modal
        open={catModal.open}
        onClose={() => setCatModal({ open: false, name: '' })}
        title="Gestionar Categorías"
        size="md"
        footer={
          <button onClick={() => setCatModal({ open: false, name: '' })} className="btn btn-secondary">Cerrar</button>
        }
      >
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <input
            type="text"
            value={catModal.name}
            onChange={e => setCatModal(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Nueva categoría..."
          />
          <button onClick={handleSaveCategory} className="btn btn-primary" disabled={savingCat || !catModal.name.trim()}>
            Agregar
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <tbody>
              {categories.length === 0 ? (
                <tr><td style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>No hay categorías</td></tr>
              ) : categories.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button onClick={() => handleDeleteCategory(c.id, c.name)} className="btn btn-danger btn-sm" title="Eliminar categoría">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </Modal>

      {/* ===== MODAL Confirmar Gasto ===== */}
      <Modal
        open={expenseConfirmModal.open}
        onClose={() => setExpenseConfirmModal({ open: false, product: null, added: 0, cost: 0 })}
        title="Stock Actualizado"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{
            background: 'var(--bg-secondary)', padding: '16px', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)', display: 'flex', gap: '16px', alignItems: 'flex-start'
          }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '10px', background: expenseConfirmModal.added > 0 ? 'var(--accent-soft)' : 'var(--danger-soft)',
              color: expenseConfirmModal.added > 0 ? 'var(--accent)' : 'var(--danger)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <Package size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '4px' }}>
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
              Solo actualizar producto, sin registrar gasto
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
