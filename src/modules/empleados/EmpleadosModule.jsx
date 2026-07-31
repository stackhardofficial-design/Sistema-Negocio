import { useState, useEffect } from 'react'
import { useApp } from '../../lib/AppContext'
import { dbGetUsers, dbUpdateUser, dbDeleteUser, dbLogActivity, dbCreateUserForTenant } from '../../lib/supabase'
import Modal from '../../components/Modal'
import { Users, Plus, Edit2, UserX, UserCheck, Search, Shield, Eye, EyeOff } from 'lucide-react'

const ROLES = [
  { value: 'vendedor', label: 'Vendedor', desc: 'Puede registrar ventas y ver productos' },
  { value: 'admin', label: 'Administrador', desc: 'Acceso completo excepto Super Admin' },
]

const EMPTY_NEW_USER = { name: '', email: '', password: '', role: 'vendedor' }

export default function EmpleadosModule() {
  const { tenantId, userInfo, toast, isAdmin } = useApp()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modal editar
  const [editModal, setEditModal] = useState({ open: false, user: null })
  const [editForm, setEditForm] = useState({ name: '', role: 'vendedor', is_active: true })

  // Modal crear nuevo
  const [newModal, setNewModal] = useState(false)
  const [newForm, setNewForm] = useState(EMPTY_NEW_USER)
  const [showPassword, setShowPassword] = useState(false)

  const [saving, setSaving] = useState(false)

  async function load() {
    if (!tenantId) { setLoading(false); return }
    setLoading(true)
    const data = await dbGetUsers(tenantId)
    setUsers(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [tenantId])

  function openEdit(u) {
    setEditForm({ name: u.name || '', role: u.role || 'vendedor', is_active: u.is_active ?? true })
    setEditModal({ open: true, user: u })
  }

  async function handleUpdate() {
    if (!editForm.name.trim()) return toast('El nombre es obligatorio', 'warning')
    setSaving(true)
    try {
      await dbUpdateUser(editModal.user.id, editForm)
      await dbLogActivity(tenantId, userInfo?.id, 'update', 'user', editModal.user.id, { role: editForm.role })
      toast('Usuario actualizado', 'success')
      setEditModal({ open: false, user: null })
      load()
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateUser() {
    if (!newForm.name.trim()) return toast('El nombre es obligatorio', 'warning')
    if (!newForm.email.trim() || !newForm.email.includes('@')) return toast('Email invÃ¡lido', 'warning')
    if (!newForm.password || newForm.password.length < 6) return toast('La contraseÃ±a debe tener al menos 6 caracteres', 'warning')

    setSaving(true)
    try {
      const userRow = await dbCreateUserForTenant(
        tenantId,
        newForm.email.trim().toLowerCase(),
        newForm.password,
        newForm.name.trim(),
        newForm.role
      )
      await dbLogActivity(tenantId, userInfo?.id, 'create', 'user', userRow.id, {
        name: newForm.name, email: newForm.email, role: newForm.role
      })
      toast(`Usuario "${newForm.name}" creado correctamente`, 'success')
      setNewModal(false)
      setNewForm(EMPTY_NEW_USER)
      setShowPassword(false)
      load()
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(u) {
    try {
      await dbUpdateUser(u.id, { is_active: !u.is_active })
      await dbLogActivity(tenantId, userInfo?.id, u.is_active ? 'deactivate' : 'activate', 'user', u.id, { name: u.name })
      toast(`Usuario ${u.is_active ? 'desactivado' : 'activado'}`, 'success')
      load()
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger')
    }
  }

  const filtered = users.filter(u =>
    (u.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="fade-in">
      <div className="module-header">
        <h1>
          <span className="icon-wrap"><Users size={20} /></span>
          Empleados & Usuarios
        </h1>
        {isAdmin() && (
          <button onClick={() => { setNewForm(EMPTY_NEW_USER); setShowPassword(false); setNewModal(true) }} className="btn btn-primary">
            <Plus size={16} /> Nuevo empleado
          </button>
        )}
      </div>

      <div className="module-content">
        <div className="search-wrap" style={{ marginBottom: '16px', maxWidth: '400px' }}>
          <Search size={16} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o email..." />
        </div>

        {loading ? (
          <div className="empty-state"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <Users size={40} />
            <h3>Sin usuarios</h3>
            <p style={{ fontSize: '0.85rem' }}>No hay empleados que coincidan con la bÃºsqueda</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(u => (
              <div key={u.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px', opacity: u.is_active ? 1 : 0.6 }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '50%',
                  background: u.role === 'admin' ? 'var(--accent-soft)' : 'var(--bg-tertiary)',
                  color: u.role === 'admin' ? 'var(--accent)' : 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: '1.1rem', flexShrink: 0
                }}>
                  {(u.name || u.email || '?').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {u.name || 'Sin nombre'}
                    {u.id === userInfo?.id && <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>Vos</span>}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{u.email}</div>
                </div>
                <div>
                  <span className={`badge ${u.role === 'admin' ? 'badge-warning' : u.role === 'super_admin' ? 'badge-danger' : 'badge-neutral'}`}>
                    <Shield size={10} /> {u.role || 'vendedor'}
                  </span>
                </div>
                <div>
                  <span className={`badge ${u.is_active ? 'badge-success' : 'badge-neutral'}`}>
                    {u.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {u.role !== 'super_admin' && u.id !== userInfo?.id && isAdmin() && (
                    <>
                      <button onClick={() => openEdit(u)} className="btn btn-secondary btn-sm">
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => toggleActive(u)}
                        className={`btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-success'}`}
                        title={u.is_active ? 'Desactivar' : 'Activar'}
                      >
                        {u.is_active ? <UserX size={12} /> : <UserCheck size={12} />}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== MODAL: EDITAR USUARIO ===== */}
      <Modal
        open={editModal.open}
        onClose={() => setEditModal({ open: false, user: null })}
        title={`Editar Â· ${editModal.user?.name || editModal.user?.email}`}
        footer={
          <>
            <button onClick={() => setEditModal({ open: false, user: null })} className="btn btn-secondary">Cancelar</button>
            <button onClick={handleUpdate} className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Nombre</label>
          <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre completo" autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Rol</label>
          <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label} â€” {r.desc}</option>)}
          </select>
        </div>
      </Modal>

      {/* ===== MODAL: NUEVO EMPLEADO ===== */}
      <Modal
        open={newModal}
        onClose={() => { setNewModal(false); setNewForm(EMPTY_NEW_USER); setShowPassword(false) }}
        title="Agregar nuevo empleado"
        footer={
          <>
            <button onClick={() => { setNewModal(false); setNewForm(EMPTY_NEW_USER) }} className="btn btn-secondary">Cancelar</button>
            <button onClick={handleCreateUser} className="btn btn-primary" disabled={saving}>
              {saving ? 'Creando...' : <><Plus size={14} /> Crear empleado</>}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{
            padding: '10px 14px', background: 'var(--info-soft)',
            border: '1px solid rgba(59,130,246,0.2)', borderRadius: 'var(--radius-md)',
            fontSize: '0.82rem', color: 'var(--info)'
          }}>
            El empleado recibirÃ¡ acceso al sistema con el email y contraseÃ±a que asignes.
          </div>
          <div className="form-group">
            <label className="form-label">Nombre completo *</label>
            <input
              value={newForm.name}
              onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ej: MarÃ­a GarcÃ­a"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email *</label>
            <input
              type="email"
              value={newForm.email}
              onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))}
              placeholder="empleado@email.com"
              autoComplete="off"
            />
          </div>
          <div className="form-group">
            <label className="form-label">ContraseÃ±a *</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={newForm.password}
                onChange={e => setNewForm(f => ({ ...f, password: e.target.value }))}
                placeholder="MÃ­nimo 6 caracteres"
                style={{ paddingRight: '44px' }}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={{
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                  display: 'flex', alignItems: 'center'
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {newForm.password && newForm.password.length < 6 && (
              <small style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>
                MÃ­nimo 6 caracteres ({newForm.password.length}/6)
              </small>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Rol</label>
            <select value={newForm.role} onChange={e => setNewForm(f => ({ ...f, role: e.target.value }))}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label} â€” {r.desc}</option>)}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  )
}

