-- =====================================================
-- MIGRACIÓN: Habilitar Supabase Realtime para Módulos
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- =====================================================

-- Añadir tablas esenciales a la publicación realtime de PostgreSQL
ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER PUBLICATION supabase_realtime ADD TABLE sales;
ALTER PUBLICATION supabase_realtime ADD TABLE sale_items;
ALTER PUBLICATION supabase_realtime ADD TABLE debtors;
ALTER PUBLICATION supabase_realtime ADD TABLE debt_payments;
ALTER PUBLICATION supabase_realtime ADD TABLE product_categories;
ALTER PUBLICATION supabase_realtime ADD TABLE tenants;
ALTER PUBLICATION supabase_realtime ADD TABLE users;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_logs;

-- Nota: 'expenses' y 'expense_categories' ya fueron añadidas en la migración de finanzas.
