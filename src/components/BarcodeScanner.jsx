import { useState, useRef, useEffect, useId, useCallback } from 'react'
import { Camera, X, Loader } from 'lucide-react'

// ── Validación de checksums para evitar lecturas erróneas ──
function isValidEAN13(code) {
  if (!/^\d{13}$/.test(code)) return false
  const digits = code.split('').map(Number)
  const check = digits.pop()
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0)
  return (10 - (sum % 10)) % 10 === check
}

function isValidEAN8(code) {
  if (!/^\d{8}$/.test(code)) return false
  const digits = code.split('').map(Number)
  const check = digits.pop()
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

function isValidUPCA(code) {
  if (!/^\d{12}$/.test(code)) return false
  const digits = code.split('').map(Number)
  const check = digits.pop()
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

function isValidBarcode(code) {
  if (!code || code.length < 3) return false
  return /^[A-Za-z0-9\-._]+$/.test(code)
}

// ── Detectar soporte nativo de BarcodeDetector (Chrome Android) ──
const hasNativeBarcodeDetector = typeof globalThis.BarcodeDetector !== 'undefined'

/**
 * BarcodeScanner ultra-rápido
 * - Android/Chrome: usa BarcodeDetector nativo (instantáneo)
 * - iPhone/Safari: usa @zxing/browser (mucho más rápido que html5-qrcode en iOS)
 * - Valida checksums para evitar lecturas erróneas
 */
export default function BarcodeScanner({ onScan, active = true, showCamera = false, inline = false, autoStart = false }) {
  const [scanning, setScanning] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [error, setError] = useState('')
  const uid = useId().replace(/:/g, '')
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const animFrameRef = useRef(null)
  const stoppedRef = useRef(false)

  const latestOnScan = useRef(onScan)
  useEffect(() => { latestOnScan.current = onScan }, [onScan])

  useEffect(() => {
    if (autoStart) setCameraOpen(true)
  }, [autoStart])

  // ===== LECTOR FÍSICO (USB HID) =====
  useEffect(() => {
    if (!active) return
    let buf = ''
    let lastTime = 0
    const handleKey = (e) => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const now = Date.now()
      if (now - lastTime > 80 && buf.length > 0) buf = ''
      lastTime = now
      if (e.key === 'Enter') {
        if (buf.length >= 3) { e.preventDefault(); handleScanned(buf); buf = '' }
        return
      }
      if (e.key.length === 1) buf += e.key
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [active])

  const handleScanned = useCallback(async (barcode) => {
    const code = barcode.trim()
    if (!isValidBarcode(code)) return // Descartar lecturas erróneas silenciosamente
    setScanning(true)
    try { await latestOnScan.current(code) } finally { setScanning(false) }
  }, [])

  // ===== CÁMARA =====
  function openCamera() {
    setError('')
    setCameraOpen(true)
  }

  async function closeCamera() {
    stoppedRef.current = true
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setCameraOpen(false)
    setError('')
  }

  useEffect(() => {
    if (!cameraOpen) return
    stoppedRef.current = false
    let lastCode = ''
    let lastScanTime = 0
    let confirmBuffer = '' // Requiere 2 lecturas iguales consecutivas para aceptar
    let confirmCount = 0

    const start = async () => {
      try {
        // Pedir la cámara con resolución ideal para escaneo rápido
        const constraints = {
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            // Safari no soporta frameRate constraint pero no falla
            frameRate: { ideal: 30, min: 15 }
          },
          audio: false
        }
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (stoppedRef.current) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream

        const video = videoRef.current
        if (!video) { stream.getTracks().forEach(t => t.stop()); return }
        video.srcObject = stream
        video.setAttribute('playsinline', 'true') // Crítico para iOS
        video.setAttribute('autoplay', 'true')
        await video.play()

        if (stoppedRef.current) return

        if (hasNativeBarcodeDetector) {
          // ── MOTOR NATIVO (Android/Chrome) ── instantáneo
          const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'code_128', 'code_39'] })

          const scanLoop = async () => {
            if (stoppedRef.current) return
            try {
              const barcodes = await detector.detect(video)
              for (const bc of barcodes) {
                const code = bc.rawValue
                if (!code || !isValidBarcode(code)) continue
                const now = Date.now()
                if (code === lastCode && now - lastScanTime < 1500) continue
                // Confirmación rápida: 2 lecturas iguales
                if (code === confirmBuffer) {
                  confirmCount++
                } else {
                  confirmBuffer = code
                  confirmCount = 1
                }
                if (confirmCount >= 2) {
                  lastCode = code
                  lastScanTime = now
                  confirmBuffer = ''
                  confirmCount = 0
                  if (!inline) {
                    stoppedRef.current = true
                    closeCamera()
                    await handleScanned(code)
                    return
                  } else {
                    await handleScanned(code)
                  }
                }
              }
            } catch {}
            // ~30 fps loop
            animFrameRef.current = requestAnimationFrame(scanLoop)
          }
          animFrameRef.current = requestAnimationFrame(scanLoop)

        } else {
          // ── MOTOR ZXING (iPhone/Safari) ── mucho más rápido que html5-qrcode
          const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await import('@zxing/library')
          if (stoppedRef.current) return

          const hints = new Map()
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39
          ])
          hints.set(DecodeHintType.TRY_HARDER, false) // Más rápido sin TRY_HARDER

          const reader = new BrowserMultiFormatReader(hints, 80) // 80ms entre intentos = ~12fps

          const scanLoop = async () => {
            if (stoppedRef.current) return
            try {
              const result = await reader.decodeOnce(video)
              if (result) {
                const code = result.getText()
                if (code && isValidBarcode(code)) {
                  const now = Date.now()
                  if (code !== lastCode || now - lastScanTime >= 1500) {
                    // Confirmación: 2 lecturas iguales
                    if (code === confirmBuffer) {
                      confirmCount++
                    } else {
                      confirmBuffer = code
                      confirmCount = 1
                    }
                    if (confirmCount >= 2) {
                      lastCode = code
                      lastScanTime = now
                      confirmBuffer = ''
                      confirmCount = 0
                      if (!inline) {
                        stoppedRef.current = true
                        closeCamera()
                        await handleScanned(code)
                        return
                      } else {
                        await handleScanned(code)
                      }
                    }
                  }
                }
              }
            } catch {}
            if (!stoppedRef.current) {
              // Siguiente frame rápido
              animFrameRef.current = requestAnimationFrame(scanLoop)
            }
          }
          animFrameRef.current = requestAnimationFrame(scanLoop)
        }

      } catch (err) {
        console.error('Scanner start error:', err)
        if (!stoppedRef.current) {
          setError('No se pudo iniciar la cámara. Verificá los permisos.')
          setCameraOpen(false)
        }
      }
    }

    // Start con delay mínimo para que el DOM monte el <video>
    const t = setTimeout(start, 50)

    return () => {
      clearTimeout(t)
      stoppedRef.current = true
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
    }
  }, [cameraOpen, inline, handleScanned])

  return (
    <>
      {scanning && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          color: 'var(--accent)', fontSize: '0.8rem', padding: '4px 10px',
          background: 'var(--accent-soft)', borderRadius: '20px'
        }}>
          <Loader size={14} className="spin-anim" /> Registrando...
        </div>
      )}

      {showCamera && !scanning && (
        <button
          type="button"
          onClick={openCamera}
          className="btn btn-secondary btn-sm"
          title="Escanear código con cámara"
        >
          <Camera size={16} /> Cámara
        </button>
      )}

      {error && (
        <div style={{
          color: 'var(--danger)', fontSize: '0.75rem',
          padding: '8px', background: 'rgba(239,68,68,0.1)',
          borderRadius: '6px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px'
        }}>
          {error}
          <button 
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={async () => {
              try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                stream.getTracks().forEach(t => t.stop())
                setError('')
                setCameraOpen(true)
              } catch (e) {
                alert('La cámara sigue bloqueada. En iPhone: Configuración > Safari > Cámara > Permitir.')
              }
            }}
          >
            <Camera size={14} /> Reintentar
          </button>
        </div>
      )}

      {/* Video del escáner */}
      {cameraOpen && (
        <div style={inline ? {
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%'
        } : {
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.97)',
          zIndex: 2000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          padding: '20px'
        }}>
          {!inline && (
            <p style={{ color: 'white', fontSize: '1rem', fontWeight: 600, margin: 0 }}>
              Apuntá al código de barras
            </p>
          )}

          {/* Video directo: mucho más rápido que el render de html5-qrcode */}
          <div style={{
            width: '100%', maxWidth: '500px', borderRadius: '12px', overflow: 'hidden',
            background: inline ? 'var(--bg)' : '#000', position: 'relative'
          }}>
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              style={{
                width: '100%', display: 'block', borderRadius: '12px',
                objectFit: 'cover', maxHeight: inline ? '200px' : '400px'
              }}
            />
            {/* Guía visual de escaneo */}
            <div style={{
              position: 'absolute', top: '50%', left: '10%', right: '10%',
              height: '2px', background: 'var(--accent)',
              transform: 'translateY(-50%)',
              boxShadow: '0 0 8px var(--accent), 0 0 20px var(--accent)',
              opacity: 0.8,
              animation: 'scanLine 1.5s ease-in-out infinite alternate'
            }} />
          </div>

          {!inline && (
            <button onClick={closeCamera} className="btn btn-danger" style={{ marginTop: '8px' }}>
              <X size={16} /> Cancelar
            </button>
          )}
        </div>
      )}

      <style>{`
        .spin-anim { animation: _spin 1s linear infinite; }
        @keyframes _spin { to { transform: rotate(360deg); } }
        @keyframes scanLine {
          0% { top: 35%; opacity: 0.5; }
          100% { top: 65%; opacity: 1; }
        }
      `}</style>
    </>
  )
}

export function useBarcodeInput(onScan) {
  const inputRef = useRef(null)
  useEffect(() => {
    let buf = ''
    let lastTime = 0
    let timeout = null
    const handleKey = (e) => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const now = Date.now()
      if (now - lastTime > 150 && buf.length > 0) buf = ''
      lastTime = now
      clearTimeout(timeout)
      if (e.key === 'Enter') {
        if (buf.length >= 3) onScan(buf.trim())
        buf = ''
        return
      }
      if (e.key.length === 1) {
        buf += e.key
        timeout = setTimeout(() => { if (buf.length >= 3) onScan(buf.trim()); buf = '' }, 200)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onScan])
  return inputRef
}
