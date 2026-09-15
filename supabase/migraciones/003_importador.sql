-- =========================================================================
-- 003_importador.sql — Carga desde la hoja de Google
--
-- Vacia agentes, registros, metas y contests y los recarga con lo que
-- devuelve el Apps Script. Se usa para el ensayo y para el dia del corte.
--
-- Protegida con una clave de UN SOLO USO guardada en privado.config
-- ('tokenImportacion'): sin ella no hace nada, y al terminar bien la borra.
-- Despues del corte hay que eliminar esta funcion: su trabajo es destructivo
-- y ya no tendra razon de existir.
--
--   drop function public.importar_datos(jsonb, text);
--
-- Procedimiento:
--   1. Generar una clave aleatoria de 48 caracteres y guardarla:
--        insert into privado.config values ('tokenImportacion', '<clave>')
--        on conflict (clave) do update set valor = excluded.valor;
--   2. Bajar los datos del Apps Script (listarAgentes, listarRegistros,
--      listarMetas, listarContests) y mandarlos por la API:
--        POST /rest/v1/rpc/importar_datos
--        { "p_datos": { agentes, registros, metas, contests }, "p_token": "<clave>" }
--   3. Comparar carga_inicial contra lo bajado, campo por campo.
-- =========================================================================

create or replace function public.importar_datos(p_datos jsonb, p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_token text;
begin
  select valor into v_token from privado.config where clave = 'tokenImportacion';
  if v_token is null or p_token is null or length(v_token) < 32 or v_token <> p_token then
    return privado.mal('No autorizado.');
  end if;

  truncate public.registros, public.agentes, public.metas, public.contests;

  insert into public.agentes (id, nombre, equipo, rol, reporta_a, activo, creado)
  select a->>'id', pg_catalog.btrim(a->>'nombre'), coalesce(a->>'equipo', ''),
         coalesce(nullif(a->>'rol', ''), 'Agente'), coalesce(a->>'reportaA', ''),
         (a->'activo') is distinct from 'false'::jsonb,
         coalesce(privado.fecha(a->>'creado'), privado.hoy_local())
    from pg_catalog.jsonb_array_elements(p_datos->'agentes') a;

  -- El orden de la lista (fecha desc; dentro del dia, el de la hoja) se
  -- conserva en "creado" para que la pagina muestre lo mismo que antes.
  insert into public.registros (id, fecha, agente_id, agente_nombre, app, press, press_sale,
    press_no_sale, caller_calls, no_show, no_califica, reschedule, cita_cedida, referidos, alp,
    sin_actividad, motivo_sin_actividad, creado, actualizado)
  select r->>'id', (r->>'fecha')::date, r->>'agenteId', coalesce(r->>'agenteNombre', ''),
         privado.num(r->'app'), privado.num(r->'press'), privado.num(r->'pressSale'),
         privado.num(r->'pressNoSale'), privado.num(r->'callerCalls'), privado.num(r->'noShow'),
         privado.num(r->'noCalifica'), privado.num(r->'reschedule'), privado.num(r->'citaCedida'),
         privado.num(r->'referidos'), privado.num(r->'alp'),
         coalesce((r->'sinActividad') = 'true'::jsonb, false),
         coalesce(r->>'motivoSinActividad', ''),
         ((r->>'fecha')::timestamp + interval '12 hours' + pg_catalog.make_interval(secs => (ord - 1)::double precision))
           at time zone 'America/Denver',
         pg_catalog.now()
    from pg_catalog.jsonb_array_elements(p_datos->'registros') with ordinality as e(r, ord);

  insert into public.metas (id, semana, agente_id, agente_nombre, alp, app, referidos)
  select m->>'id', (m->>'semana')::date, m->>'agenteId', coalesce(m->>'agenteNombre', ''),
         privado.num(m->'alp'), privado.num(m->'app'), privado.num(m->'referidos')
    from pg_catalog.jsonb_array_elements(p_datos->'metas') m;

  insert into public.contests (id, nombre, desde, hasta, premio_tipo, premio, requisitos,
    combinacion, alcance_tipo, alcance_linea, alcance_ids, estatus, ganadores, multimedia,
    creado, actualizado)
  select c->>'id', pg_catalog.btrim(c->>'nombre'), privado.fecha(c->>'desde'), privado.fecha(c->>'hasta'),
         coalesce(nullif(c->>'premioTipo', ''), 'otro'), coalesce(c->>'premio', ''),
         privado.lista(c->'requisitos'), coalesce(nullif(c->>'combinacion', ''), 'todos'),
         coalesce(nullif(c->>'alcanceTipo', ''), 'todos'), coalesce(c->>'alcanceLinea', ''),
         privado.lista(c->'alcanceIds'), coalesce(nullif(c->>'estatus', ''), 'auto'),
         privado.lista(c->'ganadores'), privado.lista(c->'multimedia'),
         coalesce(nullif(c->>'creado', '')::timestamp at time zone 'America/Denver', pg_catalog.now()),
         coalesce(nullif(c->>'actualizado', '')::timestamp at time zone 'America/Denver', pg_catalog.now())
    from pg_catalog.jsonb_array_elements(p_datos->'contests') c;

  -- Un solo uso.
  delete from privado.config where clave = 'tokenImportacion';

  return privado.bien(pg_catalog.jsonb_build_object(
    'agentes',   (select count(*) from public.agentes),
    'registros', (select count(*) from public.registros),
    'metas',     (select count(*) from public.metas),
    'contests',  (select count(*) from public.contests)));
exception when others then
  return privado.mal(sqlerrm);
end $$;

revoke all on function public.importar_datos(jsonb, text) from public;
grant execute on function public.importar_datos(jsonb, text) to anon;
