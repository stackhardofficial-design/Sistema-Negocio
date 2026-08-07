import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useApp } from '../../lib/AppContext'
import {
  dbGetProductByBarcode, dbCreateSale, dbLogActivity,
  dbGetDebtors, dbAddDebtorCharge
} from '../../lib/supabase'
import BarcodeScanner from '../../components/BarcodeScanner'
import {
  Barcode, Package, Zap, Minus, Plus,
  AlertCircle, ChevronDown, User
} from 'lucide-react'

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

function formatMoney(n) {
  return `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
}

// ===== SVG ICONS CUSTOM =====
function IconEfectivo({ active }) {
  const c = active ? '#10b981' : '#6b7280'
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Billete */}
      <rect x="3" y="10" width="30" height="18" rx="3" fill={active ? 'rgba(16,185,129,0.15)' : 'rgba(107,114,128,0.1)'} stroke={c} strokeWidth="1.8"/>
      {/* Circulo central */}
      <circle cx="18" cy="19" r="5" stroke={c} strokeWidth="1.6" fill={active ? 'rgba(16,185,129,0.12)' : 'none'}/>
      {/* Signo $ */}
      <text x="18" y="23" textAnchor="middle" fontSize="7" fontWeight="bold" fill={c} fontFamily="system-ui">$</text>
      {/* Esquinas decorativas */}
      <rect x="5" y="12" width="4" height="3" rx="1" fill={c} opacity="0.5"/>
      <rect x="27" y="23" width="4" height="3" rx="1" fill={c} opacity="0.5"/>
      {/* Lineas decorativas */}
      <line x1="5" y1="22" x2="9" y2="22" stroke={c} strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
      <line x1="27" y1="17" x2="31" y2="17" stroke={c} strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
    </svg>
  )
}

function IconMercadoPago({ active }) {
  // Logo inspirado en MercadoPago con colores del sistema (azul #3b82f6)
  const c = active ? '#3b82f6' : '#6b7280'
  const bg = active ? 'rgba(59,130,246,0.18)' : 'rgba(107,114,128,0.1)'
  return (
    <svg width="40" height="36" viewBox="0 0 40 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Fondo redondeado */}
      <rect x="2" y="4" width="36" height="28" rx="8" fill={bg} stroke={c} strokeWidth="1.5"/>
      {/* Letra M estilizada - estilo MercadoPago */}
      <path d="M10 25 L10 14 L16 21 L22 14 L22 25" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      {/* Letra P estilizada */}
      <path d="M25 25 L25 14" stroke={c} strokeWidth="2.2" strokeLinecap="round" fill="none"/>
      <path d="M25 14 C25 14 31 14 31 18.5 C31 23 25 23 25 23" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      {/* Punto acento azul */}
      {active && <circle cx="34" cy="8" r="3" fill="#3b82f6"/>}
    </svg>
  )
}

function IconDeudor({ active }) {
  const c = active ? '#f59e0b' : '#6b7280'
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Libreta */}
      <rect x="7" y="5" width="22" height="27" rx="3" fill={active ? 'rgba(245,158,11,0.12)' : 'rgba(107,114,128,0.08)'} stroke={c} strokeWidth="1.7"/>
      {/* Espiral izquierda */}
      <line x1="7" y1="5" x2="7" y2="32" stroke={c} strokeWidth="3" strokeLinecap="round"/>
      {/* Lineas de texto */}
      <line x1="12" y1="13" x2="25" y2="13" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity="0.8"/>
      <line x1="12" y1="18" x2="25" y2="18" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity="0.8"/>
      <line x1="12" y1="23" x2="20" y2="23" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
      {/* Badge deuda */}
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
  {
    id: 'efectivo',
    label: 'Efectivo',
    sublabel: 'Pago en mano',
    IconComponent: IconEfectivo,
    color: '#10b981',
    colorSoft: 'rgba(16,185,129,0.12)',
    colorBorder: 'rgba(16,185,129,0.45)',
    colorGlow: 'rgba(16,185,129,0.25)',
  },
  {
    id: 'transferencia',
    label: 'Mercado Pago',
    sublabel: 'Transferencia',
    IconComponent: IconMercadoPago,
    color: '#3b82f6',
    colorSoft: 'rgba(59,130,246,0.12)',
    colorBorder: 'rgba(59,130,246,0.45)',
    colorGlow: 'rgba(59,130,246,0.25)',
  },
  {
    id: 'deudor',
    label: 'Deudor',
    sublabel: 'Cargar a cuenta',
    IconComponent: IconDeudor,
    color: '#f59e0b',
    colorSoft: 'rgba(245,158,11,0.12)',
    colorBorder: 'rgba(245,158,11,0.45)',
    colorGlow: 'rgba(245,158,11,0.22)',
  },
]

export default function VentasModule() {
  const { tenantId, userInfo, toast } = useApp()

  // ===== MÉTODO DE PAGO =====
  const [paymentMethod, setPaymentMethod] = useState(null) // null | 'efectivo' | 'transferencia' | 'deudor'
  const [selectedDebtor, setSelectedDebtor] = useState(null)
  const [debtors, setDebtors] = useState([])
  const [loadingDebtors, setLoadingDebtors] = useState(false)
  const [debtorDropdownOpen, setDebtorDropdownOpen] = useState(false)

  // ===== VENTA =====
  const [barcodeInput, setBarcodeInput] = useState('')
  const [quantity, setQuantity] = useState(1)
  const quantityRef = useRef(quantity)
  const [loading, setLoading] = useState(false)
  const [flashSuccess, setFlashSuccess] = useState(false)
  const barcodeRef = useRef(null)

  useEffect(() => { quantityRef.current = quantity }, [quantity])

  // Cargar deudores cuando se selecciona "deudor"
  useEffect(() => {
    if (paymentMethod === 'deudor' && tenantId) {
      setLoadingDebtors(true)
      dbGetDebtors(tenantId, { includeSettled: false })
        .then(data => setDebtors(data.filter(d => !d.is_settled)))
        .finally(() => setLoadingDebtors(false))
    }
  }, [paymentMethod, tenantId])

  // Cuando cambia método de pago: resetear deudor seleccionado
  function selectPaymentMethod(method) {
    setPaymentMethod(method)
    setSelectedDebtor(null)
    setDebtorDropdownOpen(false)
    // Focus en barcode si no es deudor o ya tiene deudor
    if (method !== 'deudor') {
      setTimeout(() => barcodeRef.current?.focus(), 100)
    }
  }

  // ¿Puede escanear?
  const canScan = paymentMethod !== null && (paymentMethod !== 'deudor' || selectedDebtor !== null)

  const handleScan = useCallback(async (code) => {
    if (!code?.trim() || !tenantId || loading) return
    if (!canScan) {
      toast('Seleccioná el método de pago antes de escanear', 'warning')
      return
    }
    if (paymentMethod === 'deudor' && !selectedDebtor) {
      toast('Seleccioná un deudor antes de escanear', 'warning')
      return
    }

    const trimmed = code.trim()
    const qty = Math.max(1, quantityRef.current)
    setLoading(true)
    try {
      const product = await dbGetProductByBarcode(tenantId, trimmed)
      if (!product) {
        toast(`Código "${trimmed}" no encontrado`, 'warning')
        setBarcodeInput('')
        return
      }
      const total = product.price * qty
      const cost = (product.cost_price || 0) * qty

      const sale = await dbCreateSale(
        tenantId, userInfo?.id,
        [{ product_id: product.id, quantity: qty, unit_price: product.price, unit_cost: product.cost_price || 0 }],
        total, cost,
        paymentMethod,
        paymentMethod === 'deudor' ? selectedDebtor.id : null
      )

      // Si es deudor: registrar cargo con detalle del producto
      if (paymentMethod === 'deudor' && selectedDebtor) {
        const chargeItems = [{
          product_id: product.id,
          product_name: product.name,
          barcode: product.barcode,
          quantity: qty,
          unit_price: product.price,
          subtotal: total
        }]
        await dbAddDebtorCharge(
          selectedDebtor.id,
          total,
          `Venta: ${qty}x ${product.name}`,
          chargeItems
        )
      }

      await dbLogActivity(tenantId, userInfo?.id, 'create', 'sale', sale.id, {
        product: product.name, barcode: product.barcode, quantity: qty, total,
        payment_method: paymentMethod,
        debtor: selectedDebtor?.name || null
      })

      playBeep()
      setFlashSuccess(true)
      setTimeout(() => setFlashSuccess(false), 300)

      const methodLabel = paymentMethod === 'efectivo' ? '💵' : paymentMethod === 'transferencia' ? '📲' : `📒 ${selectedDebtor.name}`
      toast(`${qty}x ${product.name} · ${formatMoney(total)} · ${methodLabel}`, 'success')

      setQuantity(1)
      setBarcodeInput('')
      // Mantener método de pago seleccionado para la siguiente venta
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
      setBarcodeInput('')
    } finally {
      setLoading(false)
    }
  }, [tenantId, userInfo, loading, canScan, paymentMethod, selectedDebtor])

  function handleBarcodeSubmit(e) {
    e.preventDefault()
    if (!canScan) {
      toast('Seleccioná el método de pago antes de escanear', 'warning')
      return
    }
    if (barcodeInput.trim()) handleScan(barcodeInput.trim())
  }

  function adjustQty(delta) {
    setQuantity(q => Math.max(1, q + delta))
  }

  const sellerInitial = (userInfo?.name || userInfo?.email || 'V').charAt(0).toUpperCase()
  const sellerName = userInfo?.name || userInfo?.email?.split('@')[0] || 'Vendedor'

  const activeMethod = PAYMENT_METHODS.find(m => m.id === paymentMethod)

  return (
    <div style={{
      minHeight: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg)',
      padding: '0',
    }}>

      {/* ===== HEADER ===== */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px', height: '34px', borderRadius: '10px',
            background: 'var(--accent-soft)', border: '1px solid rgba(245,158,11,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Zap size={18} color="var(--accent)" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.2 }}>Venta Rápida</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Elegí el pago → escaneá</div>
          </div>
        </div>
        {/* Vendedor */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '6px 12px',
          background: 'var(--bg-tertiary)',
          borderRadius: '20px',
          fontSize: '0.78rem'
        }}>
          <div style={{
            width: '24px', height: '24px', borderRadius: '50%',
            background: 'var(--accent-soft)', border: '1px solid rgba(245,158,11,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent)', flexShrink: 0
          }}>
            {sellerInitial}
          </div>
          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{sellerName}</span>
        </div>
      </div>

      {/* ===== CONTENIDO ===== */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '16px',
        gap: '14px',
        overflowY: 'auto'
      }}>

        {/* ===== SELECTOR DE MÉTODO DE PAGO ===== */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: `2px solid ${activeMethod ? activeMethod.colorBorder : 'var(--border)'}`,
          borderRadius: '16px',
          padding: '16px',
          transition: 'border-color 0.25s, box-shadow 0.25s',
          boxShadow: activeMethod ? `0 0 0 3px ${activeMethod.colorSoft}` : 'none'
        }}>
          <div style={{
            fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)',
            letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}>
            {!paymentMethod && <AlertCircle size={13} color="var(--accent)" />}
            {paymentMethod ? '✓ Método de pago' : 'Método de pago (obligatorio)'}
          </div>

          {/* ===== BOTONES DE MÉTODO - PREMIUM ===== */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {PAYMENT_METHODS.map(method => {
              const isActive = paymentMethod === method.id
              const { IconComponent } = method
              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => selectPaymentMethod(method.id)}
                  disabled={loading}
                  style={{
                    flex: 1,
                    height: '84px',
                    borderRadius: '16px',
                    border: `2px solid ${isActive ? method.color : 'var(--border)'}`,
                    background: isActive
                      ? `linear-gradient(145deg, ${method.colorSoft}, rgba(255,255,255,0.02))`
                      : 'var(--bg)',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '2px',
                    padding: '8px 4px',
                    transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
                    boxShadow: isActive
                      ? `0 6px 20px ${method.colorGlow}, inset 0 1px 0 rgba(255,255,255,0.06)`
                      : 'inset 0 1px 0 rgba(255,255,255,0.04)',
                    WebkitTapHighlightColor: 'transparent',
                    transform: isActive ? 'scale(1.05) translateY(-2px)' : 'scale(1) translateY(0)',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {/* Brillo superior cuando activo */}
                  {isActive && (
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0,
                      height: '1px',
                      background: `linear-gradient(90deg, transparent, ${method.color}, transparent)`,
                      opacity: 0.6
                    }} />
                  )}
                  <IconComponent active={isActive} />
                  <div style={{
                    fontSize: '0.68rem', fontWeight: 700,
                    color: isActive ? method.color : 'var(--text-secondary)',
                    letterSpacing: '0.01em',
                    lineHeight: 1.2,
                    transition: 'color 0.18s'
                  }}>
                    {method.label}
                  </div>
                  <div style={{
                    fontSize: '0.58rem',
                    color: isActive ? method.color : 'var(--text-muted)',
                    opacity: isActive ? 0.75 : 0.6,
                    letterSpacing: '0.02em',
                    transition: 'all 0.18s'
                  }}>
                    {method.sublabel}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Selector de deudor (visible solo cuando method = deudor) */}
          {paymentMethod === 'deudor' && (
            <div style={{ marginTop: '12px' }} className="fade-in">
              <div style={{
                fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)',
                letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px'
              }}>
                Seleccioná el deudor
              </div>
              {loadingDebtors ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '8px' }}>
                  <div className="spinner" style={{ width: '16px', height: '16px', borderTopColor: '#ef4444' }} />
                  Cargando deudores...
                </div>
              ) : debtors.length === 0 ? (
                <div style={{
                  padding: '12px', borderRadius: '10px',
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                  fontSize: '0.8rem', color: 'var(--danger)', display: 'flex', gap: '8px', alignItems: 'center'
                }}>
                  <AlertCircle size={14} />
                  No hay deudores registrados. Creá uno desde el módulo Deudores.
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setDebtorDropdownOpen(v => !v)}
                    style={{
                      width: '100%', height: '48px', borderRadius: '12px',
                      border: `2px solid ${selectedDebtor ? 'rgba(239,68,68,0.5)' : 'var(--border)'}`,
                      background: selectedDebtor ? 'rgba(239,68,68,0.08)' : 'var(--bg)',
                      color: selectedDebtor ? '#ef4444' : 'var(--text-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0 14px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600,
                      transition: 'all 0.15s',
                      WebkitTapHighlightColor: 'transparent'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <User size={16} />
                      {selectedDebtor ? selectedDebtor.name : 'Elegir deudor...'}
                    </div>
                    <ChevronDown size={16} style={{
                      transition: 'transform 0.2s',
                      transform: debtorDropdownOpen ? 'rotate(180deg)' : 'rotate(0)'
                    }} />
                  </button>

                  {debtorDropdownOpen && (
                    <div className="fade-in" style={{
                      position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                      zIndex: 100,
                      maxHeight: '220px', overflowY: 'auto'
                    }}>
                      {debtors.map(d => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            setSelectedDebtor(d)
                            setDebtorDropdownOpen(false)
                            setTimeout(() => barcodeRef.current?.focus(), 100)
                          }}
                          style={{
                            width: '100%', textAlign: 'left', padding: '12px 16px',
                            background: selectedDebtor?.id === d.id ? 'rgba(239,68,68,0.1)' : 'transparent',
                            border: 'none', cursor: 'pointer', display: 'flex',
                            alignItems: 'center', justifyContent: 'space-between',
                            borderBottom: '1px solid var(--border)',
                            color: 'var(--text-primary)', fontSize: '0.88rem',
                            transition: 'background 0.12s',
                            WebkitTapHighlightColor: 'transparent'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                          onMouseLeave={e => e.currentTarget.style.background = selectedDebtor?.id === d.id ? 'rgba(239,68,68,0.1)' : 'transparent'}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '28px', height: '28px', borderRadius: '50%',
                              background: 'rgba(239,68,68,0.15)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: '#ef4444', fontWeight: 700, fontSize: '0.75rem', flexShrink: 0
                            }}>
                              {d.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600 }}>{d.name}</div>
                              {d.phone && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{d.phone}</div>}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: '0.78rem', color: '#ef4444', fontWeight: 700 }}>
                              ${Number(d.total_debt || 0).toLocaleString('es-AR')}
                            </div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>deuda actual</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Deudor seleccionado: confirmación visual */}
              {selectedDebtor && (
                <div className="fade-in" style={{
                  marginTop: '8px', padding: '8px 12px',
                  background: 'rgba(239,68,68,0.1)', borderRadius: '10px',
                  border: '1px solid rgba(239,68,68,0.25)',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  fontSize: '0.8rem', color: '#ef4444'
                }}>
                  <User size={13} />
                  <span>Cargando a <strong>{selectedDebtor.name}</strong> · Deuda actual: <strong>${Number(selectedDebtor.total_debt || 0).toLocaleString('es-AR')}</strong></span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ===== CANTIDAD ===== */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: `1px solid ${canScan ? 'var(--border)' : 'var(--border)'}`,
          borderRadius: '16px',
          padding: '16px',
          opacity: canScan ? 1 : 0.5,
          transition: 'opacity 0.2s',
          pointerEvents: canScan ? 'auto' : 'none'
        }}>
          <div style={{
            fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)',
            letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px'
          }}>
            Cantidad
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={() => adjustQty(-1)}
              disabled={quantity <= 1 || loading || !canScan}
              style={{
                width: '58px', height: '58px', borderRadius: '14px',
                background: quantity <= 1 ? 'var(--bg-tertiary)' : 'var(--bg-card)',
                border: `2px solid ${quantity <= 1 ? 'var(--border)' : 'var(--border-light)'}`,
                cursor: quantity <= 1 ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: quantity <= 1 ? 'var(--text-muted)' : 'var(--text-primary)',
                flexShrink: 0, transition: 'all 0.15s',
                WebkitTapHighlightColor: 'transparent'
              }}
            >
              <Minus size={22} />
            </button>

            <input
              type="number"
              min="1"
              max="999"
              value={quantity}
              onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              disabled={loading || !canScan}
              inputMode="numeric"
              pattern="[0-9]*"
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: '2.2rem',
                fontWeight: 800,
                height: '58px',
                borderRadius: '14px',
                border: '2px solid var(--accent)',
                background: 'var(--bg)',
                color: 'var(--accent)',
                boxSizing: 'border-box',
                boxShadow: '0 0 0 3px var(--accent-soft)'
              }}
            />

            <button
              type="button"
              onClick={() => adjustQty(1)}
              disabled={loading || !canScan}
              style={{
                width: '58px', height: '58px', borderRadius: '14px',
                background: 'var(--accent)',
                border: '2px solid var(--accent)',
                cursor: !canScan ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#0f1117', flexShrink: 0, transition: 'all 0.15s',
                WebkitTapHighlightColor: 'transparent',
                boxShadow: '0 4px 12px rgba(245,158,11,0.4)'
              }}
            >
              <Plus size={22} />
            </button>
          </div>
        </div>

        {/* ===== CÓDIGO DE BARRAS ===== */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: `2px solid ${
            !canScan ? 'var(--border)' :
            loading ? 'var(--accent)' : 'var(--border)'
          }`,
          borderRadius: '16px',
          padding: '16px',
          transition: 'border-color 0.2s, opacity 0.2s, box-shadow 0.2s',
          boxShadow: loading ? '0 0 0 3px var(--accent-soft)' : 'none',
          position: 'relative'
        }}>
          <div style={{
            fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)',
            letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px'
          }}>
            Código de Barras
          </div>

          {/* Overlay de bloqueo */}
          {!canScan && (
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '14px',
              background: 'rgba(15,17,23,0.6)',
              backdropFilter: 'blur(2px)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '8px', zIndex: 10
            }}>
              <AlertCircle size={28} color="var(--accent)" />
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent)', textAlign: 'center', padding: '0 20px' }}>
                {paymentMethod === 'deudor' && !selectedDebtor
                  ? 'Elegí un deudor para continuar'
                  : 'Seleccioná el método de pago primero'}
              </div>
            </div>
          )}

          <form onSubmit={handleBarcodeSubmit}>
            <div style={{ position: 'relative' }}>
              <Barcode size={18} style={{
                position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                color: loading ? 'var(--accent)' : 'var(--text-muted)', pointerEvents: 'none'
              }} />
              <input
                ref={barcodeRef}
                type="text"
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                placeholder="Escanear o escribir código..."
                disabled={loading || !canScan}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                style={{
                  paddingLeft: '44px',
                  paddingRight: '16px',
                  fontSize: '1rem',
                  height: '52px',
                  borderRadius: '12px',
                  border: flashSuccess ? '2px solid var(--success)' : '1px solid var(--border)',
                  background: flashSuccess ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg)',
                  transition: 'all 0.15s ease',
                  color: 'var(--text-primary)',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button
                type="submit"
                disabled={!barcodeInput.trim() || loading || !canScan}
                style={{
                  flex: 1, height: '48px', borderRadius: '12px',
                  background: barcodeInput.trim() && !loading && canScan
                    ? (activeMethod?.color || 'var(--accent)')
                    : 'var(--bg-tertiary)',
                  color: barcodeInput.trim() && !loading && canScan ? '#0f1117' : 'var(--text-muted)',
                  border: 'none', fontWeight: 700, fontSize: '0.9rem',
                  cursor: barcodeInput.trim() && !loading && canScan ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  WebkitTapHighlightColor: 'transparent'
                }}
              >
                {loading ? (
                  <>
                    <div className="spinner" style={{ width: '18px', height: '18px', borderTopColor: 'var(--accent)' }} />
                    Registrando...
                  </>
                ) : (
                  <>
                    <Barcode size={16} /> Confirmar código
                  </>
                )}
              </button>
            </div>
          </form>
          <div style={{ marginTop: '16px' }}>
            <BarcodeScanner
              onScan={handleScan}
              active={!loading && canScan}
              showCamera={false}
              inline={true}
              autoStart={true}
            />
          </div>
        </div>

        {/* Status bar: método activo */}
        {paymentMethod && (
          <div className="fade-in" style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 14px',
            background: activeMethod.colorSoft,
            border: `1px solid ${activeMethod.colorBorder}`,
            borderRadius: '12px',
            fontSize: '0.8rem'
          }}>
            <div style={{ color: activeMethod.color, display: 'flex', gap: '6px', alignItems: 'center', fontWeight: 600 }}>
              {React.createElement(activeMethod.icon, { size: 14 })}
              {activeMethod.label}
              {selectedDebtor && <span> · {selectedDebtor.name}</span>}
            </div>
            <div style={{ flex: 1 }} />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.73rem' }}>
              {canScan ? '✓ Listo para escanear' : 'Elegí un deudor'}
            </span>
            <button
              type="button"
              onClick={() => { setPaymentMethod(null); setSelectedDebtor(null) }}
              style={{
                background: 'none', border: '1px solid var(--border)',
                borderRadius: '6px', padding: '2px 8px',
                color: 'var(--text-muted)', cursor: 'pointer',
                fontSize: '0.72rem', lineHeight: 1.4
              }}
            >
              Cambiar
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
        button:active { opacity: 0.8; transform: scale(0.97); }
      `}</style>
    </div>
  )
}
