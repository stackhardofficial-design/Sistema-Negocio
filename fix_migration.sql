-- =====================================================
-- MIGRACIÓN CORRECTIVA - Sistema Negocio
-- Aplicar en: Supabase Dashboard > SQL Editor
-- =====================================================

-- 1. Función decrement_stock mejorada
--    Acepta p_qty negativo para devolver stock (cancelaciones)
CREATE OR REPLACE FUNCTION decrement_stock(p_product_id UUID, p_qty NUMERIC)
RETURNS VOID AS $$
BEGIN
  UPDATE products
  SET stock = GREATEST(0, COALESCE(stock, 0) - p_qty),
      updated_at = NOW()
  WHERE id = p_product_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Función increment_stock (nueva)
--    Usada al anular venta o eliminar item de venta
CREATE OR REPLACE FUNCTION increment_stock(p_product_id UUID, p_qty NUMERIC)
RETURNS VOID AS $$
BEGIN
  UPDATE products
  SET stock = COALESCE(stock, 0) + p_qty,
      updated_at = NOW()
  WHERE id = p_product_id;
END;
$$ LANGUAGE plpgsql;

-- 3. Columnas faltantes en sales para cancelaciones
--    (por si no existen aún)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- 4. Asegurar que tenants.slug tiene constraint UNIQUE
--    (ya debería tenerla, esto es un safety check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'tenants' 
    AND constraint_name = 'tenants_slug_key'
  ) THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_slug_key UNIQUE (slug);
  END IF;
END $$;

-- Verificación: mostrar las funciones creadas
SELECT proname, proargtypes FROM pg_proc 
WHERE proname IN ('decrement_stock', 'increment_stock');
