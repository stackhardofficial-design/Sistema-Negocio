import { useState, useRef, useEffect } from 'react'
import { useApp } from '../lib/AppContext'
import { askGroq } from '../lib/groq'
import { Bot, X, Send, Loader, Sparkles, ChevronDown } from 'lucide-react'

export default function AIAgent() {
  const { aiOpen, setAiOpen, currentModule, setCurrentModule, userInfo, tenant } = useApp()
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `¡Hola! Soy tu asistente de IA 🤖\n\nPuedo ayudarte a navegar el sistema, consultar ventas, productos y más.\n\n¿En qué te ayudo?`
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (aiOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [aiOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(e) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const context = `Módulo actual: ${currentModule}. Usuario: ${userInfo?.name || '?'}. Negocio: ${tenant?.name || '?'}`
      const history = [...messages, userMsg].slice(-10) // last 10 msgs
      const { text: reply, action } = await askGroq(history, context)

      setMessages(prev => [...prev, { role: 'assistant', content: reply }])

      if (action?.type === 'navigate' && action.module) {
        setCurrentModule(action.module)
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ Error: ${err.message}`
      }])
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

  const QUICK_ACTIONS = [
    'Ver ventas de hoy',
    'Productos con bajo stock',
    'Cómo registrar una venta',
    'Ver deudores'
  ]

  return (
    <>
      {/* FAB */}
      {!aiOpen && (
        <button
          onClick={() => setAiOpen(true)}
          style={{
            position: 'fixed',
            bottom: '80px',
            right: '20px',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent), #f97316)',
            color: 'white',
            border: 'none',
            boxShadow: '0 4px 20px rgba(245,158,11,0.4)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 500,
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(245,158,11,0.55)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(245,158,11,0.4)' }}
          title="Asistente IA"
        >
          <Sparkles size={24} />
        </button>
      )}

      {/* Chat Panel */}
      {aiOpen && (
        <div
          className="fade-in"
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '360px',
            height: '520px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 500,
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '14px 16px',
            background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(249,115,22,0.1))',
            borderBottom: '1px solid var(--border)'
          }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '10px',
              background: 'var(--accent-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Bot size={18} color="var(--accent)" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Asistente IA</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
                Activo
              </div>
            </div>
            <button
              onClick={() => setAiOpen(false)}
              style={{
                background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                borderRadius: '8px', padding: '5px', cursor: 'pointer',
                color: 'var(--text-muted)', display: 'flex'
              }}
            >
              <ChevronDown size={16} />
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                }}
              >
                <div style={{
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.role === 'user'
                    ? 'var(--accent)'
                    : 'var(--bg-tertiary)',
                  color: msg.role === 'user' ? '#0f1117' : 'var(--text-primary)',
                  fontSize: '0.85rem',
                  lineHeight: '1.5',
                  whiteSpace: 'pre-wrap',
                  border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none'
                }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '10px 14px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: '16px 16px 16px 4px',
                  border: '1px solid var(--border)',
                  display: 'flex', gap: '4px', alignItems: 'center'
                }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: '6px', height: '6px', borderRadius: '50%',
                      background: 'var(--accent)',
                      animation: `pulse 1s ease ${i * 0.2}s infinite`
                    }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          {messages.length <= 1 && (
            <div style={{ padding: '0 14px 8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {QUICK_ACTIONS.map(action => (
                <button
                  key={action}
                  onClick={() => { setInput(action); setTimeout(sendMessage, 100) }}
                  style={{
                    padding: '4px 10px', borderRadius: '20px',
                    background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                    color: 'var(--text-secondary)', fontSize: '0.75rem',
                    cursor: 'pointer', transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                >
                  {action}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form onSubmit={sendMessage} style={{
            display: 'flex', gap: '8px', padding: '12px 14px',
            borderTop: '1px solid var(--border)'
          }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Preguntá algo..."
              style={{ flex: 1, padding: '8px 12px', fontSize: '0.875rem' }}
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="btn btn-primary"
              style={{ padding: '8px 14px' }}
            >
              {loading ? <Loader size={16} className="spinning" /> : <Send size={16} />}
            </button>
          </form>
        </div>
      )}
    </>
  )
}
