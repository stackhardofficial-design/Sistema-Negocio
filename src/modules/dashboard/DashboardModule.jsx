import { useState, useEffect } from 'react'
import { useApp } from '../../lib/AppContext'
import { dbGetSales, dbGetProducts } from '../../lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import {
  TrendingUp, ShoppingCart, Package, AlertTriangle,
  DollarSign, Percent, LayoutDashboard, RefreshCw
} from 'lucide-react'

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
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    if (!tenantId) return
    setRefreshing(true)
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString()
    const [s, p] = await Promise.all([
      dbGetSales(tenantId, { dateFrom: from, status: 'completed' }),
      dbGetProducts(tenantId)
    ])
    setSales(s)
    setProducts(p)
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { load() }, [tenantId])

  // ===== Computar KPIs =====
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const todaySales = sales.filter(s => new Date(s.created_at) >= today)
  const totalVentaHoy = todaySales.reduce((acc, s) => acc + (s.total_amount || 0), 0)
  const totalGananciaHoy = todaySales.reduce((acc, s) => acc + ((s.total_amount || 0) - (s.total_cost || 0)), 0)
  const totalTransacciones = todaySales.length
  const lowStockProducts = products.filter(p => p.stock !== null && p.min_stock !== null && p.stock <= p.min_stock)

  // ===== Ventas mensuales (últimos 6 meses) =====
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - (5 - i), 1)
    const nextD = new Date(today.getFullYear(), today.getMonth() - (5 - i) + 1, 1)
    const monthSales = sales.filter(s => {
      const sd = new Date(s.created_at)
      return sd >= d && sd < nextD && s.status === 'completed'
    })
    return {
      mes: MONTHS[d.getMonth()],
      ventas: monthSales.reduce((a, s) => a + (s.total_amount || 0), 0),
      ganancia: monthSales.reduce((a, s) => a + ((s.total_amount || 0) - (s.total_cost || 0)), 0)
    }
  })

  // ===== Categorías (pie chart) =====
  const catMap = {}
  sales.filter(s => s.status === 'completed').forEach(sale => {
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
        <button
          onClick={load}
          className="btn btn-secondary btn-sm"
          disabled={refreshing}
        >
          <RefreshCw size={14} className={refreshing ? 'spinning' : ''} />
          Actualizar
        </button>
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

        {/* Charts Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
          {/* Bar Chart - Ventas mensuales */}
          <div className="card">
            <h3 style={{ marginBottom: '20px', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
              📊 Ventas vs Ganancia (últimos 6 meses)
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthlyData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="mes" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
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
              🥧 Categorías más vendidas
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
