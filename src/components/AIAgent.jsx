import { useState, useRef, useEffect } from 'react'
import { useApp } from '../lib/AppContext'
import { streamGroq, fetchBusinessContext } from '../lib/groq'
import { Bot, X, Send, Loader, Sparkles, ChevronDown } from 'lucide-react'

/**
 * AIAgent — Mini chat flotante para preguntas rápidas.
 * El módulo completo con historial está en /ia (IAModule).
 */
export default function AIAgent() {
  const { aiOpen, setAiOpen, tenantId, userInfo, tenant } = useApp()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (aiOpen && inputRef.current) setTimeout(() => inputRef.current?.focus(), 150)
  }, [aiOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(e) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text }
    const newMsgs = [...messages, userMsg]
    setMessages([...newMsgs, { role: 'assistant', content: '' }])
    setInput('')
    setLoading(true)

    try {
      const context = await fetchBusinessContext(tenantId)
      const moduleInfo = `Usuario: ${userInfo?.name || '?'}. Negocio: ${tenant?.name || '?'}. (Chat rápido, respuestas ultra-concisas de máximo 60 palabras)`

      await streamGroq(
        newMsgs.slice(-8),
        (delta, full) => {
          const clean = full.replace(/```action\n[\s\S]*?\n```/g, '').trim()
          setMessages(prev => {
            const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: clean }; return u
          })
        },
        `${moduleInfo}\n\n${context}`
      )
    } catch (err) {
      setMessages(prev => {
        const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: `⚠️ ${err.message}` }; return u
      })
    } finally { setLoading(false) }
  }

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  const QUICK = ['¿Cuánto gané hoy?', 'Stock bajo', '¿Cuánto me deben?']

  return (
    <>
      {/* FAB */}
      {!aiOpen && (
        <button
          onClick={() => setAiOpen(true)}
          style={{
            position: 'fixed', bottom: isMobile ? '80px' : '24px', right: '20px',
            width: '50px', height: '50px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #f59e0b, #f97316)',
            color: 'white', border: 'none',
            boxShadow: '0 4px 20px rgba(245,158,11,0.35)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 500, transition: 'all 0.2s ease'
          }}
          title="Chat rápido IA"
        >
          <Sparkles size={22} />
        </button>
      )}

      {/* Mini Chat */}
      {aiOpen && (
        <div style={{
          position: 'fixed',
          bottom: isMobile ? '74px' : '20px',
          right: isMobile ? '8px' : '20px',
          left: isMobile ? '8px' : 'auto',
          width: isMobile ? 'auto' : '340px',
          height: isMobile ? '380px' : '420px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '18px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column',
          zIndex: 600, overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 14px',
            background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(249,115,22,0.06))',
            borderBottom: '1px solid var(--border)', flexShrink: 0
          }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '8px',
              background: 'linear-gradient(135deg, #f59e0b, #f97316)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <Bot size={15} color="white" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>Chat Rápido</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Preguntá lo que quieras</div>
            </div>
            <button
              onClick={() => { setAiOpen(false); setMessages([]) }}
              style={{
                background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                borderRadius: '6px', padding: '4px', cursor: 'pointer',
                color: 'var(--text-muted)', display: 'flex'
              }}
            >
              <ChevronDown size={14} />
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 0' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '4px' }}>
                  Preguntas rápidas:
                </div>
                {QUICK.map(q => (
                  <button key={q} onClick={() => { setInput(q); setTimeout(() => document.getElementById('ai-mini-form')?.requestSubmit(), 50) }}
                    style={{
                      padding: '8px 12px', borderRadius: '10px', background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border)', cursor: 'pointer',
                      fontSize: '0.78rem', color: 'var(--text-primary)', textAlign: 'left',
                      transition: 'border-color 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  >{q}</button>
                ))}
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '85%', padding: '8px 12px',
                  borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: msg.role === 'user' ? '#0f1117' : 'var(--text-primary)',
                  fontSize: '0.8rem', lineHeight: '1.5',
                  border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none'
                }}
                  dangerouslySetInnerHTML={msg.role === 'assistant' ? {
                    __html: (msg.content || '<span style="opacity:0.4">…</span>')
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\n/g, '<br/>')
                  } : undefined}
                >
                  {msg.role === 'user' ? msg.content : undefined}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form id="ai-mini-form" onSubmit={sendMessage} style={{
            display: 'flex', gap: '6px', padding: '8px 10px',
            borderTop: '1px solid var(--border)', flexShrink: 0
          }}>
            <input
              ref={inputRef} type="text" value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              placeholder="Preguntá algo rápido..."
              style={{
                flex: 1, padding: '8px 12px', fontSize: '0.82rem', borderRadius: '10px',
                border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)', outline: 'none'
              }}
              disabled={loading}
            />
            <button type="submit" disabled={!input.trim() || loading} style={{
              padding: '8px 12px', borderRadius: '10px',
              background: input.trim() ? 'var(--accent)' : 'var(--bg-tertiary)',
              border: 'none', cursor: input.trim() ? 'pointer' : 'default',
              color: input.trim() ? '#0f1117' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {loading ? <Loader size={15} className="spinning" /> : <Send size={15} />}
            </button>
          </form>
        </div>
      )}
    </>
  )
}
