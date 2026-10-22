-- NWG Coaches Hub — Permissions retcon, phase P5: drop the legacy role model
--
-- P3 (0026) moved every database permission onto job-title capabilities and
-- P4 (0027 + app) moved the app. Nothing reads profiles.role, is_admin() or
-- can_edit_rota() any more. This file removes them and finishes the anon
-- hardening that 0023 and 0025 started. The design was approved in P5 Phase A.
--
-- What this file does, in order:
--   1. Refuses to run if any policy or function still depends on is_admin(),
--      can_edit_rota() or profiles.role, naming the offender.
--   2. Recreates the profiles_guard_privileged_columns trigger and its
--      function to cover job_title, site and active only. The trigger's WHEN
--      clause referenced old.role / new.role, which makes the column
--      undroppable (or, with CASCADE, silently drops the trigger). It must go
--      before the column does.
--   3. Drops can_edit_rota(), then is_admin().
--   4. Drops the role check constraint, the role default, then profiles.role.
--   5. Revokes anon's (and PUBLIC's) table grants on the 26 tables that still
--      have them.
--   6. Stops Supabase's default privileges granting new public tables,
--      sequences and functions to anon.
--
-- No statement uses CASCADE. Every drop is RESTRICT (stated, though it is the
-- default) and none uses IF EXISTS, so if the live database differs from what
-- Paste A showed, the file fails and rolls back rather than half-applying.
--
-- Verification: docs/investigations/permissions-p5-verification.sql. Run
-- Paste A before this file and Paste B after it.
--
-- Wrapped in an explicit transaction for the reasons 0026 gives. Altering
-- profiles takes an ACCESS EXCLUSIVE lock until COMMIT; every policy reads
-- profiles through the capability helpers, so requests wait for the moment
-- this file takes rather than seeing a half-applied state. No down migration,
-- matching every migration so far.

begin;

-- ---------------------------------------------------------------------------
-- 1. Guard
-- ---------------------------------------------------------------------------
--
-- pg_depend catches every dependent Postgres records: policies, views, BEGIN
-- ATOMIC function bodies, defaults, constraints, triggers. Plain SQL and
-- plpgsql function bodies are not recorded, so those are matched by regex on
-- prosrc. \m and \M are word boundaries: 'service_role' and
-- 'manage_club_roles' do not match '\mrole\M'.
--
-- Excluded from the role-in-body check: is_admin() (dropped in step 3) and
-- profiles_guard_privileged_columns() (replaced in step 2). Functions that
-- belong to an extension are skipped throughout.
--
-- The guard is deliberately not loosened for comments. A function whose body
-- mentions the word "role" only in a comment still aborts this file; report it
-- rather than working around it.

do $$
declare
  v_list text;
begin
  -- 1a. Anything Postgres records as depending on the two legacy functions.
  select string_agg(pg_describe_object(d.classid, d.objid, d.objsubid), ', ')
    into v_list
  from pg_catalog.pg_depend d
  where d.refclassid = 'pg_catalog.pg_proc'::regclass
    and d.refobjid in ('public.is_admin()'::regprocedure,
                       'public.can_edit_rota()'::regprocedure);

  if v_list is not null then
    raise exception
      'P5 aborted: objects still depend on is_admin()/can_edit_rota(): %. Nothing has been applied.',
      v_list;
  end if;

  -- 1b. Policies whose expression calls either function.
  select string_agg(tablename || '.' || policyname, ', ')
    into v_list
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
        ~ '(is_admin|can_edit_rota)\s*\(';

  if v_list is not null then
    raise exception
      'P5 aborted: policies still call is_admin()/can_edit_rota(): %. Nothing has been applied.',
      v_list;
  end if;

  -- 1c. Function bodies that call either function.
  select string_agg(p.proname, ', ')
    into v_list
  from pg_catalog.pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname not in ('is_admin', 'can_edit_rota')
    and p.prosrc ~ '\m(is_admin|can_edit_rota)\s*\('
    and not exists (
      select 1 from pg_catalog.pg_depend e
      where e.classid = 'pg_catalog.pg_proc'::regclass
        and e.objid = p.oid
        and e.deptype = 'e'
    );

  if v_list is not null then
    raise exception
      'P5 aborted: functions still call is_admin()/can_edit_rota(): %. Nothing has been applied.',
      v_list;
  end if;

  -- 1d. Anything Postgres records as depending on profiles.role, other than
  --     the three objects this file handles: the column default, the
  --     single-column check constraint and the guard trigger.
  select string_agg(pg_describe_object(d.classid, d.objid, d.objsubid), ', ')
    into v_list
  from pg_catalog.pg_depend d
  join pg_catalog.pg_attribute a
    on a.attrelid = 'public.profiles'::regclass
   and a.attname = 'role'
   and a.attnum = d.refobjsubid
  where d.refclassid = 'pg_catalog.pg_class'::regclass
    and d.refobjid = 'public.profiles'::regclass
    and d.classid <> 'pg_catalog.pg_attrdef'::regclass
    and not (
      d.classid = 'pg_catalog.pg_constraint'::regclass
      and exists (
        select 1 from pg_catalog.pg_constraint c
        where c.oid = d.objid
          and c.contype = 'c'
          and c.conkey = array[a.attnum]
      )
    )
    and not (
      d.classid = 'pg_catalog.pg_trigger'::regclass
      and exists (
        select 1 from pg_catalog.pg_trigger t
        where t.oid = d.objid
          and t.tgrelid = 'public.profiles'::regclass
          and t.tgname = 'profiles_guard_privileged_columns'
      )
    );

  if v_list is not null then
    raise exception
      'P5 aborted: objects still depend on profiles.role: %. Nothing has been applied.',
      v_list;
  end if;

  -- 1e. Function bodies that mention role.
  select string_agg(p.proname, ', ')
    into v_list
  from pg_catalog.pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname not in ('is_admin', 'profiles_guard_privileged_columns')
    and p.prosrc ~ '\mrole\M'
    and not exists (
      select 1 from pg_catalog.pg_depend e
      where e.classid = 'pg_catalog.pg_proc'::regclass
        and e.objid = p.oid
        and e.deptype = 'e'
    );

  if v_list is not null then
    raise exception
      'P5 aborted: function bodies still mention role: %. Nothing has been applied.',
      v_list;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. profiles self-edit guard, without role
-- ---------------------------------------------------------------------------
--
-- Same rules as 0026, minus role: nobody may change their own job_title, site
-- or active, and only an active manage_users holder may change anyone
-- else's. The bypass list, SECURITY INVOKER and search_path = '' are
-- unchanged, for the reasons 0026 gives. The errcode stays 42501: the Users
-- page (components/UsersTable.tsx) keys on the code, not the message text.
--
-- `create or replace` keeps the function's existing grants; the revokes are
-- restated so the grant state is declared here. The trigger is dropped and
-- recreated because its WHEN clause is what depends on profiles.role. Both
-- happen inside this transaction, so no update can slip through unguarded.

create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  if old.id = auth.uid() then
    raise exception 'You cannot change your own job title, site or active status'
      using errcode = '42501';
  end if;

  if not public.has_capability('manage_users') then
    raise exception 'Only an active user with manage_users can change job title, site or active status'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.profiles_guard_privileged_columns() from public;
revoke execute on function public.profiles_guard_privileged_columns() from anon;

drop trigger profiles_guard_privileged_columns on public.profiles;

create trigger profiles_guard_privileged_columns
before update on public.profiles
for each row
when (
  (old.job_title, old.site, old.active)
  is distinct from (new.job_title, new.site, new.active)
)
execute function public.profiles_guard_privileged_columns();

-- ---------------------------------------------------------------------------
-- 3. Legacy functions
-- ---------------------------------------------------------------------------
--
-- can_edit_rota() has been a shim with no callers since 0026. is_admin() has
-- had no caller since 0026. RESTRICT makes either drop fail if a policy or
-- other recorded dependent still uses it.

drop function public.can_edit_rota() restrict;
drop function public.is_admin() restrict;

-- ---------------------------------------------------------------------------
-- 4. profiles.role
-- ---------------------------------------------------------------------------
--
-- 0001 declared the role check inline, so Postgres generated its name. As in
-- 0026, the loop drops every check constraint whose column set is exactly
-- {role} rather than relying on the name. DROP COLUMN would remove the
-- constraint and default by itself; they are dropped explicitly so each step
-- is visible. RESTRICT on the column then fails on anything step 1 missed.

do $$
declare
  v_con record;
begin
  for v_con in
    select c.conname
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute a
      on a.attrelid = c.conrelid and a.attname = 'role'
    where c.conrelid = 'public.profiles'::regclass
      and c.contype = 'c'
      and c.conkey = array[a.attnum]
  loop
    execute format('alter table public.profiles drop constraint %I', v_con.conname);
  end loop;
end
$$;

alter table public.profiles alter column role drop default;

alter table public.profiles drop column role restrict;

-- ---------------------------------------------------------------------------
-- 5. Anon table grants
-- ---------------------------------------------------------------------------
--
-- The table-level form of the 0010–0014 rule, as applied in 0023 and 0025.
-- Every policy is `to authenticated`, so anon already reads nothing. Revoking
-- the grant means an anon request is refused with 42501 before RLS is
-- consulted, so a future policy written without a `to` clause (which defaults
-- to PUBLIC, and so includes anon) cannot silently open a table.
--
-- Nothing in the app reads a table while signed out: the login page, proxy.ts
-- and /auth/signout only call Supabase Auth.
--
-- The revoke from PUBLIC is a no-op today and is stated for the reason 0023
-- gives. authenticated and service_role are untouched.

revoke all on table public.profiles from public;
revoke all on table public.profiles from anon;

revoke all on table public.rota_sites from public;
revoke all on table public.rota_sites from anon;
revoke all on table public.rota_categories from public;
revoke all on table public.rota_categories from anon;
revoke all on table public.rota_class_catalogue from public;
revoke all on table public.rota_class_catalogue from anon;
revoke all on table public.rota_coaches from public;
revoke all on table public.rota_coaches from anon;
revoke all on table public.rota_standard_roster from public;
revoke all on table public.rota_standard_roster from anon;
revoke all on table public.rota_standard_classes from public;
revoke all on table public.rota_standard_classes from anon;
revoke all on table public.rota_weekly_rotas from public;
revoke all on table public.rota_weekly_rotas from anon;
revoke all on table public.rota_weekly_roster from public;
revoke all on table public.rota_weekly_roster from anon;
revoke all on table public.rota_weekly_classes from public;
revoke all on table public.rota_weekly_classes from anon;
revoke all on table public.rota_restructures from public;
revoke all on table public.rota_restructures from anon;
revoke all on table public.rota_restructure_roster from public;
revoke all on table public.rota_restructure_roster from anon;
revoke all on table public.rota_restructure_classes from public;
revoke all on table public.rota_restructure_classes from anon;

revoke all on table public.club_role_categories from public;
revoke all on table public.club_role_categories from anon;
revoke all on table public.club_roles from public;
revoke all on table public.club_roles from anon;
revoke all on table public.club_role_assignments from public;
revoke all on table public.club_role_assignments from anon;
revoke all on table public.heroes from public;
revoke all on table public.heroes from anon;
revoke all on table public.hero_hours from public;
revoke all on table public.hero_hours from anon;
revoke all on table public.club_updates from public;
revoke all on table public.club_updates from anon;
revoke all on table public.club_meetings from public;
revoke all on table public.club_meetings from anon;
revoke all on table public.club_meeting_attendees from public;
revoke all on table public.club_meeting_attendees from anon;
revoke all on table public.club_meeting_cycle_weeks from public;
revoke all on table public.club_meeting_cycle_weeks from anon;

revoke all on table public.mantras from public;
revoke all on table public.mantras from anon;
revoke all on table public.cycle_weeks from public;
revoke all on table public.cycle_weeks from anon;
revoke all on table public.programme_gymnastics_weeks from public;
revoke all on table public.programme_gymnastics_weeks from anon;
revoke all on table public.programme_preschool_weeks from public;
revoke all on table public.programme_preschool_weeks from anon;

-- ---------------------------------------------------------------------------
-- 6. Default privileges: new public objects are not granted to anon
-- ---------------------------------------------------------------------------
--
-- Supabase ships `alter default privileges in schema public grant all on
-- tables / sequences / functions to anon, authenticated, service_role`. That
-- is why 0010, 0011, 0012, 0023, 0025 and this file each had to revoke anon
-- after the fact. From here on, objects created in public by postgres (the
-- SQL Editor's role, which is how every migration here is applied) start with
-- no anon grant.
--
-- Limits:
--   * Only objects created by postgres. Supabase's own supabase_admin
--     defaults cannot be changed from the SQL Editor.
--   * Postgres's built-in EXECUTE-to-PUBLIC on new functions is a global
--     default, not a schema one, and is left alone. New functions still need
--     `revoke execute ... from public` (and, for consistency, from anon) and an
--     explicit grant to authenticated, as 0012 settled.
--   * A future feature that genuinely needs anon access must grant it
--     explicitly. That is the intended fail-closed behaviour.

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;

commit;
