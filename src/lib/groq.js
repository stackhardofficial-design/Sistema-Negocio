// =====================================================
// GROQ AI CLIENT - Sistema Buffet Escolar
// Asesor financiero + Asistente operativo
// =====================================================

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_API_KEY = import.meta.env.VITE_GROQ_KEY
const GROQ_MODEL = 'llama-3.3-70b-versatile'

const SYSTEM_PROMPT = `Eres el asistente de inteligencia artificial del sistema "StackHard" — un sistema de gestión para buffets y quioscos escolares.

# TU ROL
Eres un **asesor financiero** y **asistente operativo** experto. Respondés siempre en español argentino (vos, tenés, podés). Sos conciso, directo y útil. Usás emojis moderadamente.

# REGLA DE ORO: SIEMPRE PREGUNTÁ ANTES DE ACTUAR
**NUNCA ejecutes una acción sin confirmar primero con el usuario.** Siempre seguí este flujo:
1. El usuario te pide algo (ej: "agregá stock de alfajores")
2. Vos le hacés las preguntas necesarias para completar la info
3. Mostrás un resumen de lo que vas a hacer
4. Incluís el bloque de acción SOLO cuando el usuario confirme

# CAPACIDADES
1. **Análisis financiero**: Ganancias, márgenes, tendencias, proyecciones.
2. **Gestión de inventario**: Stock bajo, reposiciones, productos sin movimiento.
3. **Asesoría de ventas**: Productos más vendidos, métodos de pago preferidos.
4. **Gestión de deudores**: Deudas vencidas, estrategias de cobro.
5. **Acciones operativas**: Actualizar stock, crear productos, registrar gastos, gestionar deudores.
6. **Navegación**: Llevar al usuario a cualquier módulo.

# ACCIONES DISPONIBLES
Podés ejecutar estas acciones incluyendo un bloque \`\`\`action al final (invisible para el usuario):

## 1. Navegar a un módulo
\`\`\`action
{"type": "navigate", "module": "ventas"}
\`\`\`

## 2. Actualizar stock de productos (uno o varios)
Antes de ejecutar, SIEMPRE preguntá:
- ¿Se registra como gasto (compra de mercadería)?
- ¿Cuántas unidades de cada producto?
- Si es gasto: ¿cuál fue el monto total de la compra?

\`\`\`action
{"type": "update_stock", "items": [{"name": "Alfajor Triple", "quantity": 50}, {"name": "Coca Cola 500ml", "quantity": 24}], "register_expense": true, "expense_amount": 15000, "expense_description": "Compra de mercadería"}
\`\`\`

## 3. Crear un producto nuevo
Antes de ejecutar, necesitás:
- Nombre del producto
- Precio de venta
- Precio de costo (si lo tiene)
- Stock inicial (opcional)
- Stock mínimo para alertas (opcional)

\`\`\`action
{"type": "create_product", "name": "Alfajor Triple", "price": 500, "cost_price": 300, "stock": 50, "min_stock": 10}
\`\`\`

## 4. Registrar un gasto
Antes de ejecutar, necesitás:
- Descripción del gasto
- Monto
- Categoría (si la tiene)

\`\`\`action
{"type": "create_expense", "description": "Compra de servilletas", "amount": 2500, "category": "Insumos"}
\`\`\`

## 5. Actualizar precio de un producto
\`\`\`action
{"type": "update_price", "name": "Alfajor Triple", "price": 600, "cost_price": 350}
\`\`\`

# FLUJOS DE CONVERSACIÓN EJEMPLO

## Ejemplo: Carga de stock
Usuario: "Cargá stock de alfajores"
Asistente: "¡Dale! Necesito algunos datos:
• ¿Cuántas unidades de alfajores recibiste?
• ¿Querés registrar esto como un gasto (compra de mercadería) o solo actualizar el stock?"

Usuario: "50 unidades, sí registralo como gasto, pagué $15000"
Asistente: "Perfecto, te resumo lo que voy a hacer:
📦 **Alfajor Triple**: +50 unidades al stock
💰 **Gasto registrado**: $15.000 (Compra de mercadería)
¿Confirmo?"

Usuario: "Sí dale"
(Acá recién incluís el bloque action)

## Ejemplo: Varios productos
Usuario: "Llegó la mercadería, tengo que cargar alfajores, cocas y galletitas"
Asistente: "¡Genial! Decime la cantidad de cada uno:
• Alfajores: ¿cuántos?
• Coca Cola: ¿cuántas?
• Galletitas: ¿cuántas?
¿Y querés registrarlo todo como un gasto? Si sí, ¿cuánto pagaste en total?"

# FORMATO DE RESPUESTA
- Usá **negrita** para datos importantes
- Usá listas con • para enumerar items
- Sé conciso: no más de 150 palabras salvo análisis detallado
- Formato argentino para dinero: $1.500

# DATOS DEL NEGOCIO
Se te proporcionarán datos reales del negocio en cada mensaje. Usálos para dar respuestas precisas. NUNCA inventes datos.
Si no tenés un dato específico, decí que no lo tenés disponible en este momento.`

// ── Función para obtener datos del negocio desde Supabase ──
import { sb } from './supabase'

export async function fetchBusinessContext(tenantId) {
  if (!tenantId) return ''
  
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString()

  try {
    // Ejecutar todas las queries en paralelo para velocidad
    const [
      { data: salesToday },
      { data: salesWeek },
      { data: salesMonth },
      { data: products },
      { data: buffetProducts },
      { data: debtors },
      { data: expensesMonth }
    ] = await Promise.all([
      sb.from('sales').select('total_amount, total_cost, payment_method, status').eq('tenant_id', tenantId).gte('created_at', todayStart).eq('status', 'completed'),
      sb.from('sales').select('total_amount, total_cost, payment_method, status, created_at').eq('tenant_id', tenantId).gte('created_at', weekAgo).eq('status', 'completed'),
      sb.from('sales').select('total_amount, total_cost, payment_method, status').eq('tenant_id', tenantId).gte('created_at', monthStart).eq('status', 'completed'),
      sb.from('products').select('name, price, cost_price, stock, min_stock, barcode').eq('tenant_id', tenantId).eq('is_active', true).order('name'),
      sb.from('buffet_products').select('name, price, cost_price, stock, is_composite').eq('tenant_id', tenantId).eq('is_active', true).order('name'),
      sb.from('debtors').select('name, total_debt, is_active').eq('tenant_id', tenantId).eq('is_active', true),
      sb.from('expenses').select('amount, description, category, created_at').eq('tenant_id', tenantId).gte('created_at', monthStart)
    ])

    // Calcular métricas de hoy
    const todayTotal = (salesToday || []).reduce((s, v) => s + (v.total_amount || 0), 0)
    const todayCost = (salesToday || []).reduce((s, v) => s + (v.total_cost || 0), 0)
    const todayProfit = todayTotal - todayCost
    const todayCount = (salesToday || []).length
    const todayEfectivo = (salesToday || []).filter(v => v.payment_method === 'efectivo').reduce((s, v) => s + v.total_amount, 0)
    const todayTransf = (salesToday || []).filter(v => v.payment_method === 'transferencia').reduce((s, v) => s + v.total_amount, 0)
    const todayDeudor = (salesToday || []).filter(v => v.payment_method === 'deudor').reduce((s, v) => s + v.total_amount, 0)

    // Métricas de la semana
    const weekTotal = (salesWeek || []).reduce((s, v) => s + (v.total_amount || 0), 0)
    const weekCost = (salesWeek || []).reduce((s, v) => s + (v.total_cost || 0), 0)
    const weekProfit = weekTotal - weekCost
    const weekCount = (salesWeek || []).length

    // Métricas del mes
    const monthTotal = (salesMonth || []).reduce((s, v) => s + (v.total_amount || 0), 0)
    const monthCost = (salesMonth || []).reduce((s, v) => s + (v.total_cost || 0), 0)
    const monthProfit = monthTotal - monthCost
    const monthCount = (salesMonth || []).length

    // Gastos del mes
    const monthExpenses = (expensesMonth || []).reduce((s, g) => s + (g.amount || 0), 0)

    // Stock bajo
    const lowStock = (products || []).filter(p => p.stock !== null && p.min_stock !== null && p.stock <= p.min_stock)
    const outOfStock = (products || []).filter(p => p.stock !== null && p.stock <= 0)

    // Buffet stock bajo
    const buffetLowStock = (buffetProducts || []).filter(p => !p.is_composite && p.stock !== null && p.stock <= 3)

    // Deudores
    const activeDebtors = (debtors || []).filter(d => d.total_debt > 0)
    const totalDebt = activeDebtors.reduce((s, d) => s + (d.total_debt || 0), 0)

    // Top productos por margen
    const prodWithMargin = (products || [])
      .filter(p => p.price && p.cost_price)
      .map(p => ({ name: p.name, margin: ((p.price - p.cost_price) / p.price * 100).toFixed(0), profit: p.price - p.cost_price }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5)

    return `
📊 DATOS EN TIEMPO REAL DEL NEGOCIO (${now.toLocaleDateString('es-AR')} ${now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}):

💰 HOY:
• ${todayCount} ventas | Total: $${todayTotal.toLocaleString('es-AR')} | Costo: $${todayCost.toLocaleString('es-AR')} | Ganancia: $${todayProfit.toLocaleString('es-AR')}
• Efectivo: $${todayEfectivo.toLocaleString('es-AR')} | Transferencia: $${todayTransf.toLocaleString('es-AR')} | Fiado: $${todayDeudor.toLocaleString('es-AR')}

📅 ÚLTIMOS 7 DÍAS:
• ${weekCount} ventas | Total: $${weekTotal.toLocaleString('es-AR')} | Ganancia: $${weekProfit.toLocaleString('es-AR')}
• Promedio diario: $${Math.round(weekTotal / 7).toLocaleString('es-AR')}

📆 ESTE MES:
• ${monthCount} ventas | Total: $${monthTotal.toLocaleString('es-AR')} | Ganancia neta: $${(monthProfit - monthExpenses).toLocaleString('es-AR')}
• Gastos del mes: $${monthExpenses.toLocaleString('es-AR')}

📦 INVENTARIO:
• ${(products || []).length} productos kiosco | ${(buffetProducts || []).length} productos buffet
• ⚠️ ${lowStock.length} productos con stock bajo: ${lowStock.slice(0, 5).map(p => `${p.name} (${p.stock})`).join(', ') || 'Ninguno'}
• 🚫 ${outOfStock.length} sin stock: ${outOfStock.slice(0, 5).map(p => p.name).join(', ') || 'Ninguno'}
• 🍔 Buffet bajo stock: ${buffetLowStock.map(p => `${p.name} (${p.stock})`).join(', ') || 'Todo OK'}

💳 DEUDORES:
• ${activeDebtors.length} deudores activos | Deuda total: $${totalDebt.toLocaleString('es-AR')}
${activeDebtors.slice(0, 5).map(d => `  - ${d.name}: $${d.total_debt.toLocaleString('es-AR')}`).join('\n')}

🏆 TOP 5 PRODUCTOS POR MARGEN:
${prodWithMargin.map((p, i) => `  ${i + 1}. ${p.name}: ${p.margin}% margen ($${p.profit} ganancia/u)`).join('\n')}
`
  } catch (err) {
    console.error('Error fetching business context:', err)
    return '(No se pudieron obtener datos del negocio en este momento)'
  }
}

export async function askGroq(messages, systemContext = '') {
  const systemMsg = systemContext
    ? `${SYSTEM_PROMPT}\n\n${systemContext}`
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
      temperature: 0.6,
      max_tokens: 1200
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
  const systemMsg = systemContext ? `${SYSTEM_PROMPT}\n\n${systemContext}` : SYSTEM_PROMPT

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'system', content: systemMsg }, ...messages],
      temperature: 0.6,
      max_tokens: 1200,
      stream: true
    })
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || 'Error al conectar con IA')
  }

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

  // Parse action from full response
  const actionMatch = full.match(/```action\n([\s\S]*?)\n```/)
  let action = null
  let text = full
  if (actionMatch) {
    try {
      action = JSON.parse(actionMatch[1])
      text = full.replace(/```action\n[\s\S]*?\n```/, '').trim()
    } catch {}
  }

  return { text, action }
}
