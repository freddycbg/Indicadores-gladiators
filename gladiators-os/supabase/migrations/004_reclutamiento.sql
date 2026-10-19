-- ═══════════════════════════════════════════════════════════════════════
-- 004 · Reclutamiento
--
-- D-01: las siete etapas reales. "Examen reprobado" NO es una etapa del
-- embudo: es el otro desenlace del nivel 4. Por eso el nivel se guarda
-- aparte del estatus — si se dedujera del orden del enum, el embudo
-- dejaría de cuadrar.
-- ═══════════════════════════════════════════════════════════════════════

create type etapa_recluta as enum (
  'Pendiente por llamar',
  'Agendado para Webinar',
  'Agendado para entrevista',
  'En proceso de estudio',
  'Agendado para el examen',
  'Examen aprobado',
  'Examen reprobado'
);

create type urgencia_contacto as enum (
  'Llamar de inmediato', 'Normal', 'Esperar unos días'
);

-- Nivel de embudo por etapa. Aprobado = 5; reprobado comparte el 4 con
-- "Agendado para el examen", porque quien reprueba SÍ llegó a presentarlo.
create or replace function etapa_nivel(e etapa_recluta)
returns int language sql immutable parallel safe as $$
  select case e
    when 'Pendiente por llamar'     then 0
    when 'Agendado para Webinar'    then 1
    when 'Agendado para entrevista' then 2
    when 'En proceso de estudio'    then 3
    when 'Agendado para el examen'  then 4
    when 'Examen aprobado'          then 5
    when 'Examen reprobado'         then 4
  end;
$$;

create or replace function etapa_es_terminal(e etapa_recluta)
returns boolean language sql immutable parallel safe as $$
  select e in ('Examen aprobado', 'Examen reprobado');
$$;

create table recruits (
  id          uuid primary key default gen_random_uuid(),
  first_name  text not null check (length(trim(first_name)) > 0),
  last_name   text not null check (length(trim(last_name))  > 0),
  phone       text not null check (phone ~ '^[0-9]{7,15}$'),
  email       text,
  us_state    text,                       -- determina el licenciamiento
  urgency     urgencia_contacto not null default 'Normal',
  referred_by uuid not null references profiles(id) on delete restrict,
  stage       etapa_recluta not null default 'Pendiente por llamar',
  comment     text,
  is_active   boolean not null default true,
  closed_reason text,
  referred_on date not null default current_date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint recruits_cierre_motivado check (
    is_active or length(coalesce(trim(closed_reason), '')) > 0
  )
);

-- La deduplicación por teléfono que ya hace el sistema actual, pero en la
-- base de datos: el navegador puede saltarse una comprobación, un índice no.
create unique index recruits_telefono_unico on recruits (phone) where is_active;
create index recruits_etapa_idx    on recruits (stage) where is_active;
create index recruits_referente_idx on recruits (referred_by) where is_active;
create index recruits_urgencia_idx on recruits (urgency, referred_on)
  where is_active and stage = 'Pendiente por llamar';

create trigger recruits_tocar before update on recruits
  for each row execute function tocar_updated_at();

-- ── Historial de etapa ─────────────────────────────────────────────────
-- Una tabla, no tres columnas: el sistema actual solo guarda el ÚLTIMO
-- cambio, y el brief pide guardar usuario, fecha y etapa anterior de cada
-- uno. Se escribe sola por trigger para que no se pueda omitir.
create table recruit_stage_log (
  id         uuid primary key default gen_random_uuid(),
  recruit_id uuid not null references recruits(id) on delete cascade,
  from_stage etapa_recluta,
  to_stage   etapa_recluta not null,
  changed_by uuid references profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  note       text
);
create index recruit_stage_log_recluta_idx on recruit_stage_log (recruit_id, changed_at desc);

create or replace function registrar_cambio_etapa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into recruit_stage_log (recruit_id, from_stage, to_stage, changed_by)
    values (new.id, null, new.stage, auth.uid());
  elsif new.stage is distinct from old.stage then
    insert into recruit_stage_log (recruit_id, from_stage, to_stage, changed_by)
    values (new.id, old.stage, new.stage, auth.uid());
  end if;
  return new;
end;
$$;

create trigger recruits_log_etapa
  after insert or update of stage on recruits
  for each row execute function registrar_cambio_etapa();

-- ── Actividad sobre el candidato ───────────────────────────────────────
create table recruit_activities (
  id         uuid primary key default gen_random_uuid(),
  recruit_id uuid not null references recruits(id) on delete cascade,
  author_id  uuid references profiles(id) on delete set null,
  note       text not null check (length(trim(note)) > 0),
  created_at timestamptz not null default now()
);
create index recruit_activities_recluta_idx on recruit_activities (recruit_id, created_at desc);
