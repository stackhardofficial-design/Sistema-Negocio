import { useState, useEffect, useRef } from 'react'
import { useApp } from '../../lib/AppContext'
import {
  sb, dbGetProducts, dbGetCategories, dbCreateProduct,
  dbUpdateProduct, dbDeleteProduct, lookupBarcode, dbLogActivity,
  dbCreateCategory, dbDeleteCategory, dbCreateExpense, dbEnsureExpenseCategory
} from '../../lib/supabase'
import Modal from '../../components/Modal'
import BarcodeScanner from '../../components/BarcodeScanner'
import { Package, Plus, Search, Edit2, Trash2, Barcode, RefreshCw, ExternalLink, Tag } from 'lucide-react'

function formatMoney(n) {
  return `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
}

const EMPTY_PRODUCT = {
  name: '', barcode: '', category_id: '',
  price: '', cost_price: '', stock: '', min_stock: '',
  description: '', is_active: true, register_initial_expense: false
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


  const [savingCat, setSavingCat] = useState(false)

  async function handleSaveCategory() {
    if (!catModal.name.trim()) return toast('El nombre es obligatorio', 'warning')
    setSavingCat(true)
    try {
      const result = await dbCreateCategory(tenantId, catModal.name.trim())
      console.log('Category created:', result)
      toast('Categoría creada ✓', 'success')
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
    setForm({ ...EMPTY_PRODUCT, category_id: lastCategory })
    setModal({ open: true, edit: null })
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
      register_initial_expense: false
    })
    setModal({ open: true, edit: product })
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
        stock: form.stock !== '' ? parseInt(form.stock) : null,
        min_stock: form.min_stock !== '' ? parseInt(form.min_stock) : null,
        description: form.description || null,
        is_active: form.is_active
      }

      if (modal.edit) {
        await dbUpdateProduct(modal.edit.id, payload)
        await dbLogActivity(tenantId, userInfo?.id, 'update', 'product', modal.edit.id, { name: form.name })
        toast('Producto actualizado', 'success')

        const oldStock = modal.edit.stock !== null && modal.edit.stock !== undefined ? modal.edit.stock : 0;
        const newStock = form.stock !== '' ? parseInt(form.stock) : 0;
        if (newStock > oldStock && form.register_initial_expense && form.cost_price && parseFloat(form.cost_price) > 0) {
          try {
            const category = await dbEnsureExpenseCategory(tenantId, 'Compra Mercadería')
            const addedStock = newStock - oldStock
            const cost = addedStock * parseFloat(form.cost_price)
            await dbCreateExpense({
              tenant_id: tenantId,
              user_id: userInfo?.id,
              category_id: category.id,
              amount: cost,
              description: JSON.stringify({
                _type: 'stock_restock',
                qty: addedStock,
                name: form.name,
                barcode: form.barcode || '',
                unit_cost: parseFloat(form.cost_price)
              }),
              expense_date: new Date().toISOString().split('T')[0],
              expense_type: 'variable'
            })
            toast(`Gasto por reposición de stock registrado: ${formatMoney(cost)} ✓`, 'success')
          } catch(err) {
            toast(`Error al registrar gasto: ${err.message}`, 'warning')
          }
        }
      } else {
        const created = await dbCreateProduct(payload)
        await dbLogActivity(tenantId, userInfo?.id, 'create', 'product', created.id, { name: form.name })
        toast('Producto creado', 'success')
        
        if (form.stock && parseInt(form.stock) > 0 && form.register_initial_expense && form.cost_price && parseFloat(form.cost_price) > 0) {
          try {
            const category = await dbEnsureExpenseCategory(tenantId, 'Compra Mercadería')
            const cost = parseInt(form.stock) * parseFloat(form.cost_price)
            await dbCreateExpense({
              tenant_id: tenantId,
              user_id: userInfo?.id,
              category_id: category.id,
              amount: cost,
              description: JSON.stringify({
                _type: 'stock_restock',
                qty: parseInt(form.stock),
                name: form.name,
                barcode: form.barcode || '',
                unit_cost: parseFloat(form.cost_price)
              }),
              expense_date: new Date().toISOString().split('T')[0],
              expense_type: 'variable'
            })
            toast(`Gasto inicial registrado en Caja: ${formatMoney(cost)} ✓`, 'success')
          } catch(err) {
            toast(`Gasto inicial falló: ${err.message}`, 'warning')
          }
        }
      }

      setModal({ open: false, edit: null })
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
      await dbLogActivity(tenantId, userInfo?.id, 'delete', 'product', product.id, { name: product.name })
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
    if (!p.price || !p.cost_price || p.cost_price === 0) return null
    return (((p.price - p.cost_price) / p.price) * 100).toFixed(1)
  }

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
                  <th style={{ textAlign: 'right' }}>Margen</th>
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
                  const isLowStock = p.stock !== null && p.min_stock !== null && p.stock <= p.min_stock
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{p.name}</div>
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
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{formatMoney(p.cost_price)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {mg !== null
                          ? <span style={{ color: parseFloat(mg) >= 20 ? 'var(--success)' : 'var(--warning)', fontWeight: 500 }}>{mg}%</span>
                          : '—'
                        }
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ color: isLowStock ? 'var(--danger)' : 'var(--text-primary)', fontWeight: isLowStock ? 700 : 400 }}>
                          {p.stock ?? '∞'}
                          {isLowStock && ' ⚠'}
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
        onClose={() => setModal({ open: false, edit: null })}
        title={modal.edit ? 'Editar producto' : 'Nuevo producto'}
        size="lg"
        footer={
          <>
            <button onClick={() => setModal({ open: false, edit: null })} className="btn btn-secondary">Cancelar</button>
            <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : modal.edit ? 'Guardar cambios' : 'Crear producto'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-row">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Nombre del producto *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Ej: Coca Cola 500ml"
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
          </div>

          {form.price && form.cost_price && (
            <div style={{
              padding: '10px 14px', background: 'var(--success-soft)',
              borderRadius: 'var(--radius-md)', fontSize: '0.85rem',
              display: 'flex', gap: '20px'
            }}>
              <span>Ganancia: <strong style={{ color: 'var(--success)' }}>{formatMoney(form.price - form.cost_price)}</strong></span>
              <span>Margen: <strong style={{ color: 'var(--success)' }}>{(((form.price - form.cost_price) / form.price) * 100).toFixed(1)}%</strong></span>
            </div>
          )}

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

          {(() => {
            const isEditing = !!modal.edit;
            const oldStock = isEditing && modal.edit.stock !== null && modal.edit.stock !== undefined ? modal.edit.stock : 0;
            const newStock = form.stock !== '' ? parseInt(form.stock) : 0;
            const addedStock = isEditing ? (newStock > oldStock ? newStock - oldStock : 0) : newStock;
            
            if (addedStock > 0 && form.cost_price > 0) {
              const cost = addedStock * parseFloat(form.cost_price);
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--accent-soft)', padding: '12px', borderRadius: '8px', border: '1px solid var(--accent)' }}>
                  <input
                    type="checkbox"
                    id="register_initial_expense"
                    checked={form.register_initial_expense}
                    onChange={e => setForm(p => ({ ...p, register_initial_expense: e.target.checked }))}
                    style={{ width: 'auto' }}
                  />
                  <label htmlFor="register_initial_expense" className="form-label" style={{ cursor: 'pointer', margin: 0, fontWeight: 500, color: 'var(--accent)' }}>
                    Registrar gasto en Caja por {formatMoney(cost)}
                  </label>
                </div>
              )
            }
            return null;
          })()}

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
    </div>
  )
}
