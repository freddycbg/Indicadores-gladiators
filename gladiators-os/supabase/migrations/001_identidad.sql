-- ═══════════════════════════════════════════════════════════════════════
-- 001 · Identidad y jerarquía
--
-- D-03: cinco rangos. El alcance sale del organigrama, no de una lista de
-- permisos. D-06: la contraseña vive en auth.users y el administrador es
-- quien asigna el rol.
-- ═══════════════════════════════════════════════════════════════════════

create type rango as enum ('Agente', 'SA', 'GA', 'MGA', 'RGA');

-- Orden numérico del rango, para comparaciones. Agente = 0, RGA = 4.
create or replace function rango_nivel(r rango)
returns int language sql immutable parallel safe as $$
  select array_position(enum_range(null::rango), r) - 1;
$$;

-- ── Perfiles ───────────────────────────────────────────────────────────
-- Una fila por usuario de auth.users. Nace INACTIVO: un administrador debe
-- activarlo y darle su lugar en el organigrama antes de que sirva de nada.
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null check (length(trim(full_name)) > 0),
  email       text not null,
  role        rango not null default 'Agente',
  is_admin    boolean not null default false,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index profiles_role_idx   on profiles (role) where is_active;
create index profiles_active_idx on profiles (is_active);

-- ── Jerarquía, versionada ──────────────────────────────────────────────
-- Versionada a propósito: mover a alguien de equipo NO debe reescribir
-- retroactivamente quién veía qué. La fila vigente es la que tiene
-- valid_to nulo.
create table hierarchy (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  reports_to  uuid references profiles(id) on delete restrict,
  valid_from  date not null default current_date,
  valid_to    date,
  created_at  timestamptz not null default now(),
  constraint hierarchy_no_self check (profile_id <> reports_to),
  constraint hierarchy_rango_valido check (valid_to is null or valid_to > valid_from)
);

-- Una sola línea vigente por persona.
create unique index hierarchy_vigente_unica
  on hierarchy (profile_id) where valid_to is null;
create index hierarchy_jefe_idx on hierarchy (reports_to) where valid_to is null;

-- ── Equipos ────────────────────────────────────────────────────────────
create table teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(trim(name)) > 0),
  leader_id  uuid references profiles(id) on delete set null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table team_memberships (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references teams(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  valid_from date not null default current_date,
  valid_to   date,
  constraint membership_rango_valido check (valid_to is null or valid_to > valid_from)
);

create unique index membership_vigente_unica
  on team_memberships (profile_id) where valid_to is null;

-- ── Alta automática al registrarse ─────────────────────────────────────
-- D-06: el usuario se crea con correo y contraseña por Supabase Auth; el
-- perfil nace aquí, inactivo. El rol NO se toma de los metadatos del
-- registro: si se tomara, cualquiera podría declararse RGA al registrarse.
create or replace function manejar_usuario_nuevo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role, is_admin, is_active)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    new.email,
    'Agente',   -- siempre; el administrador lo cambia después
    false,      -- nunca administrador por registro
    false       -- inactivo hasta que un administrador lo active
  );
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function manejar_usuario_nuevo();

-- ── updated_at ─────────────────────────────────────────────────────────
create or replace function tocar_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_tocar before update on profiles
  for each row execute function tocar_updated_at();
