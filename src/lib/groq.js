// =====================================================
// GROQ AI CLIENT - Sistema Buffet Escolar
// =====================================================

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_API_KEY = import.meta.env.VITE_GROQ_KEY
const GROQ_MODEL = 'llama-3.3-70b-versatile'

const SYSTEM_PROMPT = `Eres un asistente inteligente integrado en el Sistema de Gestión de Buffet/Quiosco Escolar "StackHard". 
Tu rol es ayudar a los empleados y administradores a usar el sistema de manera eficiente.

Puedes ayudar con:
- Consultar ventas, productos, stock y deudores
- Explicar cómo usar cada módulo del sistema
- Sugerir acciones según el contexto
- Analizar datos y dar recomendaciones

Responde siempre en español, de forma concisa y útil. Si el usuario te pide hacer una acción en el sistema, 
devuelve un JSON de acción al final de tu respuesta con el formato:
\`\`\`action
{"type": "navigate", "module": "ventas"}
\`\`\`

Tipos de acción disponibles: navigate (con módulo), search (con término), none.

Contexto del sistema:
- Es un buffet/quiosco escolar con ventas rápidas durante el recreo
- Los productos pueden tener código de barras o no
- Hay múltiples vendedores simultáneos
- El tiempo es crítico en ventas`

export async function askGroq(messages, systemContext = '') {
  const systemMsg = systemContext
    ? `${SYSTEM_PROMPT}\n\nContexto adicional: ${systemContext}`
    : SYSTEM_PROMPT

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemMsg },
        ...messages
      ],
      temperature: 0.7,
      max_tokens: 600
    })
  })

  if (!response.ok) {
    const err = await response.json()
    throw new Error(err.error?.message || 'Error al conectar con IA')
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || ''

  // Parse action if present
  const actionMatch = content.match(/```action\n([\s\S]*?)\n```/)
  let action = null
  let text = content

  if (actionMatch) {
    try {
      action = JSON.parse(actionMatch[1])
      text = content.replace(/```action\n[\s\S]*?\n```/, '').trim()
    } catch {}
  }

  return { text, action }
}

export async function streamGroq(messages, onChunk, systemContext = '') {
  const systemMsg = systemContext ? `${SYSTEM_PROMPT}\n\nContexto: ${systemContext}` : SYSTEM_PROMPT

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'system', content: systemMsg }, ...messages],
      temperature: 0.7,
      max_tokens: 600,
      stream: true
    })
  })

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value)
    const lines = chunk.split('\n').filter(l => l.startsWith('data: '))
    for (const line of lines) {
      const json = line.replace('data: ', '')
      if (json === '[DONE]') continue
      try {
        const parsed = JSON.parse(json)
        const delta = parsed.choices?.[0]?.delta?.content || ''
        if (delta) {
          full += delta
          onChunk(delta, full)
        }
      } catch {}
    }
  }

  return full
}
