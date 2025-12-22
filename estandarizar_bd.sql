-- ===============================================
-- Script para Estandarizar Datos en la Base de Datos
-- ===============================================
-- Este script capitaliza los campos de texto existentes
-- (primera letra en mayúscula, resto en minúsculas)
-- en las tablas clientes y proveedores de Supabase/PostgreSQL
--
-- INSTRUCCIONES DE USO:
-- 1. Abre el SQL Editor en tu dashboard de Supabase
-- 2. Copia y pega este script completo
-- 3. Ejecuta el script
-- 4. Los datos existentes serán actualizados automáticamente
--
-- IMPORTANTE: Este script modifica datos existentes. 
-- Considera hacer un respaldo antes de ejecutarlo.
-- ===============================================

-- Actualizar tabla de clientes
-- Capitaliza los campos: nombre y apellido
UPDATE clientes
SET 
  nombre = INITCAP(LOWER(TRIM(nombre))),
  apellido = INITCAP(LOWER(TRIM(apellido)))
WHERE 
  nombre IS NOT NULL 
  OR apellido IS NOT NULL;

-- Actualizar tabla de proveedores
-- Capitaliza el campo: usuario
UPDATE proveedores
SET 
  usuario = INITCAP(LOWER(TRIM(usuario)))
WHERE 
  usuario IS NOT NULL;

-- Verificar los cambios en clientes
SELECT 
  id, 
  nombre, 
  apellido, 
  telefono
FROM clientes
ORDER BY id;

-- Verificar los cambios en proveedores
SELECT 
  id, 
  usuario, 
  telefono
FROM proveedores
ORDER BY id;

-- ===============================================
-- NOTAS ADICIONALES:
-- ===============================================
-- - INITCAP() capitaliza la primera letra de cada palabra
-- - Si prefieres solo capitalizar la primera letra del texto completo
--   (no cada palabra), usa esta alternativa:
--
-- Para clientes:
-- UPDATE clientes
-- SET 
--   nombre = CONCAT(UPPER(SUBSTRING(TRIM(nombre), 1, 1)), LOWER(SUBSTRING(TRIM(nombre), 2))),
--   apellido = CONCAT(UPPER(SUBSTRING(TRIM(apellido), 1, 1)), LOWER(SUBSTRING(TRIM(apellido), 2)))
-- WHERE nombre IS NOT NULL OR apellido IS NOT NULL;
--
-- Para proveedores:
-- UPDATE proveedores
-- SET 
--   usuario = CONCAT(UPPER(SUBSTRING(TRIM(usuario), 1, 1)), LOWER(SUBSTRING(TRIM(usuario), 2)))
-- WHERE usuario IS NOT NULL;
-- ===============================================
