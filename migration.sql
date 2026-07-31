-- =====================================================
-- SISTEMA BUFFET ESCOLAR - Migración completa
-- SistemaBuffet's Project
-- =====================================================

-- ===== TENANTS =====
CREATE TABLE IF NOT EXISTS tenants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  plan TEXT DEFAULT 'basic',
  is_active BOOLEAN DEFAULT true,
  paid_until DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== USERS =====
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  role TEXT DEFAULT 'vendedor', -- 'super_admin' | 'admin' | 'vendedor'
  roles TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== CATEGORIES =====
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== PRODUCTS =====
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  barcode TEXT,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  cost_price DECIMAL(10, 2) DEFAULT 0,
  stock INTEGER,
  min_stock INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);

-- ===== SALES =====
CREATE TABLE IF NOT EXISTS sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  total_amount DECIMAL(10, 2) DEFAULT 0,
  total_cost DECIMAL(10, 2) DEFAULT 0,
  status TEXT DEFAULT 'completed', -- 'completed' | 'cancelled'
  cancel_reason TEXT,
  cancelled_by UUID REFERENCES users(id),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_tenant ON sales(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at DESC);

-- ===== SALE ITEMS =====
CREATE TABLE IF NOT EXISTS sale_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL,
  unit_cost DECIMAL(10, 2) DEFAULT 0,
  subtotal DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== BUFFET PRODUCTS =====
CREATE TABLE IF NOT EXISTS buffet_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) DEFAULT 0,
  cost_price DECIMAL(10, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== INGREDIENTS (Buffet) =====
CREATE TABLE IF NOT EXISTS ingredients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT DEFAULT 'unidad',
  cost_price DECIMAL(10, 2) DEFAULT 0,
  stock DECIMAL(10, 3) DEFAULT 0,
  min_stock DECIMAL(10, 3) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== BUFFET INGREDIENTS =====
CREATE TABLE IF NOT EXISTS buffet_ingredients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  buffet_product_id UUID REFERENCES buffet_products(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity DECIMAL(10, 3) DEFAULT 1,
  unit TEXT DEFAULT 'unidad',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== BUFFET ORDERS =====
CREATE TABLE IF NOT EXISTS buffet_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  customer_name TEXT,
  status TEXT DEFAULT 'pending', -- pending | preparing | ready | delivered | cancelled
  total_amount DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== BUFFET ORDER ITEMS =====
CREATE TABLE IF NOT EXISTS buffet_order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES buffet_orders(id) ON DELETE CASCADE,
  buffet_product_id UUID REFERENCES buffet_products(id),
  quantity INTEGER DEFAULT 1,
  unit_price DECIMAL(10, 2) DEFAULT 0,
  subtotal DECIMAL(10, 2) DEFAULT 0
);

-- ===== DEBTORS =====
CREATE TABLE IF NOT EXISTS debtors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  note TEXT,
  total_debt DECIMAL(10, 2) DEFAULT 0,
  is_settled BOOLEAN DEFAULT false,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== DEBTOR CHARGES =====
CREATE TABLE IF NOT EXISTS debtor_charges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  debtor_id UUID REFERENCES debtors(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  note TEXT,
  items JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== DEBTOR PAYMENTS =====
CREATE TABLE IF NOT EXISTS debtor_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  debtor_id UUID REFERENCES debtors(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  note TEXT,
  paid_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== ACTIVITY LOG =====
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,  -- create | update | delete | cancel | activate | deactivate | login | logout | update_stock
  entity TEXT NOT NULL,  -- product | sale | user | debtor | buffet_product | category
  entity_id TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_tenant ON activity_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Descontar stock al vender
CREATE OR REPLACE FUNCTION decrement_stock(p_product_id UUID, p_qty INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE products
  SET stock = GREATEST(0, stock - p_qty),
      updated_at = NOW()
  WHERE id = p_product_id AND stock IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- Actualizar deuda total de un deudor
CREATE OR REPLACE FUNCTION update_debtor_total(p_debtor_id UUID)
RETURNS VOID AS $$
DECLARE
  v_charges DECIMAL;
  v_payments DECIMAL;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_charges
  FROM debtor_charges WHERE debtor_id = p_debtor_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_payments
  FROM debtor_payments WHERE debtor_id = p_debtor_id;

  UPDATE debtors
  SET total_debt = GREATEST(0, v_charges - v_payments)
  WHERE id = p_debtor_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE buffet_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE buffet_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE buffet_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE buffet_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE debtors ENABLE ROW LEVEL SECURITY;
ALTER TABLE debtor_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE debtor_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Políticas: usuarios autenticados acceden solo a sus datos de tenant
CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Tenants
CREATE POLICY "super_admin_all_tenants" ON tenants FOR ALL USING (is_super_admin());
CREATE POLICY "user_own_tenant" ON tenants FOR SELECT USING (id = get_user_tenant_id());

-- Users
CREATE POLICY "super_admin_all_users" ON users FOR ALL USING (is_super_admin());
CREATE POLICY "user_tenant_users" ON users FOR ALL USING (tenant_id = get_user_tenant_id());

-- Products
CREATE POLICY "tenant_products" ON products FOR ALL USING (tenant_id = get_user_tenant_id() OR is_super_admin());

-- Categories
CREATE POLICY "tenant_categories" ON categories FOR ALL USING (tenant_id = get_user_tenant_id() OR is_super_admin());

-- Sales
CREATE POLICY "tenant_sales" ON sales FOR ALL USING (tenant_id = get_user_tenant_id() OR is_super_admin());
CREATE POLICY "tenant_sale_items" ON sale_items FOR ALL USING (
  EXISTS (SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.tenant_id = get_user_tenant_id())
  OR is_super_admin()
);

-- Buffet
CREATE POLICY "tenant_buffet_products" ON buffet_products FOR ALL USING (tenant_id = get_user_tenant_id() OR is_super_admin());
CREATE POLICY "tenant_ingredients" ON ingredients FOR ALL USING (tenant_id = get_user_tenant_id() OR is_super_admin());
CREATE POLICY "tenant_buffet_ingredients" ON buffet_ingredients FOR ALL USING (
  EXISTS (SELECT 1 FROM buffet_products bp WHERE bp.id = buffet_ingredients.buffet_product_id AND bp.tenant_id = get_user_tenant_id())
  OR is_super_admin()
);
  EXISTS (SELECT 1 FROM buffet_products bp WHERE bp.id = buffet_ingredients.buffet_product_id AND bp.tenant_id = get_user_tenant_id())
  OR is_super_admin()
);
CREATE POLICY "tenant_buffet_orders" ON buffet_orders FOR ALL USING (tenant_id = get_user_tenant_id() OR is_super_admin());
CREATE POLICY "tenant_buffet_order_items" ON buffet_order_items FOR ALL USING (
  EXISTS (SELECT 1 FROM buffet_orders bo WHERE bo.id = buffet_order_items.order_id AND bo.tenant_id = get_user_tenant_id())
  OR is_super_admin()
);

-- Debtors
CREATE POLICY "tenant_debtors" ON debtors FOR ALL USING (tenant_id = get_user_tenant_id() OR is_super_admin());
CREATE POLICY "tenant_debtor_charges" ON debtor_charges FOR ALL USING (
  EXISTS (SELECT 1 FROM debtors d WHERE d.id = debtor_charges.debtor_id AND d.tenant_id = get_user_tenant_id())
  OR is_super_admin()
);
CREATE POLICY "tenant_debtor_payments" ON debtor_payments FOR ALL USING (
  EXISTS (SELECT 1 FROM debtors d WHERE d.id = debtor_payments.debtor_id AND d.tenant_id = get_user_tenant_id())
  OR is_super_admin()
);

-- Activity log
CREATE POLICY "tenant_activity_log" ON activity_log FOR ALL USING (tenant_id = get_user_tenant_id() OR is_super_admin());

-- =====================================================
-- REALTIME
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE sales;
ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER PUBLICATION supabase_realtime ADD TABLE buffet_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;

-- =====================================================
-- SUPER ADMIN INICIAL
-- (Ejecutar después del primer deploy)
-- =====================================================
-- NOTA: Crear el usuario tomas@stackhard.com en Auth > Users en el panel de Supabase
-- con contraseña TOMAS2812, y luego ejecutar:
--
-- INSERT INTO users (id, email, name, role, is_active)
-- VALUES ('<uuid-del-usuario-auth>', 'tomas@stackhard.com', 'Tomas', 'super_admin', true);
