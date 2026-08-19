import { useState, useEffect } from 'react'
import { useApp } from '../../lib/AppContext'
import { sb, dbGetCategories, dbCreateCategory, dbUpdateCategory, dbDeleteCategory, dbUpdateTenant, dbLogActivity, dbUpdateUserTheme } from '../../lib/supabase'
import { THEMES } from '../../lib/themes'
import Modal from '../../components/Modal'
import { Settings, Plus, Edit2, Trash2, Tag, Building2, RefreshCw, Download, Palette, Check } from 'lucide-react'

export default function ConfiguracionModule() {
  const { tenantId, tenant, setTenant, userInfo, toast, user, themeColor, setThemeColor } = useApp()
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [catModal, setCatModal] = useState({ open: false, edit: null })
  const [catForm, setCatForm] = useState({ name: '', icon: '' })
  const [saving, setSaving] = useState(false)
  const [tenantForm, setTenantForm] = useState({ name: '' })
  const [savingTenant, setSavingTenant] = useState(false)
  const [savingTheme, setSavingTheme] = useState(false)

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
  async function handleInstallApp() {
    if (window.deferredPrompt) {
      window.deferredPrompt.prompt()
      const { outcome } = await window.deferredPrompt.userChoice
      if (outcome === 'accepted') window.deferredPrompt = null
    } else if (isIOS) {
      alert("Para instalar en iPhone/iPad:\n1. Tocá el botón 'Compartir' (el cuadrado con la flecha hacia arriba) en Safari.\n2. Seleccioná 'Agregar a Inicio'.")
    } else {
      alert("La app ya está instalada o tu navegador no lo soporta. En Android, podés buscar la opción 'Agregar a la pantalla principal' en el menú de Chrome.")
    }
  }

  async function handleSelectTheme(themeId) {
    if (themeId === themeColor || savingTheme) return
    setSavingTheme(true)
    try {
      setThemeColor(themeId)
      await dbUpdateUserTheme(user.id, themeId)
      toast('Tema actualizado', 'success')
    } catch (err) {
      toast(`Error al cambiar tema: ${err.message}`, 'danger')
      setThemeColor(themeColor) // revert
    } finally {
      setSavingTheme(false)
    }
  }

  async function load() {
    if (!tenantId) { setLoading(false); return; }
    setLoading(true)
    const data = await dbGetCategories(tenantId)
    setCategories(data)
    if (tenant) setTenantForm({ name: tenant.name || '' })
    setLoading(false)
  }

  useEffect(() => { load() }, [tenantId, tenant])

  useEffect(() => {
    if (!tenantId) return
    const channel = sb.channel('config_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `tenant_id=eq.${tenantId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tenants', filter: `id=eq.${tenantId}` }, () => load())
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [tenantId])

  async function handleSaveCat() {
    if (!catForm.name.trim()) return toast('El nombre es obligatorio', 'warning')
    setSaving(true)
    try {
      if (catModal.edit) {
        await dbUpdateCategory(catModal.edit.id, { name: catForm.name.trim(), icon: catForm.icon || null })
        await dbLogActivity(tenantId, userInfo?.id, 'update', 'category', catModal.edit.id, { name: catForm.name.trim() })
        toast('Categoría actualizada', 'success')
      } else {
        const created = await dbCreateCategory(tenantId, catForm.name.trim(), catForm.icon || null)
        await dbLogActivity(tenantId, userInfo?.id, 'create', 'category', created.id, { name: catForm.name.trim() })
        toast('Categoría creada', 'success')
      }
      setCatModal({ open: false, edit: null })
      setCatForm({ name: '', icon: '' })
      load()
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteCat(cat) {
    if (!confirm(`¿Eliminar categoría "${cat.name}"?`)) return
    try {
      await dbDeleteCategory(cat.id)
      await dbLogActivity(tenantId, userInfo?.id, 'delete', 'category', cat.id, { name: cat.name })
      toast('Categoría eliminada', 'success')
      load()
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    }
  }

  async function handleSaveTenant() {
    if (!tenantForm.name.trim()) return toast('El nombre es obligatorio', 'warning')
    setSavingTenant(true)
    try {
      const updated = await dbUpdateTenant(tenantId, { name: tenantForm.name.trim() })
      await dbLogActivity(tenantId, userInfo?.id, 'update', 'tenant', tenantId, { name: tenantForm.name.trim() })
      setTenant(updated)
      toast('Configuración guardada', 'success')
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    } finally {
      setSavingTenant(false)
    }
  }

  async function handleUpdateApp() {
    const confirmUpdate = window.confirm('¿Forzar actualización a la última versión? Esto recargará el sistema y limpiará el caché local.')
    if (confirmUpdate) {
      if ('serviceWorker' in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations()
          for (const reg of regs) {
            await reg.unregister()
          }
        } catch(e) {
          console.error('Error unregistering sw', e)
        }
      }
      // Force reload ignoring cache
      window.location.reload(true)
    }
  }

  return (
    <div className="fade-in">
      <div className="module-header">
        <h1>
          <span className="icon-wrap"><Settings size={20} /></span>
          Configuración
        </h1>
      </div>

      <div className="module-content" style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '700px' }}>

        {/* Tema de Colores */}
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '0.95rem' }}>
            <Palette size={16} color="var(--accent)" /> Tema de Colores
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Elegí tu color preferido. Se guarda automáticamente para tu usuario.
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: '10px'
          }}>
            {THEMES.map(theme => {
              const isActive = themeColor === theme.id
              return (
                <button
                  key={theme.id}
                  onClick={() => handleSelectTheme(theme.id)}
                  disabled={savingTheme}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: isActive ? `${theme.accentSoft}` : 'var(--bg-tertiary)',
                    border: isActive ? `2px solid ${theme.accent}` : '2px solid var(--border)',
                    cursor: savingTheme ? 'wait' : 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = theme.accent
                      e.currentTarget.style.transform = 'translateY(-2px)'
                      e.currentTarget.style.boxShadow = theme.shadowAccent
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = 'var(--border)'
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = 'none'
                    }
                  }}
                >
                  {/* Color circle */}
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: theme.accent,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: `0 2px 8px ${theme.accentGlow}`,
                  }}>
                    {isActive && <Check size={14} color="#fff" strokeWidth={3} />}
                  </div>
                  {/* Theme name */}
                  <div style={{ textAlign: 'left' }}>
                    <div style={{
                      fontSize: '0.8rem',
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? theme.accent : 'var(--text-primary)',
                      lineHeight: 1.2,
                    }}>
                      {theme.name}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Instalar App */}
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontSize: '0.95rem' }}>
            <Download size={16} color="var(--accent)" /> Instalar Sistema
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Descargá e instalá esta app en tu PC, Android o iPhone para un acceso más rápido, a pantalla completa y sin distracciones.
          </p>
          <button onClick={handleInstallApp} className="btn btn-primary btn-sm">
            <Download size={14} /> Instalar Aplicación
          </button>
        </div>

        {/* Negocio */}
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontSize: '0.95rem' }}>
            <Building2 size={16} color="var(--accent)" /> Datos del negocio
          </h3>
          <div className="form-group">
            <label className="form-label">Nombre del negocio</label>
            <input
              value={tenantForm.name}
              onChange={e => setTenantForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Nombre del buffet/quiosco"
            />
          </div>
          <button onClick={handleSaveTenant} className="btn btn-primary btn-sm" disabled={savingTenant} style={{ marginTop: '12px' }}>
            {savingTenant ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>

        {/* Categorías */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem' }}>
              <Tag size={16} color="var(--accent)" /> Categorías de productos
            </h3>
            <button
              onClick={() => { setCatForm({ name: '', icon: '' }); setCatModal({ open: true, edit: null }) }}
              className="btn btn-primary btn-sm"
            >
              <Plus size={14} /> Nueva
            </button>
          </div>
          {loading ? (
            <div className="empty-state"><div className="spinner" /></div>
          ) : categories.length === 0 ? (
            <div className="empty-state" style={{ padding: '20px' }}>
              <Tag size={32} />
              <p>Sin categorías creadas</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {categories.map(cat => (
                <div
                  key={cat.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 12px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)'
                  }}
                >
                  {cat.icon && <span>{cat.icon}</span>}
                  <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{cat.name}</span>
                  <button onClick={() => { setCatForm({ name: cat.name, icon: cat.icon || '' }); setCatModal({ open: true, edit: cat }) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
                    <Edit2 size={12} />
                  </button>
                  <button onClick={() => handleDeleteCat(cat)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 0, display: 'flex' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sistema */}
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem', marginBottom: '16px' }}>
            <RefreshCw size={16} color="var(--accent)" /> Sistema y Actualizaciones
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
            Si notas que el sistema está desactualizado o hay un error de caché, puedes forzar la descarga de la última versión desde Vercel.
          </p>
          <button onClick={handleUpdateApp} className="btn btn-secondary btn-sm" style={{ gap: '6px' }}>
            <RefreshCw size={14} /> Actualizar a última versión
          </button>
        </div>
      </div>

      <Modal
        open={catModal.open}
        onClose={() => setCatModal({ open: false, edit: null })}
        title={catModal.edit ? 'Editar categoría' : 'Nueva categoría'}
        footer={
          <>
            <button onClick={() => setCatModal({ open: false, edit: null })} className="btn btn-secondary">Cancelar</button>
            <button onClick={handleSaveCat} className="btn btn-primary" disabled={saving}>Guardar</button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Nombre *</label>
          <input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Bebidas" autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Icono (emoji)</label>
          <input value={catForm.icon} onChange={e => setCatForm(f => ({ ...f, icon: e.target.value }))} placeholder="Ej: fa-coffee" />
        </div>
      </Modal>
    </div>
  )
}
