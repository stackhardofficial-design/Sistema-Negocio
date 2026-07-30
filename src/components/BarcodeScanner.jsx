import { useState, useRef, useEffect, useId } from 'react'
import { Camera, X, Loader } from 'lucide-react'

/**
 * BarcodeScanner ultra-rápido:
 * 1. Si BarcodeDetector está disponible (Chrome Android) → GPU-acelerado, ~instant
 * 2. Si no → ZXing/browser con requestAnimationFrame continuo
 *
 * Props:
 *   onScan(barcode: string)
 *   active - activa el listener de teclado (lector físico HID)
 *   showCamera - mostrar botón de cámara
 */
export default function BarcodeScanner({ onScan, active = true, showCamera = false }) {
  const [scanning, setScanning] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [error, setError] = useState('')
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const stopRef = useRef(false)

  // ===== LECTOR FÍSICO (USB HID) =====
  useEffect(() => {
    if (!active || cameraOpen) return
    let buf = ''
    let lastTime = 0

    const handleKey = (e) => {
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
  }, [active, cameraOpen])

  async function handleScanned(barcode) {
    setScanning(true)
    try { await onScan(barcode.trim()) } finally { setScanning(false) }
  }

  // ===== CÁMARA =====
  async function openCamera() {
    setError('')
    stopRef.current = false

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      })
      streamRef.current = stream
      setCameraOpen(true)

      // Esperar al mount del video
      setTimeout(() => {
        if (!videoRef.current) return
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play()
          startDetection()
        }
      }, 50)
    } catch (err) {
      console.error(err)
      setError('No se pudo acceder a la cámara. Verificá los permisos.')
    }
  }

  async function startDetection() {
    if ('BarcodeDetector' in window) {
      // ===== MODO 1: BarcodeDetector nativo (GPU-acelerado) =====
      const detector = new window.BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e', 'code_39', 'code_93', 'itf', 'codabar']
      })

      const detect = async () => {
        if (stopRef.current || !videoRef.current) return
        if (videoRef.current.readyState >= 2) {
          try {
            const codes = await detector.detect(videoRef.current)
            if (codes.length > 0) {
              closeCamera()
              await handleScanned(codes[0].rawValue)
              return
            }
          } catch {}
        }
        requestAnimationFrame(detect)
      }
      requestAnimationFrame(detect)

    } else {
      // ===== MODO 2: ZXing como fallback =====
      const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await import('@zxing/library')

      const hints = new Map()
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
        BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
        BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
        BarcodeFormat.ITF, BarcodeFormat.CODABAR
      ])
      hints.set(DecodeHintType.TRY_HARDER, true)

      const reader = new BrowserMultiFormatReader(hints)

      const decode = () => {
        if (stopRef.current || !videoRef.current) return
        if (videoRef.current.readyState >= 2) {
          try {
            const result = reader.decodeFromVideoElement(videoRef.current)
            if (result) {
              closeCamera()
              handleScanned(result.getText())
              return
            }
          } catch {}
        }
        requestAnimationFrame(decode)
      }
      requestAnimationFrame(decode)
    }
  }

  function closeCamera() {
    stopRef.current = true
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setCameraOpen(false)
    setError('')
  }

  return (
    <>
      {scanning && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          color: 'var(--accent)', fontSize: '0.8rem', padding: '4px 10px',
          background: 'var(--accent-soft)', borderRadius: '20px'
        }}>
          <Loader size={14} className="spin-anim" /> Buscando...
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
          padding: '4px 8px', background: 'rgba(239,68,68,0.1)',
          borderRadius: '6px', marginTop: '4px'
        }}>
          {error}
        </div>
      )}

      {/* Modal escáner */}
      {cameraOpen && (
        <div style={{
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
          <p style={{ color: 'white', fontSize: '1rem', fontWeight: 600, textAlign: 'center', margin: 0 }}>
            Apuntá al código de barras
          </p>

          <div style={{ position: 'relative', width: '100%', maxWidth: '500px' }}>
            <video
              ref={videoRef}
              style={{ width: '100%', borderRadius: '12px', display: 'block', background: '#111' }}
              playsInline
              muted
              autoPlay
            />
            {/* Guía visual de escaneo */}
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none'
            }}>
              <div style={{
                border: '2px solid var(--accent)',
                borderRadius: '8px',
                width: '80%',
                height: '80px',
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
                position: 'relative'
              }}>
                {/* Línea de escaneo animada */}
                <div style={{
                  position: 'absolute',
                  left: 0, right: 0,
                  height: '2px',
                  background: 'var(--accent)',
                  animation: 'scanLine 1.2s ease-in-out infinite',
                  boxShadow: '0 0 8px var(--accent)',
                  top: 0
                }} />
              </div>
            </div>
          </div>

          <button onClick={closeCamera} className="btn btn-danger" style={{ marginTop: '8px' }}>
            <X size={16} /> Cancelar
          </button>
        </div>
      )}

      <style>{`
        .spin-anim { animation: _spin 1s linear infinite; }
        @keyframes _spin { to { transform: rotate(360deg); } }
        @keyframes scanLine {
          0% { top: 0%; }
          50% { top: calc(100% - 2px); }
          100% { top: 0%; }
        }
      `}</style>
    </>
  )
}

/**
 * Hook para lector físico de código de barras
 */
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
