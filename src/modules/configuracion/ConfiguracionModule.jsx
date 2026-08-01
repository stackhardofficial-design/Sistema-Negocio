import { useState, useEffect } from 'react'
import { useApp } from '../../lib/AppContext'
import { sb, dbGetCategories, dbCreateCategory, dbUpdateCategory, dbDeleteCategory, dbUpdateTenant } from '../../lib/supabase'
import Modal from '../../components/Modal'
import { Settings, Plus, Edit2, Trash2, Tag, Building2 } from 'lucide-react'

export default function ConfiguracionModule() {
  const { tenantId, tenant, setTenant, userInfo, toast } = useApp()
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [catModal, setCatModal] = useState({ open: false, edit: null })
  const [catForm, setCatForm] = useState({ name: '', icon: '' })
  const [saving, setSaving] = useState(false)
  const [tenantForm, setTenantForm] = useState({ name: '' })
  const [savingTenant, setSavingTenant] = useState(false)

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_categories', filter: `tenant_id=eq.${tenantId}` }, () => load())
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
        toast('Categoría actualizada', 'success')
      } else {
        await dbCreateCategory(tenantId, catForm.name.trim(), catForm.icon || null)
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
      setTenant(updated)
      toast('Configuración guardada', 'success')
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    } finally {
      setSavingTenant(false)
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
          <input value={catForm.icon} onChange={e => setCatForm(f => ({ ...f, icon: e.target.value }))} placeholder="Ej: 🥤" />
        </div>
      </Modal>
    </div>
  )
}
