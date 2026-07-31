import { createClient } from '@supabase/supabase-js'

// =====================================================
// SUPABASE CLIENT - Sistema Buffet Escolar
// SistemaBuffet's Project
// =====================================================
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON || ''

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
  realtime: { params: { eventsPerSecond: 20 } }
})

// ===== AUTH =====
export const dbLogin = (email, password) =>
  sb.auth.signInWithPassword({ email, password })

export const dbLogout = () => sb.auth.signOut()
export const dbGetSession = () => sb.auth.getSession()

export async function dbGetUserInfo(userId) {
  const { data } = await sb.from('users').select('*, tenants(*)').eq('id', userId).single()
  return data
}

// ===== TENANTS (Super Admin) =====
export async function dbGetAllTenants() {
  const { data } = await sb.from('tenants').select('*').order('created_at', { ascending: false })
  return data || []
}

export async function dbGetTenant(tenantId) {
  const { data } = await sb.from('tenants').select('*').eq('id', tenantId).single()
  return data
}

export async function dbCreateTenant(payload) {
  const { data, error } = await sb.from('tenants').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function dbUpdateTenant(id, payload) {
  const { data, error } = await sb.from('tenants').update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

// ===== USERS =====
export async function dbGetUsers(tenantId) {
  const { data } = await sb.from('users').select('*')
    .eq('tenant_id', tenantId).order('created_at', { ascending: false })
  return data || []
}

export async function dbCreateUser(email, password, userData) {
  // Create auth user + profile via admin API (called from edge function or service role)
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: userData
  })
  if (error) throw error
  return data
}

export async function dbUpdateUser(id, payload) {
  const { data, error } = await sb.from('users').update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function dbDeleteUser(id) {
  const { error } = await sb.from('users').update({ is_active: false }).eq('id', id)
  if (error) throw error
}

// ===== CATEGORIES =====
export async function dbGetCategories(tenantId) {
  const { data } = await sb.from('categories')
    .select('*').eq('tenant_id', tenantId).eq('is_active', true).order('name')
  return data || []
}

export async function dbCreateCategory(tenantId, name, icon = null) {
  const { data, error } = await sb.from('categories')
    .insert({ tenant_id: tenantId, name, icon, is_active: true }).select().single()
  if (error) throw error
  return data
}

export async function dbUpdateCategory(id, payload) {
  const { data, error } = await sb.from('categories').update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function dbDeleteCategory(id) {
  const { error } = await sb.from('categories').update({ is_active: false }).eq('id', id)
  if (error) throw error
}

// ===== PRODUCTS =====
export async function dbGetProducts(tenantId, opts = {}) {
  let q = sb.from('products')
    .select('*, categories(name, icon)')
    .eq('tenant_id', tenantId)
  if (!opts.includeInactive) q = q.eq('is_active', true)
  if (opts.categoryId) q = q.eq('category_id', opts.categoryId)
  if (opts.search) q = q.ilike('name', `%${opts.search}%`)
  q = q.order('name')
  const { data } = await q
  return data || []
}

export async function dbGetProductByBarcode(tenantId, barcode) {
  const { data } = await sb.from('products')
    .select('*, categories(name, icon)')
    .eq('tenant_id', tenantId).eq('barcode', barcode).eq('is_active', true).single()
  return data
}

export async function dbCreateProduct(payload) {
  const { data, error } = await sb.from('products').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function dbUpdateProduct(id, payload) {
  const { data, error } = await sb.from('products').update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function dbUpdateProductStock(id, quantity) {
  const { data, error } = await sb.from('products')
    .update({ stock: quantity }).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function dbDeleteProduct(id) {
  const { error } = await sb.from('products').update({ is_active: false }).eq('id', id)
  if (error) throw error
}

// Buscar código de barras en Open Food Facts (Argentina)
export async function lookupBarcode(barcode) {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`)
    const json = await res.json()
    if (json.status === 1) {
      return {
        name: json.product?.product_name || json.product?.product_name_es || '',
        brand: json.product?.brands || '',
        category: json.product?.categories_tags?.[0]?.replace('en:', '') || ''
      }
    }
  } catch {}
  return null
}

// ===== SALES =====
export async function dbGetSales(tenantId, opts = {}) {
  let q = sb.from('sales')
    .select('*, sale_items(*, products(name, barcode)), users(name)')
    .eq('tenant_id', tenantId)

  if (opts.dateFrom) q = q.gte('created_at', opts.dateFrom)
  if (opts.dateTo) q = q.lte('created_at', opts.dateTo)
  if (opts.userId) q = q.eq('user_id', opts.userId)
  if (opts.status) q = q.eq('status', opts.status)

  q = q.order('created_at', { ascending: false })
  if (opts.limit) q = q.limit(opts.limit)

  const { data } = await q
  return data || []
}

export async function dbGetSaleSummary(tenantId, dateFrom, dateTo) {
  const { data } = await sb.from('sales')
    .select('total_amount, total_cost, created_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'completed')
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)
  return data || []
}

export async function dbCreateSale(tenantId, userId, items, totalAmount, totalCost) {
  // Create sale
  const { data: sale, error: saleErr } = await sb.from('sales').insert({
    tenant_id: tenantId,
    user_id: userId,
    total_amount: totalAmount,
    total_cost: totalCost,
    status: 'completed'
  }).select().single()

  if (saleErr) throw saleErr

  // Create items
  const saleItems = items.map(item => ({
    sale_id: sale.id,
    product_id: item.product_id,
    quantity: item.quantity,
    unit_price: item.unit_price,
    unit_cost: item.unit_cost,
    subtotal: item.quantity * item.unit_price
  }))

  const { error: itemsErr } = await sb.from('sale_items').insert(saleItems)
  if (itemsErr) throw itemsErr

  // Discount stock
  for (const item of items) {
    await sb.rpc('decrement_stock', { p_product_id: item.product_id, p_qty: item.quantity })
  }

  return sale
}

export async function dbCancelSale(saleId, userId, reason) {
  const { data, error } = await sb.from('sales')
    .update({ status: 'cancelled', cancel_reason: reason, cancelled_by: userId, cancelled_at: new Date().toISOString() })
    .eq('id', saleId).select().single()
  if (error) throw error
  return data
}

export async function dbUpdateSaleItem(saleItemId, newQuantity) {
  // Obtener el item actual para calcular la diferencia de stock
  const { data: item, error: itemErr } = await sb.from('sale_items')
    .select('quantity, product_id, unit_price, unit_cost, sale_id')
    .eq('id', saleItemId).single()
  if (itemErr) throw itemErr

  const diff = newQuantity - item.quantity
  const newSubtotal = newQuantity * item.unit_price

  // Actualizar el item
  const { error: updateErr } = await sb.from('sale_items')
    .update({ quantity: newQuantity, subtotal: newSubtotal })
    .eq('id', saleItemId)
  if (updateErr) throw updateErr

  // Recalcular total de la venta
  const { data: allItems } = await sb.from('sale_items')
    .select('subtotal, unit_cost, quantity')
    .eq('sale_id', item.sale_id)

  const newTotal = (allItems || []).reduce((a, i) => a + Number(i.subtotal || 0), 0)
  const newCost = (allItems || []).reduce((a, i) => a + (i.unit_cost || 0) * i.quantity, 0)

  await sb.from('sales')
    .update({ total_amount: newTotal, total_cost: newCost })
    .eq('id', item.sale_id)

  // Ajustar stock (si diff > 0 = más items, descontar más; si < 0 = devolver stock)
  if (diff !== 0 && item.product_id) {
    await sb.rpc('decrement_stock', { p_product_id: item.product_id, p_qty: diff })
  }
}

export async function dbDeleteSaleItem(saleItemId) {
  const { data: item, error: itemErr } = await sb.from('sale_items')
    .select('quantity, product_id, unit_price, unit_cost, sale_id')
    .eq('id', saleItemId).single()
  if (itemErr) throw itemErr

  const { error } = await sb.from('sale_items').delete().eq('id', saleItemId)
  if (error) throw error

  // Recalcular total
  const { data: allItems } = await sb.from('sale_items')
    .select('subtotal, unit_cost, quantity')
    .eq('sale_id', item.sale_id)

  const newTotal = (allItems || []).reduce((a, i) => a + Number(i.subtotal || 0), 0)
  const newCost = (allItems || []).reduce((a, i) => a + (i.unit_cost || 0) * i.quantity, 0)

  await sb.from('sales')
    .update({ total_amount: newTotal, total_cost: newCost })
    .eq('id', item.sale_id)

  // Devolver stock
  if (item.product_id) {
    await sb.rpc('decrement_stock', { p_product_id: item.product_id, p_qty: -item.quantity })
  }
}

// ===== INGREDIENTS (Buffet) =====
export async function dbGetIngredients(tenantId) {
  const { data } = await sb.from('ingredients')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('name')
  return data || []
}

export async function dbCreateIngredient(payload) {
  const { data, error } = await sb.from('ingredients').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function dbUpdateIngredient(id, payload) {
  const { data, error } = await sb.from('ingredients').update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function dbUpdateIngredientStock(id, quantity) {
  const { data, error } = await sb.from('ingredients')
    .update({ stock: quantity }).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function dbDeleteIngredient(id) {
  const { error } = await sb.from('ingredients').update({ is_active: false }).eq('id', id)
  if (error) throw error
}

// ===== BUFFET PRODUCTS =====
export async function dbGetBuffetProducts(tenantId) {
  const { data } = await sb.from('buffet_products')
    .select('*, buffet_ingredients(*, ingredients(name, stock, cost_price, unit))')
    .eq('tenant_id', tenantId).eq('is_active', true).order('name')
  return data || []
}

export async function dbCreateBuffetProduct(payload) {
  const { data, error } = await sb.from('buffet_products').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function dbUpdateBuffetProduct(id, payload) {
  const { data, error } = await sb.from('buffet_products').update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function dbSetBuffetIngredients(buffetProductId, ingredientsList) {
  // Delete old
  await sb.from('buffet_ingredients').delete().eq('buffet_product_id', buffetProductId)
  if (ingredientsList.length === 0) return
  const rows = ingredientsList.map(i => ({
    buffet_product_id: buffetProductId,
    ingredient_id: i.ingredient_id,
    quantity: i.quantity,
    unit: i.unit || 'unidad'
  }))
  const { error } = await sb.from('buffet_ingredients').insert(rows)
  if (error) throw error
}

// ===== BUFFET ORDERS =====
export async function dbGetBuffetOrders(tenantId, status = null) {
  let q = sb.from('buffet_orders')
    .select('*, buffet_order_items(*, buffet_products(name)), users(name)')
    .eq('tenant_id', tenantId)
  if (status) q = q.eq('status', status)
  q = q.order('created_at', { ascending: true })
  const { data } = await q
  return data || []
}

export async function dbCreateBuffetOrder(tenantId, userId, items, customerName = null) {
  const { data: order, error } = await sb.from('buffet_orders').insert({
    tenant_id: tenantId,
    user_id: userId,
    customer_name: customerName,
    status: 'pending',
    total_amount: items.reduce((s, i) => s + i.subtotal, 0)
  }).select().single()
  if (error) throw error

  const rows = items.map(i => ({
    order_id: order.id,
    buffet_product_id: i.buffet_product_id,
    quantity: i.quantity,
    unit_price: i.unit_price,
    subtotal: i.subtotal
  }))
  await sb.from('buffet_order_items').insert(rows)
  return order
}

export async function dbUpdateBuffetOrderStatus(orderId, status) {
  const { data, error } = await sb.from('buffet_orders')
    .update({ status }).eq('id', orderId).select().single()
  if (error) throw error
  return data
}

// ===== DEBTORS =====
export async function dbGetDebtors(tenantId, opts = {}) {
  let q = sb.from('debtors')
    .select('*, debtor_payments(amount, paid_at, note)')
    .eq('tenant_id', tenantId)
  if (!opts.includeSettled) q = q.eq('is_settled', false)
  q = q.order('name')
  const { data } = await q
  return data || []
}

export async function dbCreateDebtor(tenantId, payload) {
  const { data, error } = await sb.from('debtors')
    .insert({ ...payload, tenant_id: tenantId, is_settled: false }).select().single()
  if (error) throw error
  return data
}

export async function dbAddDebtorCharge(debtorId, amount, note, items = []) {
  const { data, error } = await sb.from('debtor_charges')
    .insert({ debtor_id: debtorId, amount, note, items }).select().single()
  if (error) throw error
  // Update total
  await sb.rpc('update_debtor_total', { p_debtor_id: debtorId })
  return data
}

export async function dbAddDebtorPayment(debtorId, amount, note) {
  const { data, error } = await sb.from('debtor_payments')
    .insert({ debtor_id: debtorId, amount, note }).select().single()
  if (error) throw error
  await sb.rpc('update_debtor_total', { p_debtor_id: debtorId })
  return data
}

export async function dbSettleDebtor(debtorId) {
  const { error } = await sb.from('debtors')
    .update({ is_settled: true, settled_at: new Date().toISOString() }).eq('id', debtorId)
  if (error) throw error
}

// ===== ACTIVITY LOG =====
export async function dbLogActivity(tenantId, userId, action, entity, entityId, details = {}) {
  await sb.from('activity_log').insert({
    tenant_id: tenantId,
    user_id: userId,
    action,
    entity,
    entity_id: entityId?.toString(),
    details
  })
}

export async function dbGetActivityLog(tenantId, opts = {}) {
  let q = sb.from('activity_log')
    .select('*, users(name, email)')
    .eq('tenant_id', tenantId)

  if (opts.userId) q = q.eq('user_id', opts.userId)
  if (opts.action) q = q.eq('action', opts.action)
  if (opts.entity) q = q.eq('entity', opts.entity)
  if (opts.dateFrom) q = q.gte('created_at', opts.dateFrom)
  if (opts.dateTo) q = q.lte('created_at', opts.dateTo)

  q = q.order('created_at', { ascending: false })
  if (opts.limit) q = q.limit(opts.limit)

  const { data } = await q
  return data || []
}

// ===== DASHBOARD =====
export async function dbGetDashboardStats(tenantId) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = today.toISOString()

  const [todaySales, monthlySales, topCategories, lowStock] = await Promise.all([
    // Ventas hoy
    sb.from('sales').select('total_amount, total_cost')
      .eq('tenant_id', tenantId).eq('status', 'completed')
      .gte('created_at', todayISO),

    // Ventas mes actual (últimos 12 meses)
    sb.from('sales').select('total_amount, total_cost, created_at')
      .eq('tenant_id', tenantId).eq('status', 'completed')
      .gte('created_at', new Date(today.getFullYear(), today.getMonth() - 11, 1).toISOString()),

    // Top categorías
    sb.from('sale_items')
      .select('products(category_id, categories(name)), quantity')
      .limit(500),

    // Bajo stock
    sb.from('products').select('id, name, stock, min_stock')
      .eq('tenant_id', tenantId).eq('is_active', true)
      .lt('stock', sb.raw('min_stock'))
  ])

  return {
    todaySales: todaySales.data || [],
    monthlySales: monthlySales.data || [],
    topCategories: topCategories.data || [],
    lowStock: lowStock.data || []
  }
}

// ===== REALTIME SUBSCRIPTIONS =====
export function subscribeToSales(tenantId, callback) {
  return sb.channel(`sales:${tenantId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'sales',
      filter: `tenant_id=eq.${tenantId}`
    }, callback)
    .subscribe()
}

export function subscribeToProducts(tenantId, callback) {
  return sb.channel(`products:${tenantId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'products',
      filter: `tenant_id=eq.${tenantId}`
    }, callback)
    .subscribe()
}

export function subscribeToBuffetOrders(tenantId, callback) {
  return sb.channel(`buffet_orders:${tenantId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'buffet_orders',
      filter: `tenant_id=eq.${tenantId}`
    }, callback)
    .subscribe()
}

export function unsubscribe(channel) {
  if (channel) sb.removeChannel(channel)
}
