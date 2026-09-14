-- =====================================================
-- MIGRACIÓN: Topes de Gasto Semanales
-- =====================================================

-- 1. Tabla de topes
CREATE TABLE IF NOT EXISTS topes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  weekly_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topes_tenant ON topes(tenant_id);

-- 2. Columna tope_id en expenses
ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS tope_id UUID REFERENCES topes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_tope ON expenses(tope_id);

-- 3. RLS
ALTER TABLE topes ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'topes' AND policyname = 'tenant_topes'
  ) THEN
    CREATE POLICY "tenant_topes" ON topes 
    FOR ALL USING (tenant_id = get_user_tenant_id() OR is_super_admin());
  END IF;
END $$;

-- 4. Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE topes;
EXCEPTION WHEN duplicate_object THEN
  -- Ya existe en la publicación
  NULL;
END $$;
