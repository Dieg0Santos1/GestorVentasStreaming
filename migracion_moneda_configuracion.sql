-- Agrega configuración de moneda al usuario
-- Ejecutar en Supabase SQL Editor

alter table if exists public.configuraciones_usuario
  add column if not exists moneda text;

-- Valor por defecto para registros existentes
update public.configuraciones_usuario
set moneda = 'USD'
where moneda is null;

-- Default para nuevos registros
alter table if exists public.configuraciones_usuario
  alter column moneda set default 'USD';

-- Nota: si usas RLS, normalmente no hace falta cambiar policies para una nueva columna
-- mientras las policies permitan UPDATE/INSERT sobre la tabla.
