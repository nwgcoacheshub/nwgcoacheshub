-- NWG Coaches Hub — Competitions phase 3a (0031): verification
--
-- Companion to supabase/migrations/0031_comp_calendar.sql. Written, not
-- executed.
--
-- ---------------------------------------------------------------------------
-- PASTE ORDER
-- ---------------------------------------------------------------------------
--
--   Paste A  -> run BEFORE 0031
--   apply    supabase/migrations/0031_comp_calendar.sql
--   Paste B  -> run AFTER 0031
--   curl     the anon REST checks, then the signed-in Coach checks, at the
--            end of this file
--
-- Paste each one into the Supabase SQL Editor on its own, as the editor's
-- default role (postgres). Each returns one result set:
--
--   check_name | expected | actual | pass
--
-- A good run shows pass = true on every check row. Rows whose check_name
-- starts with "info" have pass = null and are there to be read and kept.
--
-- Do not apply 0031 if Paste A has a failing row. 0031's guards repeat A1 and
-- A5 and would abort anyway.
--
-- The capability rows (A5 / B5) print, per capability, the titles that hold
-- it, in a fixed title order. Both pastes compare against the same expected
-- strings, so a B5 row that passes is identical to its A5 row. Keep Paste A's
-- output and compare by eye as well.
--
-- What each check means:
--
--   Paste A
--     A1   no comp_events / comp_event_sites table yet
--     A2   no other public table, view or sequence named comp_%
--     A3   no public function named comp_% or mentioning manage_comp_events
--     A4   no policy on a comp_% table
--     A5   the 9 capabilities resolve to the 0026 titles, and
--          manage_comp_events resolves to no title
--     A6   the objects 0031 depends on exist: rota_sites, profiles,
--          is_active_coach(), has_capability(), title_has_capability(),
--          my_capabilities()
--     info current EXECUTE grants on title_has_capability() and
--          my_capabilities() (B8 expects the same after)
--
--   Paste B
--     B1   both tables exist with RLS enabled
--     B2   policy counts: comp_events 4, comp_event_sites 3, 7 in total, and
--          no update (or for all) policy on comp_event_sites
--     B3   the 7 policy names and commands are exactly as written
--     B4   manage_comp_events: true for exactly RGM, HOG, HOO; false for
--          Coach, Lead Coach, Club Head Coach
--     B5   the 9 original capabilities resolve to the same titles as in A5
--     B6   my_capabilities() lists all 10 capability names
--     B7   check constraints reject a bad event_type and end_date < start_date
--          (and accept a valid control row). Every test insert is undone.
--     B8   anon holds no privilege on either table; authenticated holds
--          select/insert/update/delete on both
--     B9   function grants unchanged: anon and authenticated cannot execute
--          title_has_capability(); service_role can. anon cannot execute
--          my_capabilities(); authenticated can
--     B10  indexes and foreign keys as written
--     B11  no rows left behind by B7


-- ===========================================================================
-- PASTE A — before 0031
-- ===========================================================================

with
titles (ord, job_title) as (
  values (1, 'Coach'), (2, 'Lead Coach'), (3, 'Club Head Coach'),
         (4, 'Regional General Manager'), (5, 'Head of Gymnastics'), (6, 'Head of Operations')
),
caps (ord, cap, expected) as (
  values
    (1,  'view_all_sites',       'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (2,  'all_sites_scope',      'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (3,  'publish_whats_new',    'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (4,  'manage_policies',      'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (5,  'manage_users',         'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (6,  'edit_rota',            'Lead Coach, Club Head Coach, Regional General Manager, Head of Gymnastics, Head of Operations'),
    (7,  'manage_club_meetings', 'Lead Coach, Club Head Coach, Regional General Manager, Head of Gymnastics, Head of Operations'),
    (8,  'manage_club_updates',  'Lead Coach, Club Head Coach, Regional General Manager, Head of Gymnastics, Head of Operations'),
    (9,  'manage_club_roles',    'Club Head Coach, Regional General Manager, Head of Gymnastics, Head of Operations'),
    (10, 'manage_comp_events',   '(none)')
),
matrix as (
  select c.ord, c.cap, c.expected,
         coalesce(string_agg(t.job_title, ', ' order by t.ord)
                  filter (where public.title_has_capability(t.job_title, c.cap)), '(none)') as actual
  from caps c cross join titles t
  group by c.ord, c.cap, c.expected
),
fn as (
  select p.oid, p.proname::text as proname, p.prosrc
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
),
checks as (
  select 10 as ord, 0 as sub,
         'A1 comp_events / comp_event_sites tables' as check_name,
         '0' as expected,
         ((to_regclass('public.comp_events') is not null)::int
          + (to_regclass('public.comp_event_sites') is not null)::int)::text as actual,
         to_regclass('public.comp_events') is null
           and to_regclass('public.comp_event_sites') is null as pass
  union all
  select 20, 0, 'A2 public tables/views/sequences named comp_%', '0',
         count(*)::text || coalesce(': ' || string_agg(c.relname::text, ', ' order by c.relname), ''),
         count(*) = 0
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
    and c.relname like 'comp\_%'
  union all
  select 30, 0, 'A3 public functions named comp_% or mentioning manage_comp_events', '0',
         count(*)::text || coalesce(': ' || string_agg(proname, ', ' order by proname), ''),
         count(*) = 0
  from fn
  where proname like 'comp\_%' or prosrc like '%manage_comp_events%'
  union all
  select 40, 0, 'A4 policies on comp_% tables', '0',
         count(*)::text || coalesce(': ' || string_agg(tablename || '.' || policyname, ', '), ''),
         count(*) = 0
  from pg_policies
  where schemaname = 'public' and tablename like 'comp\_%'
  union all
  select 50, ord, 'A5 ' || cap, expected, actual, actual = expected
  from matrix
  union all
  select 60, 0, 'A6 dependencies present', 'all present',
         case when to_regclass('public.rota_sites') is not null
               and to_regclass('public.profiles') is not null
               and to_regprocedure('public.is_active_coach()') is not null
               and to_regprocedure('public.has_capability(text)') is not null
               and to_regprocedure('public.title_has_capability(text, text)') is not null
               and to_regprocedure('public.my_capabilities()') is not null
              then 'all present' else 'missing' end,
         to_regclass('public.rota_sites') is not null
           and to_regclass('public.profiles') is not null
           and to_regprocedure('public.is_active_coach()') is not null
           and to_regprocedure('public.has_capability(text)') is not null
           and to_regprocedure('public.title_has_capability(text, text)') is not null
           and to_regprocedure('public.my_capabilities()') is not null
  union all
  select 200, 0, 'info title_has_capability() EXECUTE: anon / authenticated / service_role', null,
         format('%s / %s / %s',
                has_function_privilege('anon', 'public.title_has_capability(text, text)', 'EXECUTE'),
                has_function_privilege('authenticated', 'public.title_has_capability(text, text)', 'EXECUTE'),
                has_function_privilege('service_role', 'public.title_has_capability(text, text)', 'EXECUTE')),
         null
  union all
  select 210, 0, 'info my_capabilities() EXECUTE: anon / authenticated', null,
         format('%s / %s',
                has_function_privilege('anon', 'public.my_capabilities()', 'EXECUTE'),
                has_function_privilege('authenticated', 'public.my_capabilities()', 'EXECUTE')),
         null
)
select check_name, expected, actual, pass
from checks
order by ord, sub;


-- ===========================================================================
-- PASTE B — after 0031
-- ===========================================================================
--
-- Paste B is two statements: a DO block that runs the B7 constraint tests,
-- then the result query. Paste both together.
--
-- B7: each test insert runs in its own sub-block. The insert is always undone:
-- a rejected row raises check_violation, and an accepted row is followed by a
-- deliberate raise, which rolls the sub-block back. The outcomes are stored in
-- session settings (comp31.*) for the result query to read. As postgres the
-- inserts bypass RLS, so only the constraints are tested. B11 confirms no row
-- was left behind.

do $$
declare
  v text;
begin
  -- Control: a valid row is accepted.
  begin
    insert into public.comp_events (title, event_type, start_date, end_date)
    values ('0031 verification test', 'Invitational Competition', date '2026-01-10', date '2026-01-11');
    raise exception using errcode = 'P0001', message = '0031-undo';
  exception
    when check_violation then v := 'rejected (' || sqlerrm || ')';
    when others then
      v := case when sqlerrm = '0031-undo' then 'accepted' else 'error: ' || sqlerrm end;
  end;
  perform set_config('comp31.control', v, false);

  -- Bad event_type.
  begin
    insert into public.comp_events (title, event_type, start_date, end_date)
    values ('0031 verification test', 'Friendly', date '2026-01-10', date '2026-01-11');
    raise exception using errcode = 'P0001', message = '0031-undo';
  exception
    when check_violation then
      get stacked diagnostics v = constraint_name;
      v := 'rejected by ' || v;
    when others then
      v := case when sqlerrm = '0031-undo' then 'accepted' else 'error: ' || sqlerrm end;
  end;
  perform set_config('comp31.bad_type', v, false);

  -- end_date before start_date.
  begin
    insert into public.comp_events (title, event_type, start_date, end_date)
    values ('0031 verification test', 'Invitational Competition', date '2026-01-11', date '2026-01-10');
    raise exception using errcode = 'P0001', message = '0031-undo';
  exception
    when check_violation then
      get stacked diagnostics v = constraint_name;
      v := 'rejected by ' || v;
    when others then
      v := case when sqlerrm = '0031-undo' then 'accepted' else 'error: ' || sqlerrm end;
  end;
  perform set_config('comp31.bad_dates', v, false);
end
$$;

with
titles (ord, job_title) as (
  values (1, 'Coach'), (2, 'Lead Coach'), (3, 'Club Head Coach'),
         (4, 'Regional General Manager'), (5, 'Head of Gymnastics'), (6, 'Head of Operations')
),
caps (ord, cap, expected) as (
  values
    (1,  'view_all_sites',       'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (2,  'all_sites_scope',      'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (3,  'publish_whats_new',    'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (4,  'manage_policies',      'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (5,  'manage_users',         'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (6,  'edit_rota',            'Lead Coach, Club Head Coach, Regional General Manager, Head of Gymnastics, Head of Operations'),
    (7,  'manage_club_meetings', 'Lead Coach, Club Head Coach, Regional General Manager, Head of Gymnastics, Head of Operations'),
    (8,  'manage_club_updates',  'Lead Coach, Club Head Coach, Regional General Manager, Head of Gymnastics, Head of Operations'),
    (9,  'manage_club_roles',    'Club Head Coach, Regional General Manager, Head of Gymnastics, Head of Operations')
),
matrix as (
  select c.ord, c.cap, c.expected,
         coalesce(string_agg(t.job_title, ', ' order by t.ord)
                  filter (where public.title_has_capability(t.job_title, c.cap)), '(none)') as actual
  from caps c cross join titles t
  group by c.ord, c.cap, c.expected
),
comp_rel as (
  select c.oid, c.relname::text as relname, c.relrowsecurity
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relname in ('comp_events', 'comp_event_sites')
    and c.relkind = 'r'
),
pol as (
  select tablename::text as tablename, policyname::text as policyname, cmd::text as cmd
  from pg_policies
  where schemaname = 'public' and tablename in ('comp_events', 'comp_event_sites')
),
expected_pol (tablename, policyname, cmd) as (
  values
    ('comp_events',      'comp_events_select_authenticated',                       'SELECT'),
    ('comp_events',      'comp_events_insert_external_or_manage_comp_events',      'INSERT'),
    ('comp_events',      'comp_events_update_manage_comp_events',                  'UPDATE'),
    ('comp_events',      'comp_events_delete_manage_comp_events',                  'DELETE'),
    ('comp_event_sites', 'comp_event_sites_select_authenticated',                  'SELECT'),
    ('comp_event_sites', 'comp_event_sites_insert_own_site_external_or_manage_comp_events', 'INSERT'),
    ('comp_event_sites', 'comp_event_sites_delete_own_site_external_or_manage_comp_events', 'DELETE')
),
pol_diff as (
  (select 'unexpected ' || policyname || ' ' || cmd as d from pol
   except select 'unexpected ' || policyname || ' ' || cmd from expected_pol)
  union all
  (select 'missing ' || policyname || ' ' || cmd from expected_pol
   except select 'missing ' || policyname || ' ' || cmd from pol)
),
idx (indexname) as (
  select indexname::text from pg_indexes
  where schemaname = 'public' and tablename in ('comp_events', 'comp_event_sites')
),
expected_idx (indexname) as (
  values ('comp_events_pkey'), ('comp_events_start_date_idx'),
         ('comp_events_title_start_date_idx'), ('comp_events_created_by_idx'),
         ('comp_event_sites_pkey'), ('comp_event_sites_site_id_idx')
),
fk as (
  select format('%s.%s -> %s on delete %s',
                c.conrelid::regclass::text,
                (select a.attname from pg_attribute a
                 where a.attrelid = c.conrelid and a.attnum = c.conkey[1]),
                c.confrelid::regclass::text,
                case c.confdeltype when 'a' then 'no action' when 'r' then 'restrict'
                                   when 'c' then 'cascade' when 'n' then 'set null'
                                   when 'd' then 'set default' end) as d
  from pg_constraint c
  where c.contype = 'f'
    and c.conrelid in ('public.comp_events'::regclass, 'public.comp_event_sites'::regclass)
),
checks as (
  select 10 as ord, 0 as sub,
         'B1 comp tables present with RLS enabled' as check_name,
         'comp_event_sites=t, comp_events=t' as expected,
         coalesce(string_agg(relname || '=' || case when relrowsecurity then 't' else 'f' end,
                             ', ' order by relname collate "C"), '(none)') as actual,
         count(*) = 2 and bool_and(relrowsecurity) as pass
  from comp_rel
  union all
  select 20, 1, 'B2 policies on comp_events', '4', count(*)::text, count(*) = 4
  from pol where tablename = 'comp_events'
  union all
  select 20, 2, 'B2 policies on comp_event_sites', '3', count(*)::text, count(*) = 3
  from pol where tablename = 'comp_event_sites'
  union all
  select 20, 3, 'B2 policies on comp tables in total', '7', count(*)::text, count(*) = 7
  from pol
  union all
  select 20, 4, 'B2 update / for all policies on comp_event_sites', '0',
         count(*)::text || coalesce(': ' || string_agg(policyname, ', '), ''),
         count(*) = 0
  from pol where tablename = 'comp_event_sites' and cmd in ('UPDATE', 'ALL')
  union all
  select 30, 0, 'B3 policy names and commands as written', '0 differences',
         count(*)::text || ' differences' || coalesce(': ' || string_agg(d, '; ' order by d), ''),
         count(*) = 0
  from pol_diff
  union all
  select 40, 1, 'B4 manage_comp_events holders', 'Regional General Manager, Head of Gymnastics, Head of Operations',
         coalesce(string_agg(t.job_title, ', ' order by t.ord)
                  filter (where public.title_has_capability(t.job_title, 'manage_comp_events')), '(none)'),
         coalesce(string_agg(t.job_title, ', ' order by t.ord)
                  filter (where public.title_has_capability(t.job_title, 'manage_comp_events')), '(none)')
           = 'Regional General Manager, Head of Gymnastics, Head of Operations'
  from titles t
  union all
  select 40, 2, 'B4 manage_comp_events for Coach / Lead Coach / Club Head Coach', 'f / f / f',
         format('%s / %s / %s',
                public.title_has_capability('Coach', 'manage_comp_events'),
                public.title_has_capability('Lead Coach', 'manage_comp_events'),
                public.title_has_capability('Club Head Coach', 'manage_comp_events')),
         not public.title_has_capability('Coach', 'manage_comp_events')
           and not public.title_has_capability('Lead Coach', 'manage_comp_events')
           and not public.title_has_capability('Club Head Coach', 'manage_comp_events')
  union all
  select 50, ord, 'B5 ' || cap || ' (compare with A5)', expected, actual, actual = expected
  from matrix
  union all
  select 60, 0, 'B6 my_capabilities() lists all 10 capability names', '10',
         count(*)::text || coalesce(' (missing: ' || string_agg(n.cap, ', ') filter (where p.prosrc not like '%''' || n.cap || '''%') || ')', ''),
         count(*) filter (where p.prosrc like '%''' || n.cap || '''%') = 10
  from pg_proc p
  cross join (values ('view_all_sites'), ('all_sites_scope'), ('publish_whats_new'),
                     ('manage_policies'), ('manage_users'), ('edit_rota'),
                     ('manage_club_meetings'), ('manage_club_updates'), ('manage_club_roles'),
                     ('manage_comp_events')) n (cap)
  where p.oid = 'public.my_capabilities()'::regprocedure
  union all
  select 70, 1, 'B7 control: valid event inserts', 'accepted',
         coalesce(current_setting('comp31.control', true), '(DO block not run)'),
         current_setting('comp31.control', true) = 'accepted'
  union all
  select 70, 2, 'B7 bad event_type rejected', 'rejected by comp_events_event_type_check',
         coalesce(current_setting('comp31.bad_type', true), '(DO block not run)'),
         current_setting('comp31.bad_type', true) = 'rejected by comp_events_event_type_check'
  union all
  select 70, 3, 'B7 end_date < start_date rejected', 'rejected by comp_events_dates_check',
         coalesce(current_setting('comp31.bad_dates', true), '(DO block not run)'),
         current_setting('comp31.bad_dates', true) = 'rejected by comp_events_dates_check'
  union all
  select 80, 1, 'B8 anon privileges on comp tables', '0',
         count(*)::text || coalesce(': ' || string_agg(relname, ', ' order by relname), ''),
         count(*) = 0
  from comp_rel
  where has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_any_column_privilege('anon', oid, 'SELECT,INSERT,UPDATE,REFERENCES')
  union all
  select 80, 2, 'B8 comp tables where authenticated lacks SELECT/INSERT/UPDATE/DELETE', '0',
         count(*)::text || coalesce(': ' || string_agg(relname, ', ' order by relname), ''),
         count(*) = 0
  from comp_rel
  where not (has_table_privilege('authenticated', oid, 'SELECT')
             and has_table_privilege('authenticated', oid, 'INSERT')
             and has_table_privilege('authenticated', oid, 'UPDATE')
             and has_table_privilege('authenticated', oid, 'DELETE'))
  union all
  select 90, 1, 'B9 title_has_capability() EXECUTE: anon / authenticated / service_role', 'false / false / true',
         format('%s / %s / %s',
                has_function_privilege('anon', 'public.title_has_capability(text, text)', 'EXECUTE'),
                has_function_privilege('authenticated', 'public.title_has_capability(text, text)', 'EXECUTE'),
                has_function_privilege('service_role', 'public.title_has_capability(text, text)', 'EXECUTE')),
         not has_function_privilege('anon', 'public.title_has_capability(text, text)', 'EXECUTE')
           and not has_function_privilege('authenticated', 'public.title_has_capability(text, text)', 'EXECUTE')
           and has_function_privilege('service_role', 'public.title_has_capability(text, text)', 'EXECUTE')
  union all
  select 90, 2, 'B9 my_capabilities() EXECUTE: anon / authenticated', 'false / true',
         format('%s / %s',
                has_function_privilege('anon', 'public.my_capabilities()', 'EXECUTE'),
                has_function_privilege('authenticated', 'public.my_capabilities()', 'EXECUTE')),
         not has_function_privilege('anon', 'public.my_capabilities()', 'EXECUTE')
           and has_function_privilege('authenticated', 'public.my_capabilities()', 'EXECUTE')
  union all
  select 100, 1, 'B10 indexes on comp tables', '6, none missing',
         (select count(*) from idx)::text
           || coalesce(' (missing: ' || string_agg(e.indexname, ', ') || ')', ', none missing'),
         (select count(*) from idx) = 6 and count(*) = 0
  from expected_idx e
  where e.indexname not in (select indexname from idx)
  union all
  select 100, 2, 'B10 foreign keys on comp tables',
         'comp_event_sites.event_id -> comp_events on delete cascade; comp_event_sites.site_id -> rota_sites on delete restrict; comp_events.created_by -> profiles on delete set null',
         coalesce(string_agg(d, '; ' order by d collate "C"), '(none)'),
         coalesce(string_agg(d, '; ' order by d collate "C"), '')
           = 'comp_event_sites.event_id -> comp_events on delete cascade; comp_event_sites.site_id -> rota_sites on delete restrict; comp_events.created_by -> profiles on delete set null'
  from fk
  union all
  select 110, 0, 'B11 test rows left behind by B7', '0', count(*)::text, count(*) = 0
  from public.comp_events where title = '0031 verification test'
)
select check_name, expected, actual, pass
from checks
order by ord, sub;


-- ===========================================================================
-- CURL CHECKS — anon REST, after Paste B
-- ===========================================================================
--
-- Same setup and rules as docs/investigations/permissions-p3-curl-checks.md.
-- Run in a terminal, not the SQL Editor. Every request uses only the
-- publishable (anon) key; no user is signed in, so each runs as anon.
-- **Every request must be refused.** With the new sb_publishable_ keys, send
-- only the apikey header, not also Authorization: Bearer.
--
--   export SB_URL="https://wwizreekicrjqwwptdmx.supabase.co"
--   export SB_KEY="<NEXT_PUBLIC publishable key from .env.local>"
--   export SITE_ID="<Burnley's rota_sites.id>"
--
--   select id from public.rota_sites where name = 'Burnley';
--
-- Both tables have anon's grants revoked (0031 step 6), like policies (0023)
-- and whats_new (0025).
--
-- For all eight requests:
--   Expected: 401, code 42501, "permission denied for table comp_events" (or
--             comp_event_sites).
--   Failure:  any 2xx, including 200 []. A 200 [] means anon has a grant and
--             only RLS is stopping it. A 23514 (check violation) or 23503
--             (foreign key) also fails: the request got past the privilege
--             check.
--
-- --- 1. comp_events --------------------------------------------------------
--
--   curl -s -i "$SB_URL/rest/v1/comp_events?select=id" -H "apikey: $SB_KEY"
--
--   curl -s -i -X POST "$SB_URL/rest/v1/comp_events" -H "apikey: $SB_KEY" \
--     -H "Content-Type: application/json" \
--     -d '{"title": "anon test", "event_type": "Invitational Competition", "start_date": "2026-01-10", "end_date": "2026-01-10"}'
--
--   curl -s -i -X PATCH "$SB_URL/rest/v1/comp_events?title=eq.x" -H "apikey: $SB_KEY" \
--     -H "Content-Type: application/json" -d '{"title": "y"}'
--
--   curl -s -i -X DELETE "$SB_URL/rest/v1/comp_events?title=eq.x" -H "apikey: $SB_KEY"
--
-- --- 2. comp_event_sites ---------------------------------------------------
--
--   curl -s -i "$SB_URL/rest/v1/comp_event_sites?select=event_id" -H "apikey: $SB_KEY"
--
--   curl -s -i -X POST "$SB_URL/rest/v1/comp_event_sites" -H "apikey: $SB_KEY" \
--     -H "Content-Type: application/json" \
--     -d "{\"event_id\": \"00000000-0000-0000-0000-000000000000\", \"site_id\": \"$SITE_ID\"}"
--
--   curl -s -i -X PATCH "$SB_URL/rest/v1/comp_event_sites?site_id=eq.$SITE_ID" -H "apikey: $SB_KEY" \
--     -H "Content-Type: application/json" -d "{\"site_id\": \"$SITE_ID\"}"
--
--   curl -s -i -X DELETE "$SB_URL/rest/v1/comp_event_sites?site_id=eq.$SITE_ID" -H "apikey: $SB_KEY"
--
-- --- Summary ---------------------------------------------------------------
--
-- Pass: all eight return 401 42501.
-- Fail: any 2xx, any non-empty body with rows, or any error code other than
--       42501. If a POST returns 201, delete the row in the SQL Editor:
--         delete from public.comp_events where title = 'anon test';
--
-- ===========================================================================
-- CURL CHECKS — signed-in Coach, after the anon checks
-- ===========================================================================
--
-- These test the two Coach limits: a Coach creates only external events of an
-- external type, and attaches their own site only to external events. They
-- need a real session for an ACTIVE profile titled 'Coach' whose site is
-- Burnley (any club site works; use its rota_sites.id as SITE_ID). Do not use
-- a Head Office title: those hold manage_comp_events and pass every case.
--
-- Get the Coach's access token (password grant; the password is never
-- stored here):
--
--   export COACH_EMAIL="<test Coach's email>"
--   export COACH_TOKEN=$(curl -s -X POST "$SB_URL/auth/v1/token?grant_type=password" \
--     -H "apikey: $SB_KEY" -H "Content-Type: application/json" \
--     -d "{\"email\": \"$COACH_EMAIL\", \"password\": \"<password>\"}" | sed -E 's/.*"access_token":"([^"]+)".*/\1/')
--
-- Every request below sends both headers:
--   -H "apikey: $SB_KEY" -H "Authorization: Bearer $COACH_TOKEN"
--
-- An RLS rejection for a signed-in user is 403 with "code":"42501", "new row
-- violates row-level security policy for table …". A 23514 (check
-- violation) or 23503 (foreign key) means the row got past RLS: that is a
-- failure for a "rejected" case.
--
-- Set up one NWG-run event in the SQL Editor (as postgres, which bypasses
-- RLS) for case 3:
--
--   insert into public.comp_events (title, event_type, start_date, end_date, source)
--   values ('0031 coach test nwg', 'NWG All Competition', date '2026-03-07', date '2026-03-07', 'nwg')
--   returning id;
--   -- export NWG_EVENT_ID="<that id>"
--
-- --- 3.1 Coach inserts event_type 'NWG All Competition' -> rejected --------
--
--   curl -s -i -X POST "$SB_URL/rest/v1/comp_events" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $COACH_TOKEN" \
--     -H "Content-Type: application/json" \
--     -d '{"title": "0031 coach test", "event_type": "NWG All Competition", "start_date": "2026-03-07", "end_date": "2026-03-07"}'
--
--   Expected: 403, code 42501 (RLS). Failure: 201.
--
-- --- 3.2 Coach inserts source 'nwg' -> rejected ----------------------------
--
--   curl -s -i -X POST "$SB_URL/rest/v1/comp_events" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $COACH_TOKEN" \
--     -H "Content-Type: application/json" \
--     -d '{"title": "0031 coach test", "event_type": "Invitational Competition", "start_date": "2026-03-07", "end_date": "2026-03-07", "source": "nwg"}'
--
--   Expected: 403, code 42501 (RLS). Failure: 201.
--
-- --- 3.3 Coach attaches own site to a source 'nwg' event -> rejected -------
--
--   curl -s -i -X POST "$SB_URL/rest/v1/comp_event_sites" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $COACH_TOKEN" \
--     -H "Content-Type: application/json" \
--     -d "{\"event_id\": \"$NWG_EVENT_ID\", \"site_id\": \"$SITE_ID\"}"
--
--   Expected: 403, code 42501 (RLS). Failure: 201.
--
-- --- 3.4 Coach attaches own site to a source 'external' event -> allowed ---
--
-- First create the external event as the Coach (this is also the positive
-- case for the comp_events insert policy). created_by defaults to the
-- Coach's id; source defaults to 'external'.
--
--   curl -s -i -X POST "$SB_URL/rest/v1/comp_events" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $COACH_TOKEN" \
--     -H "Content-Type: application/json" -H "Prefer: return=representation" \
--     -d '{"title": "0031 coach test external", "event_type": "Invitational Competition", "start_date": "2026-03-07", "end_date": "2026-03-07"}'
--
--   Expected: 201, one row with source "external". export EXT_EVENT_ID="<its id>"
--
--   curl -s -i -X POST "$SB_URL/rest/v1/comp_event_sites" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $COACH_TOKEN" \
--     -H "Content-Type: application/json" -H "Prefer: return=representation" \
--     -d "{\"event_id\": \"$EXT_EVENT_ID\", \"site_id\": \"$SITE_ID\"}"
--
--   Expected: 201, one row. Failure: 403 42501.
--
-- --- Clean up (SQL Editor) -------------------------------------------------
--
-- comp_event_sites rows go with their event (on delete cascade).
--
--   delete from public.comp_events where title like '0031 coach test%';
