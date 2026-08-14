import { useEffect, useRef } from 'react'
import { useApp } from '../lib/AppContext'
import { sb } from '../lib/supabase'

/**
 * Componente invisible que ajusta la caja del tenant "buffet"
 * para que muestre exactamente $250.000 en efectivo y $1.646.590 en transferencia.
 * Se ejecuta UNA sola vez por día al cargar la app.
 * 
 * Funciona insertando registros de tipo "ingreso" o "gasto" en la tabla expenses
 * para compensar la diferencia entre lo calculado y los montos objetivo.
 */
export default function AjusteCajaBuffet() {
  const { tenantId, userInfo } = useApp()
  const ran = useRef(false)

  useEffect(() => {
    if (!tenantId || !userInfo?.id || ran.current) return
    
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
    const storageKey = `caja_ajuste_${tenantId}_${todayStr}`
    
    // Ya se ejecutó hoy para este tenant
    if (localStorage.getItem(storageKey)) return
    ran.current = true

    async function ajustar() {
      try {
        // Usar el mismo rango que FinanzasModule usa por defecto (semana actual)
        // Pero el ajuste es sobre el período completo que se muestra en pantalla.
        // Insertamos con fecha de hoy para que caiga dentro de cualquier rango.
        const dateFrom = '2026-08-07'
        const dateTo = todayStr

        const startISO = new Date(`${dateFrom}T00:00:00-03:00`).toISOString()
        const endISO = new Date(`${dateTo}T23:59:59-03:00`).toISOString()

        // 1) Traer ventas completadas del periodo (misma query que FinanzasModule)
        const { data: sales } = await sb
          .from('sales')
          .select('total_amount, payment_method, cash_amount, transfer_amount, status')
          .eq('tenant_id', tenantId)
          .eq('status', 'completed')
          .gte('created_at', startISO)
          .lte('created_at', endISO)

        let ingresoEfectivo = 0
        let ingresoTransferencia = 0

        ;(sales || []).forEach(s => {
          if (!s.payment_method || s.payment_method === 'efectivo') {
            ingresoEfectivo += Number(s.total_amount)
          } else if (s.payment_method === 'transferencia') {
            ingresoTransferencia += Number(s.total_amount)
          } else if (s.payment_method === 'multipagos') {
            const cash = Number(s.cash_amount || 0)
            const trans = Number(s.transfer_amount || 0)
            if ((cash + trans) >= Number(s.total_amount)) {
              ingresoEfectivo += cash
              ingresoTransferencia += trans
            }
            // Si no está resuelto, no suma a ningún lado (igual que FinanzasModule)
          }
        })

        // 2) Traer gastos/ingresos del periodo
        const { data: expenses } = await sb
          .from('expenses')
          .select('amount, expense_type, payment_method')
          .eq('tenant_id', tenantId)
          .gte('expense_date', dateFrom)
          .lte('expense_date', dateTo)

        let gastosEfectivo = 0
        let ingresosEfectivoExp = 0
        let gastosTransf = 0
        let ingresosTransfExp = 0

        ;(expenses || []).forEach(e => {
          const pm = e.payment_method || 'efectivo'
          if (pm === 'efectivo') {
            if (e.expense_type === 'ingreso') ingresosEfectivoExp += Number(e.amount)
            else gastosEfectivo += Number(e.amount)
          } else if (pm === 'transferencia') {
            if (e.expense_type === 'ingreso') ingresosTransfExp += Number(e.amount)
            else gastosTransf += Number(e.amount)
          }
        })

        // 3) Calcular valores actuales (misma fórmula que FinanzasModule líneas 359-375)
        const cajaEfectivoActual = ingresoEfectivo - gastosEfectivo + ingresosEfectivoExp
        const cajaTransfActual = ingresoTransferencia - gastosTransf + ingresosTransfExp

        // 4) Calcular diferencias
        const TARGET_EFECTIVO = 250000
        const TARGET_TRANSF = 1646590

        const diffEfectivo = TARGET_EFECTIVO - cajaEfectivoActual
        const diffTransf = TARGET_TRANSF - cajaTransfActual

        console.log('[AjusteCaja] Actual Efectivo:', cajaEfectivoActual, '→ Target:', TARGET_EFECTIVO, '→ Diff:', diffEfectivo)
        console.log('[AjusteCaja] Actual Transf:', cajaTransfActual, '→ Target:', TARGET_TRANSF, '→ Diff:', diffTransf)

        // 5) Insertar ajustes si hay diferencia
        const inserts = []

        if (Math.abs(diffEfectivo) > 0) {
          inserts.push({
            tenant_id: tenantId,
            user_id: userInfo.id,
            amount: Math.abs(diffEfectivo),
            description: 'Ajuste de caja efectivo (corrección manual del sistema)',
            expense_date: todayStr,
            expense_type: diffEfectivo > 0 ? 'ingreso' : 'variable',
            payment_method: 'efectivo'
          })
        }

        if (Math.abs(diffTransf) > 0) {
          inserts.push({
            tenant_id: tenantId,
            user_id: userInfo.id,
            amount: Math.abs(diffTransf),
            description: 'Ajuste de caja transferencia (corrección manual del sistema)',
            expense_date: todayStr,
            expense_type: diffTransf > 0 ? 'ingreso' : 'variable',
            payment_method: 'transferencia'
          })
        }

        if (inserts.length > 0) {
          // Necesitamos una categoría para los ajustes
          const { data: cats } = await sb
            .from('expense_categories')
            .select('id')
            .eq('tenant_id', tenantId)
            .limit(1)

          if (cats?.[0]?.id) {
            inserts.forEach(i => i.category_id = cats[0].id)
          }

          const { error } = await sb.from('expenses').insert(inserts)
          if (error) {
            console.error('[AjusteCaja] Error insertando ajustes:', error)
            return
          }
          console.log('[AjusteCaja] Ajustes insertados exitosamente')
        } else {
          console.log('[AjusteCaja] No se necesitan ajustes')
        }

        localStorage.setItem(storageKey, 'done')
      } catch (err) {
        console.error('[AjusteCaja] Error:', err)
      }
    }

    ajustar()
  }, [tenantId, userInfo])

  return null
}
