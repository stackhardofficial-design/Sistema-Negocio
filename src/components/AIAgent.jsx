import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../lib/AppContext'
import { streamGroq, fetchBusinessContext } from '../lib/groq'
import {
  Bot, X, Send, Loader, Sparkles, ChevronDown, Plus, MessageSquare,
  Trash2, Clock, TrendingUp, Package, DollarSign, AlertTriangle, Users
} from 'lucide-react'

// ── Helpers ──
const STORAGE_KEY = 'stackhard_ai_chats'

function loadChats() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function saveChats(chats) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats))
}
function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

function autoTitle(messages) {
  const userMsg = messages.find(m => m.role === 'user')
  if (!userMsg) return 'Nueva conversación'
  const t = userMsg.content.slice(0, 40)
  return t.length < userMsg.content.length ? t + '…' : t
}

// ── Markdown-lite renderer ──
function renderMarkdown(text) {
  if (!text) return ''
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^• /gm, '‣ ')
    .replace(/\n/g, '<br/>')
}

// ── Quick Actions ──
const QUICK_ACTIONS = [
  { icon: DollarSign, label: '¿Cuánto gané hoy?', color: '#10b981' },
  { icon: TrendingUp, label: 'Análisis del mes', color: '#3b82f6' },
  { icon: Package, label: 'Productos con poco stock', color: '#f59e0b' },
  { icon: Users, label: '¿Cuánto me deben?', color: '#ef4444' },
  { icon: AlertTriangle, label: 'Productos sin movimiento', color: '#8b5cf6' },
  { icon: TrendingUp, label: '¿Qué producto es más rentable?', color: '#06b6d4' },
]

export default function AIAgent() {
  const { aiOpen, setAiOpen, tenantId, userInfo, tenant } = useApp()
  const navigate = useNavigate()
  const location = useLocation()

  // Chat state
  const [chats, setChats] = useState(() => loadChats())
  const [activeChatId, setActiveChatId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(null)

  // Get current module from URL
  const currentModule = location.pathname.replace('/', '') || 'dashboard'

  // ── Persist chats ──
  useEffect(() => { saveChats(chats) }, [chats])

  // ── Focus input when opening ──
  useEffect(() => {
    if (aiOpen && inputRef.current) setTimeout(() => inputRef.current?.focus(), 200)
  }, [aiOpen])

  // ── Scroll to bottom ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Load active chat messages ──
  useEffect(() => {
    if (activeChatId) {
      const chat = chats.find(c => c.id === activeChatId)
      if (chat) setMessages(chat.messages)
    }
  }, [activeChatId])

  // ── New Chat ──
  function newChat() {
    setActiveChatId(null)
    setMessages([])
    setInput('')
    setSidebarOpen(false)
  }

  // ── Load Chat ──
  function loadChat(chatId) {
    const chat = chats.find(c => c.id === chatId)
    if (chat) {
      setActiveChatId(chatId)
      setMessages(chat.messages)
      setSidebarOpen(false)
    }
  }

  // ── Delete Chat ──
  function deleteChat(chatId, e) {
    e.stopPropagation()
    setChats(prev => prev.filter(c => c.id !== chatId))
    if (activeChatId === chatId) newChat()
  }

  // ── Save current messages to chat ──
  const saveCurrentChat = useCallback((msgs) => {
    if (msgs.length < 2) return // Need at least 1 user + 1 assistant

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

  // ── Send Message ──
  async function sendMessage(text) {
    const msg = (text || input).trim()
    if (!msg || loading) return

    const userMsg = { role: 'user', content: msg }
    const newMsgs = [...messages, userMsg]
    setMessages(newMsgs)
    setInput('')
    setLoading(true)

    // Add assistant placeholder for streaming
    const assistantMsg = { role: 'assistant', content: '' }
    setMessages(prev => [...prev, assistantMsg])

    try {
      // Fetch business data in parallel
      const contextPromise = fetchBusinessContext(tenantId)
      const context = await contextPromise

      const moduleInfo = `Módulo actual: ${currentModule}. Usuario: ${userInfo?.name || '?'}. Negocio: ${tenant?.name || '?'}.`
      const fullContext = `${moduleInfo}\n\n${context}`

      // History for context (last 20 messages)
      const history = newMsgs.slice(-20)

      const { action } = await streamGroq(
        history,
        (delta, full) => {
          // Clean action blocks from visible text
          const clean = full.replace(/```action\n[\s\S]*?\n```/g, '').trim()
          setMessages(prev => {
            const updated = [...prev]
            updated[updated.length - 1] = { role: 'assistant', content: clean }
            return updated
          })
        },
        fullContext
      )

      // Save final messages
      setMessages(prev => {
        const final = [...prev]
        // Clean any remaining action blocks
        if (final.length > 0) {
          final[final.length - 1].content = final[final.length - 1].content.replace(/```action\n[\s\S]*?\n```/g, '').trim()
        }
        saveCurrentChat(final)
        return final
      })

      // Execute action if any
      if (action?.type === 'navigate' && action.module) {
        setTimeout(() => navigate('/' + action.module), 500)
      }

    } catch (err) {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: 'assistant',
          content: `⚠️ Error: ${err.message}. Intentá de nuevo.`
        }
        return updated
      })
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ── Mobile detection ──
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  if (!aiOpen) {
    return (
      <button
        onClick={() => setAiOpen(true)}
        style={{
          position: 'fixed', bottom: isMobile ? '80px' : '24px', right: '20px',
          width: '56px', height: '56px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #f59e0b, #f97316)',
          color: 'white', border: 'none',
          boxShadow: '0 4px 20px rgba(245,158,11,0.4)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 500, transition: 'all 0.2s ease'
        }}
        title="Asistente IA"
      >
        <Sparkles size={24} />
      </button>
    )
  }

  const showWelcome = messages.length === 0

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', background: 'rgba(0,0,0,0.5)',
      backdropFilter: 'blur(4px)'
    }}>
      {/* Sidebar de historial */}
      <div style={{
        width: sidebarOpen ? (isMobile ? '100%' : '260px') : '0px',
        background: 'var(--bg)',
        borderRight: sidebarOpen ? '1px solid var(--border)' : 'none',
        transition: 'width 0.2s ease',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column'
      }}>
        <div style={{
          padding: '16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: '8px', minWidth: '240px'
        }}>
          <button onClick={newChat} className="btn btn-primary" style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: '6px',
            justifyContent: 'center', padding: '10px'
          }}>
            <Plus size={16} /> Nuevo Chat
          </button>
          {isMobile && (
            <button onClick={() => setSidebarOpen(false)} className="btn btn-secondary" style={{ padding: '10px' }}>
              <X size={16} />
            </button>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px', minWidth: '240px' }}>
          {chats.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              No hay conversaciones previas
            </div>
          ) : (
            chats.map(chat => (
              <div
                key={chat.id}
                onClick={() => loadChat(chat.id)}
                style={{
                  padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                  background: chat.id === activeChatId ? 'var(--accent-soft)' : 'transparent',
                  border: chat.id === activeChatId ? '1px solid rgba(245,158,11,0.3)' : '1px solid transparent',
                  marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px',
                  transition: 'all 0.15s'
                }}
              >
                <MessageSquare size={14} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '0.82rem', fontWeight: 500, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {chat.title}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    <Clock size={10} style={{ marginRight: '3px', verticalAlign: 'middle' }} />
                    {new Date(chat.updatedAt).toLocaleDateString('es-AR')}
                  </div>
                </div>
                <button
                  onClick={(e) => deleteChat(chat.id, e)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', padding: '4px', borderRadius: '4px',
                    display: 'flex', opacity: 0.5, transition: 'opacity 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = 1}
                  onMouseLeave={e => e.currentTarget.style.opacity = 0.5}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Panel principal del chat */}
      <div style={{
        flex: 1, display: sidebarOpen && isMobile ? 'none' : 'flex',
        flexDirection: 'column', background: 'var(--bg-secondary)',
        maxWidth: '100%'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 16px',
          background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(249,115,22,0.05))',
          borderBottom: '1px solid var(--border)', flexShrink: 0
        }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '8px', cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex'
            }}
          >
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
            <div style={{ fontSize: '0.7rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
              Asesor financiero activo
            </div>
          </div>

          <button onClick={newChat} style={{
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '8px', cursor: 'pointer',
            color: 'var(--text-muted)', display: 'flex'
          }} title="Nuevo chat">
            <Plus size={16} />
          </button>

          <button
            onClick={() => setAiOpen(false)}
            style={{
              background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '8px', cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Messages area */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '16px',
          display: 'flex', flexDirection: 'column', gap: '12px'
        }}>
          {showWelcome && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '20px',
              padding: '20px', textAlign: 'center'
            }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '20px',
                background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(249,115,22,0.1))',
                border: '1px solid rgba(245,158,11,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Sparkles size={28} color="var(--accent)" />
              </div>
              <div>
                <h3 style={{ margin: '0 0 6px', fontSize: '1.2rem', fontWeight: 700 }}>
                  Hola, {userInfo?.name?.split(' ')[0] || 'ahí'} 👋
                </h3>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '400px' }}>
                  Soy tu asesor financiero con IA. Puedo analizar tus ventas, controlar tu stock,
                  gestionar deudores y ayudarte a tomar mejores decisiones para tu negocio.
                </p>
              </div>

              {/* Quick Actions Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '8px', width: '100%', maxWidth: '500px'
              }}>
                {QUICK_ACTIONS.map((qa, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(qa.label)}
                    style={{
                      padding: '12px', borderRadius: '12px',
                      background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                      fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 500,
                      transition: 'all 0.15s', textAlign: 'left'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = qa.color; e.currentTarget.style.background = 'var(--bg-secondary)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                  >
                    <qa.icon size={16} color={qa.color} style={{ flexShrink: 0 }} />
                    {qa.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                gap: '8px'
              }}
            >
              {msg.role === 'assistant' && (
                <div style={{
                  width: '28px', height: '28px', borderRadius: '8px',
                  background: 'linear-gradient(135deg, #f59e0b, #f97316)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, marginTop: '2px'
                }}>
                  <Bot size={14} color="white" />
                </div>
              )}
              <div style={{
                maxWidth: '80%',
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: msg.role === 'user'
                  ? 'var(--accent)'
                  : 'var(--bg-tertiary)',
                color: msg.role === 'user' ? '#0f1117' : 'var(--text-primary)',
                fontSize: '0.85rem',
                lineHeight: '1.6',
                border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none'
              }}
                dangerouslySetInnerHTML={msg.role === 'assistant' ? { __html: renderMarkdown(msg.content) || '<span style="opacity:0.5">...</span>' } : undefined}
              >
                {msg.role === 'user' ? msg.content : undefined}
              </div>
            </div>
          ))}

          {loading && messages.length > 0 && !messages[messages.length - 1]?.content && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '8px',
                background: 'linear-gradient(135deg, #f59e0b, #f97316)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0
              }}>
                <Bot size={14} color="white" />
              </div>
              <div style={{
                padding: '12px 16px', background: 'var(--bg-tertiary)',
                borderRadius: '16px 16px 16px 4px', border: '1px solid var(--border)',
                display: 'flex', gap: '5px', alignItems: 'center'
              }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: '7px', height: '7px', borderRadius: '50%',
                    background: 'var(--accent)',
                    animation: `aiPulse 1s ease ${i * 0.15}s infinite`
                  }} />
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage() }}
          style={{
            display: 'flex', gap: '8px', padding: '12px 16px',
            borderTop: '1px solid var(--border)', flexShrink: 0,
            background: 'var(--bg-secondary)'
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Preguntale algo a la IA..."
            style={{
              flex: 1, padding: '12px 16px', fontSize: '0.9rem',
              borderRadius: '12px', border: '1px solid var(--border)',
              background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
              outline: 'none'
            }}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            style={{
              padding: '12px 16px', borderRadius: '12px',
              background: input.trim() ? 'var(--accent)' : 'var(--bg-tertiary)',
              border: 'none', cursor: input.trim() ? 'pointer' : 'default',
              color: input.trim() ? '#0f1117' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s'
            }}
          >
            {loading ? <Loader size={18} className="spinning" /> : <Send size={18} />}
          </button>
        </form>
      </div>

      <style>{`
        @keyframes aiPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </div>
  )
}
