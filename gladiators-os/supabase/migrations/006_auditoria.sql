-- ═══════════════════════════════════════════════════════════════════════
-- 006 · Auditoría
--
-- El brief exige que la auditoría no se pueda alterar desde la interfaz
-- ordinaria. Aquí eso es literal: la tabla no admite UPDATE ni DELETE para
-- nadie, ni para un administrador. Solo se inserta.
-- ═══════════════════════════════════════════════════════════════════════

create table audit_logs (
  id         bigint generated always as identity primary key,
  actor_id   uuid references profiles(id) on delete set null,
  action     text not null,              -- insert | update | delete
  table_name text not null,
  record_id  text not null,
  before     jsonb,
  after      jsonb,
  reason     text,
  created_at timestamptz not null default now()
);

create index audit_logs_tabla_idx  on audit_logs (table_name, created_at desc);
create index audit_logs_actor_idx  on audit_logs (actor_id, created_at desc);
create index audit_logs_registro_idx on audit_logs (table_name, record_id);

create or replace function auditar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  id_registro text;
begin
  id_registro := coalesce(
    (to_jsonb(new) ->> 'id'),
    (to_jsonb(old) ->> 'id')
  );

  insert into audit_logs (actor_id, action, table_name, record_id, before, after)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    id_registro,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );

  return coalesce(new, old);
end;
$$;

create trigger auditar_profiles       after insert or update or delete on profiles
  for each row execute function auditar();
create trigger auditar_hierarchy      after insert or update or delete on hierarchy
  for each row execute function auditar();
create trigger auditar_daily_reports  after insert or update or delete on daily_reports
  for each row execute function auditar();
create trigger auditar_recruits       after insert or update or delete on recruits
  for each row execute function auditar();
create trigger auditar_goals          after insert or update or delete on goals
  for each row execute function auditar();
create trigger auditar_contests       after insert or update or delete on contests
  for each row execute function auditar();
