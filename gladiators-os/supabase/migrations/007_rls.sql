-- ═══════════════════════════════════════════════════════════════════════
-- 007 · Row Level Security
--
-- "No basta con esconder botones del menú." Aquí es donde se decide quién
-- ve qué. Todo lo que sigue se prueba al revés: las pruebas de
-- tests/permisos intentan leer datos ajenos y PASAN cuando la base las
-- bloquea.
--
-- Regla transversal: un perfil inactivo no lee ni escribe nada. D-06 hace
-- que todo usuario nazca inactivo, así que esto es la puerta de entrada.
-- ═══════════════════════════════════════════════════════════════════════

alter table profiles            enable row level security;
alter table hierarchy           enable row level security;
alter table teams               enable row level security;
alter table team_memberships    enable row level security;
alter table daily_reports       enable row level security;
alter table recruits            enable row level security;
alter table recruit_stage_log   enable row level security;
alter table recruit_activities  enable row level security;
alter table goals               enable row level security;
alter table contests            enable row level security;
alter table contest_rules       enable row level security;
alter table contest_participants enable row level security;
alter table audit_logs          enable row level security;

-- Nadie habla con las tablas por encima de RLS.
alter table profiles            force row level security;
alter table daily_reports       force row level security;
alter table recruits            force row level security;
alter table audit_logs          force row level security;

-- ── profiles ───────────────────────────────────────────────────────────
-- Te ves a ti, ves tu alcance, y un administrador ve a todos. Un usuario
-- inactivo solo se ve a sí mismo, para que pueda entrar y leer que está
-- pendiente de activación.
create policy profiles_leer on profiles for select to authenticated
  using (
    id = auth.uid()
    or (privado.estoy_activo() and (privado.soy_admin() or privado.puede_ver(auth.uid(), id)))
  );

-- D-06: el administrador asigna los roles. Un usuario puede corregir su
-- nombre y nada más — el WITH CHECK impide que se suba el rango o se haga
-- administrador a sí mismo.
create policy profiles_editar_lo_mio on profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role      = (select p.role      from profiles p where p.id = auth.uid())
    and is_admin  = (select p.is_admin  from profiles p where p.id = auth.uid())
    and is_active = (select p.is_active from profiles p where p.id = auth.uid())
  );

create policy profiles_admin on profiles for all to authenticated
  using (privado.soy_admin()) with check (privado.soy_admin());

-- ── hierarchy · teams · memberships ────────────────────────────────────
-- Legible para quien esté activo (el organigrama es la navegación del
-- producto). Solo un administrador lo cambia.
create policy hierarchy_leer on hierarchy for select to authenticated
  using (privado.estoy_activo());
create policy hierarchy_admin on hierarchy for all to authenticated
  using (privado.soy_admin()) with check (privado.soy_admin());

create policy teams_leer on teams for select to authenticated
  using (privado.estoy_activo());
create policy teams_admin on teams for all to authenticated
  using (privado.soy_admin()) with check (privado.soy_admin());

create policy memberships_leer on team_memberships for select to authenticated
  using (privado.estoy_activo());
create policy memberships_admin on team_memberships for all to authenticated
  using (privado.soy_admin()) with check (privado.soy_admin());

-- ── daily_reports ──────────────────────────────────────────────────────
create policy reportes_leer on daily_reports for select to authenticated
  using (privado.estoy_activo() and privado.puede_ver(auth.uid(), profile_id));

-- Solo registras lo tuyo, y nace en borrador o pendiente.
create policy reportes_crear on daily_reports for insert to authenticated
  with check (
    privado.estoy_activo()
    and profile_id = auth.uid()
    and status in ('borrador', 'pendiente')
  );

-- Editas lo tuyo mientras no esté aprobado; revisas lo de tu alcance.
-- Qué transición concreta es legal lo decide el trigger de 003.
create policy reportes_editar on daily_reports for update to authenticated
  using (
    privado.estoy_activo() and (
      (profile_id = auth.uid() and status <> 'aprobado')
      or privado.soy_admin()
      or (profile_id <> auth.uid()
          and exists (select 1 from privado.alcance(auth.uid()) a where a.profile_id = daily_reports.profile_id))
    )
  )
  with check (privado.estoy_activo());

-- Borrar un registro aprobado destruye historia. Solo borradores propios.
create policy reportes_borrar on daily_reports for delete to authenticated
  using (privado.estoy_activo() and profile_id = auth.uid() and status = 'borrador');

-- ── recruits ───────────────────────────────────────────────────────────
create policy reclutas_leer on recruits for select to authenticated
  using (privado.estoy_activo() and privado.puede_ver(auth.uid(), referred_by));

create policy reclutas_crear on recruits for insert to authenticated
  with check (
    privado.estoy_activo()
    and privado.puede_ver(auth.uid(), referred_by)
    and stage = 'Pendiente por llamar'      -- todo candidato nace aquí
  );

create policy reclutas_editar on recruits for update to authenticated
  using (privado.estoy_activo() and privado.puede_ver(auth.uid(), referred_by))
  with check (privado.estoy_activo() and privado.puede_ver(auth.uid(), referred_by));

-- El brief lo prohíbe: no se borran candidatos con historial. Se cierran.
-- Sin policy de DELETE, nadie borra. No es un olvido.

create policy stage_log_leer on recruit_stage_log for select to authenticated
  using (
    privado.estoy_activo()
    and exists (
      select 1 from recruits r
       where r.id = recruit_stage_log.recruit_id
         and privado.puede_ver(auth.uid(), r.referred_by)
    )
  );
-- El historial lo escribe el trigger (SECURITY DEFINER). Nadie a mano.

create policy actividades_leer on recruit_activities for select to authenticated
  using (
    privado.estoy_activo()
    and exists (
      select 1 from recruits r
       where r.id = recruit_activities.recruit_id
         and privado.puede_ver(auth.uid(), r.referred_by)
    )
  );
create policy actividades_crear on recruit_activities for insert to authenticated
  with check (
    privado.estoy_activo()
    and author_id = auth.uid()
    and exists (
      select 1 from recruits r
       where r.id = recruit_activities.recruit_id
         and privado.puede_ver(auth.uid(), r.referred_by)
    )
  );

-- ── goals ──────────────────────────────────────────────────────────────
create policy metas_leer on goals for select to authenticated
  using (privado.estoy_activo() and privado.puede_ver(auth.uid(), profile_id));
create policy metas_admin on goals for all to authenticated
  using (privado.soy_admin()) with check (privado.soy_admin());

-- ── contests ───────────────────────────────────────────────────────────
-- Un contest se ve si eres participante, o si cae en tu alcance.
create policy contests_leer on contests for select to authenticated
  using (
    privado.estoy_activo() and (
      privado.soy_admin()
      or scope_type = 'todos'
      or exists (select 1 from contest_participants cp
                  where cp.contest_id = contests.id and cp.profile_id = auth.uid())
      or (scope_type = 'linea' and scope_root is not null
          and exists (select 1 from privado.alcance(scope_root) a where a.profile_id = auth.uid()))
    )
  );
create policy contests_admin on contests for all to authenticated
  using (privado.soy_admin()) with check (privado.soy_admin());

create policy reglas_leer on contest_rules for select to authenticated
  using (exists (select 1 from contests c where c.id = contest_rules.contest_id));
create policy reglas_admin on contest_rules for all to authenticated
  using (privado.soy_admin()) with check (privado.soy_admin());

create policy participantes_leer on contest_participants for select to authenticated
  using (exists (select 1 from contests c where c.id = contest_participants.contest_id));
create policy participantes_admin on contest_participants for all to authenticated
  using (privado.soy_admin()) with check (privado.soy_admin());

-- ── audit_logs ─────────────────────────────────────────────────────────
-- Solo lectura, y solo para administradores. No hay policy de INSERT,
-- UPDATE ni DELETE: las filas las escribe el trigger auditar(), que es
-- SECURITY DEFINER y por tanto pasa por encima de RLS. Ningún usuario,
-- ni un administrador, puede alterar o borrar una línea de auditoría.
create policy auditoria_leer on audit_logs for select to authenticated
  using (privado.soy_admin());

-- Y por si alguien tuviera GRANT directo, se lo quitamos.
revoke insert, update, delete on audit_logs from authenticated, anon;
