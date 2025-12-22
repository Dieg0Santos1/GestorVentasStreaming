-- ======================================================
-- MIGRACIÓN: pagos_ventas (ingresos por ventas/renovaciones)
-- ======================================================
-- Objetivo:
-- - Registrar cada pago como un movimiento independiente (venta inicial y renovaciones)
-- - Permite que las renovaciones sumen en estadísticas sin alterar el precio actual de la venta
--
-- IMPORTANTE:
-- - Ejecuta esto en Supabase SQL Editor.
-- - No borra datos existentes.
-- - Incluye un backfill para crear un pago inicial por cada venta existente.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pagos_ventas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  venta_id UUID NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
  monto NUMERIC(10,2) NOT NULL,
  fecha_pago TIMESTAMPTZ NOT NULL DEFAULT now(),
  tipo TEXT NOT NULL DEFAULT 'venta', -- 'venta' | 'renovacion'
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_ventas_user_id ON public.pagos_ventas(user_id);
CREATE INDEX IF NOT EXISTS idx_pagos_ventas_fecha_pago ON public.pagos_ventas(fecha_pago);
CREATE INDEX IF NOT EXISTS idx_pagos_ventas_venta_id ON public.pagos_ventas(venta_id);

-- Backfill: un pago inicial por cada venta existente.
-- Evita duplicados si lo ejecutas más de una vez.
INSERT INTO public.pagos_ventas (user_id, venta_id, monto, fecha_pago, tipo)
SELECT
  v.user_id,
  v.id,
  COALESCE(v.monto, 0),
  COALESCE(v.fecha_venta, now()),
  'venta'
FROM public.ventas v
WHERE NOT EXISTS (
  SELECT 1
  FROM public.pagos_ventas p
  WHERE p.venta_id = v.id AND p.tipo = 'venta'
);

-- RLS (opcional, recomendado si tu proyecto usa auth + user_id)
ALTER TABLE public.pagos_ventas ENABLE ROW LEVEL SECURITY;

-- Políticas básicas: solo dueño (user_id) puede ver/insertar/editar/borrar.
DROP POLICY IF EXISTS pagos_ventas_select_own ON public.pagos_ventas;
DROP POLICY IF EXISTS pagos_ventas_insert_own ON public.pagos_ventas;
DROP POLICY IF EXISTS pagos_ventas_update_own ON public.pagos_ventas;
DROP POLICY IF EXISTS pagos_ventas_delete_own ON public.pagos_ventas;

CREATE POLICY pagos_ventas_select_own
ON public.pagos_ventas
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY pagos_ventas_insert_own
ON public.pagos_ventas
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY pagos_ventas_update_own
ON public.pagos_ventas
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY pagos_ventas_delete_own
ON public.pagos_ventas
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

COMMIT;

-- (Opcional) Diagnóstico rápido:
-- SELECT tipo, COUNT(*), SUM(monto) FROM public.pagos_ventas GROUP BY tipo;
