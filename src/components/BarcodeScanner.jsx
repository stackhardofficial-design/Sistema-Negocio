import { useState, useRef, useEffect } from 'react'
import { Camera, X, Loader, Scan } from 'lucide-react'

/**
 * BarcodeScanner - Escáner de código de barras
 * 
 * En desktop/escáneres físicos: captura automáticamente teclas rápidas seguidas de Enter
 * En móvil: abre la cámara trasera con input type=file + capture, y usa BarcodeDetector si está disponible
 * 
 * Props:
 *   onScan(barcode: string) - callback cuando se detecta un código
 *   active - si el scanner está activo (para evitar conflictos)
 *   showCamera - mostrar botón de cámara
 */
export default function BarcodeScanner({ onScan, active = true, showCamera = false }) {
  const [scanning, setScanning] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [error, setError] = useState('')
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const fileInputRef = useRef(null)
  const detectorRef = useRef(null)
  const detectingRef = useRef(false)

  // ===== LECTOR FÍSICO (USB HID) =====
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

  // ===== CÁMARA EN VIVO (solo si BarcodeDetector disponible) =====
  async function openLiveCamera() {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Tu navegador no soporta acceso a la cámara.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream
      setCameraOpen(true)

      // Esperar al siguiente frame para que el video esté montado
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
        }

        if ('BarcodeDetector' in window) {
          detectorRef.current = new window.BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'code_128', 'qr_code', 'upc_a', 'upc_e', 'code_39']
          })
          detectingRef.current = true
          detectFrame()
        }
      }, 300)
    } catch (err) {
      console.error('Camera error:', err)
      setError('No se pudo acceder a la cámara. Verificá los permisos del navegador.')
    }
  }

  async function detectFrame() {
    if (!detectingRef.current || !videoRef.current || !detectorRef.current) return
    try {
      const codes = await detectorRef.current.detect(videoRef.current)
      if (codes.length > 0) {
        const code = codes[0].rawValue
        closeCamera()
        await handleScanned(code)
        return
      }
    } catch {}
    if (detectingRef.current) requestAnimationFrame(detectFrame)
  }

  function closeCamera() {
    detectingRef.current = false
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setCameraOpen(false)
    setError('')
  }

  // ===== CAPTURA DE FOTO (fallback universal - funciona en iOS y Android) =====
  async function handleFileCapture(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // reset para permitir re-escaneo

    setScanning(true)
    setError('')
    try {
      if ('BarcodeDetector' in window) {
        const detector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'qr_code', 'upc_a', 'upc_e', 'code_39']
        })
        const bitmap = await createImageBitmap(file)
        const codes = await detector.detect(bitmap)
        if (codes.length > 0) {
          await handleScanned(codes[0].rawValue)
        } else {
          setError('No se detectó ningún código. Intentá de nuevo con mejor iluminación.')
        }
      } else {
        setError('Tu dispositivo no soporta detección automática. Ingresá el código manualmente.')
      }
    } catch (err) {
      console.error('File scan error:', err)
      setError('Error al procesar la imagen.')
    } finally {
      setScanning(false)
    }
  }

  return (
    <>
      {scanning && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          color: 'var(--accent)', fontSize: '0.8rem', padding: '4px 10px',
          background: 'var(--accent-soft)', borderRadius: '20px'
        }}>
          <Loader size={14} className="spinning" /> Buscando...
        </div>
      )}

      {showCamera && !scanning && (
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {/* Botón cámara en vivo - ideal en Android Chrome */}
          <button
            type="button"
            onClick={openLiveCamera}
            className="btn btn-secondary btn-sm"
            title="Escanear con cámara en tiempo real"
          >
            <Scan size={16} />
          </button>

          {/* Botón captura de foto - funciona en iOS Safari y todos los móviles */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-secondary btn-sm"
            title="Tomar foto del código"
          >
            <Camera size={16} />
          </button>

          {/* Input de archivo oculto que abre la cámara nativa del celular */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileCapture}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {error && (
        <div style={{
          color: 'var(--danger)', fontSize: '0.75rem',
          padding: '4px 8px', background: 'var(--danger-soft)',
          borderRadius: '6px', marginTop: '4px'
        }}>
          {error}
        </div>
      )}

      {/* Modal cámara en vivo */}
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
          <p style={{ color: 'white', fontSize: '1rem', fontWeight: 600 }}>
            Apuntá la cámara al código de barras
          </p>
          <div style={{ position: 'relative', width: '100%', maxWidth: '500px' }}>
            <video
              ref={videoRef}
              style={{
                width: '100%',
                borderRadius: '12px',
                border: '2px solid var(--accent)',
                display: 'block'
              }}
              playsInline
              muted
              autoPlay
            />
            {/* Línea animada de escaneo */}
            <div style={{
              position: 'absolute', left: '10%', right: '10%',
              height: '2px', background: 'var(--accent)',
              animation: 'scanLine 1.8s ease-in-out infinite',
              boxShadow: '0 0 12px var(--accent)',
              top: '20%'
            }} />
          </div>

          {'BarcodeDetector' in window ? (
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
              Detección automática activa
            </p>
          ) : (
            <p style={{ color: 'var(--warning)', fontSize: '0.85rem' }}>
              ⚠ Tu navegador no soporta detección automática.<br />
              Usá el botón 📷 para tomar una foto del código.
            </p>
          )}

          <button onClick={closeCamera} className="btn btn-danger">
            <X size={16} /> Cancelar
          </button>
        </div>
      )}

      <style>{`
        .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes scanLine {
          0% { top: 20%; }
          50% { top: 78%; }
          100% { top: 20%; }
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
