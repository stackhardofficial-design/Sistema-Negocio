import { useState, useEffect } from 'react'
import { useApp } from '../../lib/AppContext'
import { sb, dbGetSales, dbGetProducts, dbGetDebtors } from '../../lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import { 
  TrendingUp, ShoppingCart, Package, AlertTriangle,
  DollarSign, Percent, LayoutDashboard, RefreshCw
, BarChart2 } from 'lucide-react'

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const PIE_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899']

function formatMoney(n) {
  return `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
}

export default function DashboardModule() {
  const { tenantId } = useApp()
  const [loading, setLoading] = useState(true)
  const [sales, setSales] = useState([])
  const [products, setProducts] = useState([])
  const [debtors, setDebtors] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  
  // Filtros de tiempo
  const [timeFilter, setTimeFilter] = useState('6months') // today, week, month, 6months, custom
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  async function load(showLoading = true) {
    if (!tenantId) { setLoading(false); return; }
    if (showLoading) setRefreshing(true)

    // Calculamos la fecha desde según el filtro para la base de datos
    const now = new Date()
    let fromDate = new Date()
    let toDate = new Date()
    
    if (timeFilter === 'today') {
      fromDate.setHours(0, 0, 0, 0)
    } else if (timeFilter === 'week') {
      fromDate.setDate(now.getDate() - 7)
    } else if (timeFilter === 'month') {
      fromDate.setMonth(now.getMonth() - 1)
    } else if (timeFilter === '6months') {
      fromDate.setMonth(now.getMonth() - 5)
      fromDate.setDate(1)
      fromDate.setHours(0, 0, 0, 0)
    } else if (timeFilter === 'custom') {
      fromDate = customFrom ? new Date(customFrom) : new Date(0)
      toDate = customTo ? new Date(customTo) : new Date()
      toDate.setHours(23, 59, 59, 999)
    }

    // Asegurarnos de traer SIEMPRE los datos de hoy para las tarjetas de KPIs principales
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const fetchFrom = fromDate < today ? fromDate : today

    try {
      const [s, p, d] = await Promise.all([
        dbGetSales(tenantId, { 
          dateFrom: fetchFrom.toISOString(), 
          dateTo: (timeFilter === 'custom' && customTo) ? toDate.toISOString() : undefined,
          status: 'completed' 
        }),
        dbGetProducts(tenantId),
        dbGetDebtors(tenantId, { includeSettled: false })
      ])
      setSales(s)
      setProducts(p)
      setDebtors(d)
    } catch (err) {
      console.error('Error cargando dashboard', err)
    } finally {
      if (showLoading) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }

  useEffect(() => {
    load()
    if (!tenantId) return

    const channel = sb.channel('dashboard_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales', filter: `tenant_id=eq.${tenantId}` }, () => load(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `tenant_id=eq.${tenantId}` }, () => load(false))
      .subscribe()

    return () => { sb.removeChannel(channel) }
  }, [tenantId, timeFilter, customFrom, customTo])

  // ===== Computar KPIs =====
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const todaySales = sales.filter(s => new Date(s.created_at) >= today)
  const totalVentaHoy = todaySales.reduce((acc, s) => acc + (s.total_amount || 0), 0)
  const totalGananciaHoy = todaySales.reduce((acc, s) => acc + ((s.total_amount || 0) - (s.total_cost || 0)), 0)
  const totalTransacciones = todaySales.length
  const lowStockProducts = products.filter(p => p.stock !== null && p.min_stock !== null && p.stock <= p.min_stock)

  // Desglose de ventas de hoy por método de pago
  const ventasEfectivo = todaySales.filter(s => !s.payment_method || s.payment_method === 'efectivo').reduce((a, s) => a + (s.total_amount || 0), 0)
  const ventasTransferencia = todaySales.filter(s => s.payment_method === 'transferencia').reduce((a, s) => a + (s.total_amount || 0), 0)
  const ventasDeudor = todaySales.filter(s => s.payment_method === 'deudor').reduce((a, s) => a + (s.total_amount || 0), 0)
  const totalDeudaActiva = debtors.filter(d => !d.is_settled).reduce((a, d) => a + (d.total_debt || 0), 0)

  // ===== Filtrar ventas según el rango elegido (para los gráficos) =====
  let filteredSales = sales
  let fromDate = new Date()
  if (timeFilter === 'today') {
    fromDate.setHours(0, 0, 0, 0)
    filteredSales = sales.filter(s => new Date(s.created_at) >= fromDate)
  } else if (timeFilter === 'week') {
    fromDate.setDate(today.getDate() - 7)
    filteredSales = sales.filter(s => new Date(s.created_at) >= fromDate)
  } else if (timeFilter === 'month') {
    fromDate.setMonth(today.getMonth() - 1)
    filteredSales = sales.filter(s => new Date(s.created_at) >= fromDate)
  } else if (timeFilter === '6months') {
    fromDate.setMonth(today.getMonth() - 5)
    fromDate.setDate(1)
    fromDate.setHours(0, 0, 0, 0)
    filteredSales = sales.filter(s => new Date(s.created_at) >= fromDate)
  } else if (timeFilter === 'custom') {
    const cf = customFrom ? new Date(customFrom) : new Date(0)
    const ct = customTo ? new Date(customTo) : new Date()
    ct.setHours(23, 59, 59, 999)
    fromDate = cf
    filteredSales = sales.filter(s => {
      const d = new Date(s.created_at)
      return d >= cf && d <= ct
    })
  }

  // ===== Generar datos para el gráfico de barras =====
  // Si es semestral, agrupamos por mes. Sino, por días.
  let chartData = []
  if (timeFilter === '6months') {
    chartData = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth() - (5 - i), 1)
      const nextD = new Date(today.getFullYear(), today.getMonth() - (5 - i) + 1, 1)
      const monthSales = filteredSales.filter(s => {
        const sd = new Date(s.created_at)
        return sd >= d && sd < nextD
      })
      return {
        label: MONTHS[d.getMonth()],
        ventas: monthSales.reduce((a, s) => a + (s.total_amount || 0), 0),
        ganancia: monthSales.reduce((a, s) => a + ((s.total_amount || 0) - (s.total_cost || 0)), 0)
      }
    })
  } else {
    // Agrupar por días
    // Calcular días de diferencia
    const diffTime = Math.abs(today - fromDate)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    const daysToIterate = timeFilter === 'today' ? 1 : (diffDays > 31 && timeFilter !== 'custom' ? 31 : diffDays)
    
    // Generar un array de días
    const dailyMap = {}
    filteredSales.forEach(s => {
      const d = new Date(s.created_at)
      const dayKey = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`
      if (!dailyMap[dayKey]) dailyMap[dayKey] = { ventas: 0, ganancia: 0 }
      dailyMap[dayKey].ventas += (s.total_amount || 0)
      dailyMap[dayKey].ganancia += ((s.total_amount || 0) - (s.total_cost || 0))
    })

    // Llenar los días vacíos
    let startD = new Date(fromDate)
    let endD = timeFilter === 'custom' && customTo ? new Date(customTo) : new Date()
    if (timeFilter === 'today') {
      startD = new Date(today)
      endD = new Date(today)
    }
    
    let currentD = new Date(startD)
    while (currentD <= endD) {
      const dayKey = `${currentD.getDate().toString().padStart(2, '0')}/${(currentD.getMonth() + 1).toString().padStart(2, '0')}`
      chartData.push({
        label: dayKey,
        ventas: dailyMap[dayKey]?.ventas || 0,
        ganancia: dailyMap[dayKey]?.ganancia || 0
      })
      currentD.setDate(currentD.getDate() + 1)
    }
  }

  // ===== Categorías (pie chart) filtradas =====
  const catMap = {}
  filteredSales.forEach(sale => {
    (sale.sale_items || []).forEach(item => {
      const cat = item.products?.categories?.name || 'Sin categoría'
      catMap[cat] = (catMap[cat] || 0) + (item.quantity || 1)
    })
  })
  const categoryData = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }))

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: '10px', padding: '10px 14px', fontSize: '0.8rem'
      }}>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color }}>
            {p.name}: {formatMoney(p.value)}
          </div>
        ))}
      </div>
    )
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" />
      <span style={{ color: 'var(--text-muted)' }}>Cargando dashboard...</span>
    </div>
  )

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="module-header">
        <h1>
          <span className="icon-wrap"><LayoutDashboard size={20} /></span>
          Dashboard
        </h1>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select 
            className="input" 
            value={timeFilter} 
            onChange={e => setTimeFilter(e.target.value)}
            style={{ padding: '4px 8px', fontSize: '0.85rem' }}
          >
            <option value="today">Hoy</option>
            <option value="week">Última semana</option>
            <option value="month">Último mes</option>
            <option value="6months">Últimos 6 meses</option>
          </select>

          <button
            onClick={load}
            className="btn btn-secondary btn-sm"
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'spinning' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      <div className="module-content" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* KPI Grid */}
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <DollarSign size={20} />
            </div>
            <div className="kpi-label">Ventas hoy</div>
            <div className="kpi-value">{formatMoney(totalVentaHoy)}</div>
            <div className="kpi-sub">{totalTransacciones} transacciones</div>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
              <TrendingUp size={20} />
            </div>
            <div className="kpi-label">Ganancia hoy</div>
            <div className="kpi-value" style={{ color: 'var(--success)' }}>{formatMoney(totalGananciaHoy)}</div>
            <div className="kpi-sub">
              {totalVentaHoy > 0
                ? `${((totalGananciaHoy / totalVentaHoy) * 100).toFixed(1)}% margen`
                : '—'}
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon" style={{ background: 'var(--info-soft)', color: 'var(--info)' }}>
              <ShoppingCart size={20} />
            </div>
            <div className="kpi-label">Ticket promedio</div>
            <div className="kpi-value">
              {totalTransacciones > 0 ? formatMoney(totalVentaHoy / totalTransacciones) : '$0'}
            </div>
            <div className="kpi-sub">Por transacción</div>
          </div>

          <div className="kpi-card" style={{ borderColor: totalDeudaActiva > 0 ? 'rgba(239,68,68,0.3)' : 'var(--border)' }}>
            <div className="kpi-icon" style={{ background: totalDeudaActiva > 0 ? 'var(--danger-soft)' : 'var(--bg-tertiary)', color: totalDeudaActiva > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
              <BarChart2 size={20} />
            </div>
            <div className="kpi-label">Deuda activa</div>
            <div className="kpi-value" style={{ color: totalDeudaActiva > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
              {formatMoney(totalDeudaActiva)}
            </div>
            <div className="kpi-sub">{debtors.filter(d => !d.is_settled).length} deudores</div>
          </div>

          <div className="kpi-card" style={{ borderColor: lowStockProducts.length > 0 ? 'rgba(239,68,68,0.3)' : 'var(--border)' }}>
            <div className="kpi-icon" style={{ background: lowStockProducts.length > 0 ? 'var(--danger-soft)' : 'var(--bg-tertiary)', color: lowStockProducts.length > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
              <AlertTriangle size={20} />
            </div>
            <div className="kpi-label">Bajo stock</div>
            <div className="kpi-value" style={{ color: lowStockProducts.length > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
              {lowStockProducts.length}
            </div>
            <div className="kpi-sub">productos</div>
          </div>
        </div>

        {/* Desglose por método de pago (hoy) */}
        {totalTransacciones > 0 && (
          <div className="card fade-in" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '14px' }}>
              Desglose hoy por método de pago
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {[
                { label: '💵 Efectivo', value: ventasEfectivo, color: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)' },
                { label: '📲 Mercado Pago', value: ventasTransferencia, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)' },
                { label: '📒 Deudor', value: ventasDeudor, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)' },
              ].map(m => (
                <div key={m.label} style={{
                  flex: 1, minWidth: '120px',
                  padding: '12px 16px', borderRadius: '12px',
                  background: m.bg, border: `1px solid ${m.border}`
                }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: m.color, marginBottom: '4px' }}>{m.label}</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: m.color }}>{formatMoney(m.value)}</div>
                  {totalVentaHoy > 0 && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {((m.value / totalVentaHoy) * 100).toFixed(0)}% del total
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Charts Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
          {/* Bar Chart - Ventas */}
          <div className="card">
            <h3 style={{ marginBottom: '20px', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
              Ventas vs Ganancia ({
                timeFilter === '6months' ? 'últimos 6 meses' :
                timeFilter === 'today' ? 'hoy' :
                timeFilter === 'week' ? 'última semana' : 'último mes'
              })
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="ventas" name="Ventas" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="ganancia" name="Ganancia" fill="var(--success)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie Chart - Categorías */}
          <div className="card">
            <h3 style={{ marginBottom: '20px', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
              Categorías más vendidas
            </h3>
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val) => [val, 'Unidades']}
                    contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '0.8rem' }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={v => <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{v}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: '40px 0' }}>
                <Package size={32} />
                <p>Sin datos aún</p>
              </div>
            )}
          </div>
        </div>

        {/* Bajo stock */}
        {lowStockProducts.length > 0 && (
          <div className="card" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
            <h3 style={{ marginBottom: '16px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem' }}>
              <AlertTriangle size={16} /> Productos con bajo stock
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
              {lowStockProducts.slice(0, 8).map(p => (
                <div key={p.id} style={{
                  background: 'var(--danger-soft)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Min: {p.min_stock}</div>
                  </div>
                  <span style={{
                    fontSize: '1.1rem', fontWeight: 700, color: 'var(--danger)'
                  }}>{p.stock}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
