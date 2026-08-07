-- =====================================================
-- MIGRACIÓN: Método de Pago en Ventas
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- Agregar columna de método de pago a la tabla sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'efectivo';
-- Valores posibles: 'efectivo' | 'transferencia' | 'deudor'

-- Agregar referencia al deudor (solo cuando payment_method = 'deudor')
ALTER TABLE sales ADD COLUMN IF NOT EXISTS debtor_id UUID REFERENCES debtors(id) ON DELETE SET NULL;

-- Agregar sale_id a debtor_charges para vincular cargo con la venta original
ALTER TABLE debtor_charges ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES sales(id) ON DELETE SET NULL;

-- Índice para búsqueda por método de pago
CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON sales(payment_method);

-- Índice para búsqueda de ventas de un deudor
CREATE INDEX IF NOT EXISTS idx_sales_debtor ON sales(debtor_id) WHERE debtor_id IS NOT NULL;

-- Verificar que se aplicó correctamente
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'sales'
  AND column_name IN ('payment_method', 'debtor_id')
ORDER BY column_name;
