import { useState, useEffect } from 'react'
import { useApp } from '../../lib/AppContext'
import {
  sb, dbGetExpenseCategories, dbCreateExpenseCategory, dbUpdateExpenseCategory, dbDeleteExpenseCategory,
  dbGetExpenses, dbCreateExpense, dbDeleteExpense,
  dbGetSaleSummary, dbGetProducts, dbLogActivity
} from '../../lib/supabase'
import Modal from '../../components/Modal'
import { 
  TrendingUp, TrendingDown, DollarSign, Calendar,
  Plus, List, Trash2, Edit2, LayoutGrid, Search, AlertCircle
, Lock, RefreshCw } from 'lucide-react'

function formatMoney(n) {
  return `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
}
function formatDate(d) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function FinanzasModule() {
  const { tenantId, userInfo, toast } = useApp()
  const [activeTab, setActiveTab] = useState('resumen') // resumen, gastos, planilla

  // Datos
  const [categories, setCategories] = useState([])
  const [expenses, setExpenses] = useState([])
  const [salesSummary, setSalesSummary] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7) // Últimos 7 días por defecto
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])
  const [gastosSearch, setGastosSearch] = useState('')
  const [gastosTypeFilter, setGastosTypeFilter] = useState('all')
  const [gastosCategoryFilter, setGastosCategoryFilter] = useState('all')

  // Modales
  const [expenseModal, setExpenseModal] = useState({ open: false, edit: null })
  const [expenseForm, setExpenseForm] = useState({ amount: '', category_id: '', description: '', expense_date: new Date().toISOString().split('T')[0], expense_type: 'variable' })
  
  const [catModal, setCatModal] = useState({ open: false, edit: null })
  const [catForm, setCatForm] = useState({ name: '' })

  const [saving, setSaving] = useState(false)

  async function load(showLoading = true) {
    if (!tenantId) return
    if (showLoading) setLoading(true)
    try {
      const cats = await dbGetExpenseCategories(tenantId)
      setCategories(cats)
      
      const exps = await dbGetExpenses(tenantId, { dateFrom, dateTo })
      setExpenses(exps)
      
      // Obtener resumen de ventas para calcular ingresos
      // Se pasa 23:59:59 al dateTo para incluir todo el día
      const sales = await dbGetSaleSummary(tenantId, dateFrom + 'T00:00:00Z', dateTo + 'T23:59:59Z')
      setSalesSummary(sales)

      // Obtener productos para resolver códigos de barras antiguos
      const prods = await dbGetProducts(tenantId)
      setProducts(prods)
    } catch (err) {
      toast(`Error cargando finanzas: ${err.message}`, 'danger')
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  useEffect(() => {
    load()
    if (!tenantId) return
    const channel = sb.channel('finanzas_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales', filter: `tenant_id=eq.${tenantId}` }, () => load(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `tenant_id=eq.${tenantId}` }, () => load(false))
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [tenantId, dateFrom, dateTo])

  // ===== GASTOS =====
  async function handleSaveExpense() {
    if (!expenseForm.amount || expenseForm.amount <= 0) return toast('Monto inválido', 'warning')
    if (!expenseForm.category_id) return toast('Seleccione una categoría', 'warning')
    if (!expenseForm.expense_date) return toast('Fecha inválida', 'warning')

    setSaving(true)
    try {
      if (expenseModal.edit) {
        // Edit flow if needed later
      } else {
        const created = await dbCreateExpense({
          tenant_id: tenantId,
          user_id: userInfo?.id,
          category_id: expenseForm.category_id,
          amount: parseFloat(expenseForm.amount),
          description: expenseForm.description?.trim(),
          expense_date: expenseForm.expense_date,
          expense_type: expenseForm.expense_type || 'variable'
        })
        await dbLogActivity(tenantId, userInfo?.id, 'create', 'expense', created.id, { amount: expenseForm.amount, category_id: expenseForm.category_id })
        toast('Gasto registrado', 'success')
      }
      setExpenseModal({ open: false, edit: null })
      load()
    } catch (err) {
      toast('Error al guardar gasto: ' + err.message, 'danger')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteExpense(id) {
    if (!confirm('¿Eliminar este gasto?')) return
    try {
      await dbDeleteExpense(id)
      await dbLogActivity(tenantId, userInfo?.id, 'delete', 'expense', id)
      toast('Gasto eliminado', 'success')
      load()
    } catch (err) {
      toast('Error al eliminar', 'danger')
    }
  }

  // ===== CATEGORÍAS =====
  async function handleSaveCategory() {
    if (!catForm.name.trim()) return toast('Nombre requerido', 'warning')
    setSaving(true)
    try {
      const created = await dbCreateExpenseCategory(tenantId, catForm.name.trim())
      await dbLogActivity(tenantId, userInfo?.id, 'create', 'category', created.id, { name: catForm.name.trim() })
      toast('Categoría creada', 'success')
      setCatModal({ open: false, edit: null })
      load()
    } catch (err) {
      toast('Error al crear categoría', 'danger')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteCategory(category) {
    if (category.name === 'Compra Mercadería') {
      return toast('La categoría "Compra Mercadería" es obligatoria para el sistema de stock y no puede eliminarse', 'warning')
    }
    if (!confirm('¿Eliminar categoría? Los gastos asociados quedarán sin categoría.')) return
    try {
      await dbDeleteExpenseCategory(category.id)
      await dbLogActivity(tenantId, userInfo?.id, 'delete', 'category', category.id)
      load()
    } catch (err) {
      toast('Error al eliminar categoría', 'danger')
    }
  }

  // ===== CÁLCULOS =====
  const totalIngresos = salesSummary.reduce((acc, s) => acc + Number(s.total_amount), 0)
  const totalGastos = expenses.reduce((acc, e) => acc + Number(e.amount), 0)
  const totalFijos = expenses.filter(e => e.expense_type === 'fixed').reduce((acc, e) => acc + Number(e.amount), 0)
  const totalVariables = expenses.filter(e => !e.expense_type || e.expense_type === 'variable').reduce((acc, e) => acc + Number(e.amount), 0)
  const gananciaNeta = totalIngresos - totalGastos

  // Desglose de ingresos por método de pago
  const ingresoEfectivo = salesSummary.filter(s => !s.payment_method || s.payment_method === 'efectivo').reduce((a, s) => a + Number(s.total_amount), 0)
  const ingresoTransferencia = salesSummary.filter(s => s.payment_method === 'transferencia').reduce((a, s) => a + Number(s.total_amount), 0)
  const ingresoDeudor = salesSummary.filter(s => s.payment_method === 'deudor').reduce((a, s) => a + Number(s.total_amount), 0)

  // Agrupar para planilla semanal
  // Filas: Categorías, Columnas: Fechas únicas en el rango (o últimos 7 días)
  const fechasUnicas = [...new Set(expenses.map(e => e.expense_date))].sort()
  const planilla = categories.map(cat => {
    const row = { id: cat.id, name: cat.name, total: 0 }
    fechasUnicas.forEach(f => {
      const totalDia = expenses
        .filter(e => e.category_id === cat.id && e.expense_date === f)
        .reduce((sum, e) => sum + Number(e.amount), 0)
      row[f] = totalDia
      row.total += totalDia
    })
    return row
  }).filter(row => row.total > 0) // solo mostrar categorias con gastos en este periodo

  // Gastos sin categoría
  const gastosSinCat = expenses.filter(e => !e.category_id)
  if (gastosSinCat.length > 0) {
    const row = { id: 'none', name: 'Sin categoría', total: 0 }
    fechasUnicas.forEach(f => {
      const totalDia = gastosSinCat
        .filter(e => e.expense_date === f)
        .reduce((sum, e) => sum + Number(e.amount), 0)
      row[f] = totalDia
      row.total += totalDia
    })
    planilla.push(row)
  }

  const filteredExpenses = expenses.filter(exp => {
    if (gastosTypeFilter !== 'all' && exp.expense_type !== gastosTypeFilter) return false
    if (gastosCategoryFilter !== 'all' && exp.category_id !== gastosCategoryFilter) return false
    if (gastosSearch.trim()) {
      const q = gastosSearch.toLowerCase()
      const desc = exp.description?.toLowerCase() || ''
      const cat = exp.expense_categories?.name?.toLowerCase() || ''
      const amount = String(exp.amount)
      if (!desc.includes(q) && !cat.includes(q) && !amount.includes(q)) return false
    }
    return true
  })

  function parseDescription(desc) {
    if (!desc) return { isProduct: false, text: '-' }
    try {
      const data = JSON.parse(desc)
      if (data._type === 'stock_restock') {
        return { isProduct: true, data }
      }
    } catch {}
    // Compatibility for older formats
    if (desc.includes(' u. de "') && desc.includes('(costo unitario:')) {
      const match = desc.match(/^(-?\d+)\s+u\.\s+de\s+"(.*)"\s+\(costo unitario:\s+\$([^)]+)\)$/)
      if (match) {
        const qty = parseInt(match[1], 10)
        const name = match[2]
        const unitCostStr = match[3]
        const normalizedStr = unitCostStr.replace(/\./g, '').replace(',', '.')
        const unit_cost = parseFloat(normalizedStr) || 0

        const productMatch = products.find(p => p.name === name)
        const barcode = productMatch ? (productMatch.barcode || '') : ''

        return {
          isProduct: true,
          data: {
            _type: 'stock_restock',
            qty,
            name,
            barcode,
            unit_cost
          }
        }
      }
    }
    return { isProduct: false, text: desc }
  }

  return (
    <div className="fade-in">
      <div className="module-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '10px' }}>
          <h1>
            <span className="icon-wrap" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <TrendingUp size={20} />
            </span>
            Finanzas y Flujo de Caja
          </h1>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => {
              setExpenseForm({ amount: '', category_id: categories[0]?.id || '', description: '', expense_date: new Date().toISOString().split('T')[0] })
              setExpenseModal({ open: true, edit: null })
            }} className="btn btn-primary">
              <Plus size={16} /> Registrar Gasto
            </button>
          </div>
        </div>

        {/* Fechas */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-secondary)', padding: '10px 16px', borderRadius: '12px', width: '100%' }}>
          <Calendar size={18} color="var(--text-muted)" />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Periodo:</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input-sm" style={{ padding: '6px' }} />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>hasta</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input-sm" style={{ padding: '6px' }} />
        </div>

        {/* Tabs */}
        <div className="tabs" style={{ width: '100%', marginBottom: 0 }}>
          <button className={`tab ${activeTab === 'resumen' ? 'active' : ''}`} onClick={() => setActiveTab('resumen')}>
            <TrendingUp size={16} /> Resumen
          </button>
          <button className={`tab ${activeTab === 'gastos' ? 'active' : ''}`} onClick={() => setActiveTab('gastos')}>
            <List size={16} /> Historial Gastos
          </button>
          <button className={`tab ${activeTab === 'planilla' ? 'active' : ''}`} onClick={() => setActiveTab('planilla')}>
            <LayoutGrid size={16} /> Planilla Semanal
          </button>
          <button className={`tab ${activeTab === 'categorias' ? 'active' : ''}`} onClick={() => setActiveTab('categorias')}>
            <Edit2 size={16} /> Categorías
          </button>
        </div>
      </div>

      <div className="module-content">
        {loading ? (
          <div className="empty-state"><div className="spinner" /></div>
        ) : (
          <>
            {/* TAB: RESUMEN */}
            {activeTab === 'resumen' && (
              <div className="fade-in">
                <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: '24px' }}>
                  <div className="kpi-card">
                    <div className="kpi-label" style={{ color: 'var(--success)' }}>
                      <TrendingUp size={16} /> Ingresos (Ventas)
                    </div>
                    <div className="kpi-value">{formatMoney(totalIngresos)}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Total de ventas completadas en el periodo</div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-label" style={{ color: 'var(--danger)' }}>
                      <TrendingDown size={16} /> Egresos Totales
                    </div>
                    <div className="kpi-value">{formatMoney(totalGastos)}</div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: '6px' }}>
                        <Lock size={14} style={{display:'inline', verticalAlign:'middle'}}/> Fijos: {formatMoney(totalFijos)}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: '6px' }}>
                        <RefreshCw size={14} style={{display:'inline', verticalAlign:'middle'}}/> Variables: {formatMoney(totalVariables)}
                      </span>
                    </div>
                  </div>
                  <div className="kpi-card" style={{ background: gananciaNeta >= 0 ? 'var(--success-soft)' : 'var(--danger-soft)' }}>
                    <div className="kpi-label" style={{ color: gananciaNeta >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      <DollarSign size={16} /> Ganancia Neta
                    </div>
                    <div className="kpi-value" style={{ color: gananciaNeta >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {formatMoney(gananciaNeta)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Ingresos menos Egresos</div>
                  </div>
                </div>

                <div className="card">
                  <h3 style={{ marginBottom: '16px', fontSize: '1.1rem' }}>Distribución de Gastos</h3>
                  {planilla.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {planilla.sort((a, b) => b.total - a.total).map(row => (
                        <div key={row.id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 500 }}>{row.name}</span>
                            <span>{formatMoney(row.total)}</span>
                          </div>
                          <div style={{ width: '100%', height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${(row.total / totalGastos) * 100}%`, height: '100%', background: 'var(--danger)' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay gastos en este periodo.</p>
                  )}
                </div>

                {/* Desglose de ingresos por método de pago */}
                {totalIngresos > 0 && (
                  <div className="card" style={{ marginTop: '0' }}>
                    <h3 style={{ marginBottom: '16px', fontSize: '1rem' }}>Ingresos por método de pago</h3>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {[
                        { label: '💵 Efectivo', value: ingresoEfectivo, color: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)' },
                        { label: '📲 Mercado Pago', value: ingresoTransferencia, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)' },
                        { label: '📒 Deudor (fiado)', value: ingresoDeudor, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)' },
                      ].map(m => (
                        <div key={m.label} style={{
                          flex: 1, minWidth: '140px',
                          padding: '14px 16px', borderRadius: '12px',
                          background: m.bg, border: `1px solid ${m.border}`
                        }}>
                          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: m.color, marginBottom: '6px' }}>{m.label}</div>
                          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: m.color }}>{formatMoney(m.value)}</div>
                          {totalIngresos > 0 && (
                            <div style={{ marginTop: '6px' }}>
                              <div style={{ width: '100%', height: '4px', background: 'var(--bg-tertiary)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ width: `${(m.value / totalIngresos) * 100}%`, height: '100%', background: m.color, transition: 'width 0.4s' }} />
                              </div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                                {((m.value / totalIngresos) * 100).toFixed(1)}% del total
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: GASTOS */}
            {activeTab === 'gastos' && (
              <div className="fade-in card" style={{ padding: '0', overflow: 'hidden' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem' }}>Historial de Gastos</h3>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <select className="input-sm" value={gastosTypeFilter} onChange={e => setGastosTypeFilter(e.target.value)} style={{ padding: '6px' }}>
                        <option value="all">Todos los Tipos</option>
                        <option value="fixed">Fijos</option>
                        <option value="variable">Variables</option>
                      </select>
                      <select className="input-sm" value={gastosCategoryFilter} onChange={e => setGastosCategoryFilter(e.target.value)} style={{ padding: '6px' }}>
                        <option value="all">Todas las Categorías</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input type="text" placeholder="Buscar..." value={gastosSearch} onChange={e => setGastosSearch(e.target.value)} className="input-sm" style={{ paddingLeft: '32px', width: '180px', padding: '6px 6px 6px 32px' }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="table-responsive" style={{ overflowX: 'auto', width: '100%' }}>
                  <table className="table" style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-tertiary)', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>Fecha</th>
                        <th style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>Categoría</th>
                        <th style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>Detalle / Producto</th>
                        <th style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>Cód. Barras</th>
                        <th style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>Cant.</th>
                        <th style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>P. Unit.</th>
                        <th style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>Total</th>
                        <th style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'center', width: '60px' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExpenses.length === 0 ? (
                        <tr>
                          <td colSpan="8" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            No se encontraron gastos.
                          </td>
                        </tr>
                      ) : (
                        filteredExpenses.map(exp => {
                          const parsed = parseDescription(exp.description)
                          return (
                            <tr key={exp.id} style={{ borderBottom: '1px solid var(--border-soft)', fontSize: '0.9rem' }}>
                              <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{formatDate(exp.expense_date)}</td>
                              <td style={{ padding: '12px 16px', fontWeight: 500 }}>{exp.expense_categories?.name || 'Sin categoría'}</td>
                              {parsed.isProduct ? (
                                <>
                                  <td style={{ padding: '12px 16px' }}>{parsed.data.name}</td>
                                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{parsed.data.barcode || '-'}</td>
                                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>{parsed.data.qty}</td>
                                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>{formatMoney(parsed.data.unit_cost)}</td>
                                </>
                              ) : (
                                <>
                                  <td style={{ padding: '12px 16px' }}>{parsed.text}</td>
                                  <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>-</td>
                                  <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>-</td>
                                  <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-muted)' }}>-</td>
                                </>
                              )}
                              <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>{formatMoney(exp.amount)}</td>
                              <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                <button onClick={() => handleDeleteExpense(exp.id)} className="btn-icon text-danger" title="Eliminar gasto">
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: PLANILLA */}
            {activeTab === 'planilla' && (
              <div className="fade-in card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem' }}>Planilla de Gastos (Estilo Cuaderno)</h3>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Agrupado por categoría y día</p>
                </div>
                
                {fechasUnicas.length === 0 ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>No hay datos para armar la planilla.</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-tertiary)' }}>
                          <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid var(--border)' }}>Categoría</th>
                          {fechasUnicas.map(f => (
                            <th key={f} style={{ padding: '12px 16px', textAlign: 'right', borderBottom: '2px solid var(--border)' }}>
                              {formatDate(f).slice(0, 5)} {/* Muestra DD/MM */}
                            </th>
                          ))}
                          <th style={{ padding: '12px 16px', textAlign: 'right', borderBottom: '2px solid var(--border)', background: 'var(--bg-secondary)' }}>TOTAL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {planilla.map(row => (
                          <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '12px 16px', fontWeight: 500 }}>{row.name}</td>
                            {fechasUnicas.map(f => (
                              <td key={f} style={{ padding: '12px 16px', textAlign: 'right', color: row[f] > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                {row[f] > 0 ? formatMoney(row[f]) : '-'}
                              </td>
                            ))}
                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, background: 'var(--bg-secondary)' }}>
                              {formatMoney(row.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: 'var(--bg-secondary)' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 700 }}>Total Diario</td>
                          {fechasUnicas.map(f => {
                            const totalDia = expenses
                              .filter(e => e.expense_date === f)
                              .reduce((sum, e) => sum + Number(e.amount), 0)
                            return (
                              <td key={f} style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }}>
                                {formatMoney(totalDia)}
                              </td>
                            )
                          })}
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: 'var(--danger)' }}>
                            {formatMoney(totalGastos)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB: CATEGORÍAS */}
            {activeTab === 'categorias' && (
              <div className="fade-in">
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                  <button onClick={() => { setCatForm({ name: '' }); setCatModal({ open: true, edit: null }) }} className="btn btn-secondary">
                    <Plus size={16} /> Nueva Categoría
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                  {categories.map(cat => (
                    <div key={cat.id} className="card" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 500 }}>{cat.name}</span>
                      {cat.name !== 'Compra Mercadería' && (
                        <button onClick={() => handleDeleteCategory(cat)} className="btn-icon text-danger" title="Eliminar categoría">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal Nuevo Gasto */}
      <Modal open={expenseModal.open} onClose={() => !saving && setExpenseModal({ open: false, edit: null })} title="Registrar Gasto">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {categories.length === 0 && (
            <div style={{ padding: '12px', background: 'var(--warning-soft)', color: 'var(--warning)', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', gap: '8px' }}>
              <AlertCircle size={16} /> Primero creá al menos una categoría de gastos.
            </div>
          )}
          
          <div className="form-group">
            <label className="form-label">Categoría</label>
            <select
              value={expenseForm.category_id}
              onChange={e => setExpenseForm({ ...expenseForm, category_id: e.target.value })}
              disabled={saving}
            >
              <option value="">Seleccionar categoría...</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Monto ($)</label>
            <input
              type="number" step="0.01" min="0"
              value={expenseForm.amount}
              onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
              placeholder="Ej: 46000"
              disabled={saving}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Fecha del gasto</label>
            <input
              type="date"
              value={expenseForm.expense_date}
              onChange={e => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
              disabled={saving}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Tipo de gasto</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setExpenseForm({ ...expenseForm, expense_type: 'variable' })}
                disabled={saving}
                style={{
                  flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid',
                  borderColor: expenseForm.expense_type !== 'fixed' ? 'var(--warning)' : 'var(--border)',
                  background: expenseForm.expense_type !== 'fixed' ? 'rgba(245,158,11,0.1)' : 'transparent',
                  color: expenseForm.expense_type !== 'fixed' ? 'var(--warning)' : 'var(--text-muted)',
                  cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s'
                }}
              >
                🔄 Variable
                <div style={{ fontSize: '0.7rem', fontWeight: 400, marginTop: '2px', opacity: 0.8 }}>Mercadería, insumos</div>
              </button>
              <button
                type="button"
                onClick={() => setExpenseForm({ ...expenseForm, expense_type: 'fixed' })}
                disabled={saving}
                style={{
                  flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid',
                  borderColor: expenseForm.expense_type === 'fixed' ? 'var(--info)' : 'var(--border)',
                  background: expenseForm.expense_type === 'fixed' ? 'rgba(59,130,246,0.1)' : 'transparent',
                  color: expenseForm.expense_type === 'fixed' ? 'var(--info)' : 'var(--text-muted)',
                  cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s'
                }}
              >
                🔒 Fijo
                <div style={{ fontSize: '0.7rem', fontWeight: 400, marginTop: '2px', opacity: 0.8 }}>Alquiler, sueldo fijo</div>
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Descripción (Opcional)</label>
            <input
              type="text"
              value={expenseForm.description}
              onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })}
              placeholder="Ej: Pago a empleado, proveedor Arcor..."
              disabled={saving}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button onClick={handleSaveExpense} disabled={saving || categories.length === 0} className="btn btn-primary" style={{ flex: 1 }}>
              {saving ? 'Guardando...' : `Guardar Gasto`}
            </button>
            <button onClick={() => setExpenseModal({ open: false, edit: null })} disabled={saving} className="btn btn-secondary">
              Cancelar
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Categoría */}
      <Modal open={catModal.open} onClose={() => !saving && setCatModal({ open: false, edit: null })} title="Nueva Categoría de Gastos">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Nombre de la categoría</label>
            <input
              type="text"
              value={catForm.name}
              onChange={e => setCatForm({ name: e.target.value })}
              placeholder="Ej: Cocina, Empleados, Bebidas..."
              disabled={saving}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button onClick={handleSaveCategory} disabled={saving} className="btn btn-primary" style={{ flex: 1 }}>
              {saving ? 'Guardando...' : 'Guardar Categoría'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
