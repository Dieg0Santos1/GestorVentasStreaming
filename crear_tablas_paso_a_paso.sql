-- ===============================================
-- Script PASO A PASO para Crear Tablas en Supabase
-- ===============================================
-- Ejecuta este script en tu SQL Editor de Supabase
-- Si encuentras errores, puedes ejecutar tabla por tabla
-- ===============================================

-- PASO 1: Eliminar tablas existentes (si quieres empezar de cero)
-- ⚠️ CUIDADO: Esto eliminará todos los datos
-- Descomenta las siguientes líneas solo si quieres borrar todo:

-- DROP TABLE IF EXISTS ventas CASCADE;
-- DROP TABLE IF EXISTS cuentas_servicios CASCADE;
-- DROP TABLE IF EXISTS servicios CASCADE;
-- DROP TABLE IF EXISTS proveedores CASCADE;
-- DROP TABLE IF EXISTS clientes CASCADE;

-- ===============================================
-- PASO 2: Crear tablas base (sin dependencias)
-- ===============================================

-- Tabla de clientes
CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  telefono VARCHAR(20),
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de proveedores
CREATE TABLE IF NOT EXISTS proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario VARCHAR(100) NOT NULL,
  telefono VARCHAR(20),
  correo VARCHAR(255), -- opcional
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de servicios
CREATE TABLE IF NOT EXISTS servicios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(100) NOT NULL UNIQUE,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================================
-- PASO 3: Crear tabla de cuentas (con dependencias)
-- ===============================================

-- Tabla de cuentas de servicios
CREATE TABLE IF NOT EXISTS cuentas_servicios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id UUID NOT NULL REFERENCES servicios(id) ON DELETE CASCADE,
  proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  correo VARCHAR(255) NOT NULL,
  contrasena VARCHAR(255) NOT NULL,
  precio DECIMAL(10, 2) NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Constraint único para evitar correos duplicados por servicio
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_correo_servicio'
  ) THEN
    ALTER TABLE cuentas_servicios 
    ADD CONSTRAINT unique_correo_servicio UNIQUE (servicio_id, correo);
  END IF;
END $$;

-- ===============================================
-- PASO 4: Crear tabla de ventas
-- ===============================================

-- Tabla de ventas
CREATE TABLE IF NOT EXISTS ventas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  cuenta_servicio_id UUID REFERENCES cuentas_servicios(id) ON DELETE RESTRICT,
  fecha_venta TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  monto DECIMAL(10, 2) NOT NULL,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================================
-- PASO 5: Crear índices para mejorar rendimiento
-- ===============================================

CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes(nombre);
CREATE INDEX IF NOT EXISTS idx_proveedores_usuario ON proveedores(usuario);
CREATE INDEX IF NOT EXISTS idx_servicios_nombre ON servicios(nombre);
CREATE INDEX IF NOT EXISTS idx_cuentas_servicio_id ON cuentas_servicios(servicio_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_proveedor_id ON cuentas_servicios(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_fecha_vencimiento ON cuentas_servicios(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente_id ON ventas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ventas_cuenta_id ON ventas(cuenta_servicio_id);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha_venta);

-- ===============================================
-- PASO 6: Verificar que todo se creó correctamente
-- ===============================================

SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_schema = 'public' AND columns.table_name = tables.table_name) as columnas
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('clientes', 'proveedores', 'servicios', 'cuentas_servicios', 'ventas')
ORDER BY table_name;

-- ===============================================
-- PASO 7 (OPCIONAL): Insertar datos de ejemplo
-- ===============================================
-- Descomenta las siguientes líneas para agregar datos de prueba

-- Servicios de ejemplo
/*
INSERT INTO servicios (nombre) VALUES 
  ('Netflix'),
  ('Max'),
  ('Prime Video'),
  ('Disney+'),
  ('Spotify')
ON CONFLICT (nombre) DO NOTHING;
*/

-- Proveedores de ejemplo
/*
INSERT INTO proveedores (usuario, telefono) VALUES 
  ('Juan Pérez', '555-0001'),
  ('María García', '555-0002'),
  ('Carlos López', '555-0003');
*/

-- Clientes de ejemplo
/*
INSERT INTO clientes (nombre, apellido, telefono) VALUES 
  ('Ana', 'Martínez', '555-1001'),
  ('Luis', 'Rodríguez', '555-1002'),
  ('Sofia', 'Hernández', '555-1003');
*/

-- ===============================================
-- ¡SCRIPT COMPLETADO!
-- ===============================================
-- Si todo salió bien, deberías ver 5 tablas creadas
-- con el número correcto de columnas.
-- ===============================================
