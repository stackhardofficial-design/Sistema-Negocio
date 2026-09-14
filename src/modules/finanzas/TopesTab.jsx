import { useState, useMemo } from 'react'
import { 
  Target, Plus, Edit2, Trash2, Calendar, AlertCircle, 
  CheckCircle2, AlertTriangle, TrendingUp, History, 
  DollarSign, ArrowRight, RefreshCw, X, ChevronDown, ChevronUp
} from 'lucide-react'
import { dbCreateTope, dbUpdateTope, dbDeleteTope, dbDeleteExpense, dbUpdateExpense, dbLogActivity } from '../../lib/supabase'
import Modal from '../../components/Modal'

function formatMoney(n) {
  return `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
}

function formatDate(d) {
  if (!d) return ''
  if (d.includes('T')) return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const [year, month, day] = d.split('-')
  return `${day}/${month}/${year}`
}

function toYMD(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Obtener lunes y domingo de la semana de una fecha
export function getWeekBounds(refDate = new Date()) {
  const d = new Date(refDate)
  const day = d.getDay() // 0 domingo, 1 lunes...
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diffToMonday)
  monday.setHours(0, 0, 0, 0)

  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)

  return { monday, sunday, fromYMD: toYMD(monday), toYMD: toYMD(sunday) }
}

// Generar una lista de las últimas N semanas para selector de historial
function generateWeeksList(count = 16) {
  const weeks = []
  const current = getWeekBounds(new Date())

  for (let i = 0; i < count; i++) {
    const d = new Date(current.monday)
    d.setDate(d.getDate() - (i * 7))
    const bounds = getWeekBounds(d)
    weeks.push({
      index: i,
      label: i === 0 ? `Esta semana (${formatDate(bounds.fromYMD)} al ${formatDate(bounds.toYMD)})` :
             i === 1 ? `Semana pasada (${formatDate(bounds.fromYMD)} al ${formatDate(bounds.toYMD)})` :
             `Semana ${formatDate(bounds.fromYMD)} al ${formatDate(bounds.toYMD)}`,
      shortLabel: `${formatDate(bounds.fromYMD)} - ${formatDate(bounds.toYMD)}`,
      from: bounds.fromYMD,
      to: bounds.toYMD,
      mondayDate: bounds.monday,
      sundayDate: bounds.sunday
    })
  }
  return weeks
}

export default function TopesTab({
  tenantId,
  userInfo,
  topes = [],
  expenses = [],
  categories = [],
  onRefresh,
  toast,
  onOpenExpenseModalWithTope
}) {
  const [subTab, setSubTab] = useState('actual') // 'actual' | 'historial'
  
  // Semana actual
  const currentWeek = useMemo(() => getWeekBounds(new Date()), [])
  
  // Lista de semanas precalculadas
  const availableWeeks = useMemo(() => generateWeeksList(20), [])
  
  // Selección para Historial: desde semana (más antigua) hasta semana (más reciente)
  // Por default: últimas 2 semanas
  const [historyFromWeekIndex, setHistoryFromWeekIndex] = useState(1) // semana pasada
  const [historyToWeekIndex, setHistoryToWeekIndex] = useState(0) // esta semana
  const [selectedTopeFilter, setSelectedTopeFilter] = useState('all')

  // Modales
  const [topeModal, setTopeModal] = useState({ open: false, edit: null })
  const [topeForm, setTopeForm] = useState({ name: '', weekly_amount: '' })
  const [savingTope, setSavingTope] = useState(false)

  // Modal para editar un gasto erróneo de un tope
  const [editExpenseModal, setEditExpenseModal] = useState({ open: false, expense: null })
  const [editExpenseForm, setEditExpenseForm] = useState({ amount: '', description: '', tope_id: '', expense_date: '' })
  const [savingExpense, setSavingExpense] = useState(false)

  // Acordeón de detalles de gastos por tope en la semana actual
  const [expandedTopeId, setExpandedTopeId] = useState(null)

  // ===== CÁLCULOS SEMANA ACTUAL =====
  // Gastos de la semana actual asociados a topes
  const weeklyExpenses = useMemo(() => {
    return expenses.filter(e => {
      if (e.expense_type === 'ingreso') return false
      if (!e.tope_id) return false
      const expDate = e.expense_date
      return expDate >= currentWeek.fromYMD && expDate <= currentWeek.toYMD
    })
  }, [expenses, currentWeek])

  // Progreso por cada tope en la semana actual
  const topesActual = useMemo(() => {
    return topes.map(t => {
      const topeExps = weeklyExpenses.filter(e => e.tope_id === t.id)
      const totalSpent = topeExps.reduce((sum, e) => sum + Number(e.amount || 0), 0)
      const weeklyAmount = Number(t.weekly_amount || 0)
      const percent = weeklyAmount > 0 ? (totalSpent / weeklyAmount) * 100 : 0
      const isExceeded = totalSpent > weeklyAmount
      const diff = Math.abs(weeklyAmount - totalSpent)

      return {
        ...t,
        weeklyAmount,
        totalSpent,
        percent,
        isExceeded,
        diff,
        expenses: topeExps
      }
    })
  }, [topes, weeklyExpenses])

  // ===== CÁLCULOS HISTORIAL =====
  // Validar orden de semanas: fromWeek es más antigua (índice mayor en availableWeeks) y toWeek más reciente (índice menor)
  const minIdx = Math.min(historyFromWeekIndex, historyToWeekIndex)
  const maxIdx = Math.max(historyFromWeekIndex, historyToWeekIndex)
  
  const fromWeekObj = availableWeeks[maxIdx] || availableWeeks[0] // más antigua
  const toWeekObj = availableWeeks[minIdx] || availableWeeks[0] // más reciente
  
  // Cantidad de semanas seleccionadas
  const numWeeksSelected = maxIdx - minIdx + 1

  // Gastos en el rango del historial
  const historyExpenses = useMemo(() => {
    return expenses.filter(e => {
      if (e.expense_type === 'ingreso') return false
      if (!e.tope_id) return false
      const expDate = e.expense_date
      return expDate >= fromWeekObj.from && expDate <= toWeekObj.to
    })
  }, [expenses, fromWeekObj, toWeekObj])

  // Resumen del historial por tope
  const topesHistory = useMemo(() => {
    let list = topes
    if (selectedTopeFilter !== 'all') {
      list = topes.filter(t => t.id === selectedTopeFilter)
    }

    return list.map(t => {
      const topeExps = historyExpenses.filter(e => e.tope_id === t.id)
      const totalSpent = topeExps.reduce((sum, e) => sum + Number(e.amount || 0), 0)
      const baseWeekly = Number(t.weekly_amount || 0)
      // Como pidió el usuario: ej si el tope es 300 y elige 2 semanas entonces ese tope es de 600
      const totalBudgetPeriod = baseWeekly * numWeeksSelected
      const percent = totalBudgetPeriod > 0 ? (totalSpent / totalBudgetPeriod) * 100 : 0
      const isExceeded = totalSpent > totalBudgetPeriod
      const diff = Math.abs(totalBudgetPeriod - totalSpent)

      // Desglose semana a semana dentro del rango
      const weeksBreakdown = []
      for (let i = minIdx; i <= maxIdx; i++) {
        const w = availableWeeks[i]
        const wExps = topeExps.filter(e => e.expense_date >= w.from && e.expense_date <= w.to)
        const wSpent = wExps.reduce((sum, e) => sum + Number(e.amount || 0), 0)
        weeksBreakdown.push({
          weekLabel: w.shortLabel,
          from: w.from,
          to: w.to,
          spent: wSpent,
          budget: baseWeekly,
          exceeded: wSpent > baseWeekly
        })
      }

      return {
        ...t,
        baseWeekly,
        numWeeks: numWeeksSelected,
        totalBudgetPeriod,
        totalSpent,
        percent,
        isExceeded,
        diff,
        expenses: topeExps,
        weeksBreakdown
      }
    })
  }, [topes, historyExpenses, selectedTopeFilter, numWeeksSelected, minIdx, maxIdx, availableWeeks])

  // ===== HANDLERS TOPES =====
  function handleOpenCreateTope() {
    setTopeForm({ name: '', weekly_amount: '' })
    setTopeModal({ open: true, edit: null })
  }

  function handleOpenEditTope(t) {
    setTopeForm({ name: t.name, weekly_amount: String(t.weekly_amount) })
    setTopeModal({ open: true, edit: t })
  }

  async function handleSaveTope() {
    if (!topeForm.name.trim()) return toast('Ingrese un nombre para el tope', 'warning')
    const amt = parseFloat(topeForm.weekly_amount)
    if (isNaN(amt) || amt <= 0) return toast('Ingrese un monto semanal válido mayor a 0', 'warning')

    setSavingTope(true)
    try {
      if (topeModal.edit) {
        await dbUpdateTope(topeModal.edit.id, {
          name: topeForm.name.trim(),
          weekly_amount: amt
        })
        await dbLogActivity(tenantId, userInfo?.id, 'update', 'tope', topeModal.edit.id, { name: topeForm.name, weekly_amount: amt })
        toast('Tope modificado correctamente', 'success')
      } else {
        const created = await dbCreateTope({
          tenant_id: tenantId,
          user_id: userInfo?.id,
          name: topeForm.name.trim(),
          weekly_amount: amt
        })
        await dbLogActivity(tenantId, userInfo?.id, 'create', 'tope', created.id, { name: topeForm.name, weekly_amount: amt })
        toast('Tope semanal creado exitosamente', 'success')
      }
      setTopeModal({ open: false, edit: null })
      if (onRefresh) onRefresh()
    } catch (err) {
      toast(`Error al guardar tope: ${err.message}`, 'danger')
    } finally {
      setSavingTope(false)
    }
  }

  async function handleDeleteTope(t) {
    if (!confirm(`¿Eliminar el tope "${t.name}"? Los gastos existentes no se borrarán, solo quedarán sin tope asignado.`)) return
    try {
      await dbDeleteTope(t.id)
      await dbLogActivity(tenantId, userInfo?.id, 'delete', 'tope', t.id, { name: t.name })
      toast('Tope eliminado', 'success')
      if (onRefresh) onRefresh()
    } catch (err) {
      toast(`Error al eliminar tope: ${err.message}`, 'danger')
    }
  }

  // ===== HANDLERS GASTOS ASOCIADOS AL TOPE =====
  function handleOpenEditExpense(exp) {
    setEditExpenseForm({
      amount: String(exp.amount),
      description: exp.description || '',
      tope_id: exp.tope_id || '',
      expense_date: exp.expense_date || ''
    })
    setEditExpenseModal({ open: true, expense: exp })
  }

  async function handleSaveEditExpense() {
    const amt = parseFloat(editExpenseForm.amount)
    if (isNaN(amt) || amt <= 0) return toast('Monto inválido', 'warning')

    setSavingExpense(true)
    try {
      await dbUpdateExpense(editExpenseModal.expense.id, {
        amount: amt,
        description: editExpenseForm.description?.trim(),
        tope_id: editExpenseForm.tope_id || null,
        expense_date: editExpenseForm.expense_date
      })
      await dbLogActivity(tenantId, userInfo?.id, 'update', 'expense', editExpenseModal.expense.id, { amount: amt, tope_id: editExpenseForm.tope_id })
      toast('Gasto modificado correctamente', 'success')
      setEditExpenseModal({ open: false, expense: null })
      if (onRefresh) onRefresh()
    } catch (err) {
      toast(`Error al modificar gasto: ${err.message}`, 'danger')
    } finally {
      setSavingExpense(false)
    }
  }

  async function handleDeleteExpenseDirect(id) {
    if (!confirm('¿Eliminar este gasto registrado?')) return
    try {
      await dbDeleteExpense(id)
      await dbLogActivity(tenantId, userInfo?.id, 'delete', 'expense', id)
      toast('Gasto eliminado', 'success')
      if (onRefresh) onRefresh()
    } catch (err) {
      toast(`Error al eliminar: ${err.message}`, 'danger')
    }
  }

  return (
    <div className="fade-in">
      {/* Sub-navegación: Topes Actuales vs Historial */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: '12px', marginBottom: '20px',
        background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border)'
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setSubTab('actual')}
            className={`btn ${subTab === 'actual' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.85rem', padding: '8px 14px' }}
          >
            <Target size={15} /> Topes Esta Semana
          </button>
          <button
            onClick={() => setSubTab('historial')}
            className={`btn ${subTab === 'historial' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.85rem', padding: '8px 14px' }}
          >
            <History size={15} /> Historial de Topes
          </button>
        </div>

        <button onClick={handleOpenCreateTope} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
          <Plus size={16} /> Crear Nuevo Tope
        </button>
      </div>

      {/* ===== VISTA 1: TOPES SEMANA ACTUAL ===== */}
      {subTab === 'actual' && (
        <div>
          {/* Banner de semana actual */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)',
            padding: '12px 16px', borderRadius: '10px', marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Calendar size={18} color="#3b82f6" />
              <div>
                <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>Semana en curso:</strong>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginLeft: '6px' }}>
                  {formatDate(currentWeek.fromYMD)} al {formatDate(currentWeek.toYMD)}
                </span>
              </div>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '4px 10px', borderRadius: '6px' }}>
              🔄 Se reinicia automáticamente cada lunes
            </span>
          </div>

          {topesActual.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '50px 20px', background: 'var(--bg-secondary)',
              borderRadius: '12px', border: '1px dashed var(--border)'
            }}>
              <Target size={48} color="var(--text-muted)" style={{ marginBottom: '12px', opacity: 0.6 }} />
              <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>No hay topes de gasto configurados</h3>
              <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Creá tu primer tope semanal (por ejemplo: "Gastos Semanales" o "Insumos") para controlar el presupuesto mientras cargás gastos.
              </p>
              <button onClick={handleOpenCreateTope} className="btn btn-primary">
                <Plus size={16} /> Crear Tope Semanal
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {topesActual.map(t => {
                const isExpanded = expandedTopeId === t.id
                // Color de la barra según porcentaje
                const barColor = t.percent > 100 ? '#ef4444' : t.percent >= 75 ? '#f59e0b' : '#10b981'
                const displayPercent = Math.min(100, Math.round(t.percent))

                return (
                  <div
                    key={t.id}
                    style={{
                      background: 'var(--bg-secondary)',
                      borderRadius: '14px',
                      border: `1px solid ${t.isExceeded ? 'rgba(239, 68, 68, 0.4)' : 'var(--border)'}`,
                      overflow: 'hidden',
                      boxShadow: t.isExceeded ? '0 0 15px rgba(239, 68, 68, 0.08)' : 'none',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {/* Header del Tope */}
                    <div style={{ padding: '18px 20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                            <span style={{
                              width: '32px', height: '32px', borderRadius: '8px',
                              background: t.isExceeded ? 'rgba(239,68,68,0.15)' : 'var(--accent-soft)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: t.isExceeded ? '#ef4444' : 'var(--accent)'
                            }}>
                              <Target size={18} />
                            </span>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)' }}>{t.name}</h3>
                            {t.isExceeded && (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                background: '#ef4444', color: 'white', padding: '3px 8px',
                                borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700
                              }}>
                                <AlertTriangle size={12} /> ¡SUPERADO!
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Tope semanal asignado: <strong>{formatMoney(t.weeklyAmount)}</strong>
                          </div>
                        </div>

                        {/* Botones de acción */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {onOpenExpenseModalWithTope && (
                            <button
                              onClick={() => onOpenExpenseModalWithTope(t.id)}
                              className="btn btn-secondary btn-sm"
                              title="Registrar gasto para este tope"
                              style={{ padding: '6px 12px' }}
                            >
                              <Plus size={14} /> Cargar Gasto
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEditTope(t)}
                            className="btn btn-secondary btn-sm"
                            title="Modificar tope"
                            style={{ padding: '6px 10px' }}
                          >
                            <Edit2 size={14} /> Modificar
                          </button>
                          <button
                            onClick={() => handleDeleteTope(t)}
                            className="btn btn-secondary btn-sm"
                            title="Eliminar tope"
                            style={{ padding: '6px 10px', color: 'var(--danger)' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Métricas de Gasto y Barra de Progreso */}
                      <div style={{ marginTop: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
                          <div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Gastado esta semana:</span>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: barColor }}>
                              {formatMoney(t.totalSpent)}
                              <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '6px' }}>
                                / {formatMoney(t.weeklyAmount)}
                              </span>
                            </div>
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: barColor }}>
                              {Math.round(t.percent)}%
                            </div>
                            <div style={{ fontSize: '0.8rem', color: t.isExceeded ? '#ef4444' : 'var(--text-muted)', fontWeight: 600 }}>
                              {t.isExceeded ? `Excedido por ${formatMoney(t.diff)}` : `Disponible: ${formatMoney(t.diff)}`}
                            </div>
                          </div>
                        </div>

                        {/* Barra de progreso */}
                        <div style={{
                          height: '12px', background: 'var(--bg-tertiary)',
                          borderRadius: '6px', overflow: 'hidden', position: 'relative'
                        }}>
                          <div style={{
                            width: `${displayPercent}%`,
                            height: '100%',
                            background: barColor,
                            borderRadius: '6px',
                            transition: 'width 0.4s ease'
                          }} />
                        </div>
                      </div>

                      {/* Botón ver detalles de gastos */}
                      <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {t.expenses.length} {t.expenses.length === 1 ? 'gasto registrado' : 'gastos registrados'} esta semana
                        </span>
                        <button
                          onClick={() => setExpandedTopeId(isExpanded ? null : t.id)}
                          style={{
                            background: 'transparent', border: 'none', color: 'var(--accent)',
                            fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '4px'
                          }}
                        >
                          {isExpanded ? <>Ocultar gastos <ChevronUp size={14} /></> : <>Ver gastos de la semana <ChevronDown size={14} /></>}
                        </button>
                      </div>
                    </div>

                    {/* Desplegable: Gastos asociados a este tope en la semana */}
                    {isExpanded && (
                      <div style={{
                        borderTop: '1px solid var(--border)',
                        background: 'var(--bg-tertiary)',
                        padding: '16px 20px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            Detalle de gastos vinculados a "{t.name}" (Semana actual)
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Hacé clic en editar si ingresaste plata por error
                          </span>
                        </div>

                        {t.expenses.length === 0 ? (
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '10px 0' }}>
                            Aún no hay gastos registrados con este tope esta semana.
                          </div>
                        ) : (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textAlign: 'left' }}>
                                  <th style={{ padding: '8px 6px' }}>Fecha</th>
                                  <th style={{ padding: '8px 6px' }}>Categoría / Detalle</th>
                                  <th style={{ padding: '8px 6px' }}>Método</th>
                                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Monto</th>
                                  <th style={{ padding: '8px 6px', textAlign: 'center' }}>Acciones</th>
                                </tr>
                              </thead>
                              <tbody>
                                {t.expenses.map(exp => (
                                  <tr key={exp.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{formatDate(exp.expense_date)}</td>
                                    <td style={{ padding: '8px 6px' }}>
                                      <strong>{exp.expense_categories?.name || 'Gasto'}</strong>
                                      {exp.description && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{exp.description}</div>}
                                    </td>
                                    <td style={{ padding: '8px 6px' }}>
                                      <span style={{
                                        fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px',
                                        background: exp.payment_method === 'transferencia' ? 'rgba(0,158,227,0.1)' : 'rgba(16,185,129,0.1)',
                                        color: exp.payment_method === 'transferencia' ? '#009EE3' : '#10b981'
                                      }}>
                                        {exp.payment_method === 'transferencia' ? '📲 Transf.' : '💵 Efectivo'}
                                      </span>
                                    </td>
                                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: 'var(--danger)' }}>
                                      {formatMoney(exp.amount)}
                                    </td>
                                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                        <button
                                          onClick={() => handleOpenEditExpense(exp)}
                                          className="btn btn-secondary btn-sm"
                                          style={{ padding: '4px 8px' }}
                                          title="Modificar monto o tope"
                                        >
                                          <Edit2 size={12} />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteExpenseDirect(exp.id)}
                                          className="btn btn-danger btn-sm"
                                          style={{ padding: '4px 8px' }}
                                          title="Eliminar gasto"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== VISTA 2: HISTORIAL DE TOPES ===== */}
      {subTab === 'historial' && (
        <div>
          {/* Controles de selección de rango de semanas */}
          <div style={{
            background: 'var(--bg-secondary)', padding: '16px 20px', borderRadius: '12px',
            border: '1px solid var(--border)', marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <History size={18} color="var(--accent)" />
              <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>
                Filtro de Historial por Semanas
              </h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Desde semana:
                </label>
                <select
                  value={historyFromWeekIndex}
                  onChange={e => setHistoryFromWeekIndex(Number(e.target.value))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)' }}
                >
                  {availableWeeks.map(w => (
                    <option key={w.index} value={w.index}>{w.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Hasta semana:
                </label>
                <select
                  value={historyToWeekIndex}
                  onChange={e => setHistoryToWeekIndex(Number(e.target.value))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)' }}
                >
                  {availableWeeks.map(w => (
                    <option key={w.index} value={w.index}>{w.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Filtrar por Tope:
                </label>
                <select
                  value={selectedTopeFilter}
                  onChange={e => setSelectedTopeFilter(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)' }}
                >
                  <option value="all">Todos los topes</option>
                  {topes.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Resumen del Rango Seleccionado */}
            <div style={{
              marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ background: 'var(--accent-soft)', color: 'var(--accent)', padding: '4px 10px', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem' }}>
                  {numWeeksSelected} {numWeeksSelected === 1 ? 'semana seleccionada' : 'semanas seleccionadas'}
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Período: {formatDate(fromWeekObj.from)} al {formatDate(toWeekObj.to)}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                💡 Ejemplo: Tope semanal × {numWeeksSelected} semanas = Presupuesto acumulado
              </div>
            </div>
          </div>

          {/* Tarjetas de Historial */}
          {topesHistory.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              No hay topes para mostrar en este período.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {topesHistory.map(t => {
                const barColor = t.percent > 100 ? '#ef4444' : t.percent >= 75 ? '#f59e0b' : '#10b981'
                const displayPercent = Math.min(100, Math.round(t.percent))

                return (
                  <div
                    key={t.id}
                    style={{
                      background: 'var(--bg-secondary)', borderRadius: '14px',
                      border: `1px solid ${t.isExceeded ? 'rgba(239, 68, 68, 0.4)' : 'var(--border)'}`,
                      padding: '20px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>{t.name}</h3>
                          {t.isExceeded && (
                            <span style={{ background: '#ef4444', color: 'white', padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700 }}>
                              EXCEDIDO
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          Tope base: <strong>{formatMoney(t.baseWeekly)} / semana</strong> × {t.numWeeks} {t.numWeeks === 1 ? 'semana' : 'semanas'} = Presupuesto Total:{' '}
                          <strong style={{ color: 'var(--text-primary)' }}>{formatMoney(t.totalBudgetPeriod)}</strong>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: barColor }}>
                          {formatMoney(t.totalSpent)}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: t.isExceeded ? '#ef4444' : 'var(--text-muted)', fontWeight: 600 }}>
                          {t.isExceeded ? `Sobrepasado por ${formatMoney(t.diff)}` : `A favor: ${formatMoney(t.diff)}`}
                        </div>
                      </div>
                    </div>

                    {/* Barra de progreso global del período */}
                    <div style={{ marginTop: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Uso del presupuesto del período:</span>
                        <span style={{ fontWeight: 700, color: barColor }}>{Math.round(t.percent)}%</span>
                      </div>
                      <div style={{ height: '10px', background: 'var(--bg-tertiary)', borderRadius: '5px', overflow: 'hidden' }}>
                        <div style={{ width: `${displayPercent}%`, height: '100%', background: barColor, borderRadius: '5px' }} />
                      </div>
                    </div>

                    {/* Desglose Semana a Semana */}
                    <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>
                        Desglose por semana en el rango:
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                        {t.weeksBreakdown.map((w, idx) => (
                          <div
                            key={idx}
                            style={{
                              background: 'var(--bg-tertiary)', padding: '10px 12px', borderRadius: '8px',
                              border: `1px solid ${w.exceeded ? 'rgba(239, 68, 68, 0.3)' : 'var(--border)'}`
                            }}
                          >
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{w.weekLabel}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: w.exceeded ? '#ef4444' : 'var(--text-primary)' }}>
                                {formatMoney(w.spent)}
                              </span>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                / {formatMoney(w.budget)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== MODAL: CREAR / EDITAR TOPE ===== */}
      <Modal
        open={topeModal.open}
        onClose={() => !savingTope && setTopeModal({ open: false, edit: null })}
        title={topeModal.edit ? 'Modificar Tope Semanal' : 'Nuevo Tope Semanal'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Nombre del Tope *</label>
            <input
              type="text"
              value={topeForm.name}
              onChange={e => setTopeForm({ ...topeForm, name: e.target.value })}
              placeholder="Ej: Insumos Semanales, Mercadería, Gastos Generales..."
              disabled={savingTope}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Monto del Tope Semanal ($) *</label>
            <input
              type="number"
              min="0"
              step="1"
              value={topeForm.weekly_amount}
              onChange={e => setTopeForm({ ...topeForm, weekly_amount: e.target.value })}
              placeholder="Ej: 50000"
              disabled={savingTope}
            />
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Este valor es el límite presupuestado por semana. Cada lunes el avance comenzará en $0.
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button
              onClick={handleSaveTope}
              disabled={savingTope}
              className="btn btn-primary"
              style={{ flex: 1 }}
            >
              {savingTope ? 'Guardando...' : topeModal.edit ? 'Actualizar Tope' : 'Crear Tope'}
            </button>
            <button
              onClick={() => setTopeModal({ open: false, edit: null })}
              disabled={savingTope}
              className="btn btn-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      </Modal>

      {/* ===== MODAL: EDITAR GASTO ASOCIADO AL TOPE ===== */}
      <Modal
        open={editExpenseModal.open}
        onClose={() => !savingExpense && setEditExpenseModal({ open: false, expense: null })}
        title="Modificar Gasto del Tope"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
            Modificá el monto si se ingresó dinero que no se debía, o reasigná el tope.
          </p>

          <div className="form-group">
            <label className="form-label">Monto ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={editExpenseForm.amount}
              onChange={e => setEditExpenseForm({ ...editExpenseForm, amount: e.target.value })}
              disabled={savingExpense}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Tope Asignado</label>
            <select
              value={editExpenseForm.tope_id}
              onChange={e => setEditExpenseForm({ ...editExpenseForm, tope_id: e.target.value })}
              disabled={savingExpense}
            >
              <option value="">(Sin tope / Desvincular)</option>
              {topes.map(t => (
                <option key={t.id} value={t.id}>{t.name} (Tope: {formatMoney(t.weekly_amount)})</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Fecha del gasto</label>
            <input
              type="date"
              value={editExpenseForm.expense_date}
              onChange={e => setEditExpenseForm({ ...editExpenseForm, expense_date: e.target.value })}
              disabled={savingExpense}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Descripción</label>
            <input
              type="text"
              value={editExpenseForm.description}
              onChange={e => setEditExpenseForm({ ...editExpenseForm, description: e.target.value })}
              disabled={savingExpense}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button
              onClick={handleSaveEditExpense}
              disabled={savingExpense}
              className="btn btn-primary"
              style={{ flex: 1 }}
            >
              {savingExpense ? 'Guardando...' : 'Guardar Cambios'}
            </button>
            <button
              onClick={() => setEditExpenseModal({ open: false, expense: null })}
              disabled={savingExpense}
              className="btn btn-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
