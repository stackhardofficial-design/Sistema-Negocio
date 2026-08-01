-- =====================================================
-- MÃ“DULO DE FINANZAS Y GASTOS - MigraciÃ³n
-- Aplicar en: Supabase Dashboard > SQL Editor
-- =====================================================

-- 1. CategorÃ­as de Gastos
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_categories_tenant ON expense_categories(tenant_id);

-- 2. Gastos (Caja)
CREATE TABLE IF NOT EXISTS expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- QuiÃ©n registrÃ³ el gasto
  amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  description TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE, -- Fecha especÃ­fica del gasto
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_tenant ON expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);

-- =====================================================
-- RLS (ROW LEVEL SECURITY)
-- =====================================================
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_expense_categories" ON expense_categories 
FOR ALL USING (tenant_id = get_user_tenant_id() OR is_super_admin());

CREATE POLICY "tenant_expenses" ON expenses 
FOR ALL USING (tenant_id = get_user_tenant_id() OR is_super_admin());

-- =====================================================
-- REALTIME
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE expense_categories;
ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
-- =====================================================
-- MIGRACIÃ“N: expense_type para Caja (Fijo/Variable)
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- =====================================================

-- 1. Agregar columna expense_type a expenses
ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS expense_type TEXT DEFAULT 'variable';

-- 2. Ãndice para filtros rÃ¡pidos por tipo
CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(expense_type);
-- =====================================================
-- MIGRACIÃ“N: Habilitar Supabase Realtime para MÃ³dulos
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- =====================================================

-- AÃ±adir tablas esenciales a la publicaciÃ³n realtime de PostgreSQL
ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER PUBLICATION supabase_realtime ADD TABLE sales;
ALTER PUBLICATION supabase_realtime ADD TABLE sale_items;
ALTER PUBLICATION supabase_realtime ADD TABLE debtors;
ALTER PUBLICATION supabase_realtime ADD TABLE debt_payments;
-- Nota: 'expenses' y 'expense_categories' ya fueron aÃ±adidas en la migraciÃ³n de finanzas.
