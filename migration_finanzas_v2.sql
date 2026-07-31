-- =====================================================
-- MIGRACIÓN: expense_type para Caja (Fijo/Variable)
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- =====================================================

-- 1. Agregar columna expense_type a expenses
ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS expense_type TEXT DEFAULT 'variable';

-- 2. Índice para filtros rápidos por tipo
CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(expense_type);
