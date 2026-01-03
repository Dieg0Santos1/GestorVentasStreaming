-- ======================================================
-- MIGRACIÓN: Integración con Sistema de Códigos
-- - Clave de acceso por cliente
-- - Tabla de mensajes por cuenta
-- - Vista de cuentas habilitadas por cliente
-- ======================================================
-- Ejecutar este script en el editor SQL de Supabase
-- del proyecto usado por el Gestor de Ventas.

BEGIN;

-- 1) Clave de acceso en clientes (texto plano por ahora)
--    Nota: se puede migrar a hash más adelante si se desea.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS clave_acceso text;

CREATE INDEX IF NOT EXISTS clientes_clave_acceso_idx
  ON public.clientes (clave_acceso);

-- 2) (Opcional pero recomendado) Clave técnica del servicio
--    para alinearla con las plataformas del Sistema de Códigos.
--    Por ejemplo: 'Netflix' -> 'netflix', 'Prime Video' -> 'prime'.
ALTER TABLE public.servicios
  ADD COLUMN IF NOT EXISTS service_key text;

-- 3) Tabla de mensajes por cuenta de servicio
CREATE TABLE IF NOT EXISTS public.mensajes_cuentas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_servicio_id uuid NOT NULL REFERENCES public.cuentas_servicios(id) ON DELETE CASCADE,
  service_key text NOT NULL,
  mailbox text NOT NULL,
  subject text,
  from_address text,
  body text,
  content_type text,
  received_at timestamptz NOT NULL DEFAULT now(),
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mensajes_cuentas_cuenta_idx
  ON public.mensajes_cuentas (cuenta_servicio_id);

CREATE INDEX IF NOT EXISTS mensajes_cuentas_mailbox_service_idx
  ON public.mensajes_cuentas (service_key, mailbox);

CREATE INDEX IF NOT EXISTS mensajes_cuentas_received_at_idx
  ON public.mensajes_cuentas (received_at DESC);

-- 4) Vista de cuentas habilitadas por cliente
--    Deriva permisos de la tabla de ventas + cuentas_servicios + servicios.
--    Reglas:
--      - Solo ventas no liberadas
--      - Solo ventas cuya fecha_vencimiento (date) es hoy o futura

CREATE OR REPLACE VIEW public.vw_clientes_cuentas_habilitadas AS
SELECT
  v.cliente_id,
  v.cuenta_servicio_id,
  c.correo       AS correo_cuenta,
  COALESCE(
    s.service_key,
    -- Mapeo básico por nombre en caso de que service_key esté vacío
    CASE lower(s.nombre)
      WHEN 'netflix'    THEN 'netflix'
      WHEN 'max'        THEN 'max'
      WHEN 'disney+'    THEN 'disney'
      WHEN 'prime video' THEN 'prime'
      WHEN 'spotify'    THEN 'spotify'
      ELSE lower(s.nombre)
    END
  )              AS service_key,
  v.fecha_inicio,
  v.fecha_vencimiento
FROM public.ventas v
JOIN public.cuentas_servicios c ON c.id = v.cuenta_servicio_id
JOIN public.servicios s         ON s.id = c.servicio_id
WHERE COALESCE(v.liberada, false) = false
  AND v.fecha_vencimiento::date >= current_date;

COMMIT;
