-- ===============================================
-- Script para Crear Tablas en Supabase
-- ===============================================
-- Este script crea todas las tablas necesarias para
-- el Gestor de Ventas de servicios de streaming
--
-- INSTRUCCIONES DE USO:
-- 1. Abre el SQL Editor en tu dashboard de Supabase
-- 2. Copia y pega este script completo
-- 3. Ejecuta el script
-- 4. Las tablas serán creadas automáticamente
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

-- Tabla de cuentas de servicios
CREATE TABLE IF NOT EXISTS cuentas_servicios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id UUID NOT NULL REFERENCES servicios(id) ON DELETE CASCADE,
  proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  correo VARCHAR(255) NOT NULL,
  contrasena VARCHAR(255) NOT NULL,
  precio DECIMAL(10, 2) NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_correo_servicio UNIQUE (servicio_id, correo)
);

-- Tabla de ventas
CREATE TABLE IF NOT EXISTS ventas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  cuenta_servicio_id UUID REFERENCES cuentas_servicios(id) ON DELETE RESTRICT,
  fecha_venta TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  monto DECIMAL(10, 2) NOT NULL,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes(nombre);
CREATE INDEX IF NOT EXISTS idx_proveedores_usuario ON proveedores(usuario);
CREATE INDEX IF NOT EXISTS idx_servicios_nombre ON servicios(nombre);
CREATE INDEX IF NOT EXISTS idx_cuentas_servicio_id ON cuentas_servicios(servicio_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_proveedor_id ON cuentas_servicios(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_fecha_vencimiento ON cuentas_servicios(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente_id ON ventas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ventas_cuenta_id ON ventas(cuenta_servicio_id);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha_venta);

-- Habilitar Row Level Security (RLS) - Opcional pero recomendado
-- ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE servicios ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE cuentas_servicios ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso público (para desarrollo)
-- En producción, considera políticas más restrictivas
-- CREATE POLICY "Enable all access for authenticated users" ON clientes FOR ALL USING (true);
-- CREATE POLICY "Enable all access for authenticated users" ON proveedores FOR ALL USING (true);
-- CREATE POLICY "Enable all access for authenticated users" ON servicios FOR ALL USING (true);
-- CREATE POLICY "Enable all access for authenticated users" ON cuentas_servicios FOR ALL USING (true);
-- CREATE POLICY "Enable all access for authenticated users" ON ventas FOR ALL USING (true);

-- Verificar las tablas creadas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('clientes', 'proveedores', 'servicios', 'cuentas_servicios', 'ventas')
ORDER BY table_name;

-- ===============================================
-- DATOS DE EJEMPLO (OPCIONAL)
-- ===============================================
-- Descomentar las siguientes líneas para insertar datos de prueba

-- INSERT INTO servicios (nombre) VALUES 
--   ('Netflix'),
--   ('Max'),
--   ('Prime Video'),
--   ('Disney+'),
--   ('Spotify');

-- INSERT INTO proveedores (usuario, telefono) VALUES 
--   ('Juan Pérez', '555-0001'),
--   ('María García', '555-0002'),
--   ('Carlos López', '555-0003');

-- INSERT INTO clientes (nombre, apellido, telefono) VALUES 
--   ('Ana', 'Martínez', '555-1001'),
--   ('Luis', 'Rodríguez', '555-1002'),
--   ('Sofia', 'Hernández', '555-1003');

-- ===============================================
