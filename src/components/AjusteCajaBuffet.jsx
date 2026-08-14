import { useEffect } from 'react'
import { useApp } from '../lib/AppContext'
import { sb } from '../lib/supabase'

/**
 * Corrección FINAL de caja. Se ejecuta UNA sola vez.
 * Efectivo actual: $430.677 → Meta: $250.000 → Gasto efectivo $180.677
 * Transf actual: $1.380.090 → Meta: $1.646.590 → Ingreso transferencia $266.500
 */
export default function AjusteCajaBuffet() {
  const { tenantId, userInfo } = useApp()

  useEffect(() => {
    if (!tenantId || !userInfo?.id) return

    const KEY = 'caja_ajuste_FINAL_v2'
    if (localStorage.getItem(KEY) === 'done') return
    // Marcar INMEDIATAMENTE antes de hacer cualquier cosa para evitar doble ejecución
    localStorage.setItem(KEY, 'done')

    async function ajustar() {
      try {
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })

        const { data: cats } = await sb
          .from('expense_categories')
          .select('id')
          .eq('tenant_id', tenantId)
          .limit(1)

        const categoryId = cats?.[0]?.id || null

        const { error } = await sb.from('expenses').insert([
          {
            tenant_id: tenantId,
            user_id: userInfo.id,
            amount: 684327,
            description: 'Ajuste de caja efectivo definitivo',
            expense_date: todayStr,
            expense_type: 'variable',
            payment_method: 'efectivo',
            ...(categoryId && { category_id: categoryId })
          },
          {
            tenant_id: tenantId,
            user_id: userInfo.id,
            amount: 839120,
            description: 'Ajuste caja transferencia definitivo',
            expense_date: todayStr,
            expense_type: 'variable',
            payment_method: 'transferencia',
            ...(categoryId && { category_id: categoryId })
          }
        ])

        if (error) console.error('[AjusteCaja] Error:', error)
        else console.log('[AjusteCaja] Corrección final aplicada')
      } catch (err) {
        console.error('[AjusteCaja] Error:', err)
      }
    }

    ajustar()
  }, [tenantId, userInfo])

  return null
}
