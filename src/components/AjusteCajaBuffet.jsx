import { useEffect } from 'react'
import { sb } from '../lib/supabase'

export default function AjusteCajaBuffet({ tenantId }) {
  useEffect(() => {
    if (!tenantId) return
    const key = `buffet_caja_fixed_${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })}`
    if (localStorage.getItem(key)) return

    async function fix() {
      try {
        const { data: users } = await sb.from('users').select('*').eq('tenant_id', tenantId)
        const buffetUser = users?.find(u => u.name === '@buffet' || u.role === 'buffet')
        if (!buffetUser) {
          console.log('Buffet user not found')
          return
        }

        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
        const today = new Date(todayStr + 'T00:00:00-03:00')
        const startISO = today.toISOString()

        const { data: sales } = await sb.from('sales')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('user_id', buffetUser.id)
          .eq('status', 'completed')
          .gte('created_at', startISO)

        let totalEf = 0
        let totalTr = 0

        ;(sales || []).forEach(s => {
          if (!s.payment_method || s.payment_method === 'efectivo') totalEf += s.total_amount
          else if (s.payment_method === 'transferencia') totalTr += s.total_amount
          else if (s.payment_method === 'multipagos') {
            totalEf += Number(s.cash_amount || 0)
            totalTr += Number(s.transfer_amount || 0)
          }
        })

        const { data: expenses } = await sb.from('expenses')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('user_id', buffetUser.id)
          .gte('expense_date', todayStr)

        let expEf = 0, expTr = 0, ingEf = 0, ingTr = 0
        ;(expenses || []).forEach(e => {
          if (e.expense_type === 'ingreso') {
            if (!e.payment_method || e.payment_method === 'efectivo') ingEf += Number(e.amount)
            else ingTr += Number(e.amount)
          } else {
            if (!e.payment_method || e.payment_method === 'efectivo') expEf += Number(e.amount)
            else expTr += Number(e.amount)
          }
        })

        const currentCajaEfectivo = totalEf + ingEf - expEf
        const currentCajaTransf = totalTr + ingTr - expTr

        const targetEfectivo = 250000
        const targetTransf = 1646590

        const diffEfectivo = targetEfectivo - currentCajaEfectivo
        const diffTransf = targetTransf - currentCajaTransf

        if (diffEfectivo !== 0) {
          await sb.from('expenses').insert({
            tenant_id: tenantId,
            user_id: buffetUser.id,
            amount: Math.abs(diffEfectivo),
            description: 'Ajuste de caja efectivo (corrección manual)',
            expense_date: todayStr,
            expense_type: diffEfectivo > 0 ? 'ingreso' : 'variable',
            payment_method: 'efectivo'
          })
        }

        if (diffTransf !== 0) {
          await sb.from('expenses').insert({
            tenant_id: tenantId,
            user_id: buffetUser.id,
            amount: Math.abs(diffTransf),
            description: 'Ajuste de caja transferencia (corrección manual)',
            expense_date: todayStr,
            expense_type: diffTransf > 0 ? 'ingreso' : 'variable',
            payment_method: 'transferencia'
          })
        }

        console.log('Caja ajustada', { diffEfectivo, diffTransf })
        localStorage.setItem(key, 'true')
        alert('Se ha ajustado automáticamente la caja de @buffet (Efectivo: $250.000, Transferencia: $1.646.590)')
      } catch (err) {
        console.error('Error ajustando caja buffet:', err)
      }
    }
    fix()
  }, [tenantId])

  return null
}
