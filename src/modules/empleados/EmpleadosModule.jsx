import { useState, useEffect } from 'react'
import { useApp } from '../../lib/AppContext'
import { sb, dbGetUsers, dbUpdateUser, dbDeleteUser, dbLogActivity, dbCreateUserForTenant, dbGetAllUsersWithTenants } from '../../lib/supabase'
import Modal from '../../components/Modal'
import { Users, Plus, Edit2, UserX, UserCheck, Search, Shield, Eye, EyeOff } from 'lucide-react'

const ROLES = [
  { value: 'vendedor', label: 'Vendedor', desc: 'Puede registrar ventas y ver productos' },
  { value: 'admin', label: 'Administrador', desc: 'Acceso completo excepto Super Admin' },
]

const AVAILABLE_MODULES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'ventas', label: 'Ventas' },
  { id: 'registro_ventas', label: 'Registro de Ventas' },
  { id: 'finanzas', label: 'Finanzas (Caja)' },
  { id: 'productos', label: 'Productos' },
  { id: 'stock', label: 'Stock' },
  { id: 'buffet', label: 'Buffet' },
  { id: 'deudores', label: 'Deudores' },
  { id: 'empleados', label: 'Empleados' },
  { id: 'historial', label: 'Historial' },
  { id: 'configuracion', label: 'Configuración' }
]

const EMPTY_NEW_USER = { name: '', email: '', password: '', role: 'vendedor', access_modules: ['dashboard', 'ventas', 'registro_ventas', 'productos', 'stock', 'buffet', 'deudores'] }

export default function EmpleadosModule() {
  const { tenantId, userInfo, toast, isAdmin, isSuperAdmin } = useApp()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Para Jefes expandidos (super_admin)
  const [expanded, setExpanded] = useState({})

  // Modal editar
  const [editModal, setEditModal] = useState({ open: false, user: null })
  const [editForm, setEditForm] = useState({ name: '', role: 'vendedor', is_active: true, access_modules: [] })

  // Modal crear nuevo
  const [newModal, setNewModal] = useState(false)
  const [newForm, setNewForm] = useState(EMPTY_NEW_USER)
  const [showPassword, setShowPassword] = useState(false)

  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    let data = []
    if (isSuperAdmin()) {
      data = await dbGetAllUsersWithTenants()
    } else if (tenantId) {
      data = await dbGetUsers(tenantId)
    }
    setUsers(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [tenantId, userInfo])

  useEffect(() => {
    if (!tenantId && !isSuperAdmin()) return
    const channel = sb.channel('empleados_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => load())
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [tenantId])

  function openEdit(u) {
    let mods = u.access_modules
    if (!mods) {
      if (u.role === 'admin' || u.role === 'super_admin') mods = AVAILABLE_MODULES.map(m => m.id)
      else mods = ['dashboard', 'ventas', 'registro_ventas', 'productos', 'stock', 'buffet', 'deudores']
    }
    setEditForm({ name: u.name || '', role: u.role || 'vendedor', is_active: u.is_active ?? true, access_modules: mods })
    setEditModal({ open: true, user: u })
  }

  function toggleModule(formSetter, moduleId) {
    formSetter(f => {
      const has = f.access_modules.includes(moduleId)
      const next = has ? f.access_modules.filter(id => id !== moduleId) : [...f.access_modules, moduleId]
      return { ...f, access_modules: next }
    })
  }

  function toggleExpanded(id) {
    setExpanded(p => ({ ...p, [id]: !p[id] }))
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
    if (!newForm.email.trim() || !newForm.email.includes('@')) return toast('Email inválido', 'warning')
    if (!newForm.password || newForm.password.length < 6) return toast('La contraseña debe tener al menos 6 caracteres', 'warning')

    setSaving(true)
    try {
      const userRow = await dbCreateUserForTenant(
        tenantId,
        newForm.email.trim().toLowerCase(),
        newForm.password,
        newForm.name.trim(),
        newForm.role,
        newForm.access_modules
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

  const groupedUsers = isSuperAdmin() ? filtered.reduce((acc, u) => {
    if (!u.tenant_id) return acc
    if (!acc[u.tenant_id]) acc[u.tenant_id] = { name: u.tenants?.name || 'Sin negocio', users: [] }
    acc[u.tenant_id].users.push(u)
    return acc
  }, {}) : {}

  return (
    <div className="fade-in">
      <div className="module-header">
        <h1>
          <span className="icon-wrap"><Users size={20} /></span>
          Empleados & Usuarios
        </h1>
        {isAdmin() && !isSuperAdmin() && (
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
            <p style={{ fontSize: '0.85rem' }}>No hay empleados que coincidan con la búsqueda</p>
          </div>
        ) : isSuperAdmin() ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {Object.entries(groupedUsers).map(([tId, group]) => {
              const jefe = group.users.find(u => u.role === 'admin')
              const empleados = group.users.filter(u => u.role !== 'admin')
              const isExp = expanded[tId]

              return (
                <div key={tId} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div 
                    onClick={() => toggleExpanded(tId)}
                    style={{ 
                      padding: '14px', display: 'flex', alignItems: 'center', gap: '14px', 
                      cursor: 'pointer', background: 'var(--bg-secondary)',
                      borderBottom: isExp ? '1px solid var(--border)' : 'none'
                    }}
                  >
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '12px',
                      background: 'var(--accent-soft)', color: 'var(--accent)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: '1.2rem', flexShrink: 0
                    }}>
                      {(jefe?.name || group.name).charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {jefe?.name || 'Sin jefe asignado'} 
                        <span className="badge badge-warning">Jefe</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Negocio: {group.name} · {empleados.length} empleados</div>
                    </div>
                    <div style={{ color: 'var(--accent)', fontSize: '0.85rem', fontWeight: 500 }}>
                      {isExp ? 'Ocultar' : 'Ver empleados'}
                    </div>
                  </div>
                  
                  {isExp && (
                    <div style={{ padding: '14px', background: 'var(--bg)' }}>
                      {empleados.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {empleados.map(u => (
                            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border)', opacity: u.is_active ? 1 : 0.6 }}>
                              <div style={{
                                width: '32px', height: '32px', borderRadius: '50%',
                                background: 'var(--bg-tertiary)', color: 'var(--text-muted)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 700, fontSize: '0.9rem', flexShrink: 0
                              }}>
                                {(u.name || u.email || '?').charAt(0).toUpperCase()}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{u.name || 'Sin nombre'}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email}</div>
                              </div>
                              <span className={`badge ${u.is_active ? 'badge-success' : 'badge-neutral'}`}>
                                {u.is_active ? 'Activo' : 'Inactivo'}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '10px' }}>
                          Este negocio no tiene empleados registrados
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
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
        title={`Editar · ${editModal.user?.name || editModal.user?.email}`}
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
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Accesos a Módulos (Apartados)</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '8px' }}>
            {AVAILABLE_MODULES.map(m => (
              <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={editForm.access_modules.includes(m.id)}
                  onChange={() => toggleModule(setEditForm, m.id)}
                />
                {m.label}
              </label>
            ))}
          </div>
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
            El empleado recibirá acceso al sistema con el email y contraseña que asignes.
          </div>
          <div className="form-group">
            <label className="form-label">Nombre completo *</label>
            <input
              value={newForm.name}
              onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ej: María García"
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
            <label className="form-label">Contraseña *</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={newForm.password}
                onChange={e => setNewForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Mínimo 6 caracteres"
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
                Mínimo 6 caracteres ({newForm.password.length}/6)
              </small>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Rol</label>
            <select value={newForm.role} onChange={e => setNewForm(f => ({ ...f, role: e.target.value }))}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Accesos a Módulos (Apartados)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '8px' }}>
              {AVAILABLE_MODULES.map(m => (
                <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={newForm.access_modules.includes(m.id)}
                    onChange={() => toggleModule(setNewForm, m.id)}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

