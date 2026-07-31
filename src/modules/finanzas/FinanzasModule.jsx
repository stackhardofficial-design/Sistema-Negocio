import { useState, useEffect } from 'react'
import { useApp } from '../../lib/AppContext'
import {
  dbGetExpenseCategories, dbCreateExpenseCategory, dbUpdateExpenseCategory, dbDeleteExpenseCategory,
  dbGetExpenses, dbCreateExpense, dbDeleteExpense,
  dbGetSaleSummary
} from '../../lib/supabase'
import Modal from '../../components/Modal'
import {
  TrendingUp, TrendingDown, DollarSign, Calendar,
  Plus, List, Trash2, Edit2, LayoutGrid, Search, AlertCircle
} from 'lucide-react'

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
  const [loading, setLoading] = useState(true)

  // Filtros
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7) // Últimos 7 días por defecto
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])

  // Modales
  const [expenseModal, setExpenseModal] = useState({ open: false, edit: null })
  const [expenseForm, setExpenseForm] = useState({ amount: '', category_id: '', description: '', expense_date: new Date().toISOString().split('T')[0] })
  
  const [catModal, setCatModal] = useState({ open: false, edit: null })
  const [catForm, setCatForm] = useState({ name: '' })

  const [saving, setSaving] = useState(false)

  async function load() {
    if (!tenantId) return
    setLoading(true)
    try {
      const cats = await dbGetExpenseCategories(tenantId)
      setCategories(cats)
      
      const exps = await dbGetExpenses(tenantId, { dateFrom, dateTo })
      setExpenses(exps)
      
      // Obtener resumen de ventas para calcular ingresos
      // Se pasa 23:59:59 al dateTo para incluir todo el día
      const sales = await dbGetSaleSummary(tenantId, dateFrom + 'T00:00:00Z', dateTo + 'T23:59:59Z')
      setSalesSummary(sales)
    } catch (err) {
      toast('Error al cargar finanzas: ' + err.message, 'danger')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [tenantId, dateFrom, dateTo])

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
        await dbCreateExpense({
          tenant_id: tenantId,
          user_id: userInfo?.id,
          category_id: expenseForm.category_id,
          amount: parseFloat(expenseForm.amount),
          description: expenseForm.description?.trim(),
          expense_date: expenseForm.expense_date
        })
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
      await dbCreateExpenseCategory(tenantId, catForm.name.trim())
      toast('Categoría creada', 'success')
      setCatModal({ open: false, edit: null })
      load()
    } catch (err) {
      toast('Error al crear categoría', 'danger')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteCategory(id) {
    if (!confirm('¿Eliminar categoría? Los gastos asociados quedarán sin categoría.')) return
    try {
      await dbDeleteExpenseCategory(id)
      load()
    } catch (err) {
      toast('Error al eliminar categoría', 'danger')
    }
  }

  // ===== CÁLCULOS =====
  const totalIngresos = salesSummary.reduce((acc, s) => acc + Number(s.total_amount), 0)
  const totalGastos = expenses.reduce((acc, e) => acc + Number(e.amount), 0)
  const gananciaNeta = totalIngresos - totalGastos

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
                <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', marginBottom: '24px' }}>
                  <div className="kpi-card">
                    <div className="kpi-label" style={{ color: 'var(--success)' }}>
                      <TrendingUp size={16} /> Ingresos (Ventas)
                    </div>
                    <div className="kpi-value">{formatMoney(totalIngresos)}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Total de ventas completadas en el periodo</div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-label" style={{ color: 'var(--danger)' }}>
                      <TrendingDown size={16} /> Egresos (Gastos)
                    </div>
                    <div className="kpi-value">{formatMoney(totalGastos)}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Total de salidas registradas</div>
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
              </div>
            )}

            {/* TAB: GASTOS */}
            {activeTab === 'gastos' && (
              <div className="fade-in">
                {expenses.length === 0 ? (
                  <div className="empty-state">
                    <List size={40} />
                    <h3>Sin gastos registrados</h3>
                    <p style={{ fontSize: '0.85rem' }}>No cargaste ningún gasto en este periodo.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {expenses.map(exp => (
                      <div key={exp.id} className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <div style={{
                            width: '40px', height: '40px', borderRadius: '12px',
                            background: 'var(--danger-soft)', color: 'var(--danger)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                            <TrendingDown size={20} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '1rem' }}>{exp.expense_categories?.name || 'Sin categoría'}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '8px' }}>
                              <span>{formatDate(exp.expense_date)}</span>
                              {exp.description && <span>· {exp.description}</span>}
                              {exp.users?.name && <span>· {exp.users.name}</span>}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                            {formatMoney(exp.amount)}
                          </div>
                          <button onClick={() => handleDeleteExpense(exp.id)} className="btn-icon text-danger" title="Eliminar gasto">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                      <button onClick={() => handleDeleteCategory(cat.id)} className="btn-icon text-danger">
                        <Trash2 size={16} />
                      </button>
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
              {saving ? 'Guardando...' : 'Guardar Gasto'}
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
