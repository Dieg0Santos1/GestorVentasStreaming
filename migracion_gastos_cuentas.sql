-- ======================================================
-- MIGRACIÓN: gastos_cuentas (gastos por cuentas/renovaciones)
-- ======================================================
-- Objetivo:
-- - Registrar cada gasto asociado a una cuenta de servicio (compra inicial y renovaciones)
-- - Permitir que las renovaciones aumenten los gastos del mes actual sin perder el historial
--
-- IMPORTANTE:
-- - Ejecuta esto en Supabase SQL Editor.
-- - No borra datos existentes.
-- - Incluye un backfill para crear un gasto inicial por cada cuenta existente.

BEGIN;

CREATE TABLE IF NOT EXISTS public.gastos_cuentas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  cuenta_servicio_id UUID NOT NULL REFERENCES public.cuentas_servicios(id) ON DELETE CASCADE,
  monto NUMERIC(10,2) NOT NULL,
  fecha_gasto TIMESTAMPTZ NOT NULL DEFAULT now(),
  tipo TEXT NOT NULL DEFAULT 'compra', -- 'compra' | 'renovacion'
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gastos_cuentas_user_id ON public.gastos_cuentas(user_id);
CREATE INDEX IF NOT EXISTS idx_gastos_cuentas_fecha_gasto ON public.gastos_cuentas(fecha_gasto);
CREATE INDEX IF NOT EXISTS idx_gastos_cuentas_cuenta_id ON public.gastos_cuentas(cuenta_servicio_id);

-- Backfill: un gasto inicial por cada cuenta existente (si aún no tiene uno).
INSERT INTO public.gastos_cuentas (user_id, cuenta_servicio_id, monto, fecha_gasto, tipo)
SELECT
  c.user_id,
  c.id,
  COALESCE(c.precio_compra, 0),
  COALESCE(c.fecha_inicio, now()),
  'compra'
FROM public.cuentas_servicios c
WHERE COALESCE(c.precio_compra, 0) > 0
  AND c.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.gastos_cuentas g
    WHERE g.cuenta_servicio_id = c.id AND g.tipo = 'compra'
  );

-- RLS (opcional, recomendado si tu proyecto usa auth + user_id)
ALTER TABLE public.gastos_cuentas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gastos_cuentas_select_own ON public.gastos_cuentas;
DROP POLICY IF EXISTS gastos_cuentas_insert_own ON public.gastos_cuentas;
DROP POLICY IF EXISTS gastos_cuentas_update_own ON public.gastos_cuentas;
DROP POLICY IF EXISTS gastos_cuentas_delete_own ON public.gastos_cuentas;

CREATE POLICY gastos_cuentas_select_own
ON public.gastos_cuentas
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY gastos_cuentas_insert_own
ON public.gastos_cuentas
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY gastos_cuentas_update_own
ON public.gastos_cuentas
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY gastos_cuentas_delete_own
ON public.gastos_cuentas
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

COMMIT;

-- (Opcional) Diagnóstico rápido:
-- SELECT tipo, COUNT(*), SUM(monto) FROM public.gastos_cuentas GROUP BY tipo;
