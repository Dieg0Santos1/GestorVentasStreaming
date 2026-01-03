-- ===============================================
-- Script para permitir eliminar cuentas liberadas
-- ===============================================
-- Este script modifica las restricciones de foreign key
-- para permitir eliminar cuentas que tienen ventas históricas
-- pero que actualmente están liberadas.
--
-- INSTRUCCIONES DE USO:
-- 1. Abre el SQL Editor en tu dashboard de Supabase
-- 2. Copia y pega este script completo
-- 3. Ejecuta el script
-- ===============================================

-- PASO 1: Eliminar la restricción existente en la tabla ventas
ALTER TABLE ventas 
DROP CONSTRAINT IF EXISTS ventas_cuenta_servicio_id_fkey;

-- PASO 2: Crear nueva restricción con ON DELETE SET NULL
-- Esto permitirá eliminar cuentas y las ventas históricas 
-- mantendrán su registro pero con cuenta_servicio_id = NULL
ALTER TABLE ventas 
ADD CONSTRAINT ventas_cuenta_servicio_id_fkey 
FOREIGN KEY (cuenta_servicio_id) 
REFERENCES cuentas_servicios(id) 
ON DELETE SET NULL;

-- PASO 3: Hacer que la columna cuenta_servicio_id sea nullable (si no lo es ya)
-- Esto es necesario para que ON DELETE SET NULL funcione
ALTER TABLE ventas 
ALTER COLUMN cuenta_servicio_id DROP NOT NULL;

-- ===============================================
-- Verificar los cambios
-- ===============================================
SELECT 
  tc.table_name, 
  tc.constraint_name, 
  tc.constraint_type,
  kcu.column_name,
  rc.update_rule,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name
LEFT JOIN information_schema.referential_constraints rc 
  ON tc.constraint_name = rc.constraint_name
WHERE tc.table_name = 'ventas' 
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'cuenta_servicio_id';

-- ===============================================
-- ¡SCRIPT COMPLETADO!
-- ===============================================
-- Ahora podrás eliminar cuentas que:
-- - No tienen ventas activas (liberada = false)
-- - Tienen solo ventas históricas (liberada = true)
-- 
-- Las ventas históricas se mantendrán en la BD con
-- cuenta_servicio_id = NULL para mantener el registro.
-- ===============================================
