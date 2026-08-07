-- =====================================================
-- MIGRATION: PRODUCTOS COMPUESTOS (COMBOS)
-- =====================================================

-- 1. Añadir columna is_composite a products
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_composite BOOLEAN DEFAULT false;

-- 2. Crear tabla product_components
CREATE TABLE IF NOT EXISTS product_components (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  composite_product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  component_product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE product_components ENABLE ROW LEVEL SECURITY;

-- Políticas para product_components (basado en el tenant del producto compuesto)
CREATE POLICY "tenant_product_components" ON product_components FOR ALL USING (
  EXISTS (SELECT 1 FROM products p WHERE p.id = product_components.composite_product_id AND p.tenant_id = get_user_tenant_id())
  OR is_super_admin()
);

-- 3. Actualizar función decrement_stock
CREATE OR REPLACE FUNCTION decrement_stock(p_product_id UUID, p_qty NUMERIC)
RETURNS VOID AS $$
DECLARE
  v_is_composite BOOLEAN;
  c RECORD;
BEGIN
  SELECT is_composite INTO v_is_composite FROM products WHERE id = p_product_id;
  
  IF v_is_composite THEN
    -- Descontar a los componentes (no descontamos al compuesto en sí)
    FOR c IN (SELECT component_product_id, quantity FROM product_components WHERE composite_product_id = p_product_id) LOOP
      UPDATE products
      SET stock = GREATEST(0, COALESCE(stock, 0) - (p_qty * c.quantity)),
          updated_at = NOW()
      WHERE id = c.component_product_id;
    END LOOP;
  ELSE
    -- Comportamiento normal para producto simple
    UPDATE products
    SET stock = GREATEST(0, COALESCE(stock, 0) - p_qty),
        updated_at = NOW()
    WHERE id = p_product_id;
  END IF;
END;
$$ LANGUAGE plpgsql;


-- 4. Actualizar función increment_stock
CREATE OR REPLACE FUNCTION increment_stock(p_product_id UUID, p_qty NUMERIC)
RETURNS VOID AS $$
DECLARE
  v_is_composite BOOLEAN;
  c RECORD;
BEGIN
  SELECT is_composite INTO v_is_composite FROM products WHERE id = p_product_id;
  
  IF v_is_composite THEN
    -- Sumar a los componentes (no sumamos al compuesto en sí)
    FOR c IN (SELECT component_product_id, quantity FROM product_components WHERE composite_product_id = p_product_id) LOOP
      UPDATE products
      SET stock = COALESCE(stock, 0) + (p_qty * c.quantity),
          updated_at = NOW()
      WHERE id = c.component_product_id;
    END LOOP;
  ELSE
    -- Comportamiento normal para producto simple
    UPDATE products
    SET stock = COALESCE(stock, 0) + p_qty,
        updated_at = NOW()
    WHERE id = p_product_id;
  END IF;
END;
$$ LANGUAGE plpgsql;
