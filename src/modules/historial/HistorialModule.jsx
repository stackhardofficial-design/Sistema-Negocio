import { useState, useEffect } from 'react'
import { useApp } from '../../lib/AppContext'
import { sb, dbGetActivityLog } from '../../lib/supabase'
import { ClipboardList, Search, Filter, RefreshCw, X } from 'lucide-react'

function formatDateTime(d) {
  return new Date(d).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

const ACTION_BADGES = {
  create: { label: 'Creó', class: 'badge-success' },
  update: { label: 'Editó', class: 'badge-info' },
  delete: { label: 'Eliminó', class: 'badge-danger' },
  update_stock: { label: 'Stock', class: 'badge-warning' },
  cancel: { label: 'Anuló', class: 'badge-danger' },
  activate: { label: 'Activó', class: 'badge-success' },
  deactivate: { label: 'Desactivó', class: 'badge-neutral' },
  login: { label: 'Ingresó', class: 'badge-info' },
  logout: { label: 'Salió', class: 'badge-neutral' },
}

const ENTITY_LABELS = {
  product: 'Producto',
  sale: 'Venta',
  user: 'Usuario',
  debtor: 'Deudor',
  buffet_product: 'Producto Buffet',
  buffet_order: 'Pedido Buffet',
  ingredient: 'Ingrediente',
  category: 'Categoría',
  expense: 'Gasto',
  tenant: 'Configuración'
}

function formatMoney(n) {
  if (!n) return '$0'
  return `$${Number(n).toLocaleString('es-AR')}`
}

function renderDetails(details) {
  if (!details || Object.keys(details).length === 0) return '—'

  const PAYMENT_LABELS = {
    efectivo: '💵 Efectivo',
    transferencia: '📲 Mercado Pago',
    deudor: '📒 Deudor'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {Object.entries(details).map(([k, v]) => {
        let keyLabel = k
        let valStr = String(v)

        if (k === 'name' || k === 'product') keyLabel = 'Nombre'
        if (k === 'barcode') keyLabel = 'Cód. Barras'
        if (k === 'price' || k === 'unit_price') { keyLabel = 'Precio'; valStr = formatMoney(v) }
        if (k === 'amount' || k === 'total') { keyLabel = 'Monto'; valStr = formatMoney(v) }
        if (k === 'quantity' || k === 'qty') keyLabel = 'Cantidad'
        if (k === 'stock') keyLabel = 'Stock Actual'
        if (k === 'added') keyLabel = 'Stock Agregado'
        if (k === 'reason') keyLabel = 'Motivo'
        if (k === 'role') keyLabel = 'Rol'
        if (k === 'action') keyLabel = 'Operación'
        if (k === 'status') keyLabel = 'Estado'
        if (k === 'items') keyLabel = 'Cant. Items'
        if (k === 'category_id') keyLabel = 'Categoría ID'
        if (k === 'payment_method') {
          keyLabel = 'Método de pago'
          valStr = PAYMENT_LABELS[v] || v
        }
        if (k === 'debtor') {
          keyLabel = 'Deudor'
          valStr = v ? `📒 ${v}` : '—'
        }

        // Skip printing raw objects if they somehow get in
        if (typeof v === 'object') return null

        return (
          <div key={k} style={{ display: 'flex', gap: '6px', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{keyLabel}:</span>
            <span style={{ color: 'var(--text-primary)' }}>{valStr}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function HistorialModule() {
  const { tenantId } = useApp()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterEntity, setFilterEntity] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  async function load() {
    if (!tenantId) { setLoading(false); return; }
    setLoading(true)
    const opts = { limit: 500 }
    if (filterAction) opts.action = filterAction
    if (filterEntity) opts.entity = filterEntity
    if (filterDate) {
      opts.dateFrom = `${filterDate}T00:00:00`
      opts.dateTo = `${filterDate}T23:59:59`
    }
    const data = await dbGetActivityLog(tenantId, opts)
    setLogs(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [tenantId, filterAction, filterEntity, filterDate])

  useEffect(() => {
    if (!tenantId) return
    const channel = sb.channel('historial_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_log', filter: `tenant_id=eq.${tenantId}` }, () => load())
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [tenantId])

  const filtered = logs.filter(l => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (l.users?.name || '').toLowerCase().includes(q) ||
      (l.entity || '').toLowerCase().includes(q) ||
      (l.entity_id || '').includes(q) ||
      JSON.stringify(l.details || {}).toLowerCase().includes(q)
    )
  })

  return (
    <div className="fade-in">
      <div className="module-header">
        <h1>
          <span className="icon-wrap"><ClipboardList size={20} /></span>
          Historial Completo
        </h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowFilters(v => !v)} className="btn btn-secondary btn-sm">
            <Filter size={14} /> Filtros
          </button>
          <button onClick={load} className="btn btn-secondary btn-sm">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="module-content">
        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <div className="search-wrap" style={{ flex: 1, minWidth: '200px' }}>
            <Search size={16} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar en historial..."
            />
          </div>
        </div>

        {showFilters && (
          <div className="fade-in" style={{
            display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap',
            padding: '14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)', alignItems: 'flex-end'
          }}>
            <div className="form-group" style={{ flex: 1, minWidth: '140px' }}>
              <label className="form-label">Acción</label>
              <select value={filterAction} onChange={e => setFilterAction(e.target.value)}>
                <option value="">Todas</option>
                {Object.entries(ACTION_BADGES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: '140px' }}>
              <label className="form-label">Entidad</label>
              <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)}>
                <option value="">Todas</option>
                {Object.entries(ENTITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: '140px' }}>
              <label className="form-label">Fecha</label>
              <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
            </div>
            <button onClick={() => { setFilterAction(''); setFilterEntity(''); setFilterDate('') }} className="btn btn-secondary btn-sm">
              <X size={14} /> Limpiar
            </button>
          </div>
        )}

        {loading ? (
          <div className="empty-state"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <ClipboardList size={40} />
            <h3>Sin registros</h3>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Usuario</th>
                  <th>Acción</th>
                  <th>Entidad</th>
                  <th>ID</th>
                  <th>Detalles</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(log => {
                  const action = ACTION_BADGES[log.action] || { label: log.action, class: 'badge-neutral' }
                  return (
                    <tr key={log.id}>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {formatDateTime(log.created_at)}
                      </td>
                      <td style={{ fontWeight: 500 }}>
                        {log.users?.name || log.users?.email || '—'}
                      </td>
                      <td>
                        <span className={`badge ${action.class}`}>{action.label}</span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        {ENTITY_LABELS[log.entity] || log.entity}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {log.entity_id || '—'}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {renderDetails(log.details)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {filtered.length} registros encontrados
        </div>
      </div>
    </div>
  )
}
