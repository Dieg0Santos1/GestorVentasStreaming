-- ======================================================
-- MIGRACIÓN: permitir cuentas_servicios sin fecha de vencimiento
-- ======================================================
-- Objetivo:
-- - Hacer opcional la columna fecha_vencimiento en cuentas_servicios
-- - Soportar cuentas con vencimiento indefinido desde la app (checkbox)
--
-- INSTRUCCIONES:
-- 1. Abre el SQL Editor de tu proyecto en Supabase.
-- 2. Copia TODO este script.
-- 3. Ejecútalo una sola vez.
--
-- Nota: No borra ni modifica datos existentes.

BEGIN;

ALTER TABLE public.cuentas_servicios
  ALTER COLUMN fecha_vencimiento DROP NOT NULL;

COMMIT;
