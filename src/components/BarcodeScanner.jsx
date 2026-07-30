import { useState, useRef, useEffect, useId } from 'react'
import { Camera, X, Loader } from 'lucide-react'

/**
 * BarcodeScanner - usa html5-qrcode (que funciona) con config de máxima velocidad
 */
export default function BarcodeScanner({ onScan, active = true, showCamera = false }) {
  const [scanning, setScanning] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [error, setError] = useState('')
  const scannerRef = useRef(null)
  const uid = useId().replace(/:/g, '')
  const containerId = `barcode-reader-${uid}`

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
    setCameraOpen(true)
  }

  useEffect(() => {
    if (!cameraOpen) return

    let html5QrCode = null
    let stopped = false

    const start = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (stopped) return

        html5QrCode = new Html5Qrcode(containerId)
        scannerRef.current = html5QrCode

        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 30,
            qrbox: { width: 280, height: 100 },
            aspectRatio: 1.77,
            disableFlip: true,
            formatsToSupport: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
          },
          async (code) => {
            if (stopped) return
            stopped = true
            await stop()
            setCameraOpen(false)
            await handleScanned(code)
          },
          () => {}
        )
      } catch (err) {
        console.error('Scanner start error:', err)
        if (!stopped) {
          setError('No se pudo iniciar la cámara. Verificá los permisos.')
          setCameraOpen(false)
        }
      }
    }

    const stop = async () => {
      if (html5QrCode) {
        try {
          const state = html5QrCode.getState()
          if (state === 2) await html5QrCode.stop()
        } catch {}
        html5QrCode = null
        scannerRef.current = null
      }
    }

    const t = setTimeout(start, 150)

    return () => {
      clearTimeout(t)
      stopped = true
      stop()
    }
  }, [cameraOpen, containerId])

  async function closeCamera() {
    const sc = scannerRef.current
    if (sc) {
      try {
        const state = sc.getState()
        if (state === 2) await sc.stop()
      } catch {}
      scannerRef.current = null
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

      {/* Modal del escáner */}
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
          <p style={{ color: 'white', fontSize: '1rem', fontWeight: 600, margin: 0 }}>
            Apuntá al código de barras
          </p>

          {/* Contenedor donde html5-qrcode renderiza el video */}
          <div
            id={containerId}
            style={{ width: '100%', maxWidth: '500px', borderRadius: '12px', overflow: 'hidden' }}
          />

          <button onClick={closeCamera} className="btn btn-danger" style={{ marginTop: '8px' }}>
            <X size={16} /> Cancelar
          </button>
        </div>
      )}

      <style>{`
        .spin-anim { animation: _spin 1s linear infinite; }
        @keyframes _spin { to { transform: rotate(360deg); } }

        /* Ocultar controles innecesarios de html5-qrcode */
        #${containerId} select,
        #${containerId} img:not([src*="camera"]),
        #${containerId} span:empty {
          display: none !important;
        }
        #${containerId} video {
          border-radius: 10px;
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
