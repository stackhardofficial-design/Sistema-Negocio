import { useState, useRef, useEffect, useId } from 'react'
import { Camera, X, Loader, Scan } from 'lucide-react'

/**
 * BarcodeScanner - Escáner de código de barras
 * Usa html5-qrcode para compatibilidad total en iOS/Android/Desktop
 *
 * Props:
 *   onScan(barcode: string) - callback cuando se detecta un código
 *   active - si el scanner de teclado está activo
 *   showCamera - mostrar botones de cámara
 */
export default function BarcodeScanner({ onScan, active = true, showCamera = false }) {
  const [scanning, setScanning] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [error, setError] = useState('')
  const scannerRef = useRef(null)
  const cameraId = useId().replace(/:/g, '')
  const containerId = `qr-reader-${cameraId}`

  // ===== LECTOR FÍSICO (USB HID / teclado) =====
  useEffect(() => {
    if (!active || cameraOpen) return
    let buf = ''
    let lastTime = 0

    const handleKey = (e) => {
      const now = Date.now()
      if (now - lastTime > 100 && buf.length > 0) buf = ''
      lastTime = now

      if (e.key === 'Enter') {
        if (buf.length >= 3) {
          e.preventDefault()
          handleScanned(buf)
          buf = ''
        }
        return
      }
      if (e.key.length === 1) buf += e.key
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [active, cameraOpen])

  async function handleScanned(barcode) {
    setScanning(true)
    try {
      await onScan(barcode.trim())
    } finally {
      setScanning(false)
    }
  }

  // ===== CÁMARA CON html5-qrcode =====
  async function openCamera() {
    setError('')
    setCameraOpen(true)
  }

  useEffect(() => {
    if (!cameraOpen) return

    let html5QrCode = null

    const startScanner = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        html5QrCode = new Html5Qrcode(containerId)
        scannerRef.current = html5QrCode

        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 150 },
            aspectRatio: 1.7,
            formatsToSupport: [
              0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 // todos los formatos
            ]
          },
          async (decodedText) => {
            await stopScanner(html5QrCode)
            setCameraOpen(false)
            await handleScanned(decodedText)
          },
          () => {} // error silencioso frame a frame
        )
      } catch (err) {
        console.error('Scanner error:', err)
        setError('No se pudo iniciar la cámara. Verificá los permisos.')
        setCameraOpen(false)
      }
    }

    // Pequeño delay para que el DOM esté listo
    const t = setTimeout(startScanner, 300)
    return () => clearTimeout(t)
  }, [cameraOpen, containerId])

  async function stopScanner(instance) {
    const sc = instance || scannerRef.current
    if (sc) {
      try {
        const state = sc.getState()
        if (state === 2) await sc.stop() // 2 = SCANNING
      } catch {}
    }
    scannerRef.current = null
  }

  async function closeCamera() {
    await stopScanner(null)
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
          background: 'rgba(0,0,0,0.95)',
          zIndex: 2000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          padding: '20px'
        }}>
          <p style={{ color: 'white', fontSize: '1rem', fontWeight: 600, textAlign: 'center' }}>
            Apuntá la cámara al código de barras
          </p>

          {/* Contenedor del scanner - html5-qrcode renderiza aquí */}
          <div
            id={containerId}
            style={{
              width: '100%',
              maxWidth: '500px',
              borderRadius: '12px',
              overflow: 'hidden',
              background: '#000'
            }}
          />

          <button
            onClick={closeCamera}
            className="btn btn-danger"
            style={{ marginTop: '8px' }}
          >
            <X size={16} /> Cancelar
          </button>
        </div>
      )}

      <style>{`
        .spin-anim { animation: _spin 1s linear infinite; }
        @keyframes _spin { to { transform: rotate(360deg); } }
        /* Ocultar UI innecesaria de html5-qrcode */
        #${containerId} img[alt="Info icon"],
        #${containerId} select,
        #${containerId} button:not(.btn) {
          display: none !important;
        }
      `}</style>
    </>
  )
}

/**
 * Hook para input con escaneo de código de barras (lector físico)
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
