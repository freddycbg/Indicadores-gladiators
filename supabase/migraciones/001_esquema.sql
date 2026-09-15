-- =========================================================================
-- 001_esquema.sql — Seguimiento Diario · Gladiator's Team en Supabase
--
-- Reemplaza al Apps Script. Mismas reglas, misma forma de los datos que ve
-- la pagina (claves en camelCase), mismo sobre de respuesta {ok, data} o
-- {ok, error}: asi la pagina cambia de transporte y no de logica.
--
-- SEGURIDAD
--   * Las tablas tienen RLS activado y NINGUNA politica: la clave publica
--     de la pagina no puede leer ni escribir tablas directamente.
--   * Todo pasa por funciones SECURITY DEFINER del esquema public, que son
--     las unicas que la clave publica puede ejecutar.
--   * Lo interno (PIN, intentos fallidos, ayudas) vive en el esquema
--     "privado", que la API no expone.
--   * El PIN se valida aqui, en el servidor. Tras 10 intentos fallidos
--     desde una misma direccion en 15 minutos se bloquea esa direccion:
--     con Google la lentitud impedia de hecho adivinar un PIN de 4 digitos
--     a fuerza de intentos; con respuestas en milisegundos ya no.
-- =========================================================================

create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

-- -------------------------------------------------------------------------
-- Ayudas internas
-- -------------------------------------------------------------------------

/* La zona horaria del negocio: la misma que tenia la hoja. Decide que dia
   es "hoy" para la ventana de correccion. */
create or replace function privado.hoy_local() returns date
language sql stable set search_path = '' as $$
  select (pg_catalog.now() at time zone 'America/Denver')::date
$$;

/* Marcas de tiempo con el mismo formato que devolvia el Apps Script. */
create or replace function privado.texto_hora(t timestamptz) returns text
language sql stable set search_path = '' as $$
  select coalesce(pg_catalog.to_char(t at time zone 'America/Denver', 'YYYY-MM-DD"T"HH24:MI:SS'), '')
$$;

create or replace function privado.texto_fecha(d date) returns text
language sql immutable set search_path = '' as $$
  select coalesce(pg_catalog.to_char(d, 'YYYY-MM-DD'), '')
$$;

create or replace function privado.nuevo_id() returns text
language sql volatile set search_path = '' as $$
  select 'r' || pg_catalog.substr(pg_catalog.md5(pg_catalog.random()::text || pg_catalog.clock_timestamp()::text), 1, 16)
$$;

/* Number(x) || 0 de JavaScript: lo que no es un numero vale cero. */
create or replace function privado.num(v jsonb) returns numeric
language plpgsql immutable set search_path = '' as $$
begin
  if v is null then return 0; end if;
  case pg_catalog.jsonb_typeof(v)
    when 'number'  then return (v #>> '{}')::numeric;
    when 'boolean' then return case when v = 'true'::jsonb then 1 else 0 end;
    when 'string'  then
      begin
        return coalesce(nullif(pg_catalog.btrim(v #>> '{}'), '')::numeric, 0);
      exception when others then
        return 0;
      end;
    else return 0;
  end case;
end $$;

/* "YYYY-MM-DD..." a fecha; cualquier otra cosa, null. */
create or replace function privado.fecha(v text) returns date
language plpgsql immutable set search_path = '' as $$
begin
  if v is null or pg_catalog.btrim(v) = '' then return null; end if;
  return pg_catalog.substr(pg_catalog.btrim(v), 1, 10)::date;
exception when others then
  return null;
end $$;

/* Lista JSON; lo que no sea una lista se guarda como lista vacia. */
create or replace function privado.lista(v jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when pg_catalog.jsonb_typeof(v) = 'array' then v else '[]'::jsonb end
$$;

create or replace function privado.bien(datos jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select pg_catalog.jsonb_build_object('ok', true, 'data', datos)
$$;

create or replace function privado.mal(mensaje text) returns jsonb
language sql immutable set search_path = '' as $$
  select pg_catalog.jsonb_build_object('ok', false, 'error', mensaje)
$$;

/* Jerarquia: el "reporta a" debe tener siempre rango mayor.
   Debe coincidir con ROLES en assets/js/config.js. */
create or replace function privado.rango(rol text) returns int
language sql immutable set search_path = '' as $$
  select case rol when 'Agente' then 0 when 'SA' then 1 when 'GA' then 2
                  when 'MGA' then 3 when 'RGA' then 4 else -1 end
$$;

-- -------------------------------------------------------------------------
-- Tablas
-- -------------------------------------------------------------------------

create table if not exists public.agentes (
  id         text primary key,
  nombre     text not null,
  equipo     text not null default '',
  rol        text not null default 'Agente'
             check (rol in ('Agente', 'SA', 'GA', 'MGA', 'RGA')),
  reporta_a  text not null default '',
  activo     boolean not null default true,
  creado     date not null default privado.hoy_local()
);
create unique index if not exists agentes_nombre_unico on public.agentes (lower(nombre));

/* Sin llave foranea hacia agentes a proposito: al eliminar un agente sus
   registros se conservan para las estadisticas, con el nombre guardado. */
create table if not exists public.registros (
  id                    text primary key,
  fecha                 date not null,
  agente_id             text not null,
  agente_nombre         text not null default '',
  app                   numeric not null default 0,
  press                 numeric not null default 0,
  press_sale            numeric not null default 0,
  press_no_sale         numeric not null default 0,
  caller_calls          numeric not null default 0,
  no_show               numeric not null default 0,
  no_califica           numeric not null default 0,
  reschedule            numeric not null default 0,
  cita_cedida           numeric not null default 0,
  referidos             numeric not null default 0,
  alp                   numeric not null default 0,
  sin_actividad         boolean not null default false,
  motivo_sin_actividad  text not null default '',
  creado                timestamptz not null default now(),
  actualizado           timestamptz not null default now(),
  -- Un agente tiene un solo registro por dia.
  unique (fecha, agente_id)
);
create index if not exists registros_por_fecha on public.registros (fecha desc, creado);

create table if not exists public.metas (
  id             text primary key,
  semana         date not null,          -- lunes de la semana
  agente_id      text not null,
  agente_nombre  text not null default '',
  alp            numeric not null default 0,
  app            numeric not null default 0,
  referidos      numeric not null default 0,
  actualizado    timestamptz not null default now(),
  unique (semana, agente_id)
);

create table if not exists public.contests (
  id             text primary key,
  nombre         text not null,
  desde          date,
  hasta          date,
  premio_tipo    text not null default 'otro',
  premio         text not null default '',
  requisitos     jsonb not null default '[]',
  combinacion    text not null default 'todos',
  alcance_tipo   text not null default 'todos',
  alcance_linea  text not null default '',
  alcance_ids    jsonb not null default '[]',
  estatus        text not null default 'auto',
  ganadores      jsonb not null default '[]',
  multimedia     jsonb not null default '[]',
  creado         timestamptz not null default now(),
  actualizado    timestamptz not null default now(),
  check (desde is null or hasta is null or desde <= hasta)
);

create table if not exists privado.config (
  clave  text primary key,
  valor  text not null
);

create table if not exists privado.intentos_pin (
  id       bigserial primary key,
  ip       text not null,
  momento  timestamptz not null default now()
);
create index if not exists intentos_pin_por_ip on privado.intentos_pin (ip, momento);

-- RLS activo y sin politicas: acceso directo denegado para la clave publica.
alter table public.agentes       enable row level security;
alter table public.registros     enable row level security;
alter table public.metas         enable row level security;
alter table public.contests      enable row level security;
alter table privado.config       enable row level security;
alter table privado.intentos_pin enable row level security;

revoke all on public.agentes, public.registros, public.metas, public.contests
  from anon, authenticated;

-- -------------------------------------------------------------------------
-- PIN de administrador
-- -------------------------------------------------------------------------

create or replace function privado.ip_cliente() returns text
language plpgsql stable set search_path = '' as $$
declare
  v text;
begin
  v := pg_catalog.current_setting('request.headers', true)::json ->> 'x-forwarded-for';
  return coalesce(nullif(pg_catalog.btrim(pg_catalog.split_part(v, ',', 1)), ''), 'desconocida');
exception when others then
  return 'desconocida';
end $$;

/*
 * Valida el PIN y anota el fallo.
 *
 * Quien la llame NO debe lanzar una excepcion despues de un fallo, o el
 * intento anotado se desharia junto con la transaccion y el bloqueo nunca
 * llegaria. Por eso las funciones de la API devuelven {ok:false} en vez de
 * lanzar errores.
 */
create or replace function privado.pin_valido(p_pin text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ip     text := privado.ip_cliente();
  v_fallos int;
  v_pin    text;
begin
  if p_pin is null or pg_catalog.btrim(p_pin) = '' then
    return false;
  end if;

  select count(*) into v_fallos
    from privado.intentos_pin
   where ip = v_ip and momento > now() - interval '15 minutes';

  if v_fallos >= 10 then
    raise exception 'Demasiados intentos con PIN incorrecto. Espera 15 minutos.';
  end if;

  select valor into v_pin from privado.config where clave = 'adminPin';
  if v_pin is not null and pg_catalog.btrim(v_pin) = pg_catalog.btrim(p_pin) then
    return true;
  end if;

  insert into privado.intentos_pin (ip) values (v_ip);
  delete from privado.intentos_pin where momento < now() - interval '1 day';
  return false;
end $$;

-- -------------------------------------------------------------------------
-- Forma de los datos que ve la pagina
-- -------------------------------------------------------------------------

create or replace function privado.json_agente(a public.agentes) returns jsonb
language sql stable set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'id', a.id, 'nombre', a.nombre, 'equipo', a.equipo, 'rol', a.rol,
    'reportaA', a.reporta_a, 'activo', a.activo,
    'creado', privado.texto_fecha(a.creado))
$$;

create or replace function privado.json_registro(r public.registros) returns jsonb
language sql stable set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'id', r.id, 'fecha', privado.texto_fecha(r.fecha),
    'agenteId', r.agente_id, 'agenteNombre', r.agente_nombre,
    'app', r.app, 'press', r.press, 'pressSale', r.press_sale,
    'pressNoSale', r.press_no_sale, 'callerCalls', r.caller_calls,
    'noShow', r.no_show, 'noCalifica', r.no_califica,
    'reschedule', r.reschedule, 'citaCedida', r.cita_cedida,
    'referidos', r.referidos, 'alp', r.alp,
    'sinActividad', r.sin_actividad,
    'motivoSinActividad', case when r.sin_actividad then r.motivo_sin_actividad else '' end)
$$;

create or replace function privado.json_meta(m public.metas) returns jsonb
language sql stable set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'id', m.id, 'semana', privado.texto_fecha(m.semana),
    'agenteId', m.agente_id, 'agenteNombre', m.agente_nombre,
    'alp', m.alp, 'app', m.app, 'referidos', m.referidos)
$$;

create or replace function privado.json_contest(c public.contests) returns jsonb
language sql stable set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'id', c.id, 'nombre', c.nombre,
    'desde', privado.texto_fecha(c.desde), 'hasta', privado.texto_fecha(c.hasta),
    'premioTipo', c.premio_tipo, 'premio', c.premio,
    'requisitos', c.requisitos, 'combinacion', c.combinacion,
    'alcanceTipo', c.alcance_tipo, 'alcanceLinea', c.alcance_linea,
    'alcanceIds', c.alcance_ids, 'estatus', c.estatus,
    'ganadores', c.ganadores, 'multimedia', c.multimedia,
    'creado', privado.texto_hora(c.creado), 'actualizado', privado.texto_hora(c.actualizado))
$$;

-- =========================================================================
-- API — las unicas funciones que la pagina puede ejecutar
-- =========================================================================

/* Todo lo que la pagina lee, en una sola consulta. */
create or replace function public.carga_inicial() returns jsonb
language sql stable security definer set search_path = '' as $$
  select privado.bien(pg_catalog.jsonb_build_object(
    'version', 'supabase-1',
    'agentes', coalesce((select pg_catalog.jsonb_agg(privado.json_agente(a) order by a.nombre)
                           from public.agentes a), '[]'::jsonb),
    'registros', coalesce((select pg_catalog.jsonb_agg(privado.json_registro(r) order by r.fecha desc, r.creado)
                             from public.registros r), '[]'::jsonb),
    'metas', coalesce((select pg_catalog.jsonb_agg(privado.json_meta(m) order by m.semana, m.agente_nombre)
                         from public.metas m), '[]'::jsonb),
    'contests', coalesce((select pg_catalog.jsonb_agg(privado.json_contest(c) order by c.creado)
                            from public.contests c), '[]'::jsonb)
  ))
$$;

create or replace function public.validar_admin(p_pin text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  return privado.bien(pg_catalog.to_jsonb(privado.pin_valido(p_pin)));
exception when others then
  return privado.mal(sqlerrm);
end $$;

create or replace function public.diagnostico() returns jsonb
language sql stable security definer set search_path = '' as $$
  select privado.bien(pg_catalog.jsonb_build_object(
    'version', 'supabase-1',
    'motor', 'supabase',
    'filas', (select count(*) from public.registros),
    'agentes', (select count(*) from public.agentes),
    'pinConfigurado', exists (select 1 from privado.config where clave = 'adminPin'),
    'zonaHoraria', 'America/Denver',
    'hoy', privado.texto_fecha(privado.hoy_local())
  ))
$$;

-- -------------------------------------------------------------------------
-- Registros
-- -------------------------------------------------------------------------

create or replace function public.guardar_registro(p_registro jsonb, p_pin text default '')
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_fecha   date := privado.fecha(p_registro ->> 'fecha');
  v_agente  text := coalesce(p_registro ->> 'agenteId', '');
  -- coalesce: un registro normal no manda la clave, y la comparacion daria
  -- NULL en vez de false (corregido en produccion por 002).
  v_sin     boolean := coalesce((p_registro -> 'sinActividad') = 'true'::jsonb, false);
  v_fila    public.registros;
  v_reemplazo boolean;
begin
  if v_fecha is null then return privado.mal('La fecha es obligatoria.'); end if;
  if v_agente = '' then return privado.mal('El agente es obligatorio.'); end if;

  -- Ventana de correccion: dentro, cualquiera; fuera, solo el administrador.
  if privado.hoy_local() - v_fecha > 7 and not privado.pin_valido(p_pin) then
    return privado.mal('El reporte del ' || privado.texto_fecha(v_fecha) ||
      ' ya está cerrado (más de 7 día(s)). Solo un administrador puede modificarlo.');
  end if;

  v_reemplazo := exists (
    select 1 from public.registros where fecha = v_fecha and agente_id = v_agente);

  -- Un dia sin actividad guarda ceros a proposito: la marca es lo que
  -- distingue esos ceros de un dia trabajado sin resultados.
  insert into public.registros (
    id, fecha, agente_id, agente_nombre,
    app, press, press_sale, press_no_sale, caller_calls, no_show,
    no_califica, reschedule, cita_cedida, referidos, alp,
    sin_actividad, motivo_sin_actividad)
  values (
    privado.nuevo_id(), v_fecha, v_agente, coalesce(p_registro ->> 'agenteNombre', ''),
    case when v_sin then 0 else privado.num(p_registro -> 'app') end,
    case when v_sin then 0 else privado.num(p_registro -> 'press') end,
    case when v_sin then 0 else privado.num(p_registro -> 'pressSale') end,
    case when v_sin then 0 else privado.num(p_registro -> 'pressNoSale') end,
    case when v_sin then 0 else privado.num(p_registro -> 'callerCalls') end,
    case when v_sin then 0 else privado.num(p_registro -> 'noShow') end,
    case when v_sin then 0 else privado.num(p_registro -> 'noCalifica') end,
    case when v_sin then 0 else privado.num(p_registro -> 'reschedule') end,
    case when v_sin then 0 else privado.num(p_registro -> 'citaCedida') end,
    case when v_sin then 0 else privado.num(p_registro -> 'referidos') end,
    case when v_sin then 0 else privado.num(p_registro -> 'alp') end,
    v_sin,
    case when v_sin then coalesce(p_registro ->> 'motivoSinActividad', '') else '' end)
  on conflict (fecha, agente_id) do update set
    agente_nombre = excluded.agente_nombre,
    app = excluded.app, press = excluded.press, press_sale = excluded.press_sale,
    press_no_sale = excluded.press_no_sale, caller_calls = excluded.caller_calls,
    no_show = excluded.no_show, no_califica = excluded.no_califica,
    reschedule = excluded.reschedule, cita_cedida = excluded.cita_cedida,
    referidos = excluded.referidos, alp = excluded.alp,
    sin_actividad = excluded.sin_actividad,
    motivo_sin_actividad = excluded.motivo_sin_actividad,
    actualizado = now()
  returning * into v_fila;

  return privado.bien(pg_catalog.jsonb_build_object(
    'registro', privado.json_registro(v_fila),
    'reemplazado', v_reemplazo));
exception when others then
  return privado.mal(sqlerrm);
end $$;

create or replace function public.eliminar_registro(p_id text, p_pin text default '')
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_fecha date;
begin
  select fecha into v_fecha from public.registros where id = p_id;
  if not found then return privado.mal('El registro ya no existe.'); end if;

  if privado.hoy_local() - v_fecha > 7 and not privado.pin_valido(p_pin) then
    return privado.mal('El reporte del ' || privado.texto_fecha(v_fecha) ||
      ' ya está cerrado (más de 7 día(s)). Solo un administrador puede modificarlo.');
  end if;

  delete from public.registros where id = p_id;
  return privado.bien('true'::jsonb);
exception when others then
  return privado.mal(sqlerrm);
end $$;

-- -------------------------------------------------------------------------
-- Agentes (solo administrador)
-- -------------------------------------------------------------------------

/* null si la relacion "reporta a" es valida; si no, el mensaje de error. */
create or replace function privado.error_jerarquia(p_id text, p_superior text, p_rol text)
returns text
language plpgsql stable set search_path = '' as $$
declare
  v_sup     public.agentes;
  v_actual  text;
  v_vistos  text[] := array[p_id];
  v_guarda  int := 0;
begin
  if coalesce(p_superior, '') = '' then return null; end if;
  if p_superior = p_id then return 'Un agente no puede reportarse a si mismo.'; end if;

  select * into v_sup from public.agentes where id = p_superior;
  if not found then return 'El superior seleccionado no existe.'; end if;

  if privado.rango(v_sup.rol) <= privado.rango(p_rol) then
    return v_sup.nombre || ' es ' || v_sup.rol || ' y no puede ser superior de un ' || p_rol || '.';
  end if;

  -- Subir por la cadena de mando: volver al propio agente es un ciclo.
  v_actual := p_superior;
  while v_actual is not null and v_actual <> '' and v_guarda < 50 loop
    if v_actual = any(v_vistos) then
      return 'Esa asignacion crea un ciclo en la jerarquia.';
    end if;
    v_vistos := v_vistos || v_actual;
    select nullif(reporta_a, '') into v_actual from public.agentes where id = v_actual;
    if not found then v_actual := null; end if;
    v_guarda := v_guarda + 1;
  end loop;
  return null;
end $$;

create or replace function public.crear_agente(p_agente jsonb, p_pin text default '')
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_nombre text := pg_catalog.btrim(coalesce(p_agente ->> 'nombre', ''));
  v_rol    text := coalesce(nullif(p_agente ->> 'rol', ''), 'Agente');
  v_sup    text := coalesce(p_agente ->> 'reportaA', '');
  v_id     text := privado.nuevo_id();
  v_error  text;
  v_fila   public.agentes;
begin
  if not privado.pin_valido(p_pin) then
    return privado.mal('No autorizado: se requiere PIN de administrador.');
  end if;
  if v_nombre = '' then return privado.mal('El nombre del agente es obligatorio.'); end if;
  if privado.rango(v_rol) < 0 then return privado.mal('Rol no válido: ' || v_rol); end if;
  if exists (select 1 from public.agentes where lower(nombre) = lower(v_nombre)) then
    return privado.mal('Ya existe un agente con ese nombre.');
  end if;

  v_error := privado.error_jerarquia(v_id, v_sup, v_rol);
  if v_error is not null then return privado.mal(v_error); end if;

  insert into public.agentes (id, nombre, equipo, rol, reporta_a, activo)
  values (v_id, v_nombre, pg_catalog.btrim(coalesce(p_agente ->> 'equipo', '')), v_rol, v_sup,
          (p_agente -> 'activo') is distinct from 'false'::jsonb)
  returning * into v_fila;

  return privado.bien(privado.json_agente(v_fila));
exception when others then
  return privado.mal(sqlerrm);
end $$;

create or replace function public.actualizar_agente(p_id text, p_cambios jsonb, p_pin text default '')
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actual  public.agentes;
  v_nombre  text;
  v_equipo  text;
  v_rol     text;
  v_sup     text;
  v_activo  boolean;
  v_error   text;
  v_mal     text;
  v_fila    public.agentes;
begin
  if not privado.pin_valido(p_pin) then
    return privado.mal('No autorizado: se requiere PIN de administrador.');
  end if;

  select * into v_actual from public.agentes where id = p_id;
  if not found then return privado.mal('Agente no encontrado.'); end if;

  v_nombre := case when p_cambios ? 'nombre' then pg_catalog.btrim(coalesce(p_cambios ->> 'nombre', '')) else v_actual.nombre end;
  v_equipo := case when p_cambios ? 'equipo' then pg_catalog.btrim(coalesce(p_cambios ->> 'equipo', '')) else v_actual.equipo end;
  v_rol    := case when p_cambios ? 'rol' then coalesce(nullif(p_cambios ->> 'rol', ''), 'Agente') else v_actual.rol end;
  v_sup    := case when p_cambios ? 'reportaA' then coalesce(p_cambios ->> 'reportaA', '') else v_actual.reporta_a end;
  v_activo := case when p_cambios ? 'activo' then (p_cambios -> 'activo') = 'true'::jsonb else v_actual.activo end;

  if v_nombre = '' then return privado.mal('El nombre del agente es obligatorio.'); end if;
  if privado.rango(v_rol) < 0 then return privado.mal('Rol no válido: ' || v_rol); end if;
  if exists (select 1 from public.agentes where id <> p_id and lower(nombre) = lower(v_nombre)) then
    return privado.mal('Ya existe otro agente con ese nombre.');
  end if;

  v_error := privado.error_jerarquia(p_id, v_sup, v_rol);
  if v_error is not null then return privado.mal(v_error); end if;

  -- Al bajar de rango, quienes le reportan quedarian mal colgados.
  select pg_catalog.string_agg(nombre, ', ' order by nombre) into v_mal
    from public.agentes
   where reporta_a = p_id and id <> p_id and privado.rango(rol) >= privado.rango(v_rol);
  if v_mal is not null then
    return privado.mal('No se puede cambiar el rol a ' || v_rol || ': ' || v_mal ||
      ' le reporta(n) con nivel igual o mayor. Reasignalos primero.');
  end if;

  update public.agentes
     set nombre = v_nombre, equipo = v_equipo, rol = v_rol, reporta_a = v_sup, activo = v_activo
   where id = p_id
  returning * into v_fila;

  -- Mantener sincronizado el nombre guardado en los registros.
  if v_nombre <> v_actual.nombre then
    update public.registros set agente_nombre = v_nombre where agente_id = p_id;
  end if;

  return privado.bien(privado.json_agente(v_fila));
exception when others then
  return privado.mal(sqlerrm);
end $$;

create or replace function public.eliminar_agente(p_id text, p_borrar_registros boolean default false, p_pin text default '')
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_saliente public.agentes;
begin
  if not privado.pin_valido(p_pin) then
    return privado.mal('No autorizado: se requiere PIN de administrador.');
  end if;

  select * into v_saliente from public.agentes where id = p_id;
  if found then
    -- Quienes le reportaban pasan a su superior, para no quedar sueltos.
    update public.agentes set reporta_a = v_saliente.reporta_a where reporta_a = p_id;
    delete from public.agentes where id = p_id;
  end if;

  if p_borrar_registros then
    delete from public.registros where agente_id = p_id;
  end if;
  return privado.bien('true'::jsonb);
exception when others then
  return privado.mal(sqlerrm);
end $$;

-- -------------------------------------------------------------------------
-- Metas (solo administrador)
-- -------------------------------------------------------------------------

/* La tabla se edita completa y se manda junta. Una meta con los tres
   valores en cero se elimina. */
create or replace function public.guardar_metas(p_metas jsonb, p_pin text default '')
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  e          jsonb;
  v_semana   date;
  v_agente   text;
  v_guardadas int := 0;
  v_borradas  int := 0;
  v_n         int;
begin
  if not privado.pin_valido(p_pin) then
    return privado.mal('No autorizado: se requiere PIN de administrador.');
  end if;
  if pg_catalog.jsonb_typeof(p_metas) <> 'array' then
    return privado.bien(pg_catalog.jsonb_build_object('guardadas', 0, 'borradas', 0));
  end if;

  for e in select * from pg_catalog.jsonb_array_elements(p_metas) loop
    v_semana := privado.fecha(e ->> 'semana');
    v_agente := coalesce(e ->> 'agenteId', '');
    continue when v_semana is null or v_agente = '';

    if privado.num(e -> 'alp') <= 0 and privado.num(e -> 'app') <= 0
       and privado.num(e -> 'referidos') <= 0 then
      delete from public.metas where semana = v_semana and agente_id = v_agente;
      get diagnostics v_n = row_count;
      v_borradas := v_borradas + v_n;
      continue;
    end if;

    insert into public.metas (id, semana, agente_id, agente_nombre, alp, app, referidos)
    values (privado.nuevo_id(), v_semana, v_agente, coalesce(e ->> 'agenteNombre', ''),
            privado.num(e -> 'alp'), privado.num(e -> 'app'), privado.num(e -> 'referidos'))
    on conflict (semana, agente_id) do update set
      agente_nombre = excluded.agente_nombre, alp = excluded.alp,
      app = excluded.app, referidos = excluded.referidos, actualizado = now();
    v_guardadas := v_guardadas + 1;
  end loop;

  return privado.bien(pg_catalog.jsonb_build_object('guardadas', v_guardadas, 'borradas', v_borradas));
exception when others then
  return privado.mal(sqlerrm);
end $$;

-- -------------------------------------------------------------------------
-- Contests (solo administrador)
-- -------------------------------------------------------------------------

create or replace function public.guardar_contest(p_contest jsonb, p_pin text default '')
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_nombre text := pg_catalog.btrim(coalesce(p_contest ->> 'nombre', ''));
  v_desde  date := privado.fecha(p_contest ->> 'desde');
  v_hasta  date := privado.fecha(p_contest ->> 'hasta');
  v_id     text := coalesce(nullif(p_contest ->> 'id', ''), '');
begin
  if not privado.pin_valido(p_pin) then
    return privado.mal('No autorizado: se requiere PIN de administrador.');
  end if;
  if v_nombre = '' then return privado.mal('El nombre del contest es obligatorio.'); end if;
  if v_desde is not null and v_hasta is not null and v_desde > v_hasta then
    return privado.mal('La fecha de inicio no puede ser posterior a la de fin.');
  end if;

  if v_id = '' or not exists (select 1 from public.contests where id = v_id) then
    v_id := privado.nuevo_id();
  end if;

  -- La lista de imagenes SI se guarda. El Apps Script la perdia: nunca
  -- escribia esa columna, y ningun contest llego a tener imagenes.
  insert into public.contests (
    id, nombre, desde, hasta, premio_tipo, premio, requisitos, combinacion,
    alcance_tipo, alcance_linea, alcance_ids, estatus, ganadores, multimedia)
  values (
    v_id, v_nombre, v_desde, v_hasta,
    coalesce(nullif(p_contest ->> 'premioTipo', ''), 'otro'),
    coalesce(p_contest ->> 'premio', ''),
    privado.lista(p_contest -> 'requisitos'),
    coalesce(nullif(p_contest ->> 'combinacion', ''), 'todos'),
    coalesce(nullif(p_contest ->> 'alcanceTipo', ''), 'todos'),
    coalesce(p_contest ->> 'alcanceLinea', ''),
    privado.lista(p_contest -> 'alcanceIds'),
    coalesce(nullif(p_contest ->> 'estatus', ''), 'auto'),
    privado.lista(p_contest -> 'ganadores'),
    privado.lista(p_contest -> 'multimedia'))
  on conflict (id) do update set
    nombre = excluded.nombre, desde = excluded.desde, hasta = excluded.hasta,
    premio_tipo = excluded.premio_tipo, premio = excluded.premio,
    requisitos = excluded.requisitos, combinacion = excluded.combinacion,
    alcance_tipo = excluded.alcance_tipo, alcance_linea = excluded.alcance_linea,
    alcance_ids = excluded.alcance_ids, estatus = excluded.estatus,
    ganadores = excluded.ganadores, multimedia = excluded.multimedia,
    actualizado = now();

  return privado.bien('true'::jsonb);
exception when others then
  return privado.mal(sqlerrm);
end $$;

create or replace function public.eliminar_contest(p_id text, p_pin text default '')
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not privado.pin_valido(p_pin) then
    return privado.mal('No autorizado: se requiere PIN de administrador.');
  end if;
  delete from public.contests where id = p_id;
  if not found then return privado.mal('El contest ya no existe.'); end if;
  return privado.bien('true'::jsonb);
exception when others then
  return privado.mal(sqlerrm);
end $$;

-- -------------------------------------------------------------------------
-- Permisos de ejecucion
-- -------------------------------------------------------------------------

-- Lo interno no se ejecuta desde fuera, aunque el esquema llegara a exponerse.
revoke all on all functions in schema privado from public, anon, authenticated;

revoke all on function
  public.carga_inicial(), public.validar_admin(text), public.diagnostico(),
  public.guardar_registro(jsonb, text), public.eliminar_registro(text, text),
  public.crear_agente(jsonb, text), public.actualizar_agente(text, jsonb, text),
  public.eliminar_agente(text, boolean, text), public.guardar_metas(jsonb, text),
  public.guardar_contest(jsonb, text), public.eliminar_contest(text, text)
from public;

grant execute on function
  public.carga_inicial(), public.validar_admin(text), public.diagnostico(),
  public.guardar_registro(jsonb, text), public.eliminar_registro(text, text),
  public.crear_agente(jsonb, text), public.actualizar_agente(text, jsonb, text),
  public.eliminar_agente(text, boolean, text), public.guardar_metas(jsonb, text),
  public.guardar_contest(jsonb, text), public.eliminar_contest(text, text)
to anon, authenticated;
