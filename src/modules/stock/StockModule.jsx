import { useState, useEffect } from 'react'
import { useApp } from '../../lib/AppContext'
import { dbGetProducts, dbUpdateProductStock, dbLogActivity } from '../../lib/supabase'
import { Layers, AlertTriangle, Search, Edit2, Check, X, RefreshCw } from 'lucide-react'

function formatMoney(n) { return `$${Number(n || 0).toLocaleString('es-AR')}` }

export default function StockModule() {
  const { tenantId, userInfo, toast, isAdmin } = useApp()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [view, setView] = useState('all') // 'all' | 'low' | 'out'

  async function load() {
    if (!tenantId) return
    setLoading(true)
    const data = await dbGetProducts(tenantId, { includeInactive: false })
    setProducts(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [tenantId])

  async function saveStock(product) {
    const newStock = parseInt(editValue)
    if (isNaN(newStock) || newStock < 0) return toast('Valor inválido', 'warning')
    try {
      await dbUpdateProductStock(product.id, newStock)
      await dbLogActivity(tenantId, userInfo?.id, 'update_stock', 'product', product.id, {
        name: product.name, old: product.stock, new: newStock
      })
      toast(`Stock de "${product.name}" actualizado a ${newStock}`, 'success')
      setEditingId(null)
      load()
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
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
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar producto..."
            />
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {[
              { id: 'all', label: 'Todos' },
              { id: 'low', label: `⚠ Bajo (${lowCount})` },
              { id: 'out', label: `❌ Sin stock (${outCount})` }
            ].map(v => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
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
                  <th style={{ textAlign: 'right' }}>Stock actual</th>
                  <th style={{ textAlign: 'right' }}>Stock mín.</th>
                  <th>Estado</th>
                  {isAdmin() && <th>Editar stock</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
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
                          : isLow ? <span className="badge badge-warning">⚠ Bajo</span>
                          : p.stock === null ? <span className="badge badge-neutral">Ilimitado</span>
                          : <span className="badge badge-success">OK</span>}
                      </td>
                      {isAdmin() && (
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
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
