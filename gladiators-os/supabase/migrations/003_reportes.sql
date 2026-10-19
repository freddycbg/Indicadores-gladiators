-- ═══════════════════════════════════════════════════════════════════════
-- 003 · Reporte diario
--
-- D-02: los once indicadores conservan sus nombres. No hay campo "ventas".
-- El flujo de aprobación (borrador → pendiente → aprobado / requiere
-- corrección) es nuevo: el sistema actual no tiene estado de registro.
-- ═══════════════════════════════════════════════════════════════════════

create type estado_reporte as enum (
  'borrador', 'pendiente', 'aprobado', 'requiere_correccion'
);

create table daily_reports (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete restrict,
  work_date   date not null,
  status      estado_reporte not null default 'borrador',

  -- Los once indicadores. Nombres fijados por D-02.
  app           integer not null default 0 check (app           >= 0),
  press         integer not null default 0 check (press         >= 0),
  press_sale    integer not null default 0 check (press_sale    >= 0),
  press_no_sale integer not null default 0 check (press_no_sale >= 0),
  caller_calls  integer not null default 0 check (caller_calls  >= 0),
  no_show       integer not null default 0 check (no_show       >= 0),
  no_califica   integer not null default 0 check (no_califica   >= 0),
  reschedule    integer not null default 0 check (reschedule    >= 0),
  cita_cedida   integer not null default 0 check (cita_cedida   >= 0),
  referidos     integer not null default 0 check (referidos     >= 0),
  alp           numeric(12,2) not null default 0 check (alp     >= 0),

  sin_actividad        boolean not null default false,
  motivo_sin_actividad text,
  comentario           text,

  submitted_at timestamptz,
  reviewed_by  uuid references profiles(id) on delete set null,
  reviewed_at  timestamptz,
  review_note  text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Integridad que pide el brief: un registro por agente y día.
  constraint daily_reports_un_dia unique (profile_id, work_date),

  -- No se puede reportar el futuro.
  constraint daily_reports_no_futuro check (work_date <= current_date),

  -- Un día sin actividad exige motivo y no admite cifras.
  constraint daily_reports_sin_actividad_coherente check (
    not sin_actividad or (
      length(coalesce(trim(motivo_sin_actividad), '')) > 0
      and app = 0 and press = 0 and press_sale = 0 and press_no_sale = 0
      and caller_calls = 0 and no_show = 0 and no_califica = 0
      and reschedule = 0 and cita_cedida = 0 and referidos = 0 and alp = 0
    )
  ),

  -- Las presentaciones que vendieron más las que no, no pueden pasar del
  -- total de presentaciones.
  constraint daily_reports_press_cuadra check (press_sale + press_no_sale <= press),

  -- Devolver un registro exige decir por qué.
  constraint daily_reports_correccion_motivada check (
    status <> 'requiere_correccion' or length(coalesce(trim(review_note), '')) > 0
  ),

  -- Un registro revisado tiene revisor y fecha.
  constraint daily_reports_revision_completa check (
    (status in ('borrador','pendiente')) = (reviewed_at is null)
  )
);

create index daily_reports_persona_fecha_idx on daily_reports (profile_id, work_date desc);
create index daily_reports_fecha_idx         on daily_reports (work_date desc);
create index daily_reports_pendientes_idx    on daily_reports (profile_id)
  where status = 'pendiente';
-- Los indicadores oficiales solo leen lo aprobado; este índice es su camino.
create index daily_reports_aprobados_idx on daily_reports (work_date, profile_id)
  where status = 'aprobado';

create trigger daily_reports_tocar before update on daily_reports
  for each row execute function tocar_updated_at();

-- ── Quién puede cambiar el estado, y a qué ─────────────────────────────
-- Las transiciones legales. Un agente no se aprueba a sí mismo y un
-- registro aprobado no se edita: vuelve a 'requiere_correccion' primero.
create or replace function validar_transicion_reporte()
returns trigger language plpgsql security definer set search_path = public, privado as $$
declare
  es_admin   boolean := privado.soy_admin();
  es_revisor boolean;
begin
  if new.status = old.status then
    -- Edición de cifras: solo mientras no esté aprobado.
    if old.status = 'aprobado' and not es_admin then
      raise exception 'Un registro aprobado no se edita. Pídele a tu líder que lo devuelva para corrección.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- ¿Quien revisa tiene a esta persona en su alcance, y no es ella misma?
  es_revisor := es_admin or (
    auth.uid() <> new.profile_id
    and exists (select 1 from privado.alcance(auth.uid()) a where a.profile_id = new.profile_id)
  );

  if old.status in ('borrador','requiere_correccion') and new.status = 'pendiente' then
    if auth.uid() <> new.profile_id and not es_admin then
      raise exception 'Solo el dueño del registro puede enviarlo a revisión.'
        using errcode = 'check_violation';
    end if;
    new.submitted_at := now();

  elsif old.status = 'pendiente' and new.status in ('aprobado','requiere_correccion') then
    if not es_revisor then
      raise exception 'No puedes revisar registros fuera de tu equipo, ni el tuyo propio.'
        using errcode = 'check_violation';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();

  elsif old.status = 'aprobado' and new.status = 'requiere_correccion' then
    if not es_revisor then
      raise exception 'No puedes devolver registros fuera de tu equipo.'
        using errcode = 'check_violation';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();

  else
    raise exception 'Cambio de estado no permitido: % → %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger daily_reports_transicion
  before update on daily_reports
  for each row execute function validar_transicion_reporte();
