import { useState, useEffect, useCallback, useRef } from 'react'
import { useApp } from '../../lib/AppContext'
import {
  dbGetProductByBarcode, dbCreateSale, dbLogActivity
} from '../../lib/supabase'
import BarcodeScanner from '../../components/BarcodeScanner'
import {
  Barcode, CheckCircle2, Package, Zap, Hash, Minus, Plus
} from 'lucide-react'

function formatMoney(n) {
  return `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
}

export default function VentasModule() {
  const { tenantId, userInfo, toast } = useApp()

  // Estado del escÃ¡ner
  const [barcodeInput, setBarcodeInput] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [loading, setLoading] = useState(false)

  // ConfirmaciÃ³n flash (5 segundos)
  const [confirmation, setConfirmation] = useState(null)
  const [progress, setProgress] = useState(100)
  const timerRef = useRef(null)
  const progressRef = useRef(null)
  const barcodeRef = useRef(null)

  useEffect(() => {
    barcodeRef.current?.focus()
  }, [])

  function clearTimer() {
    clearTimeout(timerRef.current)
    clearInterval(progressRef.current)
  }

  function showConfirmation(data) {
    clearTimer()
    setConfirmation(data)
    setProgress(100)

    let elapsed = 0
    progressRef.current = setInterval(() => {
      elapsed += 50
      setProgress(Math.max(0, 100 - (elapsed / 5000) * 100))
    }, 50)

    timerRef.current = setTimeout(() => {
      clearInterval(progressRef.current)
      setConfirmation(null)
      setProgress(100)
      setBarcodeInput('')
      barcodeRef.current?.focus()
    }, 5000)
  }

  useEffect(() => () => clearTimer(), [])

  // ===== ESCANEO Y VENTA INMEDIATA =====
  const handleScan = useCallback(async (code) => {
    if (!code?.trim() || !tenantId || loading) return
    const trimmed = code.trim()
    const qty = Math.max(1, quantity)

    setLoading(true)
    try {
      const product = await dbGetProductByBarcode(tenantId, trimmed)
      if (!product) {
        toast(`CÃ³digo "${trimmed}" no encontrado`, 'warning')
        setBarcodeInput('')
        barcodeRef.current?.focus()
        return
      }

      const total = product.price * qty
      const cost = (product.cost_price || 0) * qty

      const sale = await dbCreateSale(
        tenantId,
        userInfo?.id,
        [{ product_id: product.id, quantity: qty, unit_price: product.price, unit_cost: product.cost_price || 0 }],
        total,
        cost
      )

      await dbLogActivity(tenantId, userInfo?.id, 'create', 'sale', sale.id, {
        product: product.name, barcode: product.barcode, quantity: qty, total
      })

      showConfirmation({
        product, quantity: qty, total,
        seller: userInfo?.name || userInfo?.email?.split('@')[0] || 'Vendedor'
      })

      setQuantity(1)
      setBarcodeInput('')
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
      setBarcodeInput('')
      barcodeRef.current?.focus()
    } finally {
      setLoading(false)
    }
  }, [tenantId, userInfo, quantity, loading])

  function handleBarcodeSubmit(e) {
    e.preventDefault()
    if (barcodeInput.trim()) handleScan(barcodeInput.trim())
  }

  function adjustQty(delta) {
    setQuantity(q => Math.max(1, q + delta))
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      padding: '24px 16px',
      background: 'var(--bg)',
      gap: '20px'
    }}>

      {/* Header */}
      <div style={{ textAlign: 'center', width: '100%', maxWidth: '420px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '10px',
          background: 'var(--accent-soft)', border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: '16px', padding: '8px 20px', marginBottom: '12px'
        }}>
          <Zap size={20} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--accent)' }}>
            Venta RÃ¡pida
          </span>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
          EscaneÃ¡ el cÃ³digo â†’ la venta se registra al instante
        </p>
      </div>

      {/* Panel principal */}
      <div style={{
        width: '100%', maxWidth: '420px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '20px',
        padding: '24px',
        display: 'flex', flexDirection: 'column', gap: '20px',
        boxShadow: '0 4px 32px rgba(0,0,0,0.25)'
      }}>

        {/* CÃ³digo de barras */}
        <div>
          <label style={{
            fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)',
            letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '8px', display: 'block'
          }}>
            CÃ³digo de Barras
          </label>
          <form onSubmit={handleBarcodeSubmit}>
            <div style={{ position: 'relative' }}>
              <Barcode size={18} style={{
                position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                color: loading ? 'var(--accent)' : 'var(--text-muted)', pointerEvents: 'none',
                transition: 'color 0.2s'
              }} />
              <input
                ref={barcodeRef}
                type="text"
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                placeholder="Escanear o escribir cÃ³digo..."
                disabled={loading}
                autoComplete="off"
                style={{
                  paddingLeft: '42px',
                  paddingRight: '120px',
                  fontSize: '1.1rem',
                  height: '52px',
                  borderRadius: '12px',
                  border: `2px solid ${loading ? 'var(--accent)' : 'var(--border)'}`,
                  background: 'var(--bg)',
                  color: 'var(--text-primary)',
                  width: '100%',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                  boxShadow: loading ? '0 0 0 3px var(--accent-soft)' : 'none'
                }}
              />
              <div style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '6px' }}>
                <BarcodeScanner onScan={handleScan} active={!loading} showCamera={true} />
              </div>
            </div>
          </form>
        </div>

        {/* Cantidad */}
        <div>
          <label style={{
            fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)',
            letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '8px', display: 'block'
          }}>
            Cantidad
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              onClick={() => adjustQty(-1)}
              disabled={quantity <= 1 || loading}
              style={{
                width: '52px', height: '52px', borderRadius: '12px',
                background: quantity <= 1 ? 'var(--bg-tertiary)' : 'var(--bg-card)',
                border: '2px solid var(--border)', cursor: quantity <= 1 ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-secondary)', flexShrink: 0, transition: 'all 0.15s'
              }}
            >
              <Minus size={20} />
            </button>

            <input
              type="number"
              min="1"
              max="999"
              value={quantity}
              onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              disabled={loading}
              style={{
                flex: 1, textAlign: 'center',
                fontSize: '1.8rem', fontWeight: 800,
                height: '52px', borderRadius: '12px',
                border: '2px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--accent)',
                boxSizing: 'border-box'
              }}
            />

            <button
              type="button"
              onClick={() => adjustQty(1)}
              disabled={loading}
              style={{
                width: '52px', height: '52px', borderRadius: '12px',
                background: 'var(--accent-soft)',
                border: '2px solid rgba(245,158,11,0.3)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--accent)', flexShrink: 0, transition: 'all 0.15s'
              }}
            >
              <Plus size={20} />
            </button>
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px', textAlign: 'center' }}>
            AjustÃ¡ la cantidad antes de escanear Â· <strong>o escaneÃ¡ varias veces</strong>
          </p>
        </div>

        {/* Indicador de estado */}
        {loading && (
          <div className="fade-in" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            padding: '14px', background: 'var(--accent-soft)',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: '12px', color: 'var(--accent)', fontWeight: 600, fontSize: '0.9rem'
          }}>
            <div className="spinner" style={{ width: '20px', height: '20px', borderTopColor: 'var(--accent)' }} />
            Registrando venta...
          </div>
        )}

        {/* Usuario activo */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 14px', background: 'var(--bg-tertiary)',
          borderRadius: '10px', fontSize: '0.8rem'
        }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%',
            background: 'var(--accent-soft)', border: '1px solid rgba(245,158,11,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent)'
          }}>
            {(userInfo?.name || userInfo?.email || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {userInfo?.name || userInfo?.email?.split('@')[0] || 'Vendedor'}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
              Las ventas se registran a tu nombre
            </div>
          </div>
        </div>
      </div>

      {/* ===== CONFIRMACIÃ“N FLASH ===== */}
      {confirmation && (
        <div
          className="fade-in"
          style={{
            width: '100%', maxWidth: '420px',
            borderRadius: '20px', overflow: 'hidden',
            border: '2px solid var(--success)',
            boxShadow: '0 8px 40px rgba(16,185,129,0.25)',
            animation: 'slideUp 0.3s ease'
          }}
        >
          {/* Barra de progreso */}
          <div style={{ height: '4px', background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${progress}%`,
              background: 'var(--success)', transition: 'width 0.05s linear'
            }} />
          </div>

          <div style={{
            background: 'var(--bg-secondary)', padding: '20px 24px',
            display: 'flex', flexDirection: 'column', gap: '16px'
          }}>
            {/* TÃ­tulo con total */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '12px',
                background: 'rgba(16,185,129,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <CheckCircle2 size={22} color="var(--success)" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--success)' }}>
                  Â¡Venta registrada!
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Vendedor: {confirmation.seller}
                </div>
              </div>
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {formatMoney(confirmation.total)}
                </div>
              </div>
            </div>

            {/* Detalle producto */}
            <div style={{
              background: 'var(--bg)', borderRadius: '12px', padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: '12px'
            }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '10px',
                background: 'var(--bg-tertiary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <Package size={20} color="var(--text-muted)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                }}>
                  {confirmation.product.name}
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
                  {confirmation.product.barcode && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Hash size={11} /> {confirmation.product.barcode}
                    </span>
                  )}
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {formatMoney(confirmation.product.price)} c/u
                  </span>
                </div>
              </div>
              <div style={{
                background: 'var(--accent-soft)', border: '1px solid rgba(245,158,11,0.3)',
                borderRadius: '8px', padding: '6px 14px', textAlign: 'center', flexShrink: 0
              }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>
                  {confirmation.quantity}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--accent)', marginTop: '1px' }}>unid.</div>
              </div>
            </div>

            {/* Countdown */}
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              Se oculta automÃ¡ticamente en {Math.ceil(progress / 20)}s
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

