-- ═══════════════════════════════════════════════════════════════════════
-- 002 · Alcance
--
-- El corazón de los permisos. "Alcance" = lo propio más lo de todos los
-- que cuelgan de ti en el organigrama vigente, a cualquier profundidad.
--
-- Vive en un esquema aparte para que nadie la llame por accidente desde el
-- cliente, y es SECURITY DEFINER porque tiene que leer hierarchy entera
-- para resolver la recursión — si dependiera de RLS se mordería la cola.
-- ═══════════════════════════════════════════════════════════════════════

create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;
grant usage on schema privado to authenticated;

-- Todos los descendientes de alguien, más esa persona.
create or replace function privado.alcance(raiz uuid)
returns table (profile_id uuid)
language sql stable security definer set search_path = public, privado as $$
  with recursive baja as (
    select raiz as id
    union
    select h.profile_id
      from hierarchy h
      join baja b on h.reports_to = b.id
     where h.valid_to is null
  )
  select id from baja;
$$;

-- ¿Puede `quien` ver los datos de `sujeto`?
-- Un administrador lo ve todo. El resto, solo su alcance.
create or replace function privado.puede_ver(quien uuid, sujeto uuid)
returns boolean
language sql stable security definer set search_path = public, privado as $$
  select
    quien = sujeto
    or exists (select 1 from profiles p where p.id = quien and p.is_admin)
    or exists (select 1 from privado.alcance(quien) a where a.profile_id = sujeto);
$$;

-- Atajos sobre el usuario de la sesión.
create or replace function privado.mi_alcance()
returns table (profile_id uuid)
language sql stable set search_path = public, privado as $$
  select * from privado.alcance(auth.uid());
$$;

create or replace function privado.soy_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin and is_active from profiles where id = auth.uid()), false);
$$;

create or replace function privado.estoy_activo()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_active from profiles where id = auth.uid()), false);
$$;

grant execute on function privado.alcance(uuid)      to authenticated;
grant execute on function privado.puede_ver(uuid,uuid) to authenticated;
grant execute on function privado.mi_alcance()       to authenticated;
grant execute on function privado.soy_admin()        to authenticated;
grant execute on function privado.estoy_activo()     to authenticated;
