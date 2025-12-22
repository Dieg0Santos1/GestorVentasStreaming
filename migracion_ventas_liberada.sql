-- Permite "liberar" una cuenta vencida sin eliminar la venta (para no descontar ingresos).
-- Al liberar, se marcará la venta como liberada=true y ya no bloqueará la cuenta.

alter table if exists public.ventas
add column if not exists liberada boolean not null default false;

create index if not exists ventas_user_id_liberada_fecha_vencimiento_idx
on public.ventas (user_id, liberada, fecha_vencimiento);
