import { useState, useEffect, useRef } from 'react'
import { useApp } from '../../lib/AppContext'
import {
  dbGetProducts, dbGetCategories, dbCreateProduct,
  dbUpdateProduct, dbDeleteProduct, lookupBarcode, dbLogActivity,
  dbCreateCategory, dbDeleteCategory
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
  description: '', is_active: true
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

  async function load() {
    if (!tenantId) { setLoading(false); return; }
    setLoading(true)
    const [p, c] = await Promise.all([
      dbGetProducts(tenantId, { includeInactive: true }),
      dbGetCategories(tenantId)
    ])
    setProducts(p)
    setCategories(c)
    setLoading(false)
  }

  useEffect(() => { load() }, [tenantId])

  function openCreate() {
    setForm(EMPTY_PRODUCT)
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
      is_active: product.is_active ?? true
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
      } else {
        const created = await dbCreateProduct(payload)
        await dbLogActivity(tenantId, userInfo?.id, 'create', 'product', created.id, { name: form.name })
        toast('Producto creado', 'success')
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
          {isAdmin() && (
            <button onClick={openCreate} className="btn btn-primary">
              <Plus size={16} /> Nuevo producto
            </button>
          )}
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
            {isAdmin() && (
              <button 
                onClick={() => setCatModal({ open: true, name: '' })} 
                className="btn btn-secondary"
                style={{ padding: '8px 12px' }}
                title="Gestionar categorías"
              >
                <Tag size={16} /> <span className="hide-on-mobile">Categorías</span>
              </button>
            )}
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
                  {isAdmin() && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin() ? 9 : 8}>
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
                      {isAdmin() && (
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
                      )}
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
                <select
                  value={form.category_id}
                  onChange={e => setForm(p => ({ ...p, category_id: e.target.value }))}
                  style={{ flex: 1 }}
                >
                  <option value="">Sin categoría</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
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
