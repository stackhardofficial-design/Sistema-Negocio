import { useState, useEffect } from 'react'
import { useApp } from '../../lib/AppContext'
import { dbGetAllTenants, dbCreateTenant, dbUpdateTenant, dbCreateUserForTenant, sb } from '../../lib/supabase'
import Modal from '../../components/Modal'
import { Crown, Plus, Building2, Users, Edit2, Search, ToggleLeft } from 'lucide-react'

function formatDate(d) { return new Date(d).toLocaleDateString('es-AR') }

const EMPTY_TENANT = { name: '', admin_name: '', admin_email: '', admin_password: '', plan: 'basic' }

export default function SuperAdminModule() {
  const { toast } = useApp()
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState({ open: false, edit: null })
  const [form, setForm] = useState(EMPTY_TENANT)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const data = await dbGetAllTenants()
    setTenants(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Auto-complete email when place name changes
  function handleNameChange(name) {
    const slug = name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')
    setForm(f => ({
      ...f,
      name,
      admin_email: slug ? `admin@${slug}.com` : f.admin_email
    }))
  }

  async function handleSave() {
    if (!form.name.trim()) return toast('El nombre del lugar es obligatorio', 'warning')

    setSaving(true)
    let createdTenantId = null
    try {
      if (modal.edit) {
        await dbUpdateTenant(modal.edit.id, {
          name: form.name.trim(),
          plan: form.plan
        })
        toast('Negocio actualizado', 'success')
      } else {
        // Validar contraseña mínima si se va a crear usuario
        if (form.admin_email && form.admin_password && form.admin_password.length < 6) {
          return toast('La contraseña debe tener al menos 6 caracteres', 'warning')
        }

        // Generar slug base (se hace único en dbCreateTenant automáticamente)
        const slugBase = form.name.trim()
          .toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar acentos
          .replace(/\s+/g, '')
          .replace(/[^a-z0-9]/g, '')
          || 'negocio'

        // Crear tenant (slug único garantizado)
        const tenant = await dbCreateTenant({
          name: form.name.trim(),
          slug: slugBase,
          plan: form.plan || 'basic',
          is_active: true
        })
        createdTenantId = tenant.id

        // Crear usuario admin si se proporcionaron credenciales
        if (form.admin_email && form.admin_password) {
          try {
            await dbCreateUserForTenant(
              tenant.id,
              form.admin_email.trim(),
              form.admin_password,
              form.admin_name || 'Admin',
              'admin'
            )
          } catch (userErr) {
            // Rollback: eliminar el tenant creado si el usuario falló
            await sb.from('tenants').delete().eq('id', tenant.id)
            throw new Error(`Error al crear el usuario admin: ${userErr.message}`)
          }
        }

        toast(`Negocio "${form.name}" creado exitosamente`, 'success')
      }

      setModal({ open: false, edit: null })
      setForm(EMPTY_TENANT)
      load()
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    } finally {
      setSaving(false)
    }
  }


  function openEdit(t) {
    setForm({ name: t.name, admin_email: '', admin_password: '', admin_name: '', plan: t.plan || 'basic' })
    setModal({ open: true, edit: t })
  }

  const filtered = tenants.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.slug || '').includes(search.toLowerCase())
  )

  return (
    <div className="fade-in">
      <div className="module-header">
        <h1>
          <span className="icon-wrap" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
            <Crown size={20} />
          </span>
          Super Admin
        </h1>
        <button onClick={() => { setForm(EMPTY_TENANT); setModal({ open: true, edit: null }) }} className="btn btn-primary">
          <Plus size={16} /> Nuevo negocio
        </button>
      </div>

      <div className="module-content">
        <div style={{
          padding: '12px 16px', background: 'var(--danger-soft)',
          border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)',
          fontSize: '0.85rem', color: 'var(--danger)', marginBottom: '20px',
          display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          <Crown size={16} />
          Panel de administración global · Solo accesible por <strong>tomas@stackhard.com</strong>
        </div>

        {/* Stats */}
        <div className="kpi-grid" style={{ marginBottom: '20px' }}>
          <div className="kpi-card">
            <div className="kpi-label">Total negocios</div>
            <div className="kpi-value">{tenants.length}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Activos</div>
            <div className="kpi-value">{tenants.filter(t => t.is_active).length}</div>
          </div>
        </div>

        <div className="search-wrap" style={{ marginBottom: '16px', maxWidth: '400px' }}>
          <Search size={16} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar negocio..." />
        </div>

        {loading ? (
          <div className="empty-state"><div className="spinner" /></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(t => (
              <div key={t.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  background: 'var(--accent-soft)', color: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: '1.2rem', flexShrink: 0
                }}>
                  {t.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{t.name}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    @{t.slug} · Plan: {t.plan || 'basic'} · Creado: {formatDate(t.created_at)}
                  </div>
                </div>
                <span className={`badge ${t.is_active ? 'badge-success' : 'badge-neutral'}`}>
                  {t.is_active ? 'Activo' : 'Inactivo'}
                </span>
                <button onClick={() => openEdit(t)} className="btn btn-secondary btn-sm">
                  <Edit2 size={12} /> Editar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={modal.open}
        onClose={() => setModal({ open: false, edit: null })}
        title={modal.edit ? 'Editar negocio' : 'Nuevo negocio'}
        size="md"
        footer={
          <>
            <button onClick={() => setModal({ open: false, edit: null })} className="btn btn-secondary">Cancelar</button>
            <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : modal.edit ? 'Guardar' : 'Crear negocio'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Nombre del lugar *</label>
          <input
            value={form.name}
            onChange={e => handleNameChange(e.target.value)}
            placeholder="Ej: Buffet San Martín"
            autoFocus
          />
          <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            El slug y el email del admin se generan automáticamente
          </small>
        </div>

        {!modal.edit && (
          <>
            <div className="form-group">
              <label className="form-label">Nombre del admin</label>
              <input
                value={form.admin_name}
                onChange={e => setForm(f => ({ ...f, admin_name: e.target.value }))}
                placeholder="Ej: María García"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email del admin</label>
              <input
                value={form.admin_email}
                onChange={e => setForm(f => ({ ...f, admin_email: e.target.value }))}
                placeholder="admin@nombrelugar.com"
                style={{ background: form.admin_email.includes('@') ? 'var(--success-soft)' : undefined }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Contraseña del admin</label>
              <input
                type="password"
                value={form.admin_password}
                onChange={e => setForm(f => ({ ...f, admin_password: e.target.value }))}
                placeholder="Mínimo 8 caracteres"
              />
            </div>
          </>
        )}

        <div className="form-group">
          <label className="form-label">Plan</label>
          <select value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}>
            <option value="basic">Básico</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
      </Modal>
    </div>
  )
}
