-- =====================================================
-- AUTO-CONFIRMACIÓN DE USUARIOS
-- Aplicar en: Supabase Dashboard > SQL Editor
-- =====================================================

-- 1. Confirmar todos los usuarios existentes que no estén confirmados
UPDATE auth.users 
SET email_confirmed_at = NOW() 
WHERE email_confirmed_at IS NULL;

-- 2. Crear función para auto-confirmar nuevos usuarios creados desde el frontend (vía signUp)
CREATE OR REPLACE FUNCTION public.auto_confirm_new_user()
RETURNS TRIGGER AS $$
BEGIN
  NEW.email_confirmed_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Crear el trigger que se ejecuta antes de insertar en auth.users
DROP TRIGGER IF EXISTS auto_confirm_user_trigger ON auth.users;
CREATE TRIGGER auto_confirm_user_trigger
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.auto_confirm_new_user();
