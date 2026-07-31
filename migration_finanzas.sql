-- =====================================================
-- MÓDULO DE FINANZAS Y GASTOS - Migración
-- Aplicar en: Supabase Dashboard > SQL Editor
-- =====================================================

-- 1. Categorías de Gastos
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
  user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Quién registró el gasto
  amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  description TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE, -- Fecha específica del gasto
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
