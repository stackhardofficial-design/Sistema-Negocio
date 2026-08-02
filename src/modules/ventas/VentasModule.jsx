import { useState, useEffect, useCallback, useRef } from 'react'
import { useApp } from '../../lib/AppContext'
import {
  dbGetProductByBarcode, dbCreateSale, dbLogActivity
} from '../../lib/supabase'
import BarcodeScanner from '../../components/BarcodeScanner'
import {
  Barcode, CheckCircle2, Package, Zap, Hash, Minus, Plus
} from 'lucide-react'

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime) // 880Hz
    gain.gain.setValueAtTime(0.1, ctx.currentTime)
    osc.start()
    osc.stop(ctx.currentTime + 0.1) // 100ms
  } catch(e) {
    console.error('Audio beep failed', e)
  }
}

function formatMoney(n) {
  return `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
}

export default function VentasModule() {
  const { tenantId, userInfo, toast } = useApp()

  const [barcodeInput, setBarcodeInput] = useState('')
  const [quantity, setQuantity] = useState(1)
  const quantityRef = useRef(quantity)

  useEffect(() => {
    quantityRef.current = quantity
  }, [quantity])

  const [loading, setLoading] = useState(false)
  const [flashSuccess, setFlashSuccess] = useState(false)

  const barcodeRef = useRef(null)



  const handleScan = useCallback(async (code) => {
    if (!code?.trim() || !tenantId || loading) return
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
        total, cost
      )
      await dbLogActivity(tenantId, userInfo?.id, 'create', 'sale', sale.id, {
        product: product.name, barcode: product.barcode, quantity: qty, total
      })
      playBeep()
      setFlashSuccess(true)
      setTimeout(() => setFlashSuccess(false), 300)
      
      toast(`✅ ${qty}x ${product.name} registrados: ${formatMoney(total)}`, 'success')
      
      setQuantity(1)
      setBarcodeInput('')
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
      setBarcodeInput('')
    } finally {
      setLoading(false)
    }
  }, [tenantId, userInfo, loading])

  function handleBarcodeSubmit(e) {
    e.preventDefault()
    if (barcodeInput.trim()) handleScan(barcodeInput.trim())
  }

  function adjustQty(delta) {
    setQuantity(q => Math.max(1, q + delta))
  }

  const sellerInitial = (userInfo?.name || userInfo?.email || 'V').charAt(0).toUpperCase()
  const sellerName = userInfo?.name || userInfo?.email?.split('@')[0] || 'Vendedor'

  return (
    <div style={{
      minHeight: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg)',
      padding: '0',
    }}>

      {/* ===== HEADER COMPACTO ===== */}
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
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Escanear â†’ venta al instante</div>
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

      {/* ===== CONTENIDO PRINCIPAL ===== */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '16px',
        gap: '14px',
        overflowY: 'auto'
      }}>

        {/* ===== CANTIDAD ===== */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '16px',
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
              disabled={quantity <= 1 || loading}
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
              disabled={loading}
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
              disabled={loading}
              style={{
                width: '58px', height: '58px', borderRadius: '14px',
                background: 'var(--accent)',
                border: '2px solid var(--accent)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#0f1117', flexShrink: 0, transition: 'all 0.15s',
                WebkitTapHighlightColor: 'transparent',
                boxShadow: '0 4px 12px rgba(245,158,11,0.4)'
              }}
            >
              <Plus size={22} />
            </button>
          </div>
          <p style={{
            fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '8px',
            textAlign: 'center', lineHeight: 1.4
          }}>
            Ajustá antes de escanear · o escaneá <strong style={{ color: 'var(--text-secondary)' }}>N veces</strong> para N unidades
          </p>
        </div>

        {/* ===== CÓDIGO DE BARRAS ===== */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: `2px solid ${loading ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: '16px',
          padding: '16px',
          transition: 'border-color 0.2s',
          boxShadow: loading ? '0 0 0 3px var(--accent-soft)' : 'none'
        }}>
          <div style={{
            fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)',
            letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px'
          }}>
            Código de Barras
          </div>
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
                disabled={loading}
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
                disabled={!barcodeInput.trim() || loading}
                style={{
                  flex: 1, height: '48px', borderRadius: '12px',
                  background: barcodeInput.trim() && !loading ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: barcodeInput.trim() && !loading ? '#0f1117' : 'var(--text-muted)',
                  border: 'none', fontWeight: 700, fontSize: '0.9rem',
                  cursor: barcodeInput.trim() && !loading ? 'pointer' : 'not-allowed',
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
            <BarcodeScanner onScan={handleScan} active={!loading} showCamera={false} inline={true} autoStart={true} />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        /* En mobile: input de cantidad sin flechas */
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
        /* Touch feedback */
        button:active { opacity: 0.8; transform: scale(0.97); }
      `}</style>
    </div>
  )
}


