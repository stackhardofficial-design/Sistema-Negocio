const fs = require('fs');

function updateFile(file, replacer) {
  let content = fs.readFileSync(file, 'utf8');
  content = replacer(content);
  fs.writeFileSync(file, content);
}

// 1. AIAgent.jsx
updateFile('src/components/AIAgent.jsx', c => {
  return c.replace(/🤖/g, '').replace(/❌/g, 'Error:');
});

// 2. BuffetModule.jsx
updateFile('src/modules/buffet/BuffetModule.jsx', c => {
  if (!c.includes('ClipboardList')) {
    c = c.replace(/import {([^}]+)} from 'lucide-react'/, "import { $1, ClipboardList, Utensils, Package as PkgIcon, User, Check } from 'lucide-react'");
  }
  c = c.replace(/label: `📋 Pedidos \${([^}]+)}`/g, "label: <span style={{display:'flex', alignItems:'center', gap:'6px'}}><ClipboardList size={16}/> Pedidos {$1}</span>");
  c = c.replace(/label: '🍔 Productos Preparados'/g, "label: <span style={{display:'flex', alignItems:'center', gap:'6px'}}><Utensils size={16}/> Productos Preparados</span>");
  c = c.replace(/label: '🥗 Ingredientes \\(Stock\\)'/g, "label: <span style={{display:'flex', alignItems:'center', gap:'6px'}}><PkgIcon size={16}/> Ingredientes (Stock)</span>");
  c = c.replace(/{order\.customer_name \? `👤 \${order\.customer_name}` : 'Pedido'}/g, "{order.customer_name ? <span style={{display:'flex', alignItems:'center', gap:'4px'}}><User size={14}/> {order.customer_name}</span> : 'Pedido'}");
  c = c.replace(/✓ Listo/g, "Listo");
  return c;
});

// 3. ConfiguracionModule.jsx
updateFile('src/modules/configuracion/ConfiguracionModule.jsx', c => {
  return c.replace(/Ej: 🥤/g, "Ej: fa-coffee");
});

// 4. DashboardModule.jsx
updateFile('src/modules/dashboard/DashboardModule.jsx', c => {
  if (!c.includes('BarChart2')) {
    c = c.replace(/import {([^}]+)} from 'lucide-react'/, "import { $1, BarChart2 } from 'lucide-react'");
  }
  c = c.replace(/📊 Ventas vs Ganancia/g, "Ventas vs Ganancia");
  c = c.replace(/🥧 Categorías más vendidas/g, "Categorías más vendidas");
  return c;
});

// 5. FinanzasModule.jsx
updateFile('src/modules/finanzas/FinanzasModule.jsx', c => {
  if (!c.includes('Lock')) {
    c = c.replace(/import {([^}]+)} from 'lucide-react'/, "import { $1, Lock } from 'lucide-react'");
  }
  c = c.replace(/🔒 Fijos:/g, "<Lock size={14} style={{display:'inline', verticalAlign:'middle'}}/> Fijos:");
  c = c.replace(/🔄 Variables:/g, "<RefreshCw size={14} style={{display:'inline', verticalAlign:'middle'}}/> Variables:");
  c = c.replace(/>🔄 Variable</g, "><RefreshCw size={14} style={{marginRight: 6}}/> Variable<");
  c = c.replace(/>🔒 Fijo</g, "><Lock size={14} style={{marginRight: 6}}/> Fijo<");
  c = c.replace(/Guardar Gasto \${expenseForm\.expense_type === 'fixed' \? '🔒 Fijo' : '🔄 Variable'}/g, "Guardar Gasto");
  return c;
});

// 6. ProductosModule.jsx
updateFile('src/modules/productos/ProductosModule.jsx', c => {
  if (!c.includes('AlertTriangle')) {
    c = c.replace(/import {([^}]+)} from 'lucide-react'/, "import { $1, AlertTriangle } from 'lucide-react'");
  }
  c = c.replace(/✓/g, "");
  c = c.replace(/{isLowStock && ' ⚠'}/g, "{isLowStock && <AlertTriangle size={14} style={{marginLeft: 6, color:'var(--warning)'}}/>}");
  return c;
});

// 7. StockModule.jsx
updateFile('src/modules/stock/StockModule.jsx', c => {
  if (!c.includes('AlertTriangle')) {
    c = c.replace(/import {([^}]+)} from 'lucide-react'/, "import { $1, AlertTriangle } from 'lucide-react'");
  }
  c = c.replace(/✓/g, "");
  c = c.replace(/❌/g, "");
  c = c.replace(/<span className=\"badge badge-warning\">⚠ Bajo<\/span>/g, "<span className=\"badge badge-warning\" style={{display:'flex', alignItems:'center', gap:'4px'}}><AlertTriangle size={12}/> Bajo</span>");
  c = c.replace(/label: `⚠ Bajo \(\${lowCount}\)`/g, "label: <span style={{display:'flex', alignItems:'center', gap:'4px'}}><AlertTriangle size={14}/> Bajo (${lowCount})</span>");
  return c;
});

// 8. RegistroVentasModule.jsx
updateFile('src/modules/ventas/RegistroVentasModule.jsx', c => {
  c = c.replace(/'⏳ Guardando...'/g, "'Guardando...'");
  return c;
});

// 9. VentasModule.jsx
updateFile('src/modules/ventas/VentasModule.jsx', c => {
  c = c.replace(/✅ /g, "");
  return c;
});
