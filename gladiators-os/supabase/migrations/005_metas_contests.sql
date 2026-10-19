-- ═══════════════════════════════════════════════════════════════════════
-- 005 · Metas y contests
--
-- La meta base es una fila con week_start nulo, igual que en el sistema
-- actual: un patrón que ya funciona y no necesita tabla aparte. Una fila
-- con fecha la sobreescribe para esa semana.
--
-- Los contests son más complejos de lo que el brief asume: tienen
-- requisitos individuales, de equipo y de "certificación" (cuántas
-- personas llegan a un umbral cada una).
-- ═══════════════════════════════════════════════════════════════════════

create type metrica_meta as enum ('alp', 'app', 'referidos');

create table goals (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  week_start date,                         -- lunes; null = meta base
  metric     metrica_meta not null,
  target     numeric(12,2) not null check (target > 0),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint goals_semana_es_lunes check (
    week_start is null or extract(isodow from week_start) = 1
  )
);

-- Una meta por persona, métrica y semana. El índice parcial cubre la meta
-- base, donde week_start es nulo y un UNIQUE normal no agruparía.
create unique index goals_una_por_semana
  on goals (profile_id, metric, week_start) where week_start is not null;
create unique index goals_una_base
  on goals (profile_id, metric) where week_start is null;

create type ambito_contest   as enum ('todos', 'linea', 'seleccion');
create type estatus_contest  as enum ('auto', 'pagado', 'anulado', 'cancelado');
create type ambito_requisito as enum ('individual', 'equipo', 'conteo');
create type tipo_premio      as enum ('efectivo', 'viaje', 'experiencia', 'otro');

create table contests (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  starts_on  date not null,
  ends_on    date not null,
  prize_type tipo_premio not null default 'otro',
  prize      text,
  scope_type ambito_contest not null default 'todos',
  scope_root uuid references profiles(id) on delete set null,  -- si scope_type = 'linea'
  status     estatus_contest not null default 'auto',
  combine    text not null default 'todos' check (combine in ('todos','alguno')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint contests_rango_valido check (ends_on >= starts_on),
  constraint contests_linea_tiene_raiz check (scope_type <> 'linea' or scope_root is not null)
);

create table contest_rules (
  id          uuid primary key default gen_random_uuid(),
  contest_id  uuid not null references contests(id) on delete cascade,
  metric      text not null,            -- cualquiera de los once indicadores
  scope       ambito_requisito not null default 'individual',
  threshold   numeric(12,2) not null check (threshold > 0),
  min_people  integer check (min_people > 0),
  constraint contest_rules_conteo_tiene_minimo check (
    (scope = 'conteo') = (min_people is not null)
  )
);

create table contest_participants (
  contest_id uuid not null references contests(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  primary key (contest_id, profile_id)
);
