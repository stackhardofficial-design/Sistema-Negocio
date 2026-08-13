const fs = require('fs');

let fmPath = 'src/modules/finanzas/FinanzasModule.jsx';
let c = fs.readFileSync(fmPath, 'utf8');

// 1. Update initial expenseForm state to include payment_method
c = c.replace(
  "expense_date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }), expense_type: 'ingreso'",
  "expense_date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }), expense_type: 'ingreso', payment_method: 'efectivo'"
);
c = c.replace(
  "expense_date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }), expense_type: 'variable'",
  "expense_date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }), expense_type: 'variable', payment_method: 'efectivo'"
);

// 2. Remove the condition that hides the Multipagos box (it should always show if we want it strictly present, wait! The user said "no aparece lo de multipagos", removing the `> 0` check will make it always appear. But I also want to make sure the expected money is calculated.
c = c.replace(
  "...(ingresoMultipagoSinResolver > 0 ? [{ label: '💸 Multipago (Pendiente)', value: ingresoMultipagoSinResolver, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.3)' }] : [])",
  "{ label: '💸 Multipago (Pendiente)', value: ingresoMultipagoSinResolver, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.3)' }"
);

// 3. Add payment method select in the Modal Nuevo Gasto/Ingreso
const paymentMethodHtml = `
            <div className="form-group">
              <label className="form-label">Método de Pago</label>
              <select
                value={expenseForm.payment_method || 'efectivo'}
                onChange={e => setExpenseForm({ ...expenseForm, payment_method: e.target.value })}
                disabled={saving}
              >
                <option value="efectivo">💵 Efectivo</option>
                <option value="transferencia">💳 Transferencia (Mercado Pago, etc.)</option>
              </select>
            </div>
`;
c = c.replace(
  '<div className="form-group">\n              <label className="form-label">Monto ($)</label>',
  paymentMethodHtml + '\n            <div className="form-group">\n              <label className="form-label">Monto ($)</label>'
);

// 4. Calculate Expected Money (Dinero Esperado)
// We need to loop through expenses and separate them by payment_method.
// Currently expenses are grouped into fixed and variable.
const oldResumenSection = `          {/* Resumen */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {/* Ingresos (Caja) */}`;

const expectedMoneyLogic = `
          {/* DINERO ESPERADO */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '250px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>EFECTIVO ESPERADO EN CAJA</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#10b981' }}>
                {formatMoney(
                  ingresoEfectivo 
                  - expenses.filter(e => e.payment_method === 'efectivo' && e.expense_type !== 'ingreso').reduce((a, b) => a + Number(b.amount), 0) 
                  + expenses.filter(e => e.payment_method === 'efectivo' && e.expense_type === 'ingreso').reduce((a, b) => a + Number(b.amount), 0)
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Ingresos Efectivo - Gastos Efectivo</div>
            </div>
            
            <div style={{ flex: 1, minWidth: '250px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>DINERO ESPERADO EN CUENTA (Transf.)</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#3b82f6' }}>
                {formatMoney(
                  ingresoTransferencia 
                  - expenses.filter(e => e.payment_method === 'transferencia' && e.expense_type !== 'ingreso').reduce((a, b) => a + Number(b.amount), 0)
                  + expenses.filter(e => e.payment_method === 'transferencia' && e.expense_type === 'ingreso').reduce((a, b) => a + Number(b.amount), 0)
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Ingresos Transf. - Gastos Transf.</div>
            </div>
          </div>
`;

c = c.replace(oldResumenSection, expectedMoneyLogic + '\n' + oldResumenSection);

fs.writeFileSync(fmPath, c, 'utf8');
console.log('Patched FinanzasModule.jsx with expected money and payment method UI');
