-- NWG Coaches Hub — Competitions phase 3d (0033): verification
--
-- Companion to supabase/migrations/0033_comp_entry_transitions.sql. Written,
-- not executed.
--
-- ---------------------------------------------------------------------------
-- PASTE ORDER
-- ---------------------------------------------------------------------------
--
--   Paste A  -> run BEFORE 0033
--   apply    supabase/migrations/0033_comp_entry_transitions.sql
--   Paste B  -> run AFTER 0033
--
-- Paste each one into the Supabase SQL Editor on its own, as the editor's
-- default role (postgres). Each returns ONE result table:
--
--   check_name | expected | actual | pass
--
-- Paste A is a single query. Paste B is a DO block (the tests) followed by
-- the result query, as in the 0032 verification; paste both together. The
-- editor shows only the last statement's result, which is the result query.
-- (Impersonating a user needs SET LOCAL ROLE inside plpgsql, which a single
-- SELECT can't do.)
--
-- A good run shows pass = true on every check row. Rows with pass = null are
-- either "info" rows (Paste A, to read) or SKIPPED tests: a test is skipped,
-- not failed, when the job title it needs has no suitable active profile.
--
-- Do not apply 0033 if Paste A has a failing row. 0033's guards repeat A1-A5
-- and would abort anyway.
--
-- What each check means:
--
--   Paste A
--     A1   none of the 20 functions 0033 creates exists yet
--     A2   no trigger on any of the 7 comp entry tables
--     A3   comp_entries has no withdrawn_by / withdrawn_at / withdrawal_note
--     A4   the 7 comp entry tables (0032) exist with RLS enabled
--     A5   the 4 comp entry capabilities resolve to their 0032 titles
--     A6   the helpers 0033 calls exist
--     A7   you are running as postgres (0033's functions must be owned by a
--          trusted role)
--     info rows in each comp entry table (expected 0: no app code writes to
--          them before 0034)
--     info the profiles Paste B will impersonate: whether each exists (no
--          names). Anything missing here is SKIPPED in Paste B.
--
--   Paste B
--     B0   the test fixture was built and every test ran
--     B1   the 14 RPCs: security definer, search_path '', trusted owner,
--          EXECUTE for authenticated only (not public, not anon)
--     B2   the 2 internal helpers: security definer, search_path '', trusted
--          owner, no EXECUTE for authenticated or anon
--     B3   the 4 trigger functions: 3 invoker + comp_entry_clear_pricing
--          definer, search_path '', trusted owner, no EXECUTE for anon
--     B4   exactly the 14 triggers, on the right tables and functions
--     B5   the withdrawal columns, their 2 checks, index and FK
--     g..  guard on comp_entries (direct changes to gated columns)
--     r..  request sign-off
--     s..  sign off
--     d..  decline
--     p..  confirm pricing and the automatic clearing
--     o..  PO request sent
--     l..  the gymnast / price lock from the PO request onward
--     n..  record / correct PO number
--     e..  entered, organiser paid, complete
--     w..  withdraw
--     u..  the 3 undo actions
--     j..  judge approval and the staff guard
--     x..  not found
--     B9   no rows left behind (row counts of the 9 comp tables are the same
--          before and after the DO block)


-- ===========================================================================
-- PASTE A — before 0033
-- ===========================================================================

with
titles (ord, job_title) as (
  values (1, 'Coach'), (2, 'Lead Coach'), (3, 'Club Head Coach'),
         (4, 'Regional General Manager'), (5, 'Head of Gymnastics'), (6, 'Head of Operations')
),
caps (ord, cap, expected) as (
  values
    (1, 'edit_comp_entries',     'Coach, Lead Coach, Club Head Coach, Regional General Manager, Head of Gymnastics, Head of Operations'),
    (2, 'sign_off_competitions', 'Head of Gymnastics'),
    (3, 'approve_judges',        'Regional General Manager, Head of Gymnastics'),
    (4, 'confirm_comp_pricing',  'Club Head Coach, Head of Gymnastics')
),
matrix as (
  select c.ord, c.cap, c.expected,
         coalesce(string_agg(t.job_title, ', ' order by t.ord)
                  filter (where public.title_has_capability(t.job_title, c.cap)), '(none)') as actual
  from caps c cross join titles t
  group by c.ord, c.cap, c.expected
),
entry_tables (relname) as (
  values ('comp_external_details'), ('comp_entries'), ('comp_entry_fee_levels'),
         ('comp_entry_extras'), ('comp_entry_gymnasts'), ('comp_entry_gymnast_extras'),
         ('comp_entry_staff')
),
new_functions (proname) as (
  values ('comp_entry_for_action'), ('comp_entry_assert_signoff_ready'),
         ('comp_entry_request_signoff'), ('comp_entry_sign_off'), ('comp_entry_decline'),
         ('comp_entry_confirm_pricing'), ('comp_entry_po_request_sent'),
         ('comp_entry_record_po_number'), ('comp_entry_mark_entered'),
         ('comp_entry_mark_organiser_paid'), ('comp_entry_complete'), ('comp_entry_withdraw'),
         ('comp_entry_approve_judge'), ('comp_entry_undo_po_request'),
         ('comp_entry_undo_entered'), ('comp_entry_undo_organiser_paid'),
         ('comp_entries_guard'), ('comp_entry_staff_guard'), ('comp_entry_lock_guard'),
         ('comp_entry_clear_pricing')
),
deps (name, present) as (
  values
    ('is_active_coach()',      to_regprocedure('public.is_active_coach()') is not null),
    ('has_capability()',       to_regprocedure('public.has_capability(text)') is not null),
    ('has_site_capability()',  to_regprocedure('public.has_site_capability(text, uuid)') is not null),
    ('title_has_capability()', to_regprocedure('public.title_has_capability(text, text)') is not null),
    ('comp_events',            to_regclass('public.comp_events') is not null),
    ('profiles',               to_regclass('public.profiles') is not null),
    ('rota_sites',             to_regclass('public.rota_sites') is not null)
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
         'A1 functions 0033 creates' as check_name,
         '0' as expected,
         count(*)::text || coalesce(': ' || string_agg(p.proname::text, ', ' order by p.proname), '') as actual,
         count(*) = 0 as pass
  from pg_proc p
  join new_functions f on f.proname = p.proname
  where p.pronamespace = 'public'::regnamespace
  union all
  select 20, 0, 'A2 triggers on the 7 comp entry tables', '0',
         count(*)::text || coalesce(': ' || string_agg(t.tgname::text, ', ' order by t.tgname), ''),
         count(*) = 0
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  where not t.tgisinternal
    and c.relnamespace = 'public'::regnamespace
    and c.relname in (select relname from entry_tables)
  union all
  select 30, 0, 'A3 withdrawal columns on comp_entries', '0',
         count(*)::text || coalesce(': ' || string_agg(c.column_name::text, ', ' order by c.column_name), ''),
         count(*) = 0
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'comp_entries'
    and c.column_name in ('withdrawn_by', 'withdrawn_at', 'withdrawal_note')
  union all
  select 40, 0, 'A4 the 7 comp entry tables exist with RLS', '7',
         count(*) filter (where c.relrowsecurity)::text
           || coalesce(' / missing or no RLS: ' || string_agg(e.relname, ', ' order by e.relname)
                                                     filter (where not coalesce(c.relrowsecurity, false)), ''),
         count(*) filter (where c.relrowsecurity) = 7
  from entry_tables e
  left join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = e.relname
  union all
  select 50, m.ord, 'A5 ' || m.cap, m.expected, m.actual, m.actual = m.expected
  from matrix m
  union all
  select 60, 0, 'A6 objects 0033 depends on', 'all present',
         coalesce('missing: ' || string_agg(name, ', ') filter (where not present), 'all present'),
         bool_and(present)
  from deps
  union all
  select 70, 0, 'A7 current_user (will own the 0033 functions)', 'postgres',
         current_user::text,
         current_user in ('postgres', 'supabase_admin', 'service_role')
  union all
  select 80, 0, 'info comp entry table rows', '0',
         (select count(*) from public.comp_external_details)::text || ' details, '
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
  select 90, 5, 'info Paste B: active Coach at a second club site', 'yes',
         case when exists (
                select 1 from public.profiles p
                join public.rota_sites s on s.name = p.site
                where p.active and p.job_title = 'Coach'
                  and s.name is distinct from (select site from club_coach)
              ) then 'yes' else 'NO: the other-site test will be SKIPPED' end,
         null
)
select check_name, expected, actual, pass
from checks
order by ord, sub;


-- ===========================================================================
-- PASTE B — after 0033
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
--   coach2  a Coach at a club site other than S
-- A test whose actor (or second required profile) doesn't exist records
-- "SKIPPED: ..." with pass = null.
--
-- Impersonation: set_config('request.jwt.claims', {sub, role}) so
-- auth.uid() returns the profile id, then SET LOCAL ROLE authenticated, the
-- role PostgREST uses. RLS, grants and the guards all apply as for the app.
--
-- Fixture (built as postgres inside an outer sub-block, at site S):
--   one external event (starts and ends today + 40), S attached, entry
--   deadline today + 10 (so a sign-off today is LATE: deadline - 28 is
--   before today); one draft entry; fee levels Opal (used) and Diamond
--   (unused); extras T-shirt (used) and Medal (unused); one gymnast on Opal
--   with the T-shirt; one judge (the Coach, or another active profile if
--   there is no Coach).
--
-- Each test runs in its own nested sub-block:
--   1. setup statements, as postgres (which the guards trust), put the
--      entry into the stage the test needs;
--   2. the action, as the impersonated user;
--   3. an optional post query, as postgres, reads the outcome;
--   4. a deliberate raise ('0033-undo') rolls all of it back, including the
--      SET LOCAL ROLE and the JWT claims.
-- An action that raises records "SQLSTATE: message"; the check passes when
-- the SQLSTATE is the expected one. An action that succeeds records "ok" (or
-- the post query's text), or "<n> rows affected" if it touched other than 1
-- row (an RLS refusal of an update shows as 0 rows). The outer sub-block
-- ends in a raise too, which rolls back the fixture. B9 checks nothing was
-- left behind.
--
-- Placeholders in the test SQL (format() positions):
--   %1$L entry       %2$L event        %3$L fee level Opal (used)
--   %4$L fee level Diamond (unused)    %5$L extra T-shirt (used)
--   %6$L extra Medal (unused)          %7$L gymnast     %8$L staff (judge)
--   %9$L "who" profile for setup *_by columns          %10$L HOG profile
--   %11$L site S     %12$L today (Europe/London)        %13$L spare event id

do $$
declare
  r jsonb := '[]'::jsonb;
  v_before jsonb;
  t record;
  v_sql text;
  v_actor uuid;
  v_missing text;
  v_actual text;
  v_rows bigint;
  v_today date := (now() at time zone 'Europe/London')::date;

  v_coach uuid;
  v_chc uuid;
  v_hog uuid;
  v_rgm uuid;
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

  -- Setup statements shared by many tests (run as postgres).
  v_aw   text := $q$update public.comp_entries set status = 'awaiting_signoff', signoff_requested_by = %9$L, signoff_requested_at = now() where id = %1$L$q$;
  v_col  text := $q$update public.comp_entries set status = 'collecting', signed_off_by = %9$L, signed_off_at = now() where id = %1$L$q$;
  v_conf text := $q$update public.comp_entries set pricing_confirmed_by = %9$L, pricing_confirmed_at = now() where id = %1$L$q$;
  v_tick text := $q$update public.comp_entry_gymnasts set debt_added = true, paid = true, marked_paid_bars = true where id = %7$L$q$;
  v_pos  text := $q$update public.comp_entries set status = 'po_request_sent', po_requested_by = %9$L, po_requested_at = now() where id = %1$L$q$;
  v_por  text := $q$update public.comp_entries set status = 'po_received', po_number = 'PO-OLD', po_received_by = %9$L, po_received_at = now() where id = %1$L$q$;
  v_ent  text := $q$update public.comp_entries set status = 'entered', po_number = 'PO-OLD', entered_by = %9$L, entered_at = now() where id = %1$L$q$;
  v_done text := $q$update public.comp_entries set status = 'completed', completed_by = %9$L, completed_at = now() where id = %1$L$q$;
  v_wd   text := $q$update public.comp_entries set status = 'withdrawn', withdrawn_by = %9$L, withdrawn_at = now(), withdrawal_note = 'test' where id = %1$L$q$;
  v_paid text := $q$update public.comp_entries set organiser_paid_by = %9$L, organiser_paid_at = now() where id = %1$L$q$;
  v_appr text := $q$update public.comp_entry_staff set judge_approved_by = %9$L, judge_approved_at = now() where id = %8$L$q$;
  v_gwd  text := $q$update public.comp_entry_gymnasts set withdrawn = true, withdrawn_note = 'test' where id = %7$L$q$;
  v_nofl text := $q$update public.comp_entry_gymnasts set fee_level_id = null where id = %7$L$q$;
  v_ev2a text := $q$insert into public.comp_events (id, title, event_type, start_date, end_date) values (%13$L, '0033 verification event 2', 'Invitational Competition', %12$L::date + 40, %12$L::date + 40)$q$;
  v_ev2b text := $q$insert into public.comp_event_sites (event_id, site_id) values (%13$L, %11$L)$q$;

  -- Post queries (run as postgres).
  q_status  text := $q$select 'ok, status=' || status from public.comp_entries where id = %1$L$q$;
  q_pricing text := $q$select case when pricing_confirmed_at is null then 'ok, pricing cleared' else 'ok, pricing kept' end from public.comp_entries where id = %1$L$q$;
  q_judge   text := $q$select case when judge_approved_at is null then 'ok, approval reset' else 'ok, approval kept' end from public.comp_entry_staff where id = %8$L$q$;
  q_confirmed text := $q$select 'ok, confirmed=' || (pricing_confirmed_at is not null) from public.comp_entries where id = %1$L$q$;
  q_approved  text := $q$select 'ok, approved=' || (judge_approved_at is not null) from public.comp_entry_staff where id = %8$L$q$;
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
    'comp_entry_staff', (select count(*) from public.comp_entry_staff)
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

  select p.id into v_coach2
  from public.profiles p
  join public.rota_sites s on s.name = p.site
  where p.active and p.job_title = 'Coach' and s.id is distinct from v_site
  order by p.created_at limit 1;

  v_who := coalesce(
    v_hog, v_coach,
    (select p.id from public.profiles p where p.active order by p.created_at limit 1));

  begin
    -- --- fixture (as postgres) ---------------------------------------------
    insert into public.comp_events (title, event_type, start_date, end_date)
    values ('0033 verification event', 'Invitational Competition', v_today + 40, v_today + 40)
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
    insert into public.comp_entry_gymnasts (entry_id, fee_level_id, full_name, dob)
    values (v_en, v_fl, '0033 Test Gymnast', date '2015-03-12') returning id into v_g;
    insert into public.comp_entry_gymnast_extras (entry_id, gymnast_id, extra_id)
    values (v_en, v_g, v_x);
    insert into public.comp_entry_staff (entry_id, profile_id, staff_role, transport)
    values (v_en, coalesce(v_coach, v_who), 'judge', 'carpool') returning id into v_st;

    -- --- tests ---------------------------------------------------------------
    for t in
      select * from (values
        -- guard on comp_entries
        (100, 'g01', 'Coach sets status directly', 'coach', null::text, '42501', null::text[],
         $q$update public.comp_entries set status = 'collecting' where id = %1$L$q$, null::text),
        (101, 'g02', 'Coach sets signed_off_by directly', 'coach', null, '42501', null,
         $q$update public.comp_entries set signed_off_by = %9$L, signed_off_at = now() where id = %1$L$q$, null),
        (102, 'g03', 'Coach sets po_number directly', 'coach', null, '42501', null,
         $q$update public.comp_entries set po_number = 'PO-DIRECT' where id = %1$L$q$, null),
        (103, 'g04', 'Coach sets data_removed_at directly', 'coach', null, '42501', null,
         $q$update public.comp_entries set data_removed_by = auth.uid(), data_removed_at = now() where id = %1$L$q$, null),
        (104, 'g05', 'Coach changes site_id directly', 'coach', null, '42501', null,
         $q$update public.comp_entries set site_id = gen_random_uuid() where id = %1$L$q$, null),
        (105, 'g06', 'Coach changes created_by directly', 'coach', null, '42501', null,
         $q$update public.comp_entries set created_by = null where id = %1$L$q$, null),
        (106, 'g07', 'Coach sets withdrawal_note directly', 'coach', null, '42501', null,
         $q$update public.comp_entries set withdrawal_note = 'direct' where id = %1$L$q$, null),
        (107, 'g08', 'Coach edits notes and judges_required', 'coach', null, 'ok', null,
         $q$update public.comp_entries set notes = '0033 test', judges_required = 2, updated_at = now() where id = %1$L$q$, null),
        (108, 'g09', 'Coach inserts an entry with withdrawal fields set', 'coach', null, '42501', array[v_ev2a, v_ev2b],
         $q$insert into public.comp_entries (event_id, site_id, withdrawn_by, withdrawn_at, withdrawal_note) values (%13$L, %11$L, auth.uid(), now(), 'test')$q$, null),
        (109, 'g10', 'Coach inserts a plain draft entry (control for g09)', 'coach', null, 'ok', array[v_ev2a, v_ev2b],
         $q$insert into public.comp_entries (event_id, site_id) values (%13$L, %11$L)$q$, null),
        (110, 'g11', 'Coach changes uplift_pct: pricing cleared', 'coach', null, 'ok, pricing cleared', array[v_conf],
         $q$update public.comp_entries set uplift_pct = 25 where id = %1$L$q$, q_pricing),
        (111, 'g12', 'Coach edits notes: pricing kept', 'coach', null, 'ok, pricing kept', array[v_conf],
         $q$update public.comp_entries set notes = '0033 test' where id = %1$L$q$, q_pricing),
        (112, 'g13', 'Coach deletes a draft entry with prices confirmed (cascades)', 'coach', null, 'ok', array[v_conf],
         $q$delete from public.comp_entries where id = %1$L$q$, null),

        -- request sign-off
        (200, 'r01', 'Request sign-off: a gymnast has no fee level', 'coach', null, '55000', array[v_nofl],
         $q$select public.comp_entry_request_signoff(%1$L)$q$, null),
        (201, 'r02', 'Request sign-off: no entry deadline', 'coach', null, '55000',
         array[$q$update public.comp_external_details set entry_deadline = null where event_id = %2$L$q$],
         $q$select public.comp_entry_request_signoff(%1$L)$q$, null),
        (202, 'r03', 'Request sign-off: every gymnast withdrawn', 'coach', null, '55000', array[v_gwd],
         $q$select public.comp_entry_request_signoff(%1$L)$q$, null),
        (203, 'r04', 'Coach requests sign-off on a ready draft', 'coach', null, 'ok, status=awaiting_signoff', null,
         $q$select public.comp_entry_request_signoff(%1$L)$q$, q_status),
        (204, 'r05', 'Coach resubmits a declined entry', 'coach', null, 'ok, status=awaiting_signoff, decline cleared=true',
         array[$q$update public.comp_entries set status = 'declined', declined_by = %9$L, declined_at = now(), decline_note = 'test' where id = %1$L$q$],
         $q$select public.comp_entry_request_signoff(%1$L)$q$,
         $q$select 'ok, status=' || status || ', decline cleared=' || (num_nulls(declined_by, declined_at, decline_note) = 3) from public.comp_entries where id = %1$L$q$),
        (205, 'r06', 'Request sign-off while collecting', 'coach', null, '55000', array[v_col],
         $q$select public.comp_entry_request_signoff(%1$L)$q$, null),
        (206, 'r07', 'Coach at another site requests sign-off', 'coach2', null, '42501', null,
         $q$select public.comp_entry_request_signoff(%1$L)$q$, null),

        -- sign off
        (300, 's01', 'Coach signs off', 'coach', null, '42501', array[v_aw],
         $q$select public.comp_entry_sign_off(%1$L, true)$q$, null),
        (301, 's02', 'RGM signs off', 'rgm', null, '42501', array[v_aw],
         $q$select public.comp_entry_sign_off(%1$L, true)$q$, null),
        (302, 's03', 'HOG signs off a late entry without acknowledging', 'hog', null, '22023', array[v_aw],
         $q$select public.comp_entry_sign_off(%1$L)$q$, null),
        (303, 's04', 'HOG signs off a late entry with acknowledgement', 'hog', null, 'ok, status=collecting, late_ack=true', array[v_aw],
         $q$select public.comp_entry_sign_off(%1$L, true)$q$,
         $q$select 'ok, status=' || status || ', late_ack=' || late_notice_acknowledged from public.comp_entries where id = %1$L$q$),
        (304, 's05', 'HOG signs off an on-time entry without acknowledging', 'hog', null, 'ok, status=collecting, late_ack=false',
         array[v_aw, $q$update public.comp_external_details set entry_deadline = %12$L::date + 60 where event_id = %2$L$q$],
         $q$select public.comp_entry_sign_off(%1$L)$q$,
         $q$select 'ok, status=' || status || ', late_ack=' || late_notice_acknowledged from public.comp_entries where id = %1$L$q$),
        (305, 's06', 'On-time sign-off passing acknowledgement stores false', 'hog', null, 'ok, status=collecting, late_ack=false',
         array[v_aw, $q$update public.comp_external_details set entry_deadline = %12$L::date + 60 where event_id = %2$L$q$],
         $q$select public.comp_entry_sign_off(%1$L, true)$q$,
         $q$select 'ok, status=' || status || ', late_ack=' || late_notice_acknowledged from public.comp_entries where id = %1$L$q$),
        (306, 's07', 'HOG signs off after a gymnast lost their fee level', 'hog', null, '55000', array[v_aw, v_nofl],
         $q$select public.comp_entry_sign_off(%1$L, true)$q$, null),
        (307, 's08', 'Deactivated HOG signs off', 'hog', null, '42501',
         array[v_aw, $q$update public.profiles set active = false where id = %10$L$q$],
         $q$select public.comp_entry_sign_off(%1$L, true)$q$, null),

        -- decline
        (400, 'd01', 'Coach declines', 'coach', null, '42501', array[v_aw],
         $q$select public.comp_entry_decline(%1$L, 'no')$q$, null),
        (401, 'd02', 'HOG declines with a blank note', 'hog', null, '22023', array[v_aw],
         $q$select public.comp_entry_decline(%1$L, '   ')$q$, null),
        (402, 'd03', 'HOG declines with a note', 'hog', null, 'ok, status=declined', array[v_aw],
         $q$select public.comp_entry_decline(%1$L, 'Too late to enter')$q$, q_status),
        (403, 'd04', 'HOG declines a draft', 'hog', null, '55000', null,
         $q$select public.comp_entry_decline(%1$L, 'no')$q$, null),

        -- confirm pricing and automatic clearing
        (500, 'p01', 'Coach confirms prices', 'coach', null, '42501', null,
         $q$select public.comp_entry_confirm_pricing(%1$L)$q$, null),
        (501, 'p02', 'Club Head Coach confirms prices at own site', 'chc', null, 'ok, confirmed=true', null,
         $q$select public.comp_entry_confirm_pricing(%1$L)$q$, q_confirmed),
        (502, 'p03', 'HOG confirms prices', 'hog', null, 'ok, confirmed=true', null,
         $q$select public.comp_entry_confirm_pricing(%1$L)$q$, q_confirmed),
        (503, 'p04', 'RGM confirms prices (all sites, but no capability)', 'rgm', null, '42501', null,
         $q$select public.comp_entry_confirm_pricing(%1$L)$q$, null),
        (504, 'p05', 'HOG confirms prices already confirmed', 'hog', null, '55000', array[v_conf],
         $q$select public.comp_entry_confirm_pricing(%1$L)$q$, null),
        (505, 'p06', 'HOG confirms prices on a withdrawn entry', 'hog', null, '55000', array[v_wd],
         $q$select public.comp_entry_confirm_pricing(%1$L)$q$, null),
        (506, 'p07', 'Coach changes a fee: pricing cleared', 'coach', null, 'ok, pricing cleared', array[v_conf],
         $q$update public.comp_entry_fee_levels set organiser_fee = 25 where id = %3$L$q$, q_pricing),
        (507, 'p08', 'Coach adds an extra: pricing cleared', 'coach', null, 'ok, pricing cleared', array[v_conf],
         $q$insert into public.comp_entry_extras (entry_id, label, price) values (%1$L, 'Programme', 3)$q$, q_pricing),
        (508, 'p09', 'Coach deletes an unused fee level: pricing cleared', 'coach', null, 'ok, pricing cleared', array[v_conf],
         $q$delete from public.comp_entry_fee_levels where id = %4$L$q$, q_pricing),
        (509, 'p10', 'Coach renames a fee level: pricing kept', 'coach', null, 'ok, pricing kept', array[v_conf],
         $q$update public.comp_entry_fee_levels set label = 'Opal (renamed)' where id = %3$L$q$, q_pricing),
        (510, 'p11', 'Coach changes an extra price: pricing cleared', 'coach', null, 'ok, pricing cleared', array[v_conf],
         $q$update public.comp_entry_extras set price = 12 where id = %5$L$q$, q_pricing),
        (511, 'p12', 'Coach adds a fee level: pricing cleared', 'coach', null, 'ok, pricing cleared', array[v_conf],
         $q$insert into public.comp_entry_fee_levels (entry_id, label, organiser_fee) values (%1$L, 'Crystal', 24)$q$, q_pricing),

        -- PO request sent
        (600, 'o01', 'PO request: not every gymnast paid', 'coach', null, '55000', array[v_col, v_conf],
         $q$select public.comp_entry_po_request_sent(%1$L)$q$, null),
        (601, 'o02', 'PO request: prices not confirmed', 'coach', null, '55000', array[v_col, v_tick],
         $q$select public.comp_entry_po_request_sent(%1$L)$q$, null),
        (602, 'o03', 'PO request: ready and confirmed', 'coach', null, 'ok, status=po_request_sent', array[v_col, v_tick, v_conf],
         $q$select public.comp_entry_po_request_sent(%1$L)$q$, q_status),
        (603, 'o04', 'PO request from draft', 'coach', null, '55000', array[v_tick, v_conf],
         $q$select public.comp_entry_po_request_sent(%1$L)$q$, null),
        (604, 'o05', 'PO request ignores an unpaid withdrawn gymnast', 'coach', null, 'ok, status=po_request_sent',
         array[v_col, v_tick, v_conf,
               $q$insert into public.comp_entry_gymnasts (entry_id, fee_level_id, full_name, dob, withdrawn, withdrawn_note) values (%1$L, %3$L, '0033 Test Gymnast 3', date '2014-01-01', true, 'test')$q$],
         $q$select public.comp_entry_po_request_sent(%1$L)$q$, q_status),

        -- lock from the PO request onward
        (700, 'l01', 'Locked: Coach adds a gymnast', 'coach', null, '55000', array[v_pos],
         $q$insert into public.comp_entry_gymnasts (entry_id, fee_level_id, full_name, dob) values (%1$L, %3$L, '0033 Test Gymnast 2', date '2015-01-01')$q$, null),
        (701, 'l02', 'Locked: Coach withdraws a gymnast', 'coach', null, 'ok, withdrawn=true', array[v_pos],
         $q$update public.comp_entry_gymnasts set withdrawn = true, withdrawn_note = 'Injury' where id = %7$L$q$,
         $q$select 'ok, withdrawn=' || withdrawn from public.comp_entry_gymnasts where id = %7$L$q$),
        (702, 'l03', 'Locked: Coach un-withdraws a gymnast', 'coach', null, '55000', array[v_gwd, v_pos],
         $q$update public.comp_entry_gymnasts set withdrawn = false, withdrawn_note = null where id = %7$L$q$, null),
        (703, 'l04', 'Locked: Coach changes a gymnast''s fee level', 'coach', null, '55000', array[v_pos],
         $q$update public.comp_entry_gymnasts set fee_level_id = %4$L where id = %7$L$q$, null),
        (704, 'l05', 'Locked: Coach removes a gymnast''s extra', 'coach', null, '55000', array[v_pos],
         $q$delete from public.comp_entry_gymnast_extras where gymnast_id = %7$L and extra_id = %5$L$q$, null),
        (705, 'l06', 'Locked: Coach adds an extra to a gymnast', 'coach', null, '55000', array[v_pos],
         $q$insert into public.comp_entry_gymnast_extras (entry_id, gymnast_id, extra_id) values (%1$L, %7$L, %6$L)$q$, null),
        (706, 'l07', 'Locked: Coach adds a fee level', 'coach', null, '55000', array[v_pos],
         $q$insert into public.comp_entry_fee_levels (entry_id, label, organiser_fee) values (%1$L, 'Crystal', 24)$q$, null),
        (707, 'l08', 'Locked: Coach changes a fee', 'coach', null, '55000', array[v_pos],
         $q$update public.comp_entry_fee_levels set organiser_fee = 25 where id = %3$L$q$, null),
        (708, 'l09', 'Locked: Coach deletes an unused fee level', 'coach', null, '55000', array[v_pos],
         $q$delete from public.comp_entry_fee_levels where id = %4$L$q$, null),
        (709, 'l10', 'Locked: Coach adds an extra', 'coach', null, '55000', array[v_pos],
         $q$insert into public.comp_entry_extras (entry_id, label, price) values (%1$L, 'Programme', 3)$q$, null),
        (710, 'l11', 'Locked: Coach changes an extra price', 'coach', null, '55000', array[v_pos],
         $q$update public.comp_entry_extras set price = 12 where id = %5$L$q$, null),
        (711, 'l12', 'Locked: Coach deletes an unused extra', 'coach', null, '55000', array[v_pos],
         $q$delete from public.comp_entry_extras where id = %6$L$q$, null),
        (712, 'l13', 'Locked: Coach edits payment fields and notes', 'coach', null, 'ok', array[v_pos],
         $q$update public.comp_entry_gymnasts set paid = true, amount_paid = 28.80, paid_date = %12$L::date, notes = '0033 test' where id = %7$L$q$, null),
        (713, 'l14', 'Locked: Coach renames a fee level', 'coach', null, 'ok', array[v_pos],
         $q$update public.comp_entry_fee_levels set label = 'Opal (renamed)' where id = %3$L$q$, null),
        (714, 'l15', 'Locked: changing a withdrawn gymnast''s fee level is allowed', 'coach', null, 'ok', array[v_gwd, v_pos],
         $q$update public.comp_entry_gymnasts set fee_level_id = %4$L where id = %7$L$q$, null),
        (715, 'l16', 'Locked at completed: Coach adds a gymnast', 'coach', null, '55000', array[v_done],
         $q$insert into public.comp_entry_gymnasts (entry_id, fee_level_id, full_name, dob) values (%1$L, %3$L, '0033 Test Gymnast 2', date '2015-01-01')$q$, null),
        (716, 'l17', 'Locked at withdrawn: Coach changes a fee', 'coach', null, '55000', array[v_wd],
         $q$update public.comp_entry_fee_levels set organiser_fee = 25 where id = %3$L$q$, null),
        (717, 'l18', 'Not locked while collecting: Coach adds a gymnast', 'coach', null, 'ok', array[v_col],
         $q$insert into public.comp_entry_gymnasts (entry_id, fee_level_id, full_name, dob) values (%1$L, %3$L, '0033 Test Gymnast 2', date '2015-01-01')$q$, null),

        -- record / correct PO number
        (800, 'n01', 'Record a blank PO number', 'coach', null, '22023', array[v_pos],
         $q$select public.comp_entry_record_po_number(%1$L, '  ')$q$, null),
        (801, 'n02', 'Record a PO number', 'coach', null, 'ok, status=po_received, po=PO-0033', array[v_pos],
         $q$select public.comp_entry_record_po_number(%1$L, '  PO-0033  ')$q$,
         $q$select 'ok, status=' || status || ', po=' || po_number from public.comp_entries where id = %1$L$q$),
        (802, 'n03', 'Correct the PO number once entered', 'coach', null, 'ok, status=entered, po=PO-0033B', array[v_ent],
         $q$select public.comp_entry_record_po_number(%1$L, 'PO-0033B')$q$,
         $q$select 'ok, status=' || status || ', po=' || po_number from public.comp_entries where id = %1$L$q$),
        (803, 'n04', 'Record a PO number while collecting', 'coach', null, '55000', array[v_col],
         $q$select public.comp_entry_record_po_number(%1$L, 'PO-0033')$q$, null),
        (804, 'n05', 'Record a PO number over 100 characters', 'coach', null, '22023', array[v_pos],
         $q$select public.comp_entry_record_po_number(%1$L, repeat('9', 101))$q$, null),

        -- entered, organiser paid, complete
        (900, 'e01', 'Mark entered after PO received', 'coach', null, 'ok, status=entered', array[v_por],
         $q$select public.comp_entry_mark_entered(%1$L)$q$, q_status),
        (901, 'e02', 'Mark entered while collecting', 'coach', null, '55000', array[v_col],
         $q$select public.comp_entry_mark_entered(%1$L)$q$, null),
        (902, 'e03', 'Organiser paid after PO received', 'coach', null, 'ok, organiser_paid=true', array[v_por],
         $q$select public.comp_entry_mark_organiser_paid(%1$L)$q$,
         $q$select 'ok, organiser_paid=' || (organiser_paid_at is not null) from public.comp_entries where id = %1$L$q$),
        (903, 'e04', 'Organiser paid while collecting', 'coach', null, '55000', array[v_col],
         $q$select public.comp_entry_mark_organiser_paid(%1$L)$q$, null),
        (904, 'e05', 'Organiser paid twice', 'coach', null, '55000', array[v_ent, v_paid],
         $q$select public.comp_entry_mark_organiser_paid(%1$L)$q$, null),
        (905, 'e06', 'Complete before the competition ends', 'coach', null, '55000', array[v_ent],
         $q$select public.comp_entry_complete(%1$L)$q$, null),
        (906, 'e07', 'Complete on the competition''s last day', 'coach', null, 'ok, status=completed',
         array[v_ent, $q$update public.comp_events set start_date = %12$L::date, end_date = %12$L::date where id = %2$L$q$],
         $q$select public.comp_entry_complete(%1$L)$q$, q_status),
        (907, 'e08', 'Complete before being entered', 'coach', null, '55000',
         array[v_por, $q$update public.comp_events set start_date = %12$L::date - 1, end_date = %12$L::date - 1 where id = %2$L$q$],
         $q$select public.comp_entry_complete(%1$L)$q$, null),

        -- withdraw
        (1000, 'w01', 'Withdraw a draft', 'coach', null, '55000', null,
         $q$select public.comp_entry_withdraw(%1$L, 'test')$q$, null),
        (1001, 'w02', 'Withdraw with a blank reason', 'coach', null, '22023', array[v_col],
         $q$select public.comp_entry_withdraw(%1$L, '')$q$, null),
        (1002, 'w03', 'Withdraw with a reason', 'coach', null, 'ok, status=withdrawn, note=Club closed', array[v_col],
         $q$select public.comp_entry_withdraw(%1$L, '  Club closed  ')$q$,
         $q$select 'ok, status=' || status || ', note=' || withdrawal_note from public.comp_entries where id = %1$L$q$),
        (1003, 'w04', 'Withdraw a completed entry', 'coach', null, '55000', array[v_done],
         $q$select public.comp_entry_withdraw(%1$L, 'test')$q$, null),

        -- undo
        (1100, 'u01', 'Undo the PO request', 'coach', null, 'ok, status=collecting, po_requested cleared=true', array[v_pos],
         $q$select public.comp_entry_undo_po_request(%1$L)$q$,
         $q$select 'ok, status=' || status || ', po_requested cleared=' || (num_nulls(po_requested_by, po_requested_at) = 2) from public.comp_entries where id = %1$L$q$),
        (1101, 'u02', 'Undo the PO request after the PO number', 'coach', null, '55000', array[v_por],
         $q$select public.comp_entry_undo_po_request(%1$L)$q$, null),
        (1102, 'u03', 'Undo entered', 'coach', null, 'ok, status=po_received, entered cleared=true', array[v_ent],
         $q$select public.comp_entry_undo_entered(%1$L)$q$,
         $q$select 'ok, status=' || status || ', entered cleared=' || (num_nulls(entered_by, entered_at) = 2) from public.comp_entries where id = %1$L$q$),
        (1103, 'u04', 'Undo entered after completion', 'coach', null, '55000', array[v_done],
         $q$select public.comp_entry_undo_entered(%1$L)$q$, null),
        (1104, 'u05', 'Undo organiser paid', 'coach', null, 'ok, organiser_paid=false', array[v_por, v_paid],
         $q$select public.comp_entry_undo_organiser_paid(%1$L)$q$,
         $q$select 'ok, organiser_paid=' || (organiser_paid_at is not null) from public.comp_entries where id = %1$L$q$),
        (1105, 'u06', 'Undo organiser paid when not paid', 'coach', null, '55000', array[v_por],
         $q$select public.comp_entry_undo_organiser_paid(%1$L)$q$, null),

        -- judges
        (1200, 'j01', 'Coach approves a judge directly', 'coach', null, '42501', null,
         $q$update public.comp_entry_staff set judge_approved_by = auth.uid(), judge_approved_at = now() where id = %8$L$q$, null),
        (1201, 'j02', 'Coach calls Approve judge', 'coach', null, '42501', null,
         $q$select public.comp_entry_approve_judge(%8$L)$q$, null),
        (1202, 'j03', 'RGM approves a judge', 'rgm', null, 'ok, approved=true', null,
         $q$select public.comp_entry_approve_judge(%8$L)$q$, q_approved),
        (1203, 'j04', 'HOG approves a judge', 'hog', null, 'ok, approved=true', null,
         $q$select public.comp_entry_approve_judge(%8$L)$q$, q_approved),
        (1204, 'j05', 'HOG approves a judge twice', 'hog', null, '55000', array[v_appr],
         $q$select public.comp_entry_approve_judge(%8$L)$q$, null),
        (1205, 'j06', 'HOG approves a coach (not a judge)', 'hog', null, '55000',
         array[$q$update public.comp_entry_staff set staff_role = 'coach' where id = %8$L$q$],
         $q$select public.comp_entry_approve_judge(%8$L)$q$, null),
        (1206, 'j07', 'Coach swaps an approved judge''s person: approval reset', 'coach', 'hog', 'ok, approval reset', array[v_appr],
         $q$update public.comp_entry_staff set profile_id = %10$L where id = %8$L$q$, q_judge),
        (1207, 'j08', 'Coach makes an approved judge a coach: approval reset', 'coach', null, 'ok, approval reset', array[v_appr],
         $q$update public.comp_entry_staff set staff_role = 'coach' where id = %8$L$q$, q_judge),
        (1208, 'j09', 'Coach edits an approved judge''s transport: approval kept', 'coach', null, 'ok, approval kept', array[v_appr],
         $q$update public.comp_entry_staff set transport = 'own_car' where id = %8$L$q$, q_judge),
        (1209, 'j10', 'HOG approves a judge on a withdrawn entry', 'hog', null, '55000', array[v_wd],
         $q$select public.comp_entry_approve_judge(%8$L)$q$, null),
        (1210, 'j11', 'HOG approves a judge whose account is deactivated', 'hog', 'coach', '55000',
         array[$q$update public.profiles set active = false where id = (select profile_id from public.comp_entry_staff where id = %8$L)$q$],
         $q$select public.comp_entry_approve_judge(%8$L)$q$, null),
        (1211, 'j12', 'HOG approves an unknown staff row', 'hog', null, 'P0002', null,
         $q$select public.comp_entry_approve_judge(gen_random_uuid())$q$, null),

        -- not found
        (1300, 'x01', 'HOG signs off an unknown entry', 'hog', null, 'P0002', null,
         $q$select public.comp_entry_sign_off(gen_random_uuid(), true)$q$, null)
      ) as x (ord, key, name, actor, also, expected, setup, action, post)
      order by ord
    loop
      v_actor := case t.actor
                   when 'coach' then v_coach when 'chc' then v_chc when 'hog' then v_hog
                   when 'rgm' then v_rgm when 'coach2' then v_coach2 end;
      v_missing := case
        when v_actor is null then t.actor
        when t.also = 'hog' and v_hog is null then 'hog'
        when t.also = 'coach' and v_coach is null then 'coach'
      end;

      if v_missing is not null then
        v_actual := 'SKIPPED: no active ' || case v_missing
          when 'coach'  then 'Coach at a club site'
          when 'chc'    then 'Club Head Coach at the Coach''s site'
          when 'hog'    then 'Head of Gymnastics'
          when 'rgm'    then 'Regional General Manager'
          when 'coach2' then 'Coach at a second club site'
        end;
      else
        begin
          if t.setup is not null then
            foreach v_sql in array t.setup loop
              execute format(v_sql, v_en, v_ev, v_fl, v_fl2, v_x, v_x2, v_g, v_st,
                             v_who, v_hog, v_site, v_today, v_ev2);
            end loop;
          end if;

          perform set_config(
            'request.jwt.claims',
            json_build_object('sub', v_actor, 'role', 'authenticated')::text,
            true);
          set local role authenticated;
          execute format(t.action, v_en, v_ev, v_fl, v_fl2, v_x, v_x2, v_g, v_st,
                         v_who, v_hog, v_site, v_today, v_ev2);
          get diagnostics v_rows = row_count;
          reset role;

          if v_rows <> 1 then
            v_actual := v_rows || ' rows affected';
          elsif t.post is not null then
            execute format(t.post, v_en, v_ev, v_fl, v_fl2, v_x, v_x2, v_g, v_st,
                           v_who, v_hog, v_site, v_today, v_ev2)
              into v_actual;
          else
            v_actual := 'ok';
          end if;

          raise exception using message = '0033-undo';
        exception
          when others then
            if sqlerrm <> '0033-undo' then
              v_actual := sqlstate || ': ' || sqlerrm;
            end if;
        end;
      end if;

      r := r || jsonb_build_array(jsonb_build_object(
        'ord', t.ord, 'check_name', t.key || ' ' || t.name,
        'expected', t.expected, 'actual', v_actual));
    end loop;

    raise exception using message = '0033-fixture-undo';
  exception
    when others then
      r := r || jsonb_build_array(jsonb_build_object(
        'ord', 0, 'check_name', 'B0 fixture built and every test ran',
        'expected', 'completed',
        'actual', case when sqlerrm = '0033-fixture-undo' then 'completed'
                       else 'error: ' || sqlstate || ': ' || sqlerrm end));
  end;

  perform set_config('comp33.results', r::text, false);
  perform set_config('comp33.before', v_before::text, false);
end
$$;

with
rpcs (sig) as (
  values ('public.comp_entry_request_signoff(uuid)'),
         ('public.comp_entry_sign_off(uuid, boolean)'),
         ('public.comp_entry_decline(uuid, text)'),
         ('public.comp_entry_confirm_pricing(uuid)'),
         ('public.comp_entry_po_request_sent(uuid)'),
         ('public.comp_entry_record_po_number(uuid, text)'),
         ('public.comp_entry_mark_entered(uuid)'),
         ('public.comp_entry_mark_organiser_paid(uuid)'),
         ('public.comp_entry_complete(uuid)'),
         ('public.comp_entry_withdraw(uuid, text)'),
         ('public.comp_entry_approve_judge(uuid)'),
         ('public.comp_entry_undo_po_request(uuid)'),
         ('public.comp_entry_undo_entered(uuid)'),
         ('public.comp_entry_undo_organiser_paid(uuid)')
),
helpers (sig) as (
  values ('public.comp_entry_for_action(uuid, text, text, boolean)'),
         ('public.comp_entry_assert_signoff_ready(uuid, uuid)')
),
trigger_fns (sig, definer) as (
  values ('public.comp_entries_guard()', false),
         ('public.comp_entry_staff_guard()', false),
         ('public.comp_entry_lock_guard()', false),
         ('public.comp_entry_clear_pricing()', true)
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
rpc_check as (
  select r.sig,
         coalesce(f.prosecdef and f.empty_path and f.trusted_owner
                  and not f.public_exec and not f.anon_exec and f.auth_exec, false) as ok
  from rpcs r left join fn f on f.oid = to_regprocedure(r.sig)
),
helper_check as (
  select h.sig,
         coalesce(f.prosecdef and f.empty_path and f.trusted_owner
                  and not f.public_exec and not f.anon_exec and not f.auth_exec, false) as ok
  from helpers h left join fn f on f.oid = to_regprocedure(h.sig)
),
trigger_fn_check as (
  select tf.sig,
         coalesce(f.prosecdef = tf.definer and f.empty_path and f.trusted_owner
                  and not f.public_exec and not f.anon_exec
                  and (not tf.definer or not f.auth_exec), false) as ok
  from trigger_fns tf left join fn f on f.oid = to_regprocedure(tf.sig)
),
expected_triggers (tbl, tgname, fn) as (
  values ('comp_entries', 'comp_entries_guard_insert', 'comp_entries_guard'),
         ('comp_entries', 'comp_entries_guard_update', 'comp_entries_guard'),
         ('comp_entry_staff', 'comp_entry_staff_guard', 'comp_entry_staff_guard'),
         ('comp_entry_fee_levels', 'comp_entry_fee_levels_clear_pricing', 'comp_entry_clear_pricing'),
         ('comp_entry_fee_levels', 'comp_entry_fee_levels_clear_pricing_update', 'comp_entry_clear_pricing'),
         ('comp_entry_extras', 'comp_entry_extras_clear_pricing', 'comp_entry_clear_pricing'),
         ('comp_entry_extras', 'comp_entry_extras_clear_pricing_update', 'comp_entry_clear_pricing'),
         ('comp_entry_gymnasts', 'comp_entry_gymnasts_lock_insert', 'comp_entry_lock_guard'),
         ('comp_entry_gymnasts', 'comp_entry_gymnasts_lock_update', 'comp_entry_lock_guard'),
         ('comp_entry_gymnast_extras', 'comp_entry_gymnast_extras_lock', 'comp_entry_lock_guard'),
         ('comp_entry_fee_levels', 'comp_entry_fee_levels_lock', 'comp_entry_lock_guard'),
         ('comp_entry_fee_levels', 'comp_entry_fee_levels_lock_update', 'comp_entry_lock_guard'),
         ('comp_entry_extras', 'comp_entry_extras_lock', 'comp_entry_lock_guard'),
         ('comp_entry_extras', 'comp_entry_extras_lock_update', 'comp_entry_lock_guard')
),
actual_triggers (tbl, tgname, fn) as (
  select c.relname::text, t.tgname::text, p.proname::text
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_proc p on p.oid = t.tgfoid
  where not t.tgisinternal
    and c.relnamespace = 'public'::regnamespace
    and c.relname in ('comp_external_details', 'comp_entries', 'comp_entry_fee_levels',
                      'comp_entry_extras', 'comp_entry_gymnasts', 'comp_entry_gymnast_extras',
                      'comp_entry_staff')
),
trigger_diff as (
  (select 'unexpected ' || tbl || '.' || tgname || ' -> ' || fn as d from actual_triggers
   except select 'unexpected ' || tbl || '.' || tgname || ' -> ' || fn from expected_triggers)
  union all
  (select 'missing ' || tbl || '.' || tgname || ' -> ' || fn from expected_triggers
   except select 'missing ' || tbl || '.' || tgname || ' -> ' || fn from actual_triggers)
),
schema_bits (name, present) as (
  values
    ('withdrawn_by uuid', exists (
       select 1 from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = 'comp_entries'
         and c.column_name = 'withdrawn_by' and c.data_type = 'uuid')),
    ('withdrawn_at timestamptz', exists (
       select 1 from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = 'comp_entries'
         and c.column_name = 'withdrawn_at' and c.data_type = 'timestamp with time zone')),
    ('withdrawal_note text', exists (
       select 1 from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = 'comp_entries'
         and c.column_name = 'withdrawal_note' and c.data_type = 'text')),
    ('comp_entries_withdrawn_pair_check', exists (
       select 1 from pg_constraint k
       where k.conrelid = 'public.comp_entries'::regclass
         and k.conname = 'comp_entries_withdrawn_pair_check' and k.contype = 'c')),
    ('comp_entries_withdrawal_note_check', exists (
       select 1 from pg_constraint k
       where k.conrelid = 'public.comp_entries'::regclass
         and k.conname = 'comp_entries_withdrawal_note_check' and k.contype = 'c')),
    ('comp_entries_withdrawn_by_idx', to_regclass('public.comp_entries_withdrawn_by_idx') is not null),
    ('withdrawn_by -> profiles on delete set null', exists (
       select 1 from pg_constraint k
       join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
       where k.conrelid = 'public.comp_entries'::regclass and k.contype = 'f'
         and a.attname = 'withdrawn_by' and k.confrelid = 'public.profiles'::regclass
         and k.confdeltype = 'n'))
),
results as (
  select x.ord, x.check_name, x.expected, x.actual
  from jsonb_to_recordset(coalesce(nullif(current_setting('comp33.results', true), ''), '[]')::jsonb)
       as x (ord int, check_name text, expected text, actual text)
),
before_counts as (
  select coalesce(nullif(current_setting('comp33.before', true), ''), '{}')::jsonb as b
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
         ('comp_entry_staff', (select count(*) from public.comp_entry_staff))
),
checks as (
  select 0 as ord, 'B0 test results recorded' as check_name, 'yes' as expected,
         case when (select count(*) from results) > 1 then 'yes (' || (select count(*) from results) || ' rows)'
              else 'no: run the DO block in the same paste' end as actual,
         (select count(*) from results) > 1 as pass
  union all
  select 10, 'B1 the 14 RPCs: definer, search_path '''', trusted owner, authenticated only', '14',
         count(*) filter (where ok)::text
           || coalesce(' / failing: ' || string_agg(sig, ', ') filter (where not ok), ''),
         count(*) filter (where ok) = 14
  from rpc_check
  union all
  select 20, 'B2 the 2 internal helpers: definer, search_path '''', trusted owner, no EXECUTE for authenticated or anon', '2',
         count(*) filter (where ok)::text
           || coalesce(' / failing: ' || string_agg(sig, ', ') filter (where not ok), ''),
         count(*) filter (where ok) = 2
  from helper_check
  union all
  select 30, 'B3 the 4 trigger functions: 3 invoker + clear_pricing definer, search_path '''', trusted owner', '4',
         count(*) filter (where ok)::text
           || coalesce(' / failing: ' || string_agg(sig, ', ') filter (where not ok), ''),
         count(*) filter (where ok) = 4
  from trigger_fn_check
  union all
  select 40, 'B4 the 14 triggers on the comp entry tables', '14, no differences',
         (select count(*) from actual_triggers)::text
           || coalesce(' / ' || (select string_agg(d, '; ' order by d) from trigger_diff), ', no differences'),
         (select count(*) from actual_triggers) = 14 and not exists (select 1 from trigger_diff)
  union all
  select 50, 'B5 withdrawal columns, checks, index and FK', 'all present',
         coalesce('missing: ' || string_agg(name, ', ') filter (where not present), 'all present'),
         bool_and(present)
  from schema_bits
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
