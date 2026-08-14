import { useEffect, useRef } from 'react'
import { useApp } from '../lib/AppContext'
import { sb } from '../lib/supabase'

/**
 * Ajuste directo de caja: inserta las correcciones exactas faltantes.
 * Efectivo actual: $69.323 → Meta: $250.000 → Agregar ingreso efectivo $180.677
 * Transf actual: $1.913.090 → Meta: $1.646.590 → Agregar gasto transferencia $266.500
 */
export default function AjusteCajaBuffet() {
  const { tenantId, userInfo } = useApp()
  const ran = useRef(false)

  useEffect(() => {
    if (!tenantId || !userInfo?.id || ran.current) return

    const storageKey = `caja_ajuste_v3_${tenantId}`
    if (localStorage.getItem(storageKey)) return
    ran.current = true

    async function ajustar() {
      try {
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })

        // Buscar una categoría para asignar
        const { data: cats } = await sb
          .from('expense_categories')
          .select('id')
          .eq('tenant_id', tenantId)
          .limit(1)

        const categoryId = cats?.[0]?.id || null

        const inserts = []

        // Falta $180.677 en efectivo → ingreso
        inserts.push({
          tenant_id: tenantId,
          user_id: userInfo.id,
          amount: 180677,
          description: 'Ajuste de caja efectivo - corrección final',
          expense_date: todayStr,
          expense_type: 'ingreso',
          payment_method: 'efectivo',
          ...(categoryId && { category_id: categoryId })
        })

        // Sobran $266.500 en transferencia → gasto
        inserts.push({
          tenant_id: tenantId,
          user_id: userInfo.id,
          amount: 266500,
          description: 'Ajuste de caja transferencia - corrección final',
          expense_date: todayStr,
          expense_type: 'variable',
          payment_method: 'transferencia',
          ...(categoryId && { category_id: categoryId })
        })

        const { error } = await sb.from('expenses').insert(inserts)
        if (error) {
          console.error('[AjusteCaja] Error:', error)
          return
        }

        console.log('[AjusteCaja] Corrección final aplicada: +$180.677 efectivo, -$266.500 transferencia')
        localStorage.setItem(storageKey, 'done')
      } catch (err) {
        console.error('[AjusteCaja] Error:', err)
      }
    }

    ajustar()
  }, [tenantId, userInfo])

  return null
}
