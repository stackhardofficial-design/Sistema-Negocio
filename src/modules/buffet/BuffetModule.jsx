import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../../lib/AppContext'
import {
  sb, dbGetBuffetProducts, dbCreateBuffetProduct, dbUpdateBuffetProduct,
  dbGetBuffetOrders, dbGetProducts, dbSetBuffetProductComponents,
  dbCreateBuffetOrder, dbUpdateBuffetOrderStatus, dbLogActivity,
  dbCreateSale, dbGetDebtors, dbAddDebtorCharge, dbUpdateProduct
} from '../../lib/supabase'
import Modal from '../../components/Modal'
import BarcodeScanner from '../../components/BarcodeScanner'
import { Coffee, Plus, Edit2, Clock, Utensils, User, Package as PkgIcon, AlertTriangle, X, Zap, ChevronDown, Minus } from 'lucide-react'

function formatMoney(n) { return `$${Number(n || 0).toLocaleString('es-AR')}` }
function formatTime(d) { return new Date(d).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) }

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    gain.gain.setValueAtTime(0.1, ctx.currentTime)
    osc.start()
    osc.stop(ctx.currentTime + 0.1)
  } catch(e) {
    console.error('Audio beep failed', e)
  }
}

const STATUS_LABELS = {
  pending: { label: 'Pendiente', color: 'var(--warning)', badge: 'badge-warning' },
  preparing: { label: 'Preparando', color: 'var(--info)', badge: 'badge-info' },
  ready: { label: 'Listo', color: 'var(--success)', badge: 'badge-success' },
  delivered: { label: 'Entregado', color: 'var(--text-muted)', badge: 'badge-neutral' }
}

// ===== SVG ICONS CUSTOM =====
function IconEfectivo({ active }) {
  const c = active ? '#10b981' : '#6b7280'
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="10" width="30" height="18" rx="3" fill={active ? 'rgba(16,185,129,0.15)' : 'rgba(107,114,128,0.1)'} stroke={c} strokeWidth="1.8"/>
      <circle cx="18" cy="19" r="5" stroke={c} strokeWidth="1.6" fill={active ? 'rgba(16,185,129,0.12)' : 'none'}/>
      <text x="18" y="23" textAnchor="middle" fontSize="7" fontWeight="bold" fill={c} fontFamily="system-ui">$</text>
      <rect x="5" y="12" width="4" height="3" rx="1" fill={c} opacity="0.5"/>
      <rect x="27" y="23" width="4" height="3" rx="1" fill={c} opacity="0.5"/>
      <line x1="5" y1="22" x2="9" y2="22" stroke={c} strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
      <line x1="27" y1="17" x2="31" y2="17" stroke={c} strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
    </svg>
  )
}

function IconMercadoPago({ active }) {
  const color = active ? '#009EE3' : '#6b7280'
  const opacityBg = active ? 0.15 : 0.05
  return (
    <svg width="42" height="36" viewBox="0 0 42 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="21" cy="18" rx="18" ry="12" fill={color} fillOpacity={opacityBg} />
      <ellipse cx="21" cy="18" rx="18" ry="12" stroke={color} strokeWidth="1.5" />
      <path d="M4 18 C4 11 11 6 21 6 C31 6 38 11 38 18 L4 18 Z" fill={color} fillOpacity="0.8" />
      <path d="M4 18 C4 25 11 30 21 30 C31 30 38 25 38 18 L4 18 Z" fill={color} fillOpacity="0.8" />
      <path d="M4 18 C6 18 10 16 16 16 L25 16 C32 16 36 18 38 18 C36 21 32 23 25 23 L16 23 C10 23 6 21 4 18 Z" fill={active ? '#ffffff' : 'var(--bg-secondary)'} />
      <path d="M6 18 C8 17 12 16.5 15 16.5 C16 16.5 18 17 19 18 C20 19 20.5 20 20 21 C19 22 17 22.5 15 22.5 C13 22.5 11 21.5 10 21" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M12 21.5 C13 22.5 15 22.5 16 21.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M14 22 C15 23 16 23 17 22" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M36 18 C34 17.5 30 17 27 17 C25 17 23 16.5 22 17.5 C21 18.5 22 19.5 23 20.5 C24 21.5 26 21.5 28 20.5 C29 19.5 30 19.5 31 19" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M30 17 L29 19" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M22 17.5 C20 18.5 21 20 22 20.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function IconMultipagos({ active }) {
  const c = active ? '#8b5cf6' : '#6b7280'
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="6" width="12" height="24" rx="2" fill={active ? 'rgba(139,92,246,0.15)' : 'rgba(107,114,128,0.1)'} stroke={c} strokeWidth="1.5" />
      <circle cx="10" cy="18" r="3" stroke={c} strokeWidth="1.2" />
      <rect x="20" y="12" width="12" height="12" rx="2" fill={active ? 'rgba(139,92,246,0.15)' : 'rgba(107,114,128,0.1)'} stroke={c} strokeWidth="1.5" />
      <path d="M16 18 H20" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
      <text x="10" y="19.5" textAnchor="middle" fontSize="5" fontWeight="bold" fill={c} fontFamily="system-ui">$</text>
      <text x="26" y="19.5" textAnchor="middle" fontSize="5" fontWeight="bold" fill={c} fontFamily="system-ui">MP</text>
    </svg>
  )
}

function IconDeudor({ active }) {
  const c = active ? '#f59e0b' : '#6b7280'
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="7" y="5" width="22" height="27" rx="3" fill={active ? 'rgba(245,158,11,0.12)' : 'rgba(107,114,128,0.08)'} stroke={c} strokeWidth="1.7"/>
      <line x1="7" y1="5" x2="7" y2="32" stroke={c} strokeWidth="3" strokeLinecap="round"/>
      <line x1="12" y1="13" x2="25" y2="13" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity="0.8"/>
      <line x1="12" y1="18" x2="25" y2="18" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity="0.8"/>
      <line x1="12" y1="23" x2="20" y2="23" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
      {active && (
        <>
          <circle cx="27" cy="9" r="5" fill="#f59e0b"/>
          <text x="27" y="12.5" textAnchor="middle" fontSize="6.5" fontWeight="bold" fill="#0f1117" fontFamily="system-ui">$</text>
        </>
      )}
    </svg>
  )
}

const PAYMENT_METHODS = [
  { id: 'efectivo', label: 'Efectivo', sublabel: 'Pago en mano', IconComponent: IconEfectivo, color: '#10b981', colorSoft: 'rgba(16,185,129,0.12)', colorBorder: 'rgba(16,185,129,0.45)' },
  { id: 'transferencia', label: 'Mercado Pago', sublabel: 'Transferencia', IconComponent: IconMercadoPago, color: '#009EE3', colorSoft: 'rgba(0,158,227,0.12)', colorBorder: 'rgba(0,158,227,0.45)' },
  { id: 'deudor', label: 'Deudor', sublabel: 'Cargar a cuenta', IconComponent: IconDeudor, color: '#f59e0b', colorSoft: 'rgba(245,158,11,0.12)', colorBorder: 'rgba(245,158,11,0.45)' },
  { id: 'multipagos', label: 'Multipagos', sublabel: 'Efectivo + Transf', IconComponent: IconMultipagos, color: '#8b5cf6', colorSoft: 'rgba(139,92,246,0.12)', colorBorder: 'rgba(139,92,246,0.45)' },
]

export default function BuffetModule() {
  const { tenantId, userInfo, toast, isAdmin } = useApp()
  const [tab, setTab] = useState('pedidos') // productos | pedidos
  const [buffetProducts, setBuffetProducts] = useState([])
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  const [productModal, setProductModal] = useState({ open: false, edit: null })
  const [productTypeTab, setProductTypeTab] = useState('simple') // 'simple' | 'combo'
  const [form, setForm] = useState({ name: '', barcode: '', price: '', cost_price: '', stock: '', min_stock: '', description: '', components: [] })
  const [saving, setSaving] = useState(false)

  const [orderModal, setOrderModal] = useState({ open: false })
  
  // VENTA LOGIC
  const [paymentMethod, setPaymentMethod] = useState(null)
  const [selectedDebtor, setSelectedDebtor] = useState(null)
  const [debtors, setDebtors] = useState([])
  const [loadingDebtors, setLoadingDebtors] = useState(false)
  const [debtorDropdownOpen, setDebtorDropdownOpen] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const quantityRef = useRef(1)
  const [selling, setSelling] = useState(false)
  const [orderCustomerName, setOrderCustomerName] = useState('')
  const [orderNotes, setOrderNotes] = useState('')

  const [kitchenAction, setKitchenAction] = useState({ open: false, type: '', group: null, amount: 1 })
  const [processingAction, setProcessingAction] = useState(false)

  async function handleKitchenAction() {
    setProcessingAction(true)
    try {
      const newStatus = 'delivered'
      const amountToProcess = Math.min(kitchenAction.amount, kitchenAction.group.count)
      
      const sortedOrders = [...kitchenAction.group.orders].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      
      let unitsLeft = amountToProcess
      const ordersToUpdate = []
      
      for (const o of sortedOrders) {
        if (unitsLeft <= 0) break
        const orderQty = o.buffet_order_items?.reduce((s, i) => s + i.quantity, 0) || 1
        ordersToUpdate.push(o.id)
        unitsLeft -= orderQty
      }

      await Promise.all(ordersToUpdate.map(id => dbUpdateBuffetOrderStatus(id, newStatus)))
      
      toast(`Se entregaron ${amountToProcess} ${kitchenAction.group.name}`, 'success')
      setKitchenAction({ open: false, type: '', group: null, amount: 1 })
      load(false)
    } catch (e) {
      toast('Error al actualizar pedidos', 'error')
    } finally {
      setProcessingAction(false)
    }
  }

  async function load(showLoading = true) {
    if (!tenantId) { setLoading(false); return; }
    if (showLoading) setLoading(true)
    const [bp, ord, stdProds] = await Promise.all([
      dbGetBuffetProducts(tenantId),
      dbGetBuffetOrders(tenantId),
      dbGetProducts(tenantId)
    ])
    setBuffetProducts(bp)
    setOrders(ord)
    setProducts(stdProds)
    if (showLoading) setLoading(false)
  }

  useEffect(() => {
    load()
    if (!tenantId) return
    const channel = sb.channel('buffet_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buffet_orders', filter: `tenant_id=eq.${tenantId}` }, () => load(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buffet_products', filter: `tenant_id=eq.${tenantId}` }, () => load(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buffet_product_components', filter: `tenant_id=eq.${tenantId}` }, () => load(false))
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [tenantId])

  useEffect(() => { quantityRef.current = quantity }, [quantity])

  useEffect(() => {
    if (paymentMethod === 'deudor' && tenantId) {
      setLoadingDebtors(true)
      dbGetDebtors(tenantId, { includeSettled: false })
        .then(data => setDebtors(data.filter(d => !d.is_settled)))
        .finally(() => setLoadingDebtors(false))
    }
  }, [paymentMethod, tenantId])

  function openCreate() {
    setForm({ name: '', barcode: '', price: '', cost_price: '', stock: '', min_stock: '', description: '', components: [] })
    setProductTypeTab('simple')
    setProductModal({ open: true, edit: null })
  }

  function openCreateCombo() {
    setForm({ name: '', barcode: '', price: '', cost_price: '', stock: '', min_stock: '', description: '', components: [] })
    setProductTypeTab('combo')
    setProductModal({ open: true, edit: null })
  }

  function openEdit(bp) {
    setForm({
      name: bp.name || '',
      barcode: bp.barcode || '',
      price: bp.price || '',
      cost_price: bp.cost_price || '',
      stock: bp.stock ?? '',
      min_stock: bp.min_stock ?? '',
      description: bp.description || '',
      components: (bp.buffet_product_components || []).map(c => ({
        is_buffet: !!c.component_buffet_product_id,
        component_id: c.component_buffet_product_id || c.component_product_id,
        quantity: c.quantity,
        name: c.products?.name || c.buffet_products?.name || 'Desconocido',
        cost: c.products?.cost_price || c.buffet_products?.cost_price || 0
      }))
    })
    setProductTypeTab(bp.is_composite ? 'combo' : 'simple')
    setProductModal({ open: true, edit: bp })
  }

  async function handleSave() {
    if (!form.name.trim()) return toast('El nombre es obligatorio', 'warning')
    if (!form.price) return toast('El precio es obligatorio', 'warning')
    
    if (form.barcode && form.barcode.trim()) {
      const existing = buffetProducts.find(p => p.barcode === form.barcode.trim() && p.id !== productModal.edit?.id)
      if (existing) {
        return toast(`El código de barras ya existe en el producto "${existing.name}". Usa otro.`, 'error')
      }
    }

    setSaving(true)
    try {
      const is_composite = productTypeTab === 'combo'
      const payload = {
        tenant_id: tenantId,
        name: form.name.trim(),
        barcode: form.barcode.trim() || null,
        price: parseFloat(form.price),
        cost_price: form.cost_price ? parseFloat(form.cost_price) : 0,
        stock: is_composite ? null : (form.stock !== '' ? parseInt(form.stock) : null),
        min_stock: is_composite ? null : (form.min_stock !== '' ? parseInt(form.min_stock) : null),
        description: form.description || null,
        is_composite,
        is_active: true
      }
      let id
      if (productModal.edit) {
        const updated = await dbUpdateBuffetProduct(productModal.edit.id, payload)
        id = updated.id
        await dbLogActivity(tenantId, userInfo?.id, 'update', 'buffet_product', id, { name: form.name.trim() })
        toast('Producto actualizado', 'success')
      } else {
        const created = await dbCreateBuffetProduct(payload)
        id = created.id
        await dbLogActivity(tenantId, userInfo?.id, 'create', 'buffet_product', id, { name: form.name.trim() })
        toast('Producto creado', 'success')
      }
      
      if (is_composite) {
        await dbSetBuffetProductComponents(id, form.components, tenantId)
        const totalCost = form.components.reduce((acc, c) => acc + (parseFloat(c.cost || 0) * c.quantity), 0)
        await dbUpdateBuffetProduct(id, { cost_price: totalCost })
      } else {
        await dbSetBuffetProductComponents(id, [], tenantId)
      }

      setProductModal({ open: false, edit: null })
      load(false)
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    } finally {
      setSaving(false)
    }
  }

  // Components helpers
  function addComponent() { setForm(f => ({ ...f, components: [...f.components, { is_buffet: false, component_id: '', quantity: 1, name: '', cost: 0 }] })) }
  function updateComponent(i, field, value) {
    setForm(f => {
      const updated = [...f.components]; updated[i] = { ...updated[i], [field]: value }
      if (field === 'component_id' || field === 'is_buffet') {
        const isBuf = updated[i].is_buffet
        const list = isBuf ? buffetProducts : products
        const found = list.find(p => p.id === updated[i].component_id)
        if (found) { updated[i].name = found.name; updated[i].cost = found.cost_price || 0 }
      }
      return { ...f, components: updated }
    })
  }
  function removeComponent(i) { setForm(f => ({ ...f, components: f.components.filter((_, idx) => idx !== i) })) }

  // ===== INSTANT SELL LOGIC =====
  const canScan = paymentMethod !== null && (paymentMethod !== 'deudor' || selectedDebtor !== null)

  const handleSellProduct = useCallback(async (bp) => {
    if (!bp || !tenantId || selling) return
    if (!canScan) {
      toast('Seleccioná el método de pago antes de agregar/escanear', 'warning')
      return
    }
    if (paymentMethod === 'deudor' && !selectedDebtor) {
      toast('Seleccioná un deudor', 'warning')
      return
    }

    const qty = Math.max(1, quantityRef.current)
    setSelling(true)

    try {
      // Validar stock (simple o componentes de combo)
      if (!bp.is_composite) {
        if (bp.stock !== null && bp.stock < qty) {
          toast(`El producto "${bp.name}" no tiene suficiente stock (${bp.stock} disp.)`, 'danger')
          setSelling(false)
          return
        }
      } else {
        // Es compuesto, verificar stock de cada componente
        for (const comp of (bp.buffet_product_components || [])) {
          const reqQty = (comp.quantity || 1) * qty
          if (comp.component_product_id && comp.products) {
            if (comp.products.stock !== null && comp.products.stock < reqQty) {
              toast(`El insumo "${comp.products.name}" no tiene suficiente stock (${comp.products.stock} disp.)`, 'danger')
              setSelling(false)
              return
            }
          } else if (comp.component_buffet_product_id && comp.buffet_products) {
            if (comp.buffet_products.stock !== null && comp.buffet_products.stock < reqQty) {
              toast(`El insumo de buffet "${comp.buffet_products.name}" no tiene suficiente stock (${comp.buffet_products.stock} disp.)`, 'danger')
              setSelling(false)
              return
            }
          }
        }
      }

      const total = bp.price * qty
      
      // Calcular costo real (si es compuesto, se calcula al momento o se usa el guardado, pero usamos getDisplayCost para asegurar precisión)
      const cost = getDisplayCost(bp) * qty

      // 1. Create Sale (Finances)
      const sale = await dbCreateSale(
        tenantId, userInfo?.id,
        [{ buffet_product_id: bp.id, quantity: qty, unit_price: bp.price, unit_cost: getDisplayCost(bp), subtotal: total }],
        total, cost,
        paymentMethod,
        paymentMethod === 'deudor' ? selectedDebtor.id : null
      )

      // 2. Debtor charge if applies
      if (paymentMethod === 'deudor' && selectedDebtor) {
        await dbAddDebtorCharge(selectedDebtor.id, total, `Buffet: ${qty}x ${bp.name}`, [{
          buffet_product_id: bp.id, product_name: bp.name, barcode: bp.barcode,
          quantity: qty, unit_price: bp.price, subtotal: total
        }], sale.id)
      }

      // 3. Create Buffet Order (Kitchen)
      const finalCustomerName = orderCustomerName.trim() || (paymentMethod === 'deudor' ? selectedDebtor.name : null)
      const finalNotes = orderNotes.trim() || null
      const order = await dbCreateBuffetOrder(tenantId, userInfo?.id, [{
        buffet_product_id: bp.id, quantity: qty, unit_price: bp.price, subtotal: total
      }], finalCustomerName, finalNotes)

      // 4. Descontar Stock
      if (!bp.is_composite && bp.stock !== null) {
        await dbUpdateBuffetProduct(bp.id, { stock: bp.stock - qty })
      } else if (bp.is_composite) {
        // Descontar a los componentes
        for (const comp of (bp.buffet_product_components || [])) {
          const reqQty = comp.quantity * qty
          if (comp.component_product_id && comp.products?.stock !== null) {
            await dbUpdateProduct(comp.component_product_id, { stock: comp.products.stock - reqQty })
          } else if (comp.component_buffet_product_id && comp.buffet_products?.stock !== null) {
            await dbUpdateBuffetProduct(comp.component_buffet_product_id, { stock: comp.buffet_products.stock - reqQty })
          }
        }
      }

      await dbLogActivity(tenantId, userInfo?.id, 'create', 'buffet_order', order.id, {
        product: bp.name, quantity: qty, total, payment_method: paymentMethod
      })

      playBeep()
      const methodLabel = paymentMethod === 'efectivo' ? '💵' : paymentMethod === 'transferencia' ? '📲' : paymentMethod === 'multipagos' ? '💳 Multipagos' : `📒 ${selectedDebtor?.name || ''}`
      toast(`${qty}x ${bp.name} enviado a la cocina · ${formatMoney(total)} · ${methodLabel}`, 'success')

      setQuantity(1)
      setPaymentMethod(null)
      setSelectedDebtor(null)
      setOrderModal({ open: false })
      setOrderCustomerName('')
      setOrderNotes('')
      load(false)
    } catch (err) {
      toast(`Error al registrar: ${err.message}`, 'danger')
    } finally {
      setSelling(false)
    }
  }, [tenantId, userInfo, selling, canScan, paymentMethod, selectedDebtor, orderCustomerName, orderNotes])

  async function changeOrderStatus(orderId, status) {
    try {
      await dbUpdateBuffetOrderStatus(orderId, status)
      await dbLogActivity(tenantId, userInfo?.id, 'update', 'buffet_order', orderId, { status })
      load()
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    }
  }

  const activeOrders = orders.filter(o => o.status !== 'delivered')

  const getDisplayCost = (p) => {
    if (p.is_composite) {
      return (p.buffet_product_components || []).reduce((acc, c) => {
        const cost = c.products?.cost_price || c.buffet_products?.cost_price || 0
        return acc + (cost * c.quantity)
      }, 0)
    }
    return p.cost_price || 0
  }

  const getDisplayStock = (p) => {
    if (p.is_composite) {
      if (!p.buffet_product_components || p.buffet_product_components.length === 0) return 0
      let minStock = Infinity
      for (const c of p.buffet_product_components) {
        const itemStock = c.products?.stock ?? c.buffet_products?.stock ?? 0
        const possible = Math.floor(itemStock / (c.quantity || 1))
        if (possible < minStock) minStock = possible
      }
      return minStock === Infinity ? 0 : minStock
    }
    return p.stock
  }

  const activeMethod = PAYMENT_METHODS.find(m => m.id === paymentMethod)

  const pendingGrouped = {}

  orders.forEach(o => {
    if (o.status === 'delivered') return
    const qty = o.buffet_order_items?.reduce((s, i) => s + i.quantity, 0) || 1
    const productName = o.buffet_order_items?.[0]?.buffet_products?.name || 'Desconocido'
    
    if (!pendingGrouped[productName]) {
      pendingGrouped[productName] = { count: 0, orders: [], name: productName }
    }
    pendingGrouped[productName].count += qty
    pendingGrouped[productName].orders.push(o)
  })

  const pendingList = Object.values(pendingGrouped).sort((a,b) => b.count - a.count)

  return (
    <div className="fade-in">
      <div className="module-header">
        <h1>
          <span className="icon-wrap"><Coffee size={20} /></span>
          Buffet
        </h1>
      </div>

      <div className="module-content">
        {/* Tabs and Actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px', alignItems: 'center' }}>
          {/* Tabs Container */}
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', background: 'var(--bg-secondary)', padding: '4px', borderRadius: 'var(--radius-md)' }}>
            {[
              { id: 'pedidos', label: `📋 Pedidos ${activeOrders.length > 0 ? `(${activeOrders.length})` : ''}` },
              { id: 'productos', label: <span style={{display:'flex', alignItems:'center', gap:'6px'}}><Utensils size={16}/> Productos Buffet</span> }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-secondary'}`}
                style={{ border: 'none' }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginLeft: 'auto' }}>
            {tab === 'pedidos' && (
              <button onClick={() => setOrderModal({ open: true })} className="btn btn-primary btn-sm">
                <Plus size={16} /> Nuevo pedido
              </button>
            )}
            {tab === 'productos' && (
              <>
                <button onClick={openCreate} className="btn btn-primary btn-sm">
                  <Plus size={16} /> Nuevo producto
                </button>
                <button onClick={openCreateCombo} className="btn btn-secondary btn-sm" style={{ border: '1px solid var(--accent)', color: 'var(--accent)' }}>
                  <PkgIcon size={16} /> Nuevo combo
                </button>
              </>
            )}
          </div>
        </div>

        {loading ? (
          <div className="empty-state"><div className="spinner" /></div>
        ) : tab === 'productos' ? (
          /* ===== PRODUCTOS BUFFET (TABLE VIEW) ===== */
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Código</th>
                  <th style={{ textAlign: 'right' }}>Precio</th>
                  <th style={{ textAlign: 'right' }}>Costo</th>
                  <th style={{ textAlign: 'right' }}>Stock</th>
                  <th>Tipo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {buffetProducts.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">
                        <Coffee size={32} />
                        <p>Sin productos en buffet</p>
                      </div>
                    </td>
                  </tr>
                ) : buffetProducts.map(bp => {
                  const dispStock = getDisplayStock(bp)
                  const isLowStock = !bp.is_composite && bp.stock !== null && bp.min_stock !== null && bp.stock <= bp.min_stock
                  return (
                    <tr key={bp.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{bp.name}</div>
                        {bp.description && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{bp.description}</div>}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {bp.barcode || '—'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }}>{formatMoney(bp.price)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{formatMoney(getDisplayCost(bp))}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ color: isLowStock ? 'var(--danger)' : 'var(--text-primary)', fontWeight: isLowStock ? 700 : 400 }}>
                          {dispStock ?? '—'}
                          {isLowStock && <AlertTriangle size={14} style={{marginLeft: 6, color:'var(--warning)'}}/>}
                        </span>
                      </td>
                      <td>
                        {bp.is_composite 
                          ? <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>Combo</span>
                          : <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>Simple</span>
                        }
                      </td>
                      <td>
                        <button onClick={() => openEdit(bp)} className="btn btn-secondary btn-sm">
                          <Edit2 size={12} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* ===== PEDIDOS AGRUPADOS ===== */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px', maxWidth: '600px', margin: '0 auto' }}>
            <div className="card" style={{ background: 'var(--bg-secondary)', border: 'none' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: 'var(--warning)' }}>
                <Clock size={18} /> En Cocina
              </h3>
              {pendingList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Nada pendiente</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {pendingList.map(g => (
                    <div key={g.name} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                      {/* Group Header (Acumulado) */}
                      <div
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '16px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)'
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{g.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ background: 'var(--warning)', color: '#fff', padding: '4px 12px', borderRadius: '20px', fontWeight: 800, fontSize: '1.2rem' }}>
                            x{g.count}
                          </span>
                          <button onClick={() => setKitchenAction({ open: true, type: 'to_delivered', group: g, amount: g.count })} className="btn btn-sm btn-secondary">
                            Lote
                          </button>
                        </div>
                      </div>
                      {/* Individual Orders */}
                      <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column' }}>
                        {g.orders.map((o, idx) => {
                          const qty = o.buffet_order_items?.reduce((s, i) => s + i.quantity, 0) || 1
                          const cName = o.customer_name || 'Sin nombre'
                          return (
                            <div key={o.id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: idx !== g.orders.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{qty}x {cName}</span>
                                {o.notes && <span style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 500 }}>{o.notes}</span>}
                              </div>
                              <button 
                                onClick={() => changeOrderStatus(o.id, 'delivered')} 
                                className="btn btn-sm" 
                                style={{ background: 'var(--success-soft)', color: 'var(--success)', border: 'none' }}
                              >
                                ✔ Listo
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===== MODAL Producto Buffet ===== */}
      <Modal
        open={productModal.open}
        onClose={() => setProductModal({ open: false, edit: null })}
        title={productModal.edit ? 'Editar producto buffet' : 'Nuevo producto buffet'}
        size="lg"
        footer={
          <>
            <button onClick={() => setProductModal({ open: false, edit: null })} className="btn btn-secondary">Cancelar</button>
            <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', gap: '4px', marginBottom: '14px', background: 'var(--bg-secondary)', padding: '4px', borderRadius: 'var(--radius-md)', width: 'fit-content' }}>
          <button
            onClick={() => setProductTypeTab('simple')}
            className={`btn btn-sm ${productTypeTab === 'simple' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ border: 'none' }}
          >
            Producto Simple
          </button>
          <button
            onClick={() => setProductTypeTab('combo')}
            className={`btn btn-sm ${productTypeTab === 'combo' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ border: 'none' }}
          >
            Combo / Compuesto
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-row">
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Nombre *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Hamburguesa completa" />
            </div>
            <div className="form-group">
              <label className="form-label">Código (Opcional)</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input 
                  value={form.barcode} 
                  onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} 
                  placeholder="Código de barras..." 
                  style={{ flex: 1 }}
                />
                <BarcodeScanner 
                  onScan={(code) => setForm(p => ({ ...p, barcode: code }))} 
                  active={productModal.open} 
                  showCamera={true}
                  autoStart={productModal.open}
                />
              </div>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Precio de venta *</label>
              <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" min="0" />
            </div>
            <div className="form-group">
              <label className="form-label">Costo total {productTypeTab === 'combo' && '(Calculado auto)'}</label>
              <input type="number" value={form.cost_price} onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))} placeholder="0.00" min="0" disabled={productTypeTab === 'combo'} />
            </div>
          </div>
          
          {productTypeTab === 'simple' && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Stock Actual</label>
                <input type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Stock Mínimo</label>
                <input type="number" value={form.min_stock} onChange={e => setForm(f => ({ ...f, min_stock: e.target.value }))} placeholder="0" />
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Descripción</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción breve..." />
          </div>

          {productTypeTab === 'combo' && (
            /* Componentes de Combo */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label className="form-label">Componentes del Combo</label>
                <button type="button" onClick={addComponent} className="btn btn-secondary btn-sm">
                  <Plus size={12} /> Agregar producto
                </button>
              </div>
              {form.components.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={c.is_buffet ? 'buffet' : 'standard'}
                    onChange={e => {
                      updateComponent(i, 'is_buffet', e.target.value === 'buffet');
                      updateComponent(i, 'component_id', '');
                    }}
                    style={{ flex: '1 1 120px', minWidth: '100px' }}
                  >
                    <option value="buffet">Buffet</option>
                    <option value="standard">Kiosco</option>
                  </select>
                  <select
                    value={c.component_id}
                    onChange={e => updateComponent(i, 'component_id', e.target.value)}
                    style={{ flex: '1 1 150px' }}
                  >
                    <option value="">Seleccionar producto...</option>
                    {(c.is_buffet ? buffetProducts : products).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input
                    type="number"
                    value={c.quantity}
                    onChange={e => updateComponent(i, 'quantity', parseInt(e.target.value))}
                    style={{ flex: '1 1 70px', minWidth: '70px' }}
                    min="1"
                  />
                  <button type="button" onClick={() => removeComponent(i)} className="btn btn-danger btn-sm">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* ===== MODAL Nuevo Pedido (Venta Express Buffet) ===== */}
      <Modal
        open={orderModal.open}
        onClose={() => { setOrderModal({ open: false }); setPaymentMethod(null); setQuantity(1); setOrderCustomerName(''); setOrderNotes(''); }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Zap size={20} color="var(--accent)" />
            Venta Rápida Buffet
          </div>
        }
        size="lg"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          
            {/* NOMBRE Y NOTAS */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Nombre del Cliente (Opcional)</label>
                <input 
                  type="text" 
                  value={orderCustomerName} 
                  onChange={e => setOrderCustomerName(e.target.value)} 
                  placeholder="Ej: Juan Perez"
                />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Notas (Opcional)</label>
                <input 
                  type="text" 
                  value={orderNotes} 
                  onChange={e => setOrderNotes(e.target.value)} 
                  placeholder="Ej: Sin aderezo"
                />
              </div>
            </div>

            {/* SELECTOR DE PAGO */}
          <div style={{
            background: 'var(--bg-secondary)',
            border: `2px solid ${activeMethod ? activeMethod.colorBorder : 'var(--border)'}`,
            borderRadius: '16px',
            padding: '16px',
            transition: 'all 0.2s',
            boxShadow: activeMethod ? `0 0 0 3px ${activeMethod.colorSoft}` : 'none'
          }}>
            <div style={{
              fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px'
            }}>
              1. Método de pago
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px'
            }}>
              {PAYMENT_METHODS.map(method => {
                const isActive = paymentMethod === method.id
                return (
                  <button
                    key={method.id}
                    onClick={() => {
                      setPaymentMethod(method.id)
                      setSelectedDebtor(null)
                      setDebtorDropdownOpen(false)
                    }}
                    style={{
                      background: isActive ? method.colorSoft : 'var(--bg-tertiary)',
                      border: `1px solid ${isActive ? method.colorBorder : 'var(--border)'}`,
                      padding: '14px 10px', borderRadius: '12px', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                      transition: 'all 0.15s',
                    }}
                  >
                    <method.IconComponent active={isActive} />
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: isActive ? method.color : 'var(--text-primary)' }}>
                        {method.label}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{method.sublabel}</div>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Selector Deudor si corresponde */}
            {paymentMethod === 'deudor' && (
              <div style={{ marginTop: '14px', position: 'relative' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Seleccionar cuenta
                </div>
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setDebtorDropdownOpen(v => !v)}
                    style={{
                      width: '100%', padding: '12px 14px',
                      background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', cursor: 'pointer'
                    }}
                  >
                    {selectedDebtor ? (
                      <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <User size={16} color="var(--accent)" /> {selectedDebtor.name}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>{loadingDebtors ? 'Cargando cuentas...' : 'Elegir cliente...'}</span>
                    )}
                    <ChevronDown size={16} />
                  </button>
                  {debtorDropdownOpen && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0,
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)', marginTop: '4px', zIndex: 50,
                      maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                    }}>
                      {debtors.length === 0 && <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)' }}>No hay deudores activos</div>}
                      {debtors.map(d => (
                        <button
                          key={d.id}
                          onClick={() => { setSelectedDebtor(d); setDebtorDropdownOpen(false) }}
                          style={{
                            width: '100%', padding: '12px 14px', border: 'none', background: 'transparent',
                            textAlign: 'left', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                          }}
                        >
                          <span style={{ fontWeight: 500 }}>{d.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div style={{
            fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.05em'
          }}>
            2. Código o Escaneo ({quantity} {quantity === 1 ? 'unidad' : 'unidades'})
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {/* Controles de Cantidad */}
            <div style={{
              display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '4px'
            }}>
              <button 
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="btn btn-secondary" 
                style={{ width: '40px', height: '40px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Minus size={18} />
              </button>
              <div style={{ width: '50px', textAlign: 'center', fontWeight: 700, fontSize: '1.2rem' }}>
                {quantity}
              </div>
              <button 
                onClick={() => setQuantity(q => q + 1)}
                className="btn btn-secondary" 
                style={{ width: '40px', height: '40px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Plus size={18} />
              </button>
            </div>
            
            {/* Input y Escáner estilo Ventas */}
            <div style={{ flex: 1, position: 'relative' }}>
              <BarcodeScanner 
                onScan={(code) => {
                  const found = buffetProducts.find(p => p.barcode === code)
                  if (found) {
                    handleSellProduct(found)
                  } else {
                    toast(`Código no encontrado en buffet: ${code}`, 'warning')
                  }
                }} 
                active={orderModal.open && canScan} 
                showCamera={true}
                autoStart={false} 
              />
              {!canScan && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(0,0,0,0.5)', zIndex: 10, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)',
                  backdropFilter: 'blur(2px)'
                }}>
                  <span style={{ background: 'var(--bg)', padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600 }}>
                    Seleccioná el pago arriba
                  </span>
                </div>
              )}
            </div>
          </div>

          <label className="form-label">O seleccionar manualmente</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px', position: 'relative' }}>
            {!canScan && (
              <div style={{
                position: 'absolute', top: '-10px', left: '-10px', right: '-10px', bottom: '-10px',
                background: 'rgba(0,0,0,0.5)', zIndex: 10, borderRadius: 'var(--radius-md)',
                backdropFilter: 'blur(1px)'
              }}></div>
            )}
            {buffetProducts.map(bp => (
              <button
                key={bp.id}
                onClick={() => handleSellProduct(bp)}
                disabled={!canScan || selling}
                style={{
                  padding: '12px 14px', background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                  cursor: canScan ? 'pointer' : 'not-allowed', textAlign: 'left', transition: 'all 0.15s',
                  display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start',
                  opacity: canScan ? 1 : 0.6
                }}
              >
                <span style={{ fontSize: '0.85rem', fontWeight: 600, lineHeight: '1.3', color: 'var(--text-primary)' }}>{bp.name}</span>
                <span style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '0.95rem' }}>{formatMoney(bp.price)}</span>
              </button>
            ))}
          </div>

        </div>
      </Modal>

      {/* ===== MODAL KITCHEN ACTION ===== */}
      <Modal
        open={kitchenAction.open}
        onClose={() => !processingAction && setKitchenAction({ open: false, type: '', group: null, amount: 1 })}
        title="¿Cuántas se entregan?"
        size="sm"
      >
        {kitchenAction.group && (
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ marginBottom: '20px', color: 'var(--accent)' }}>{kitchenAction.group.name}</h3>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', marginBottom: '30px' }}>
              <button 
                className="btn btn-secondary" 
                style={{ width: '45px', height: '45px', borderRadius: '50%', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setKitchenAction(prev => ({ ...prev, amount: Math.max(1, prev.amount - 1) }))}
              ><Minus size={20} /></button>
              
              <div style={{ fontSize: '2.5rem', fontWeight: 800, minWidth: '60px' }}>
                {kitchenAction.amount}
              </div>
              
              <button 
                className="btn btn-secondary" 
                style={{ width: '45px', height: '45px', borderRadius: '50%', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setKitchenAction(prev => ({ ...prev, amount: Math.min(prev.group.count, prev.amount + 1) }))}
              ><Plus size={20} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button 
                onClick={() => !processingAction && setKitchenAction({ open: false, type: '', group: null, amount: 1 })} 
                className="btn btn-secondary"
                disabled={processingAction}
              >Cancelar</button>
              <button 
                onClick={handleKitchenAction} 
                className="btn btn-primary"
                disabled={processingAction}
              >
                {processingAction ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  )
}
