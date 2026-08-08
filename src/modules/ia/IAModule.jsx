import { useState, useRef, useEffect, useCallback } from 'react'
import { useApp } from '../../lib/AppContext'
import { streamGroq, fetchBusinessContext } from '../../lib/groq'
import { executeAIAction } from '../../lib/aiActions'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Bot, Send, Loader, Sparkles, Plus, MessageSquare,
  Trash2, Clock, TrendingUp, Package, DollarSign, AlertTriangle, Users, CheckCircle
} from 'lucide-react'

// ── Helpers ──
const STORAGE_KEY = 'stackhard_ai_chats'
function loadChats() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] } }
function saveChats(chats) { localStorage.setItem(STORAGE_KEY, JSON.stringify(chats)) }
function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function autoTitle(msgs) {
  const u = msgs.find(m => m.role === 'user')
  if (!u) return 'Nueva conversación'
  const t = u.content.slice(0, 40)
  return t.length < u.content.length ? t + '…' : t
}

function renderMarkdown(text) {
  if (!text) return ''
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^• /gm, '‣ ')
    .replace(/\n/g, '<br/>')
}

const QUICK_ACTIONS = [
  { icon: DollarSign, label: '¿Cuánto gané hoy?', color: '#10b981' },
  { icon: TrendingUp, label: 'Análisis financiero del mes', color: '#3b82f6' },
  { icon: Package, label: 'Productos con poco stock', color: '#f59e0b' },
  { icon: Users, label: '¿Cuánto me deben los deudores?', color: '#ef4444' },
  { icon: AlertTriangle, label: '¿Qué productos son más rentables?', color: '#8b5cf6' },
  { icon: TrendingUp, label: 'Sugerencias para mejorar las ventas', color: '#06b6d4' },
]

export default function IAModule() {
  const { tenantId, userInfo, tenant } = useApp()
  const navigate = useNavigate()
  const location = useLocation()

  const [chats, setChats] = useState(() => loadChats())
  const [activeChatId, setActiveChatId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [executingAction, setExecutingAction] = useState(false)

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { saveChats(chats) }, [chats])
  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    if (activeChatId) {
      const chat = chats.find(c => c.id === activeChatId)
      if (chat) setMessages(chat.messages)
    }
  }, [activeChatId])

  function newChat() { setActiveChatId(null); setMessages([]); setInput(''); setSidebarOpen(false) }
  function loadChat(id) { const c = chats.find(x => x.id === id); if (c) { setActiveChatId(id); setMessages(c.messages); setSidebarOpen(false) } }
  function deleteChat(id, e) { e.stopPropagation(); setChats(p => p.filter(c => c.id !== id)); if (activeChatId === id) newChat() }

  const saveCurrentChat = useCallback((msgs) => {
    if (msgs.length < 2) return
    setChats(prev => {
      if (activeChatId) {
        return prev.map(c => c.id === activeChatId ? { ...c, messages: msgs, updatedAt: Date.now() } : c)
      } else {
        const id = generateId()
        setActiveChatId(id)
        return [{ id, title: autoTitle(msgs), messages: msgs, createdAt: Date.now(), updatedAt: Date.now() }, ...prev]
      }
    })
  }, [activeChatId])

  async function handleExecuteAction(msgIndex, action) {
    if (!action || executingAction) return
    setExecutingAction(true)
    try {
      const result = await executeAIAction(action, tenantId, userInfo.id)
      
      setMessages(prev => {
        const newMsgs = [...prev]
        newMsgs[msgIndex] = { ...newMsgs[msgIndex], actionExecuted: true, actionResult: result.message, actionSuccess: result.success }
        saveCurrentChat(newMsgs)
        return newMsgs
      })

      if (result.success && result.navigate) {
        setTimeout(() => navigate('/' + result.navigate), 500)
      }
    } catch (err) {
      alert('Error ejecutando acción: ' + err.message)
    } finally {
      setExecutingAction(false)
    }
  }

  async function sendMessage(text) {
    const msg = (text || input).trim()
    if (!msg || loading) return
    const userMsg = { role: 'user', content: msg }
    const newMsgs = [...messages, userMsg]
    setMessages([...newMsgs, { role: 'assistant', content: '' }])
    setInput('')
    setLoading(true)

    try {
      const context = await fetchBusinessContext(tenantId)
      const moduleInfo = `Usuario: ${userInfo?.name || '?'}. Negocio: ${tenant?.name || '?'}.`
      const { action } = await streamGroq(
        newMsgs.slice(-20),
        (delta, full) => {
          const clean = full.replace(/```action\n[\s\S]*?\n```/g, '').trim()
          setMessages(prev => {
            const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: clean }; return u
          })
        },
        `${moduleInfo}\n\n${context}`
      )
      setMessages(prev => {
        const f = [...prev]
        if (f.length > 0) {
          f[f.length - 1].content = f[f.length - 1].content.replace(/```action\n[\s\S]*?\n```/g, '').trim()
          if (action) f[f.length - 1].action = action
        }
        saveCurrentChat(f)
        return f
      })
    } catch (err) {
      setMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: `⚠️ Error: ${err.message}` }; return u })
    } finally { setLoading(false) }
  }

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const showWelcome = messages.length === 0

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 'calc(100vh - 60px)', position: 'relative' }}>

      {/* ─── SIDEBAR HISTORIAL ─── */}
      {sidebarOpen && (
        <div style={{
          position: isMobile ? 'absolute' : 'relative',
          top: 0, left: 0, bottom: 0,
          width: isMobile ? '100%' : '260px',
          background: 'var(--bg)', borderRight: '1px solid var(--border)',
          zIndex: 10, display: 'flex', flexDirection: 'column',
          boxShadow: isMobile ? '4px 0 20px rgba(0,0,0,0.3)' : 'none'
        }}>
          <div style={{ padding: '14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px' }}>
            <button onClick={newChat} className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
              <Plus size={16} /> Nuevo Chat
            </button>
            <button onClick={() => setSidebarOpen(false)} className="btn btn-secondary" style={{ padding: '8px 10px' }}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {chats.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sin conversaciones previas</div>
            ) : chats.map(chat => (
              <div key={chat.id} onClick={() => loadChat(chat.id)} style={{
                padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', marginBottom: '4px',
                background: chat.id === activeChatId ? 'var(--accent-soft)' : 'transparent',
                border: chat.id === activeChatId ? '1px solid rgba(245,158,11,0.3)' : '1px solid transparent',
                display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.15s'
              }}>
                <MessageSquare size={14} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.title}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{new Date(chat.updatedAt).toLocaleDateString('es-AR')}</div>
                </div>
                <button onClick={(e) => deleteChat(chat.id, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex', opacity: 0.5 }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── PANEL PRINCIPAL ─── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px',
          background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(249,115,22,0.04))',
          borderBottom: '1px solid var(--border)', flexShrink: 0
        }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '8px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex'
          }}>
            <MessageSquare size={16} />
          </button>
          <div style={{
            width: '32px', height: '32px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #f59e0b, #f97316)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <Bot size={18} color="white" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>StackHard AI</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} /> Asesor financiero activo
            </div>
          </div>
          <button onClick={newChat} className="btn btn-secondary" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem' }}>
            <Plus size={14} /> Nuevo
          </button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {showWelcome && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px', padding: '20px', textAlign: 'center' }}>
              <div style={{
                width: '72px', height: '72px', borderRadius: '22px',
                background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(249,115,22,0.08))',
                border: '1px solid rgba(245,158,11,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Sparkles size={32} color="var(--accent)" />
              </div>
              <div>
                <h2 style={{ margin: '0 0 8px', fontSize: '1.3rem', fontWeight: 700 }}>
                  Hola, {userInfo?.name?.split(' ')[0] || 'ahí'} 👋
                </h2>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: '450px', lineHeight: 1.5 }}>
                  Soy tu asesor financiero con inteligencia artificial. Puedo analizar tus ventas, controlar tu inventario, gestionar deudores y ayudarte a tomar mejores decisiones para tu negocio.
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', width: '100%', maxWidth: '550px' }}>
                {QUICK_ACTIONS.map((qa, i) => (
                  <button key={i} onClick={() => sendMessage(qa.label)} style={{
                    padding: '14px 12px', borderRadius: '14px', background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    gap: '10px', fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 500,
                    transition: 'all 0.15s', textAlign: 'left'
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = qa.color }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
                  >
                    <qa.icon size={18} color={qa.color} style={{ flexShrink: 0 }} />
                    {qa.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: '8px' }}>
              {msg.role === 'assistant' && (
                <div style={{
                  width: '30px', height: '30px', borderRadius: '10px',
                  background: 'linear-gradient(135deg, #f59e0b, #f97316)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px'
                }}><Bot size={15} color="white" /></div>
              )}
              <div style={{
                maxWidth: '80%', padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: msg.role === 'user' ? '#0f1117' : 'var(--text-primary)',
                fontSize: '0.85rem', lineHeight: '1.6',
                border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none'
              }}>
                {msg.role === 'assistant' ? (
                  <>
                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) || '<span style="opacity:0.4">…</span>' }} />
                    {msg.action && !msg.actionExecuted && (
                      <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px dashed var(--accent)' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CheckCircle size={14} color="var(--accent)" /> Acción Solicitada
                        </div>
                        <div style={{ fontSize: '0.75rem', marginBottom: '10px', color: 'var(--text-muted)' }}>
                          {msg.action.type === 'update_stock' ? 'Se va a actualizar el stock.' : msg.action.type === 'create_product' ? 'Se va a crear un nuevo producto.' : msg.action.type === 'create_expense' ? 'Se va a registrar un gasto.' : msg.action.type === 'update_price' ? 'Se va a actualizar el precio.' : msg.action.type === 'navigate' ? `Navegar a ${msg.action.module}` : 'Se ejecutará una acción en el sistema.'}
                        </div>
                        <button onClick={() => handleExecuteAction(i, msg.action)} disabled={executingAction} className="btn btn-primary" style={{ width: '100%', padding: '8px', display: 'flex', justifyContent: 'center', gap: '6px', fontSize: '0.8rem' }}>
                          {executingAction ? <Loader size={14} className="spinning" /> : <Sparkles size={14} />} Confirmar y Ejecutar
                        </button>
                      </div>
                    )}
                    {msg.actionExecuted && (
                      <div style={{ marginTop: '12px', padding: '10px', background: msg.actionSuccess ? 'var(--success-soft)' : 'var(--danger-soft)', color: msg.actionSuccess ? 'var(--success)' : 'var(--danger)', borderRadius: '8px', fontSize: '0.75rem', whiteSpace: 'pre-wrap', border: `1px solid ${msg.actionSuccess ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}` }}>
                        {msg.actionResult}
                      </div>
                    )}
                  </>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}

          {loading && messages.length > 0 && !messages[messages.length - 1]?.content && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ width: '30px', height: '30px', borderRadius: '10px', background: 'linear-gradient(135deg, #f59e0b, #f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Bot size={15} color="white" />
              </div>
              <div style={{ padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: '16px 16px 16px 4px', border: '1px solid var(--border)', display: 'flex', gap: '5px', alignItems: 'center' }}>
                {[0, 1, 2].map(i => (<span key={i} style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent)', animation: `aiPulse 1s ease ${i * 0.15}s infinite` }} />))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={e => { e.preventDefault(); sendMessage() }} style={{
          display: 'flex', gap: '8px', padding: '12px 16px',
          borderTop: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-secondary)'
        }}>
          <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder="Preguntale algo a la IA..."
            style={{ flex: 1, padding: '12px 16px', fontSize: '0.9rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', outline: 'none' }}
            disabled={loading}
          />
          <button type="submit" disabled={!input.trim() || loading} style={{
            padding: '12px 16px', borderRadius: '12px',
            background: input.trim() ? 'var(--accent)' : 'var(--bg-tertiary)',
            border: 'none', cursor: input.trim() ? 'pointer' : 'default',
            color: input.trim() ? '#0f1117' : 'var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s'
          }}>
            {loading ? <Loader size={18} className="spinning" /> : <Send size={18} />}
          </button>
        </form>
      </div>

      <style>{`@keyframes aiPulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.1); } }`}</style>
    </div>
  )
}
