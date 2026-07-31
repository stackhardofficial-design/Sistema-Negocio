const fs = require('fs');

function fixFile(path) {
  let content = fs.readFileSync(path, 'utf8');
  
  const replacements = {
    'Ã¡': 'á', 'Ã©': 'é', 'Ã­': 'í', 'Ã³': 'ó', 'Ãº': 'ú',
    'Ã±': 'ñ', 'Ã ': 'Á', 'Ã‰': 'É', 'Ã\x8D': 'Í', 'Ã“': 'Ó', 
    'Ãš': 'Ú', 'Ã‘': 'Ñ', 'Â·': '·', 'â€”': '—', 'Ã“': 'Ó', 'CÃ“DIGO': 'CÓDIGO'
  };

  let fixed = content;
  for (const [bad, good] of Object.entries(replacements)) {
    fixed = fixed.split(bad).join(good);
  }

  // Si hubo un BOM de powershell o similar y lo leyó raro, al escribir utf8 
  // debería quedar normal.
  fs.writeFileSync(path, fixed, 'utf8');
  console.log(`Fixed ${path}`);
}

fixFile('src/modules/empleados/EmpleadosModule.jsx');
fixFile('src/modules/ventas/VentasModule.jsx');
