-- NWG Coaches Hub — Competitions phase 3e (0035): verification
--
-- Companion to supabase/migrations/0035_comp_activity_log.sql. Written,
-- not executed.
--
-- ---------------------------------------------------------------------------
-- PASTE ORDER
-- ---------------------------------------------------------------------------
--
--   Paste A  -> run BEFORE 0035
--   apply    supabase/migrations/0035_comp_activity_log.sql
--   Paste B  -> run AFTER 0035
--
-- Paste each one into the Supabase SQL Editor on its own, as the editor's
-- default role (postgres). Each returns ONE result table:
--
--   check_name | expected | actual | pass
--
-- Paste A is a single query. Paste B is a DO block (the tests) followed by
-- the result query, as in the 0033 verification; paste both together. The
-- editor shows only the last statement's result, which is the result query.
--
-- A good run shows pass = true on every check row. Rows with pass = null are
-- either "info" rows (Paste A, to read) or SKIPPED tests: a test is skipped,
-- not failed, when the job title it needs has no suitable active profile.
--
-- Do not apply 0035 if Paste A has a failing row. 0035's guards repeat
-- A1-A6 and would abort anyway.
--
-- What each check means:
--
--   Paste A
--     A1   0033 and 0034 are applied
--     A2   nothing 0035 creates exists yet (table, 2 functions, triggers)
--     A3   no trigger on comp_events or comp_event_sites
--     A4   the live capability matrix: the 14 capabilities resolve to their
--          0032 titles, remove_comp_gymnast_data to none
--     A5   the objects and columns 0035 depends on
--     A6   you are running as postgres (0035's functions and the log table
--          must be owned by a trusted role)
--     info row counts, and the profiles Paste B will impersonate (whether
--          each exists, no names). Anything missing is SKIPPED in Paste B.
--
--   Paste B
--     B0   the test fixture was built and every test ran
--     B1   comp_activity_log has the 15 expected columns and types
--     B2   RLS on, exactly 1 policy, and it is a select policy
--     B3   grants: authenticated and service_role select only; anon and
--          public nothing
--     B4   the logger: security definer, search_path '', trusted owner, no
--          EXECUTE for public, anon or authenticated
--     B5   the removal RPC: security definer, search_path '', trusted
--          owner, EXECUTE for authenticated only
--     B6   the 9 logger triggers (AFTER INSERT OR UPDATE OR DELETE, FOR
--          EACH ROW), and 24 triggers in all on the 9 logged tables
--     B7   the log's only foreign key is actor_id -> profiles on delete
--          set null (nothing ties it to the rows it describes)
--     B8   the 15-capability matrix (50 pairs), and my_capabilities()
--          lists remove_comp_gymnast_data
--     a..  actor and action label for each kind of change; no-ops logged
--          nothing
--     p..  gymnast PII and entry free text: column names only, never values
--     r..  who can read the log; my_capabilities() per job title
--     i..  nobody can insert, update or delete log rows directly
--     c..  cascades log one row; event-level rows
--     d..  gymnast data removal
--     B9   no rows left behind (row counts of the 9 logged tables and the
--          log are the same before and after the DO block)
--
-- Every logging test (a, p, c, d) ends with ", pii=N": the number of log
-- rows written since the fixture was built whose whole row, as text,
-- contains a test gymnast's name or DOB, or any "pii-" marker used for
-- gymnast notes, withdrawn notes, entry notes, decline notes or withdrawal
-- notes. Expected 0 everywhere.


-- ===========================================================================
-- PASTE A — before 0035
-- ===========================================================================

with
titles (ord, job_title) as (
  values (1, 'Coach'), (2, 'Lead Coach'), (3, 'Club Head Coach'),
         (4, 'Regional General Manager'), (5, 'Head of Gymnastics'), (6, 'Head of Operations')
),
caps (ord, cap, expected) as (
  values
    (1,  'view_all_sites',           'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (2,  'all_sites_scope',          'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (3,  'publish_whats_new',        'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (4,  'manage_policies',          'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (5,  'manage_users',             'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (6,  'edit_rota',                'Lead Coach, Club Head Coach, Regional General Manager, Head of Gymnastics, Head of Operations'),
    (7,  'manage_club_meetings',     'Lead Coach, Club Head Coach, Regional General Manager, Head of Gymnastics, Head of Operations'),
    (8,  'manage_club_updates',      'Lead Coach, Club Head Coach, Regional General Manager, Head of Gymnastics, Head of Operations'),
    (9,  'manage_club_roles',        'Club Head Coach, Regional General Manager, Head of Gymnastics, Head of Operations'),
    (10, 'manage_comp_events',       'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (11, 'edit_comp_entries',        'Coach, Lead Coach, Club Head Coach, Regional General Manager, Head of Gymnastics, Head of Operations'),
    (12, 'sign_off_competitions',    'Head of Gymnastics'),
    (13, 'approve_judges',           'Regional General Manager, Head of Gymnastics'),
    (14, 'confirm_comp_pricing',     'Club Head Coach, Head of Gymnastics'),
    (15, 'remove_comp_gymnast_data', '(none)')
),
matrix as (
  select c.ord, c.cap, c.expected,
         coalesce(string_agg(t.job_title, ', ' order by t.ord)
                  filter (where public.title_has_capability(t.job_title, c.cap)), '(none)') as actual
  from caps c cross join titles t
  group by c.ord, c.cap, c.expected
),
deps (name, present) as (
  values
    ('is_active_coach()',      to_regprocedure('public.is_active_coach()') is not null),
    ('has_capability()',       to_regprocedure('public.has_capability(text)') is not null),
    ('has_site_capability()',  to_regprocedure('public.has_site_capability(text, uuid)') is not null),
    ('title_has_capability()', to_regprocedure('public.title_has_capability(text, text)') is not null),
    ('my_capabilities()',      to_regprocedure('public.my_capabilities()') is not null),
    ('comp_entry_for_action()', to_regprocedure('public.comp_entry_for_action(uuid, text, text, boolean)') is not null),
    ('comp_events',            to_regclass('public.comp_events') is not null),
    ('comp_event_sites',       to_regclass('public.comp_event_sites') is not null),
    ('profiles',               to_regclass('public.profiles') is not null),
    ('rota_sites',             to_regclass('public.rota_sites') is not null),
    ('comp_entries.notes / decline_note / withdrawal_note / data_removed_by / data_removed_at',
     (select count(*) from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'comp_entries'
        and c.column_name in ('notes', 'decline_note', 'withdrawal_note',
                              'data_removed_by', 'data_removed_at')) = 5),
    ('comp_entry_gymnasts.full_name / dob / notes / withdrawn_note',
     (select count(*) from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'comp_entry_gymnasts'
        and c.column_name in ('full_name', 'dob', 'notes', 'withdrawn_note')) = 4)
),
club_coach as (
  -- The site Paste B will use: a club site with an active Coach, preferring
  -- one that also has an active Club Head Coach (same rule as Paste B).
  select s.name as site,
         exists (
           select 1 from public.profiles c
           where c.active and c.job_title = 'Club Head Coach' and c.site = p.site
         ) as has_chc
  from public.profiles p
  join public.rota_sites s on s.name = p.site
  where p.active and p.job_title = 'Coach'
  order by 2 desc, p.created_at
  limit 1
),
checks as (
  select 10 as ord, 0 as sub,
         'A1 0033 and 0034 applied' as check_name,
         'yes' as expected,
         case when to_regprocedure('public.comp_entry_lock_guard()') is not null
                   and exists (
                     select 1 from pg_trigger
                     where tgrelid = 'public.comp_entry_gymnasts'::regclass
                       and tgname = 'comp_entry_gymnasts_lock_delete')
              then 'yes' else 'no' end as actual,
         to_regprocedure('public.comp_entry_lock_guard()') is not null
           and exists (
             select 1 from pg_trigger
             where tgrelid = 'public.comp_entry_gymnasts'::regclass
               and tgname = 'comp_entry_gymnasts_lock_delete') as pass
  union all
  select 20, 0, 'A2 objects 0035 creates', 'none',
         coalesce(nullif(concat_ws(', ',
           case when to_regclass('public.comp_activity_log') is not null then 'comp_activity_log' end,
           case when to_regprocedure('public.comp_activity_log_write()') is not null then 'comp_activity_log_write()' end,
           case when to_regprocedure('public.comp_entry_remove_gymnast_data(uuid)') is not null then 'comp_entry_remove_gymnast_data()' end,
           (select string_agg(t.tgname::text, ', ') from pg_trigger t
            where not t.tgisinternal and t.tgname like '%activity_log%')
         ), ''), 'none'),
         to_regclass('public.comp_activity_log') is null
           and to_regprocedure('public.comp_activity_log_write()') is null
           and to_regprocedure('public.comp_entry_remove_gymnast_data(uuid)') is null
           and not exists (select 1 from pg_trigger t
                           where not t.tgisinternal and t.tgname like '%activity_log%')
  union all
  select 30, 0, 'A3 triggers on comp_events and comp_event_sites', '0',
         count(*)::text || coalesce(': ' || string_agg(t.tgname::text, ', ' order by t.tgname), ''),
         count(*) = 0
  from pg_trigger t
  where not t.tgisinternal
    and t.tgrelid in ('public.comp_events'::regclass, 'public.comp_event_sites'::regclass)
  union all
  select 40, m.ord, 'A4 ' || m.cap, m.expected, m.actual, m.actual = m.expected
  from matrix m
  union all
  select 50, 0, 'A5 objects 0035 depends on', 'all present',
         coalesce('missing: ' || string_agg(name, ', ') filter (where not present), 'all present'),
         bool_and(present)
  from deps
  union all
  select 60, 0, 'A6 current_user (will own the 0035 functions and log)', 'postgres',
         current_user::text,
         current_user in ('postgres', 'supabase_admin')
  union all
  select 70, 0, 'info rows in the 9 tables 0035 logs', '(read)',
         (select count(*) from public.comp_events)::text || ' events, '
           || (select count(*) from public.comp_event_sites)::text || ' event sites, '
           || (select count(*) from public.comp_external_details)::text || ' details, '
           || (select count(*) from public.comp_entries)::text || ' entries, '
           || (select count(*) from public.comp_entry_fee_levels)::text || ' fee levels, '
           || (select count(*) from public.comp_entry_extras)::text || ' extras, '
           || (select count(*) from public.comp_entry_gymnasts)::text || ' gymnasts, '
           || (select count(*) from public.comp_entry_gymnast_extras)::text || ' gymnast extras, '
           || (select count(*) from public.comp_entry_staff)::text || ' staff',
         null::boolean
  union all
  select 90, 1, 'info Paste B: active Coach at a club site', 'yes',
         coalesce((select 'yes (' || site || ')' from club_coach), 'NO: Coach tests will be SKIPPED'),
         null
  union all
  select 90, 2, 'info Paste B: active Club Head Coach at that site', 'yes',
         case when (select has_chc from club_coach) then 'yes'
              else 'NO: Club Head Coach tests will be SKIPPED' end,
         null
  union all
  select 90, 3, 'info Paste B: active Head of Gymnastics', 'yes',
         case when exists (select 1 from public.profiles p where p.active and p.job_title = 'Head of Gymnastics')
              then 'yes' else 'NO: HOG tests will be SKIPPED' end,
         null
  union all
  select 90, 4, 'info Paste B: active Regional General Manager', 'yes',
         case when exists (select 1 from public.profiles p where p.active and p.job_title = 'Regional General Manager')
              then 'yes' else 'NO: RGM tests will be SKIPPED' end,
         null
  union all
  select 90, 5, 'info Paste B: active Head of Operations', 'yes',
         case when exists (select 1 from public.profiles p where p.active and p.job_title = 'Head of Operations')
              then 'yes' else 'NO: HOO tests will be SKIPPED' end,
         null
  union all
  select 90, 6, 'info Paste B: active Coach at a second club site', 'yes',
         case when exists (
                select 1 from public.profiles p
                join public.rota_sites s on s.name = p.site
                where p.active and p.job_title = 'Coach'
                  and s.name is distinct from (select site from club_coach)
              ) then 'yes' else 'NO: the other-site tests will be SKIPPED' end,
         null
)
select check_name, expected, actual, pass
from checks
order by ord, sub;


-- ===========================================================================
-- PASTE B — after 0035
-- ===========================================================================
--
-- Paste B is two statements: a DO block that runs the tests, then the
-- result query. Paste both together.
--
-- Who it impersonates (real profiles, chosen by job_title, all active):
--   coach   a Coach at a club site S, preferring a site that also has a CHC
--   chc     a Club Head Coach at S
--   hog     a Head of Gymnastics (any site)
--   rgm     a Regional General Manager (any site)
--   hoo     a Head of Operations (any site)
--   coach2  a Coach at a club site other than S
-- A test whose actor doesn't exist records "SKIPPED: ..." with pass = null.
--
-- Impersonation, as 0033: set_config('request.jwt.claims', {sub, role}) so
-- auth.uid() returns the profile id, then SET LOCAL ROLE authenticated, the
-- role PostgREST uses. RLS, grants, the guards and the logger all apply as
-- for the app.
--
-- Fixture (built as postgres inside an outer sub-block, at site S; the
-- logger logs it with actor null): one external event (starts and ends
-- today + 40), S attached, entry deadline today + 10; one draft entry; fee
-- levels Opal (used) and Diamond (unused); extras T-shirt (used) and Medal
-- (unused); one gymnast, "0035 Zebra Quokka", DOB 2013-02-27, notes
-- "pii-gnotes-fixture", on Opal with the T-shirt; one judge (the Coach, or
-- another active profile if there is no Coach).
--
-- Each test runs in its own nested sub-block:
--   1. setup statements, as postgres, put the entry into the stage the test
--      needs; then the log's current max id is noted (%14$L);
--   2. the action, as the impersonated user;
--   3. an optional post query, as postgres, reads the outcome (usually the
--      log rows written by the action: id > %14$L);
--   4. a deliberate raise ('0035-undo') rolls all of it back, including the
--      SET LOCAL ROLE and the JWT claims.
-- A write action that raises records "SQLSTATE: message"; the check passes
-- when the SQLSTATE is the expected one. One that succeeds records "ok" (or
-- the post query's text), or "<n> rows affected" if it touched other than 1
-- row. A read test (reads = true) records the action's own result, read as
-- the impersonated user. The outer sub-block ends in a raise too, which
-- rolls back the fixture. B9 checks nothing was left behind.
--
-- Log lines in post results read: table.op/action/actor[redacted], with
-- action "-" for an ordinary edit and actor "system" for postgres.
--
-- Placeholders in the test SQL (format() positions):
--   %1$L entry       %2$L event        %3$L fee level Opal (used)
--   %4$L fee level Diamond (unused)    %5$L extra T-shirt (used)
--   %6$L extra Medal (unused)          %7$L gymnast     %8$L staff (judge)
--   %9$L "who" profile for setup *_by columns          %10$L HOG profile
--   %11$L site S     %12$L today (Europe/London)        %13$L spare event id
--   %14$L log max id before the action                 %15$L log max id
--   before the fixture                %16$L Coach       %17$L CHC
--   %18$L RGM

do $$
declare
  r jsonb := '[]'::jsonb;
  v_before jsonb;
  t record;
  v_sql text;
  v_actor uuid;
  v_actual text;
  v_rows bigint;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_mark bigint;
  v_mark0 bigint;

  v_coach uuid;
  v_chc uuid;
  v_hog uuid;
  v_rgm uuid;
  v_hoo uuid;
  v_coach2 uuid;
  v_who uuid;
  v_site uuid;
  v_ev uuid;
  v_ev2 uuid := gen_random_uuid();
  v_en uuid;
  v_fl uuid;
  v_fl2 uuid;
  v_x uuid;
  v_x2 uuid;
  v_g uuid;
  v_st uuid;

  -- Setup statements shared by many tests (run as postgres). Every free-text
  -- value carries a "pii-" marker, so the pii count would catch it.
  v_aw    text := $q$update public.comp_entries set status = 'awaiting_signoff', signoff_requested_by = %9$L, signoff_requested_at = now() where id = %1$L$q$;
  v_col   text := $q$update public.comp_entries set status = 'collecting', signed_off_by = %9$L, signed_off_at = now() where id = %1$L$q$;
  v_conf  text := $q$update public.comp_entries set pricing_confirmed_by = %9$L, pricing_confirmed_at = now() where id = %1$L$q$;
  v_tick  text := $q$update public.comp_entry_gymnasts set debt_added = true, paid = true, marked_paid_bars = true where id = %7$L$q$;
  v_amt   text := $q$update public.comp_entry_gymnasts set amount_paid = 28.80, paid_date = %12$L::date where id = %7$L$q$;
  v_pos   text := $q$update public.comp_entries set status = 'po_request_sent', po_requested_by = %9$L, po_requested_at = now() where id = %1$L$q$;
  v_por   text := $q$update public.comp_entries set status = 'po_received', po_number = 'PO-OLD', po_received_by = %9$L, po_received_at = now() where id = %1$L$q$;
  v_ent   text := $q$update public.comp_entries set status = 'entered', po_number = 'PO-OLD', entered_by = %9$L, entered_at = now() where id = %1$L$q$;
  v_done  text := $q$update public.comp_entries set status = 'completed', completed_by = %9$L, completed_at = now() where id = %1$L$q$;
  v_wd    text := $q$update public.comp_entries set status = 'withdrawn', withdrawn_by = %9$L, withdrawn_at = now(), withdrawal_note = 'pii-withdraw-setup' where id = %1$L$q$;
  v_decl  text := $q$update public.comp_entries set status = 'declined', declined_by = %9$L, declined_at = now(), decline_note = 'pii-decline-setup' where id = %1$L$q$;
  v_enote text := $q$update public.comp_entries set notes = 'pii-enotes-setup' where id = %1$L$q$;
  v_gwd   text := $q$update public.comp_entry_gymnasts set withdrawn = true, withdrawn_note = 'pii-gwd-setup' where id = %7$L$q$;
  v_g2    text := $q$insert into public.comp_entry_gymnasts (entry_id, fee_level_id, full_name, dob, notes, debt_added, paid, marked_paid_bars, amount_paid) values (%1$L, %4$L, '0035 Yak Ocelot', date '2012-11-30', 'pii-gnotes-g2', true, true, true, 28.80)$q$;
  v_appr  text := $q$update public.comp_entry_staff set judge_approved_by = %9$L, judge_approved_at = now() where id = %8$L$q$;
  v_rm1   text := $q$update public.comp_entries set data_removed_by = %9$L, data_removed_at = now() where id = %1$L$q$;
  v_rm2   text := $q$update public.comp_entry_gymnasts set full_name = null, dob = null, notes = null, withdrawn_note = null where entry_id = %1$L$q$;
  -- Competition end dates for the removal tests.
  v_d13m  text := $q$update public.comp_events set start_date = (%12$L::date - interval '13 months')::date, end_date = (%12$L::date - interval '13 months')::date where id = %2$L$q$;
  v_d12m  text := $q$update public.comp_events set start_date = (%12$L::date - interval '12 months')::date, end_date = (%12$L::date - interval '12 months')::date where id = %2$L$q$;
  v_dshort text := $q$update public.comp_events set start_date = (%12$L::date - interval '12 months')::date + 1, end_date = (%12$L::date - interval '12 months')::date + 1 where id = %2$L$q$;
  v_d100  text := $q$update public.comp_events set start_date = %12$L::date - 100, end_date = %12$L::date - 100 where id = %2$L$q$;
  v_ev2a  text := $q$insert into public.comp_events (id, title, event_type, start_date, end_date) values (%13$L, '0035 verification event 2', 'Invitational Competition', %12$L::date + 40, %12$L::date + 40)$q$;
  v_ev2b  text := $q$insert into public.comp_event_sites (event_id, site_id) values (%13$L, %11$L)$q$;
  v_ev2d  text := $q$insert into public.comp_external_details (event_id, entry_deadline) values (%13$L, %12$L::date + 30)$q$;

  -- Post queries (run as postgres).
  q_log text := $q$
    select 'ok, '
      || coalesce(string_agg(
           l.table_name || '.' || l.op || '/' || coalesce(l.action, '-') || '/'
             || case when l.actor_id is null then 'system'
                     when l.actor_id = %16$L then 'coach'
                     when l.actor_id = %10$L then 'hog'
                     when l.actor_id = %17$L then 'chc'
                     when l.actor_id = %18$L then 'rgm'
                     else 'other' end
             || '[' || array_to_string(l.redacted, ',') || ']',
           '; ' order by l.id), 'none')
      || ', pii=' || (
           select count(*) from public.comp_activity_log x
           where x.id > %15$L
             and to_jsonb(x)::text ~ '(Zebra|Quokka|Yak|Ocelot|pii-|2013-02-27|2012-11-30)')
    from public.comp_activity_log l
    where l.id > %14$L
  $q$;
  q_removed text := $q$
    select 'ok, blank='
      || (select bool_and(num_nulls(g.full_name, g.dob, g.notes, g.withdrawn_note) = 4)
          from public.comp_entry_gymnasts g where g.entry_id = %1$L)
      || ', kept='
      || (select bool_and(g.fee_level_id is not null and g.debt_added and g.paid
                          and g.marked_paid_bars and g.amount_paid = 28.80)
          from public.comp_entry_gymnasts g where g.entry_id = %1$L)
      || '/' || (select count(*) from public.comp_entry_gymnast_extras x where x.entry_id = %1$L)
      || ', entry='
      || (select (e.data_removed_at is not null)::text
                 || '/' || coalesce(e.notes, 'null')
                 || '/' || coalesce(e.decline_note, 'null')
                 || '/' || coalesce(e.withdrawal_note, 'null')
          from public.comp_entries e where e.id = %1$L)
      || ', log='
      || (select coalesce(string_agg(
                   l.table_name || '.' || coalesce(l.action, '-')
                     || '(gymnasts=' || coalesce(l.detail ->> 'gymnasts', '-') || ')'
                     || '[' || array_to_string(l.redacted, ',') || ']',
                   '; ' order by l.id), 'none')
          from public.comp_activity_log l where l.id > %14$L)
      || ', pii=' || (
           select count(*) from public.comp_activity_log x
           where x.id > %15$L
             and to_jsonb(x)::text ~ '(Zebra|Quokka|Yak|Ocelot|pii-|2013-02-27|2012-11-30)')
  $q$;
  q_paid_bars text := $q$
    select 'ok, ' || coalesce(string_agg(
             l.table_name || '.' || l.op || '/' || coalesce(l.action, '-') || ' '
               || (select string_agg(k || '=' || coalesce(l.changes #>> array[k, 'old'], 'null')
                                       || '->' || coalesce(l.changes #>> array[k, 'new'], 'null'),
                                     ',' order by k)
                   from jsonb_object_keys(l.changes) as k),
             '; ' order by l.id), 'none')
    from public.comp_activity_log l
    where l.id > %14$L
  $q$;

  -- Read actions (run as the impersonated user).
  rd_entry text := $q$select 'ok, visible=' || (count(*) > 0) from public.comp_activity_log where entry_id = %1$L$q$;
  rd_caps  text := $q$select 'ok, has=' || ('remove_comp_gymnast_data' = any (c.capabilities)) from public.my_capabilities() c$q$;
begin
  -- --- counts before -------------------------------------------------------
  select jsonb_build_object(
    'comp_events', (select count(*) from public.comp_events),
    'comp_event_sites', (select count(*) from public.comp_event_sites),
    'comp_external_details', (select count(*) from public.comp_external_details),
    'comp_entries', (select count(*) from public.comp_entries),
    'comp_entry_fee_levels', (select count(*) from public.comp_entry_fee_levels),
    'comp_entry_extras', (select count(*) from public.comp_entry_extras),
    'comp_entry_gymnasts', (select count(*) from public.comp_entry_gymnasts),
    'comp_entry_gymnast_extras', (select count(*) from public.comp_entry_gymnast_extras),
    'comp_entry_staff', (select count(*) from public.comp_entry_staff),
    'comp_activity_log', (select count(*) from public.comp_activity_log)
  ) into v_before;

  -- --- profiles ------------------------------------------------------------
  select p.id, s.id into v_coach, v_site
  from public.profiles p
  join public.rota_sites s on s.name = p.site
  where p.active and p.job_title = 'Coach'
  order by exists (
             select 1 from public.profiles c
             where c.active and c.job_title = 'Club Head Coach' and c.site = p.site
           ) desc,
           p.created_at
  limit 1;

  if v_site is null then
    select s.id into v_site from public.rota_sites s order by s.sort_order, s.name limit 1;
  end if;

  select p.id into v_chc
  from public.profiles p
  join public.rota_sites s on s.name = p.site
  where p.active and p.job_title = 'Club Head Coach' and s.id = v_site
  order by p.created_at limit 1;

  select p.id into v_hog from public.profiles p
  where p.active and p.job_title = 'Head of Gymnastics' order by p.created_at limit 1;

  select p.id into v_rgm from public.profiles p
  where p.active and p.job_title = 'Regional General Manager' order by p.created_at limit 1;

  select p.id into v_hoo from public.profiles p
  where p.active and p.job_title = 'Head of Operations' order by p.created_at limit 1;

  select p.id into v_coach2
  from public.profiles p
  join public.rota_sites s on s.name = p.site
  where p.active and p.job_title = 'Coach' and s.id is distinct from v_site
  order by p.created_at limit 1;

  v_who := coalesce(
    v_hog, v_coach,
    (select p.id from public.profiles p where p.active order by p.created_at limit 1));

  select coalesce(max(id), 0) into v_mark0 from public.comp_activity_log;

  begin
    -- --- fixture (as postgres) ---------------------------------------------
    insert into public.comp_events (title, event_type, start_date, end_date)
    values ('0035 verification event', 'Invitational Competition', v_today + 40, v_today + 40)
    returning id into v_ev;
    insert into public.comp_event_sites (event_id, site_id) values (v_ev, v_site);
    insert into public.comp_external_details (event_id, entry_deadline, organiser_payment_deadline)
    values (v_ev, v_today + 10, v_today + 10);
    insert into public.comp_entries (event_id, site_id, created_by)
    values (v_ev, v_site, v_who) returning id into v_en;
    insert into public.comp_entry_fee_levels (entry_id, label, organiser_fee, sort_order)
    values (v_en, 'Opal', 24, 1) returning id into v_fl;
    insert into public.comp_entry_fee_levels (entry_id, label, organiser_fee, sort_order)
    values (v_en, 'Diamond', 28, 2) returning id into v_fl2;
    insert into public.comp_entry_extras (entry_id, label, price, sort_order)
    values (v_en, 'T-shirt', 10, 1) returning id into v_x;
    insert into public.comp_entry_extras (entry_id, label, price, sort_order)
    values (v_en, 'Medal', 5, 2) returning id into v_x2;
    insert into public.comp_entry_gymnasts (entry_id, fee_level_id, full_name, dob, notes)
    values (v_en, v_fl, '0035 Zebra Quokka', date '2013-02-27', 'pii-gnotes-fixture')
    returning id into v_g;
    insert into public.comp_entry_gymnast_extras (entry_id, gymnast_id, extra_id)
    values (v_en, v_g, v_x);
    insert into public.comp_entry_staff (entry_id, profile_id, staff_role, transport)
    values (v_en, coalesce(v_coach, v_who), 'judge', 'carpool') returning id into v_st;

    -- --- tests ---------------------------------------------------------------
    for t in
      select * from (values
        -- actor and action label
        (100, 'a01', 'Coach requests sign-off', 'coach', 'ok, comp_entries.update/request_signoff/coach[], pii=0',
         null::text[], $q$select public.comp_entry_request_signoff(%1$L)$q$, q_log, false),
        (101, 'a02', 'Coach resubmits a declined entry', 'coach', 'ok, comp_entries.update/request_signoff/coach[decline_note], pii=0',
         array[v_decl], $q$select public.comp_entry_request_signoff(%1$L)$q$, q_log, false),
        (102, 'a03', 'HOG signs off', 'hog', 'ok, comp_entries.update/sign_off/hog[], pii=0',
         array[v_aw], $q$select public.comp_entry_sign_off(%1$L, true)$q$, q_log, false),
        (103, 'a04', 'HOG declines with a note', 'hog', 'ok, comp_entries.update/decline/hog[decline_note], pii=0',
         array[v_aw], $q$select public.comp_entry_decline(%1$L, 'pii-decline-a04 injury')$q$, q_log, false),
        (104, 'a05', 'Coach withdraws the entry with a reason', 'coach', 'ok, comp_entries.update/withdraw/coach[withdrawal_note], pii=0',
         array[v_col], $q$select public.comp_entry_withdraw(%1$L, 'pii-withdraw-a05 illness')$q$, q_log, false),
        (105, 'a06', 'Club Head Coach confirms prices', 'chc', 'ok, comp_entries.update/confirm_pricing/chc[], pii=0',
         null, $q$select public.comp_entry_confirm_pricing(%1$L)$q$, q_log, false),
        (106, 'a07', 'Coach changes a fee: fee row, then pricing cleared', 'coach',
         'ok, comp_entry_fee_levels.update/-/coach[]; comp_entries.update/pricing_cleared/coach[], pii=0',
         array[v_conf], $q$update public.comp_entry_fee_levels set organiser_fee = 25 where id = %3$L$q$, q_log, false),
        (107, 'a08', 'Coach marks a gymnast paid on BARS', 'coach', 'ok, comp_entry_gymnasts.update/- marked_paid_bars=false->true',
         null, $q$update public.comp_entry_gymnasts set marked_paid_bars = true, updated_at = now() where id = %7$L$q$, q_paid_bars, false),
        (108, 'a09', 'Coach withdraws a gymnast with a note', 'coach', 'ok, comp_entry_gymnasts.update/withdraw_gymnast/coach[withdrawn_note], pii=0',
         null, $q$update public.comp_entry_gymnasts set withdrawn = true, withdrawn_note = 'pii-gwd-a09 broken wrist' where id = %7$L$q$, q_log, false),
        (109, 'a10', 'HOG approves the judge', 'hog', 'ok, comp_entry_staff.update/approve_judge/hog[], pii=0',
         null, $q$select public.comp_entry_approve_judge(%8$L)$q$, q_log, false),
        (110, 'a11', 'Coach records the PO number', 'coach', 'ok, comp_entries.update/record_po_number/coach[], pii=0',
         array[v_pos], $q$select public.comp_entry_record_po_number(%1$L, 'PO-0035')$q$, q_log, false),
        (111, 'a12', 'Coach marks the organiser paid', 'coach', 'ok, comp_entries.update/mark_organiser_paid/coach[], pii=0',
         array[v_por], $q$select public.comp_entry_mark_organiser_paid(%1$L)$q$, q_log, false),
        (112, 'a13', 'Coach changes only updated_at: nothing logged', 'coach', 'ok, none, pii=0',
         null, $q$update public.comp_entries set updated_at = now() where id = %1$L$q$, q_log, false),
        (113, 'a14', 'Coach writes identical values: nothing logged', 'coach', 'ok, none, pii=0',
         null, $q$update public.comp_entries set judges_required = judges_required, notes = notes where id = %1$L$q$, q_log, false),
        (114, 'a15', 'Coach edits entry notes: name only, no value', 'coach', 'ok, comp_entries.update/-/coach[notes], pii=0',
         null, $q$update public.comp_entries set notes = 'pii-enotes-a15 asthma', updated_at = now() where id = %1$L$q$, q_log, false),
        (115, 'a16', 'Coach changes the uplift with prices confirmed', 'coach', 'ok, comp_entries.update/pricing_cleared/coach[], pii=0',
         array[v_conf], $q$update public.comp_entries set uplift_pct = 25 where id = %1$L$q$, q_log, false),

        -- gymnast PII
        (200, 'p01', 'Coach adds a gymnast with name, DOB and notes', 'coach', 'ok, comp_entry_gymnasts.insert/-/coach[dob,full_name,notes], pii=0',
         null, $q$insert into public.comp_entry_gymnasts (entry_id, fee_level_id, full_name, dob, notes) values (%1$L, %3$L, '0035 Yak Ocelot', date '2012-11-30', 'pii-gnotes-p01')$q$, q_log, false),
        (201, 'p02', 'Coach edits a gymnast''s name, DOB and notes', 'coach', 'ok, comp_entry_gymnasts.update/-/coach[dob,full_name,notes], pii=0',
         null, $q$update public.comp_entry_gymnasts set full_name = '0035 Yak Ocelot', dob = date '2012-11-30', notes = 'pii-gnotes-p02' where id = %7$L$q$, q_log, false),
        (202, 'p03', 'Coach deletes a gymnast (extras cascade not logged)', 'coach', 'ok, comp_entry_gymnasts.delete/-/coach[dob,full_name,notes], pii=0',
         null, $q$delete from public.comp_entry_gymnasts where id = %7$L$q$, q_log, false),

        -- reading the log
        (300, 'r01', 'Coach reads own site''s entry log', 'coach', 'ok, visible=true',
         null, rd_entry, null, true),
        (301, 'r02', 'Coach at another site reads the entry log', 'coach2', 'ok, visible=false',
         null, rd_entry, null, true),
        (302, 'r03', 'Coach at another site reads the event-level rows', 'coach2', 'ok, visible=true',
         null, $q$select 'ok, visible=' || (count(*) > 0) from public.comp_activity_log where event_id = %2$L and entry_id is null$q$, null, true),
        (303, 'r04', 'RGM reads the entry log', 'rgm', 'ok, visible=true',
         null, rd_entry, null, true),
        (304, 'r05', 'Deactivated Coach reads the entry log', 'coach', 'ok, visible=false',
         array[$q$update public.profiles set active = false where id = %16$L$q$], rd_entry, null, true),
        (305, 'r06', 'Coach reads a deleted draft entry''s delete row', 'coach', 'ok, visible=true',
         array[$q$delete from public.comp_entries where id = %1$L$q$],
         $q$select 'ok, visible=' || (count(*) = 1) from public.comp_activity_log where entry_id = %1$L and table_name = 'comp_entries' and op = 'delete'$q$, null, true),
        (306, 'r07', 'Coach at another site reads that delete row', 'coach2', 'ok, visible=false',
         array[$q$delete from public.comp_entries where id = %1$L$q$],
         $q$select 'ok, visible=' || (count(*) = 1) from public.comp_activity_log where entry_id = %1$L and table_name = 'comp_entries' and op = 'delete'$q$, null, true),
        (310, 'r08', 'my_capabilities(): HOG has remove_comp_gymnast_data', 'hog', 'ok, has=true', null, rd_caps, null, true),
        (311, 'r09', 'my_capabilities(): RGM has remove_comp_gymnast_data', 'rgm', 'ok, has=true', null, rd_caps, null, true),
        (312, 'r10', 'my_capabilities(): HOO does not', 'hoo', 'ok, has=false', null, rd_caps, null, true),
        (313, 'r11', 'my_capabilities(): Club Head Coach does not', 'chc', 'ok, has=false', null, rd_caps, null, true),
        (314, 'r12', 'my_capabilities(): Coach does not', 'coach', 'ok, has=false', null, rd_caps, null, true),

        -- append-only
        (400, 'i01', 'Coach inserts a log row', 'coach', '42501',
         null, $q$insert into public.comp_activity_log (table_name, op, row_key) values ('comp_entries', 'update', '{}')$q$, null, false),
        (401, 'i02', 'Coach updates log rows', 'coach', '42501',
         null, $q$update public.comp_activity_log set action = null where entry_id = %1$L$q$, null, false),
        (402, 'i03', 'Coach deletes log rows', 'coach', '42501',
         null, $q$delete from public.comp_activity_log where entry_id = %1$L$q$, null, false),
        (403, 'i04', 'HOG inserts a log row', 'hog', '42501',
         null, $q$insert into public.comp_activity_log (table_name, op, row_key) values ('comp_entries', 'update', '{}')$q$, null, false),
        (404, 'i05', 'HOG updates log rows', 'hog', '42501',
         null, $q$update public.comp_activity_log set action = null where entry_id = %1$L$q$, null, false),
        (405, 'i06', 'HOG deletes log rows', 'hog', '42501',
         null, $q$delete from public.comp_activity_log where entry_id = %1$L$q$, null, false),

        -- cascades and event-level rows
        (500, 'c01', 'Coach deletes the draft entry: one row, children not logged', 'coach', 'ok, comp_entries.delete/-/coach[], pii=0',
         null, $q$delete from public.comp_entries where id = %1$L$q$, q_log, false),
        (501, 'c02', 'HOG deletes an event with a site and details: one row', 'hog', 'ok, comp_events.delete/-/hog[], pii=0',
         array[v_ev2a, v_ev2b, v_ev2d], $q$delete from public.comp_events where id = %13$L$q$, q_log, false),
        (502, 'c03', 'Coach changes the entry deadline: event-level row', 'coach', 'ok, comp_external_details.update/-/coach[], pii=0',
         null, $q$update public.comp_external_details set entry_deadline = %12$L::date + 20 where event_id = %2$L$q$, q_log, false),
        (503, 'c04', 'Coach attaches own site to an external event', 'coach', 'ok, comp_event_sites.insert/-/coach[], pii=0',
         array[v_ev2a], $q$insert into public.comp_event_sites (event_id, site_id) values (%13$L, %11$L)$q$, q_log, false),

        -- gymnast data removal
        (600, 'd01', 'Coach removes gymnast details', 'coach', '42501',
         array[v_d13m, v_done], $q$select public.comp_entry_remove_gymnast_data(%1$L)$q$, null, false),
        (601, 'd02', 'Club Head Coach removes gymnast details', 'chc', '42501',
         array[v_d13m, v_done], $q$select public.comp_entry_remove_gymnast_data(%1$L)$q$, null, false),
        (602, 'd03', 'HOO removes gymnast details', 'hoo', '42501',
         array[v_d13m, v_done], $q$select public.comp_entry_remove_gymnast_data(%1$L)$q$, null, false),
        (603, 'd04', 'HOG removes: competition ended 100 days ago', 'hog', '55000',
         array[v_d100, v_done], $q$select public.comp_entry_remove_gymnast_data(%1$L)$q$, null, false),
        (604, 'd05', 'HOG removes: one day short of 12 months', 'hog', '55000',
         array[v_dshort, v_done], $q$select public.comp_entry_remove_gymnast_data(%1$L)$q$, null, false),
        (605, 'd06', 'HOG removes from an entered entry', 'hog', '55000',
         array[v_d13m, v_ent], $q$select public.comp_entry_remove_gymnast_data(%1$L)$q$, null, false),
        (606, 'd07', 'HOG removes: exactly 12 months, completed', 'hog',
         'ok, blank=true, kept=true/1, entry=true/null/null/null, log=comp_entries.remove_gymnast_data(gymnasts=1)[], pii=0',
         array[v_d12m, v_tick, v_amt, v_done], $q$select public.comp_entry_remove_gymnast_data(%1$L)$q$, q_removed, false),
        (607, 'd08', 'HOG removes: completed, 2 gymnasts, entry notes', 'hog',
         'ok, blank=true, kept=true/1, entry=true/null/null/null, log=comp_entries.remove_gymnast_data(gymnasts=2)[notes], pii=0',
         array[v_d13m, v_tick, v_amt, v_g2, v_enote, v_done], $q$select public.comp_entry_remove_gymnast_data(%1$L)$q$, q_removed, false),
        (608, 'd09', 'RGM removes: withdrawn entry, withdrawn gymnast', 'rgm',
         'ok, blank=true, kept=true/1, entry=true/null/null/[removed], log=comp_entries.remove_gymnast_data(gymnasts=1)[withdrawal_note], pii=0',
         array[v_d13m, v_tick, v_amt, v_gwd, v_wd], $q$select public.comp_entry_remove_gymnast_data(%1$L)$q$, q_removed, false),
        (609, 'd10', 'HOG removes: declined entry with entry notes', 'hog',
         'ok, blank=true, kept=true/1, entry=true/null/[removed]/null, log=comp_entries.remove_gymnast_data(gymnasts=1)[decline_note,notes], pii=0',
         array[v_d13m, v_tick, v_amt, v_decl, v_enote], $q$select public.comp_entry_remove_gymnast_data(%1$L)$q$, q_removed, false),
        (610, 'd11', 'HOG removes twice', 'hog', '55000',
         array[v_d13m, v_done, v_rm1, v_rm2], $q$select public.comp_entry_remove_gymnast_data(%1$L)$q$, null, false),
        (611, 'd12', 'HOG removes from an unknown entry', 'hog', 'P0002',
         null, $q$select public.comp_entry_remove_gymnast_data(gen_random_uuid())$q$, null, false),
        (612, 'd13', 'Coach re-enters a name after removal (RLS with check)', 'coach', '42501',
         array[v_d13m, v_done, v_rm1, v_rm2], $q$update public.comp_entry_gymnasts set full_name = '0035 Yak Ocelot', dob = date '2012-11-30' where id = %7$L$q$, null, false),
        (613, 'd14', 'Deactivated HOG removes gymnast details', 'hog', '42501',
         array[v_d13m, v_done, $q$update public.profiles set active = false where id = %10$L$q$],
         $q$select public.comp_entry_remove_gymnast_data(%1$L)$q$, null, false)
      ) as x (ord, key, name, actor, expected, setup, action, post, reads)
      order by ord
    loop
      v_actor := case t.actor
                   when 'coach' then v_coach when 'chc' then v_chc when 'hog' then v_hog
                   when 'rgm' then v_rgm when 'hoo' then v_hoo when 'coach2' then v_coach2 end;

      if v_actor is null then
        v_actual := 'SKIPPED: no active ' || case t.actor
          when 'coach'  then 'Coach at a club site'
          when 'chc'    then 'Club Head Coach at the Coach''s site'
          when 'hog'    then 'Head of Gymnastics'
          when 'rgm'    then 'Regional General Manager'
          when 'hoo'    then 'Head of Operations'
          when 'coach2' then 'Coach at a second club site'
        end;
      else
        begin
          if t.setup is not null then
            foreach v_sql in array t.setup loop
              execute format(v_sql, v_en, v_ev, v_fl, v_fl2, v_x, v_x2, v_g, v_st,
                             v_who, v_hog, v_site, v_today, v_ev2, v_mark, v_mark0,
                             v_coach, v_chc, v_rgm);
            end loop;
          end if;

          select coalesce(max(id), 0) into v_mark from public.comp_activity_log;

          perform set_config(
            'request.jwt.claims',
            json_build_object('sub', v_actor, 'role', 'authenticated')::text,
            true);
          set local role authenticated;
          if t.reads then
            execute format(t.action, v_en, v_ev, v_fl, v_fl2, v_x, v_x2, v_g, v_st,
                           v_who, v_hog, v_site, v_today, v_ev2, v_mark, v_mark0,
                           v_coach, v_chc, v_rgm)
              into v_actual;
            reset role;
          else
            execute format(t.action, v_en, v_ev, v_fl, v_fl2, v_x, v_x2, v_g, v_st,
                           v_who, v_hog, v_site, v_today, v_ev2, v_mark, v_mark0,
                           v_coach, v_chc, v_rgm);
            get diagnostics v_rows = row_count;
            reset role;

            if v_rows <> 1 then
              v_actual := v_rows || ' rows affected';
            elsif t.post is not null then
              execute format(t.post, v_en, v_ev, v_fl, v_fl2, v_x, v_x2, v_g, v_st,
                             v_who, v_hog, v_site, v_today, v_ev2, v_mark, v_mark0,
                             v_coach, v_chc, v_rgm)
                into v_actual;
            else
              v_actual := 'ok';
            end if;
          end if;

          raise exception using message = '0035-undo';
        exception
          when others then
            if sqlerrm <> '0035-undo' then
              v_actual := sqlstate || ': ' || sqlerrm;
            end if;
        end;
      end if;

      r := r || jsonb_build_array(jsonb_build_object(
        'ord', t.ord, 'check_name', t.key || ' ' || t.name,
        'expected', t.expected, 'actual', v_actual));
    end loop;

    raise exception using message = '0035-fixture-undo';
  exception
    when others then
      r := r || jsonb_build_array(jsonb_build_object(
        'ord', 0, 'check_name', 'B0 fixture built and every test ran',
        'expected', 'completed',
        'actual', case when sqlerrm = '0035-fixture-undo' then 'completed'
                       else 'error: ' || sqlstate || ': ' || sqlerrm end));
  end;

  perform set_config('comp35.results', r::text, false);
  perform set_config('comp35.before', v_before::text, false);
end
$$;

with
expected_columns (ord, col, typ) as (
  values (1, 'id', 'bigint'), (2, 'created_at', 'timestamp with time zone'),
         (3, 'tx_id', 'bigint'), (4, 'actor_id', 'uuid'), (5, 'table_name', 'text'),
         (6, 'op', 'text'), (7, 'row_id', 'uuid'), (8, 'row_key', 'jsonb'),
         (9, 'entry_id', 'uuid'), (10, 'event_id', 'uuid'), (11, 'site_id', 'uuid'),
         (12, 'action', 'text'), (13, 'changes', 'jsonb'), (14, 'redacted', 'text[]'),
         (15, 'detail', 'jsonb')
),
actual_columns (col, typ) as (
  select a.attname::text, format_type(a.atttypid, a.atttypmod)
  from pg_attribute a
  where a.attrelid = to_regclass('public.comp_activity_log')
    and a.attnum > 0 and not a.attisdropped
),
column_diff as (
  (select 'unexpected ' || col || ' ' || typ as d from actual_columns
   except select 'unexpected ' || col || ' ' || typ from expected_columns)
  union all
  (select 'missing ' || col || ' ' || typ from expected_columns
   except select 'missing ' || col || ' ' || typ from actual_columns)
),
privs (grantee, priv, expected) as (
  values ('authenticated', 'SELECT', true), ('authenticated', 'INSERT', false),
         ('authenticated', 'UPDATE', false), ('authenticated', 'DELETE', false),
         ('authenticated', 'TRUNCATE', false),
         ('service_role', 'SELECT', true), ('service_role', 'INSERT', false),
         ('service_role', 'UPDATE', false), ('service_role', 'DELETE', false),
         ('service_role', 'TRUNCATE', false),
         ('anon', 'SELECT', false), ('anon', 'INSERT', false),
         ('anon', 'UPDATE', false), ('anon', 'DELETE', false)
),
priv_check as (
  select p.grantee || ' ' || p.priv as name,
         has_table_privilege(p.grantee, 'public.comp_activity_log', p.priv) = p.expected as ok
  from privs p
  union all
  select 'public (any)',
         not exists (
           select 1 from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
           where c.oid = 'public.comp_activity_log'::regclass and a.grantee = 0)
),
fn as (
  select p.oid, p.prosecdef,
         coalesce(p.proconfig, '{}') @> array['search_path=""'] as empty_path,
         pg_get_userbyid(p.proowner) in ('postgres', 'supabase_admin', 'service_role') as trusted_owner,
         exists (
           select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
           where a.grantee = 0 and a.privilege_type = 'EXECUTE'
         ) as public_exec,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
  from pg_proc p
),
logger_fn as (
  select f.* from fn f where f.oid = to_regprocedure('public.comp_activity_log_write()')
),
removal_fn as (
  select f.* from fn f where f.oid = to_regprocedure('public.comp_entry_remove_gymnast_data(uuid)')
),
logged_tables (relname) as (
  values ('comp_events'), ('comp_event_sites'), ('comp_external_details'),
         ('comp_entries'), ('comp_entry_fee_levels'), ('comp_entry_extras'),
         ('comp_entry_gymnasts'), ('comp_entry_gymnast_extras'), ('comp_entry_staff')
),
log_triggers as (
  select c.relname::text as tbl, t.tgname::text as tgname, t.tgtype
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  where not t.tgisinternal
    and t.tgfoid = to_regprocedure('public.comp_activity_log_write()')
),
trigger_check as (
  select l.relname,
         exists (
           select 1 from log_triggers lt
           where lt.tbl = l.relname
             and lt.tgname = l.relname || '_activity_log'
             and lt.tgtype = 29  -- ROW (1) + INSERT (4) + DELETE (8) + UPDATE (16), AFTER
         ) as ok
  from logged_tables l
),
all_triggers as (
  select count(*) as n
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  where not t.tgisinternal
    and c.relnamespace = 'public'::regnamespace
    and c.relname in (select relname from logged_tables)
),
log_fks as (
  select a.attname::text as col, k.confrelid, k.confdeltype
  from pg_constraint k
  join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
  where k.conrelid = to_regclass('public.comp_activity_log') and k.contype = 'f'
),
titles (job_title) as (
  values ('Coach'), ('Lead Coach'), ('Club Head Coach'),
         ('Regional General Manager'), ('Head of Gymnastics'), ('Head of Operations')
),
caps (cap) as (
  values ('view_all_sites'), ('all_sites_scope'), ('publish_whats_new'),
         ('manage_policies'), ('manage_users'), ('edit_rota'),
         ('manage_club_meetings'), ('manage_club_updates'), ('manage_club_roles'),
         ('manage_comp_events'),
         ('edit_comp_entries'), ('sign_off_competitions'), ('approve_judges'),
         ('confirm_comp_pricing'),
         ('remove_comp_gymnast_data')
),
expected_pairs (cap, job_title) as (
  select c.cap, t.job_title
  from (values ('view_all_sites'), ('all_sites_scope'), ('publish_whats_new'),
               ('manage_policies'), ('manage_users'), ('manage_comp_events')) c (cap)
  cross join (values ('Regional General Manager'), ('Head of Gymnastics'),
                     ('Head of Operations')) t (job_title)
  union all
  select c.cap, t.job_title
  from (values ('edit_rota'), ('manage_club_meetings'), ('manage_club_updates')) c (cap)
  cross join (values ('Lead Coach'), ('Club Head Coach'), ('Regional General Manager'),
                     ('Head of Gymnastics'), ('Head of Operations')) t (job_title)
  union all
  select 'manage_club_roles', t.job_title
  from (values ('Club Head Coach'), ('Regional General Manager'),
               ('Head of Gymnastics'), ('Head of Operations')) t (job_title)
  union all
  select 'edit_comp_entries', t.job_title from titles t
  union all
  select 'sign_off_competitions', 'Head of Gymnastics'
  union all
  select 'approve_judges', t.job_title
  from (values ('Regional General Manager'), ('Head of Gymnastics')) t (job_title)
  union all
  select 'confirm_comp_pricing', t.job_title
  from (values ('Club Head Coach'), ('Head of Gymnastics')) t (job_title)
  union all
  select 'remove_comp_gymnast_data', t.job_title
  from (values ('Regional General Manager'), ('Head of Gymnastics')) t (job_title)
),
actual_pairs (cap, job_title) as (
  select c.cap, t.job_title
  from caps c cross join titles t
  where public.title_has_capability(t.job_title, c.cap)
),
pair_diff as (
  (select 'unexpected ' || cap || ' -> ' || job_title as d from actual_pairs
   except select 'unexpected ' || cap || ' -> ' || job_title from expected_pairs)
  union all
  (select 'missing ' || cap || ' -> ' || job_title from expected_pairs
   except select 'missing ' || cap || ' -> ' || job_title from actual_pairs)
),
results as (
  select x.ord, x.check_name, x.expected, x.actual
  from jsonb_to_recordset(coalesce(nullif(current_setting('comp35.results', true), ''), '[]')::jsonb)
       as x (ord int, check_name text, expected text, actual text)
),
before_counts as (
  select coalesce(nullif(current_setting('comp35.before', true), ''), '{}')::jsonb as b
),
after_counts (tbl, n) as (
  values ('comp_events', (select count(*) from public.comp_events)),
         ('comp_event_sites', (select count(*) from public.comp_event_sites)),
         ('comp_external_details', (select count(*) from public.comp_external_details)),
         ('comp_entries', (select count(*) from public.comp_entries)),
         ('comp_entry_fee_levels', (select count(*) from public.comp_entry_fee_levels)),
         ('comp_entry_extras', (select count(*) from public.comp_entry_extras)),
         ('comp_entry_gymnasts', (select count(*) from public.comp_entry_gymnasts)),
         ('comp_entry_gymnast_extras', (select count(*) from public.comp_entry_gymnast_extras)),
         ('comp_entry_staff', (select count(*) from public.comp_entry_staff)),
         ('comp_activity_log', (select count(*) from public.comp_activity_log))
),
checks as (
  select 0 as ord, 'B0 test results recorded' as check_name, 'yes' as expected,
         case when (select count(*) from results) > 1 then 'yes (' || (select count(*) from results) || ' rows)'
              else 'no: run the DO block in the same paste' end as actual,
         (select count(*) from results) > 1 as pass
  union all
  select 10, 'B1 comp_activity_log columns and types', '15, no differences',
         (select count(*) from actual_columns)::text
           || coalesce(' / ' || (select string_agg(d, '; ' order by d) from column_diff), ', no differences'),
         (select count(*) from actual_columns) = 15 and not exists (select 1 from column_diff)
  union all
  select 20, 'B2 RLS on, 1 policy, select only', 'rls=true, policies=1, select=1',
         'rls=' || coalesce((select c.relrowsecurity::text from pg_class c
                             where c.oid = to_regclass('public.comp_activity_log')), 'missing')
           || ', policies=' || (select count(*) from pg_policy p
                                where p.polrelid = to_regclass('public.comp_activity_log'))
           || ', select=' || (select count(*) from pg_policy p
                              where p.polrelid = to_regclass('public.comp_activity_log') and p.polcmd = 'r'),
         coalesce((select c.relrowsecurity from pg_class c
                   where c.oid = to_regclass('public.comp_activity_log')), false)
           and (select count(*) from pg_policy p
                where p.polrelid = to_regclass('public.comp_activity_log')) = 1
           and (select count(*) from pg_policy p
                where p.polrelid = to_regclass('public.comp_activity_log') and p.polcmd = 'r') = 1
  union all
  select 30, 'B3 log grants: select only (authenticated, service_role); nothing for anon or public', 'all as expected',
         coalesce('wrong: ' || string_agg(name, ', ') filter (where not ok), 'all as expected'),
         bool_and(ok)
  from priv_check
  union all
  select 40, 'B4 logger: definer, search_path '''', trusted owner, no EXECUTE for public/anon/authenticated', 'ok',
         coalesce((select case when prosecdef and empty_path and trusted_owner
                                    and not public_exec and not anon_exec and not auth_exec
                               then 'ok' else 'wrong' end from logger_fn), 'missing'),
         coalesce((select prosecdef and empty_path and trusted_owner
                          and not public_exec and not anon_exec and not auth_exec from logger_fn), false)
  union all
  select 50, 'B5 removal RPC: definer, search_path '''', trusted owner, authenticated only', 'ok',
         coalesce((select case when prosecdef and empty_path and trusted_owner
                                    and not public_exec and not anon_exec and auth_exec
                               then 'ok' else 'wrong' end from removal_fn), 'missing'),
         coalesce((select prosecdef and empty_path and trusted_owner
                          and not public_exec and not anon_exec and auth_exec from removal_fn), false)
  union all
  select 60, 'B6 the 9 logger triggers; 24 triggers in all on the 9 tables', '9 / 24',
         (select count(*) filter (where ok) from trigger_check)::text
           || coalesce(' (failing: ' || (select string_agg(relname, ', ') from trigger_check where not ok) || ')', '')
           || ' / ' || (select n from all_triggers)::text,
         (select count(*) filter (where ok) from trigger_check) = 9
           and (select count(*) from log_triggers) = 9
           and (select n from all_triggers) = 24
  union all
  select 70, 'B7 log foreign keys: actor_id -> profiles on delete set null only', 'actor_id',
         coalesce((select string_agg(col, ', ' order by col) from log_fks), 'none'),
         (select count(*) from log_fks) = 1
           and exists (select 1 from log_fks
                       where col = 'actor_id' and confrelid = 'public.profiles'::regclass
                         and confdeltype = 'n')
  union all
  select 80, 'B8 capability matrix (15 capabilities, 50 pairs) and my_capabilities()', '50, no differences, listed',
         (select count(*) from actual_pairs)::text
           || coalesce(' / ' || (select string_agg(d, '; ' order by d) from pair_diff), ', no differences')
           || case when pg_get_functiondef('public.my_capabilities()'::regprocedure)
                        like '%''remove_comp_gymnast_data''%'
                   then ', listed' else ', NOT listed' end,
         (select count(*) from actual_pairs) = 50
           and not exists (select 1 from pair_diff)
           and pg_get_functiondef('public.my_capabilities()'::regprocedure)
                 like '%''remove_comp_gymnast_data''%'
  union all
  select 1000 + res.ord, res.check_name, res.expected, res.actual,
         case
           when res.actual like 'SKIPPED%' then null
           else split_part(res.actual, ': ', 1) = res.expected
         end
  from results res
  union all
  select 90000, 'B9 no rows left behind (' || a.tbl || ')',
         coalesce((select b ->> a.tbl from before_counts), '?'),
         a.n::text,
         a.n::text = (select b ->> a.tbl from before_counts)
  from after_counts a
)
select check_name, expected, actual, pass
from checks
order by ord, check_name;
