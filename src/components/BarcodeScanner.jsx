import { useState, useEffect, useRef } from 'react'
import { Camera, X, Loader, Hash } from 'lucide-react'

/**
 * BarcodeScanner - Escáner de código de barras
 * Soporta: cámara del dispositivo + lector físico (teclado)
 * onScan(barcode: string) => void
 */
export default function BarcodeScanner({ onScan, active = true, showCamera = false }) {
  const inputRef = useRef(null)
  const [buffer, setBuffer] = useState('')
  const [lastKeyTime, setLastKeyTime] = useState(0)
  const [scanning, setScanning] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)

  // ===== LECTOR FÍSICO (USB HID) =====
  // Los lectores de código de barras envían el código como si fuera un teclado muy rápido
  useEffect(() => {
    if (!active || cameraOpen) return

    let buf = ''
    let lastTime = 0

    const handleKey = (e) => {
      const now = Date.now()

      // Si el gap entre teclas es > 100ms, reiniciamos (es usuario escribiendo)
      if (now - lastTime > 100 && buf.length > 0) {
        buf = ''
      }
      lastTime = now

      if (e.key === 'Enter') {
        if (buf.length >= 3) {
          e.preventDefault()
          handleScanned(buf)
          buf = ''
        }
        return
      }

      if (e.key.length === 1) {
        buf += e.key
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [active, cameraOpen])

  async function handleScanned(barcode) {
    setScanning(true)
    await onScan(barcode.trim())
    setScanning(false)
  }

  // ===== CÁMARA (API de navegador) =====
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  async function openCamera() {
    setCameraOpen(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      startBarcodeDetection()
    } catch (err) {
      console.error('Camera error:', err)
      setCameraOpen(false)
    }
  }

  function closeCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setCameraOpen(false)
  }

  async function startBarcodeDetection() {
    if (!('BarcodeDetector' in window)) {
      // Fallback: usar ZXing o manual
      console.log('BarcodeDetector not supported, using manual input')
      return
    }
    const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'qr_code', 'upc_a', 'upc_e'] })

    const detect = async () => {
      if (!videoRef.current || !cameraOpen) return
      try {
        const codes = await detector.detect(videoRef.current)
        if (codes.length > 0) {
          const code = codes[0].rawValue
          closeCamera()
          await handleScanned(code)
          return
        }
      } catch {}
      if (videoRef.current) requestAnimationFrame(detect)
    }

    requestAnimationFrame(detect)
  }

  return (
    <>
      {/* Scan indicator */}
      {scanning && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          color: 'var(--accent)', fontSize: '0.8rem', padding: '4px 10px',
          background: 'var(--accent-soft)', borderRadius: '20px'
        }}>
          <Loader size={14} className="spinning" /> Buscando...
        </div>
      )}

      {/* Camera button */}
      {showCamera && (
        <button
          type="button"
          onClick={openCamera}
          className="btn btn-secondary btn-sm"
          title="Escanear con cámara"
        >
          <Camera size={16} /> Cámara
        </button>
      )}

      {/* Camera Modal */}
      {cameraOpen && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.9)',
          zIndex: 2000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '20px'
        }}>
          <div style={{ position: 'relative' }}>
            <video
              ref={videoRef}
              style={{
                width: '100%', maxWidth: '500px',
                borderRadius: 'var(--radius-lg)',
                border: '2px solid var(--accent)'
              }}
              playsInline
              muted
            />
            {/* Scan line animation */}
            <div style={{
              position: 'absolute', top: '50%', left: '10%', right: '10%',
              height: '2px', background: 'var(--accent)',
              animation: 'scanLine 1.5s ease-in-out infinite',
              boxShadow: '0 0 10px var(--accent)'
            }} />
          </div>

          <p style={{ color: 'white', fontSize: '0.9rem', opacity: 0.8 }}>
            Apuntá la cámara al código de barras
          </p>

          <button onClick={closeCamera} className="btn btn-danger">
            <X size={16} /> Cancelar
          </button>
        </div>
      )}

      <style>{`
        .spinning { animation: spin 1s linear infinite; }
        @keyframes scanLine {
          0% { top: 20%; }
          50% { top: 80%; }
          100% { top: 20%; }
        }
      `}</style>
    </>
  )
}

/**
 * Hook para input con escaneo de código de barras
 */
export function useBarcodeInput(onScan) {
  const inputRef = useRef(null)

  useEffect(() => {
    let buf = ''
    let lastTime = 0
    let timeout = null

    const handleKey = (e) => {
      // Solo procesar si el foco no está en un input/textarea
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
