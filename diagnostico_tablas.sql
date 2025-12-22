-- ===============================================
-- Script de DIAGNÓSTICO de Tablas
-- ===============================================
-- Ejecuta este script para ver qué tablas tienes
-- y detectar problemas
-- ===============================================

-- 1. Ver todas las tablas que existen
SELECT 
  table_name,
  table_type
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- 2. Ver columnas de cada tabla importante
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name IN ('clientes', 'proveedores', 'servicios', 'cuentas_servicios', 'ventas')
ORDER BY table_name, ordinal_position;

-- 3. Ver restricciones (foreign keys, etc)
SELECT
  tc.table_name, 
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('clientes', 'proveedores', 'servicios', 'cuentas_servicios', 'ventas')
ORDER BY tc.table_name;

-- 4. Contar registros en cada tabla
DO $$
DECLARE
  table_record RECORD;
  count_query TEXT;
  row_count INTEGER;
BEGIN
  RAISE NOTICE '=== CONTEO DE REGISTROS ===';
  
  FOR table_record IN 
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name IN ('clientes', 'proveedores', 'servicios', 'cuentas_servicios', 'ventas')
    ORDER BY table_name
  LOOP
    count_query := format('SELECT COUNT(*) FROM %I', table_record.table_name);
    EXECUTE count_query INTO row_count;
    RAISE NOTICE 'Tabla %: % registros', table_record.table_name, row_count;
  END LOOP;
END $$;

-- ===============================================
-- SI NECESITAS ELIMINAR UNA TABLA ESPECÍFICA:
-- ===============================================
-- Descomenta la tabla que quieres eliminar

-- DROP TABLE IF EXISTS ventas CASCADE;
-- DROP TABLE IF EXISTS cuentas_servicios CASCADE;
-- DROP TABLE IF EXISTS servicios CASCADE;
-- DROP TABLE IF EXISTS proveedores CASCADE;
-- DROP TABLE IF EXISTS clientes CASCADE;

-- ===============================================
-- RESULTADO ESPERADO:
-- ===============================================
-- Deberías ver 5 tablas con estas columnas:
--
-- clientes: 5 columnas
--   - id (uuid)
--   - nombre (varchar)
--   - apellido (varchar)
--   - telefono (varchar)
--   - creado_en (timestamp)
--
-- proveedores: 5 columnas
--   - id (uuid)
--   - usuario (varchar)
--   - telefono (varchar)
--   - correo (varchar)
--   - creado_en (timestamp)
--
-- servicios: 3 columnas
--   - id (uuid)
--   - nombre (varchar)
--   - creado_en (timestamp)
--
-- cuentas_servicios: 8 columnas
--   - id (uuid)
--   - servicio_id (uuid)
--   - proveedor_id (uuid)
--   - correo (varchar)
--   - contrasena (varchar)
--   - precio (numeric)
--   - fecha_vencimiento (date)
--   - creado_en (timestamp)
--
-- ventas: 6 columnas
--   - id (uuid)
--   - cliente_id (uuid)
--   - cuenta_servicio_id (uuid)
--   - fecha_venta (timestamp)
--   - monto (numeric)
--   - creado_en (timestamp)
-- ===============================================
