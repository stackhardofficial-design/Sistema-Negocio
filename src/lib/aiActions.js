// =====================================================
// AI ACTION EXECUTOR - Ejecuta acciones de la IA en Supabase
// =====================================================
import {
  sb, dbGetProducts, dbCreateProduct, dbUpdateProduct,
  dbCreateExpense, dbEnsureExpenseCategory, dbLogActivity
} from './supabase'

/**
 * Ejecuta una acción propuesta por la IA.
 * Retorna { success, message } 
 */
export async function executeAIAction(action, tenantId, userId) {
  if (!action || !tenantId) return { success: false, message: 'Faltan datos para ejecutar' }

  try {
    switch (action.type) {
      case 'navigate':
        return { success: true, message: `Navegando a ${action.module}`, navigate: action.module }

      case 'update_stock':
        return await handleUpdateStock(action, tenantId, userId)

      case 'create_product':
        return await handleCreateProduct(action, tenantId, userId)

      case 'create_expense':
        return await handleCreateExpense(action, tenantId, userId)

      case 'update_price':
        return await handleUpdatePrice(action, tenantId, userId)

      default:
        return { success: false, message: `Acción desconocida: ${action.type}` }
    }
  } catch (err) {
    return { success: false, message: `Error: ${err.message}` }
  }
}

async function handleUpdateStock(action, tenantId, userId) {
  const products = await dbGetProducts(tenantId)
  const results = []

  for (const item of (action.items || [])) {
    // Buscar producto por nombre (fuzzy match)
    const found = products.find(p =>
      p.name.toLowerCase().includes(item.name.toLowerCase()) ||
      item.name.toLowerCase().includes(p.name.toLowerCase())
    )

    if (found) {
      const newStock = (found.stock || 0) + item.quantity
      await dbUpdateProduct(found.id, { stock: newStock })
      await dbLogActivity(tenantId, userId, 'update', 'product', found.id, {
        action: 'stock_update_ia', name: found.name, added: item.quantity, new_stock: newStock
      })
      results.push(`✅ ${found.name}: +${item.quantity} → ${newStock} unidades`)
    } else {
      results.push(`⚠️ "${item.name}": no encontrado en el sistema`)
    }
  }

  // Registrar como gasto si corresponde
  if (action.register_expense && action.expense_amount) {
    const catId = await dbEnsureExpenseCategory(tenantId, 'Mercadería')
    await dbCreateExpense({
      tenant_id: tenantId,
      user_id: userId,
      amount: action.expense_amount,
      description: action.expense_description || 'Compra de mercadería (vía IA)',
      category_id: catId,
      expense_date: new Date().toISOString().split('T')[0]
    })
    results.push(`💰 Gasto registrado: $${Number(action.expense_amount).toLocaleString('es-AR')}`)
  }

  return { success: true, message: results.join('\n') }
}

async function handleCreateProduct(action, tenantId, userId) {
  const product = await dbCreateProduct({
    tenant_id: tenantId,
    name: action.name,
    price: action.price || 0,
    cost_price: action.cost_price || 0,
    stock: action.stock ?? null,
    min_stock: action.min_stock ?? null,
    is_active: true
  })

  await dbLogActivity(tenantId, userId, 'create', 'product', product.id, {
    action: 'create_product_ia', name: action.name
  })

  return {
    success: true,
    message: `✅ Producto "${action.name}" creado exitosamente\n• Precio: $${Number(action.price).toLocaleString('es-AR')}\n• Costo: $${Number(action.cost_price || 0).toLocaleString('es-AR')}\n• Stock: ${action.stock ?? 'Sin control'}`
  }
}

async function handleCreateExpense(action, tenantId, userId) {
  let catId = null
  if (action.category) {
    catId = await dbEnsureExpenseCategory(tenantId, action.category)
  }

  await dbCreateExpense({
    tenant_id: tenantId,
    user_id: userId,
    amount: action.amount,
    description: action.description || 'Gasto registrado vía IA',
    category_id: catId,
    expense_date: new Date().toISOString().split('T')[0]
  })

  await dbLogActivity(tenantId, userId, 'create', 'expense', null, {
    action: 'create_expense_ia', description: action.description, amount: action.amount
  })

  return {
    success: true,
    message: `✅ Gasto registrado: $${Number(action.amount).toLocaleString('es-AR')}\n📝 ${action.description}`
  }
}

async function handleUpdatePrice(action, tenantId, userId) {
  const products = await dbGetProducts(tenantId)
  const found = products.find(p =>
    p.name.toLowerCase().includes(action.name.toLowerCase()) ||
    action.name.toLowerCase().includes(p.name.toLowerCase())
  )

  if (!found) {
    return { success: false, message: `⚠️ Producto "${action.name}" no encontrado` }
  }

  const updates = {}
  if (action.price) updates.price = action.price
  if (action.cost_price) updates.cost_price = action.cost_price

  await dbUpdateProduct(found.id, updates)
  await dbLogActivity(tenantId, userId, 'update', 'product', found.id, {
    action: 'update_price_ia', name: found.name, ...updates
  })

  return {
    success: true,
    message: `✅ "${found.name}" actualizado\n• Precio: $${Number(action.price || found.price).toLocaleString('es-AR')}\n• Costo: $${Number(action.cost_price || found.cost_price).toLocaleString('es-AR')}`
  }
}
