-- =====================================================
-- MIGRACIÓN: Agregar columna theme_color a users
-- =====================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_color TEXT DEFAULT 'amber';
