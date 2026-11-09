-- NWG Coaches Hub — Competitions phase 3c (0032): verification
--
-- Companion to supabase/migrations/0032_comp_external_entries.sql. Written,
-- not executed.
--
-- ---------------------------------------------------------------------------
-- PASTE ORDER
-- ---------------------------------------------------------------------------
--
--   Paste A  -> run BEFORE 0032
--   apply    supabase/migrations/0032_comp_external_entries.sql
--   Paste B  -> run AFTER 0032
--
-- Paste each one into the Supabase SQL Editor on its own, as the editor's
-- default role (postgres). Each returns ONE result table:
--
--   check_name | expected | actual | pass
--
-- Paste A is a single query. Paste B is a DO block (the B7 constraint tests)
-- followed by the result query; paste both together. The editor shows only
-- the last statement's result, which is the result query.
--
-- A good run shows pass = true on every check row. Rows whose check_name
-- starts with "info" have pass = null and are there to be read and kept.
--
-- Do not apply 0032 if Paste A has a failing row. 0032's guards repeat A1,
-- A3 (function), A5, A6 and A7 and would abort anyway.
--
-- What each check means:
--
--   Paste A
--     A1   none of the 7 tables exists yet
--     A2   no other public relation named comp_entr% or comp_external%
--     A3   no comp_staff_candidates() and no function mentions the 4 new
--          capability names
--     A4   no policy on any of the 7 tables
--     A5   the 10 capabilities resolve to the 0031 titles; the 4 new names
--          resolve to no title
--     A6   the objects 0032 depends on exist
--     A7   Postgres 15 or later
--     A8   at least one rota_sites row and one profiles row (B7 needs them)
--     info current EXECUTE grants on title_has_capability() and
--          my_capabilities() (B9 expects the same after)
--
--   Paste B
--     B1   the 7 tables exist with RLS enabled
--     B2   policy counts per table (4, 4, 4, 4, 4, 3, 4), 27 in total, and no
--          update (or for all) policy on comp_entry_gymnast_extras
--     B3   the 27 policy names and commands are exactly as written
--     B4   the 4 new capabilities resolve to exactly their titles
--     B5   the 10 existing capabilities resolve to the same titles as in A5
--     B6   my_capabilities() lists all 14 capability names
--     B7   constraint and FK behaviour (as postgres, so RLS is bypassed and
--          only the schema is tested). Every test is undone.
--     B8   anon holds no privilege on any of the 7 tables; authenticated
--          holds select/insert/update/delete on all 7
--     B9   function grants and shape: title_has_capability() and
--          my_capabilities() unchanged; comp_staff_candidates() callable by
--          authenticated only, security definer, search_path '', returning
--          (id, full_name, site)
--     B10  the 30 indexes and 24 foreign keys as written
--     B11  no rows left behind by B7 (all 7 tables are empty: no app code
--          writes to them before 0034)


-- ===========================================================================
-- PASTE A — before 0032
-- ===========================================================================

with
titles (ord, job_title) as (
  values (1, 'Coach'), (2, 'Lead Coach'), (3, 'Club Head Coach'),
         (4, 'Regional General Manager'), (5, 'Head of Gymnastics'), (6, 'Head of Operations')
),
caps (ord, cap, expected) as (
  values
    (1,  'view_all_sites',        'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (2,  'all_sites_scope',       'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (3,  'publish_whats_new',     'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (4,  'manage_policies',       'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (5,  'manage_users',          'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (6,  'edit_rota',             'Lead Coach, Club Head Coach, Regional General Manager, Head of Gymnastics, Head of Operations'),
    (7,  'manage_club_meetings',  'Lead Coach, Club Head Coach, Regional General Manager, Head of Gymnastics, Head of Operations'),
    (8,  'manage_club_updates',   'Lead Coach, Club Head Coach, Regional General Manager, Head of Gymnastics, Head of Operations'),
    (9,  'manage_club_roles',     'Club Head Coach, Regional General Manager, Head of Gymnastics, Head of Operations'),
    (10, 'manage_comp_events',    'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (11, 'edit_comp_entries',     '(none)'),
    (12, 'sign_off_competitions', '(none)'),
    (13, 'approve_judges',        '(none)'),
    (14, 'confirm_comp_pricing',  '(none)')
),
matrix as (
  select c.ord, c.cap, c.expected,
         coalesce(string_agg(t.job_title, ', ' order by t.ord)
                  filter (where public.title_has_capability(t.job_title, c.cap)), '(none)') as actual
  from caps c cross join titles t
  group by c.ord, c.cap, c.expected
),
new_tables (relname) as (
  values ('comp_external_details'), ('comp_entries'), ('comp_entry_fee_levels'),
         ('comp_entry_extras'), ('comp_entry_gymnasts'), ('comp_entry_gymnast_extras'),
         ('comp_entry_staff')
),
fn as (
  select p.oid, p.proname::text as proname, p.prosrc
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
),
deps (name, present) as (
  values
    ('comp_events',            to_regclass('public.comp_events') is not null),
    ('comp_event_sites',       to_regclass('public.comp_event_sites') is not null),
    ('rota_sites',             to_regclass('public.rota_sites') is not null),
    ('profiles',               to_regclass('public.profiles') is not null),
    ('is_active_coach()',      to_regprocedure('public.is_active_coach()') is not null),
    ('has_capability()',       to_regprocedure('public.has_capability(text)') is not null),
    ('has_site_capability()',  to_regprocedure('public.has_site_capability(text, uuid)') is not null),
    ('title_has_capability()', to_regprocedure('public.title_has_capability(text, text)') is not null),
    ('my_capabilities()',      to_regprocedure('public.my_capabilities()') is not null)
),
checks as (
  select 10 as ord, 0 as sub,
         'A1 the 7 comp entry tables' as check_name,
         '0' as expected,
         count(*) filter (where to_regclass('public.' || relname) is not null)::text
           || coalesce(': ' || string_agg(relname, ', ' order by relname)
                                filter (where to_regclass('public.' || relname) is not null), '') as actual,
         count(*) filter (where to_regclass('public.' || relname) is not null) = 0 as pass
  from new_tables
  union all
  select 20, 0, 'A2 public relations named comp_entr% or comp_external%', '0',
         count(*)::text || coalesce(': ' || string_agg(c.relname::text, ', ' order by c.relname), ''),
         count(*) = 0
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and (c.relname like 'comp\_entr%' or c.relname like 'comp\_external%')
  union all
  select 30, 0, 'A3 comp_staff_candidates() or functions mentioning the 4 new capabilities', '0',
         count(*)::text || coalesce(': ' || string_agg(proname, ', ' order by proname), ''),
         count(*) = 0
  from fn
  where proname = 'comp_staff_candidates'
     or prosrc like '%edit_comp_entries%'
     or prosrc like '%sign_off_competitions%'
     or prosrc like '%approve_judges%'
     or prosrc like '%confirm_comp_pricing%'
  union all
  select 40, 0, 'A4 policies on the 7 comp entry tables', '0',
         count(*)::text || coalesce(': ' || string_agg(tablename || '.' || policyname, ', '), ''),
         count(*) = 0
  from pg_policies
  where schemaname = 'public' and tablename in (select relname from new_tables)
  union all
  select 50, ord, 'A5 ' || cap, expected, actual, actual = expected
  from matrix
  union all
  select 60, 0, 'A6 dependencies present', 'all present',
         coalesce('missing: ' || string_agg(name, ', ') filter (where not present), 'all present'),
         bool_and(present)
  from deps
  union all
  select 70, 0, 'A7 server_version_num >= 150000', '>= 150000',
         current_setting('server_version_num'),
         current_setting('server_version_num')::int >= 150000
  union all
  select 80, 0, 'A8 rota_sites rows / profiles rows (B7 needs one of each)', '>= 1 / >= 1',
         format('%s / %s', (select count(*) from public.rota_sites), (select count(*) from public.profiles)),
         (select count(*) from public.rota_sites) >= 1 and (select count(*) from public.profiles) >= 1
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
-- PASTE B — after 0032
-- ===========================================================================
--
-- Paste B is two statements: a DO block that runs the B7 tests, then the
-- result query. Paste both together.
--
-- B7: the DO block builds one test fixture inside an outer sub-block:
--   two external events on the first rota_sites row, both with the site
--   attached; event 1 has deadlines; an entry on each; a fee level and an
--   extra on each entry; one gymnast on entry 1 (fee level and extra from
--   entry 1); one judge on entry 1 (the oldest profile).
-- Each test runs in its own nested sub-block that always ends in an error,
-- so it is rolled back: a rejected change raises an integrity violation, and
-- an accepted one is followed by a deliberate raise ('0032-undo'). The outer
-- sub-block also ends with a deliberate raise, which rolls the fixture back.
-- Outcomes are kept in a jsonb variable (variables survive the rollbacks)
-- and stored afterwards in the session setting comp32.results for the result
-- query. As postgres the statements bypass RLS, so only constraints and FKs
-- are tested. B11 confirms nothing was left behind.

do $$
declare
  r jsonb := '{}'::jsonb;
  v text;
  n int;
  v_site uuid;
  v_profile uuid;
  v_ev1 uuid;
  v_ev2 uuid;
  v_ev3 uuid;
  v_en1 uuid;
  v_en2 uuid;
  v_fl1 uuid;
  v_fl2 uuid;
  v_ex1 uuid;
  v_ex2 uuid;
  v_g1 uuid;
begin
  select s.id into v_site from public.rota_sites s order by s.sort_order, s.name limit 1;
  select p.id into v_profile from public.profiles p order by p.created_at limit 1;

  begin
    -- Fixture (the control: every valid insert is accepted).
    insert into public.comp_events (title, event_type, start_date, end_date)
    values ('0032 verification test 1', 'Invitational Competition', date '2026-01-10', date '2026-01-10')
    returning id into v_ev1;
    insert into public.comp_events (title, event_type, start_date, end_date)
    values ('0032 verification test 2', 'Regional/National Competition', date '2026-01-17', date '2026-01-17')
    returning id into v_ev2;
    insert into public.comp_event_sites (event_id, site_id) values (v_ev1, v_site), (v_ev2, v_site);
    insert into public.comp_external_details (event_id, entry_deadline, organiser_payment_deadline)
    values (v_ev1, date '2025-12-10', date '2025-12-10');
    insert into public.comp_entries (event_id, site_id) values (v_ev1, v_site) returning id into v_en1;
    insert into public.comp_entries (event_id, site_id) values (v_ev2, v_site) returning id into v_en2;
    insert into public.comp_entry_fee_levels (entry_id, label, organiser_fee)
    values (v_en1, 'Opal', 24) returning id into v_fl1;
    insert into public.comp_entry_fee_levels (entry_id, label, organiser_fee)
    values (v_en2, 'Opal', 24) returning id into v_fl2;
    insert into public.comp_entry_extras (entry_id, label, price)
    values (v_en1, 'T-shirt', 10) returning id into v_ex1;
    insert into public.comp_entry_extras (entry_id, label, price)
    values (v_en2, 'T-shirt', 10) returning id into v_ex2;
    insert into public.comp_entry_gymnasts (entry_id, fee_level_id, full_name, dob)
    values (v_en1, v_fl1, '0032 Test Gymnast', date '2015-03-12') returning id into v_g1;
    insert into public.comp_entry_gymnast_extras (entry_id, gymnast_id, extra_id)
    values (v_en1, v_g1, v_ex1);
    insert into public.comp_entry_staff (entry_id, profile_id, staff_role, transport)
    values (v_en1, v_profile, 'judge', 'carpool');
    r := r || jsonb_build_object('control', 'accepted');

    -- Second entry for the same (event, site).
    begin
      insert into public.comp_entries (event_id, site_id) values (v_ev1, v_site);
      raise exception using errcode = 'P0001', message = '0032-undo';
    exception
      when integrity_constraint_violation then
        get stacked diagnostics v = constraint_name;
        r := r || jsonb_build_object('dup_entry', 'rejected by ' || v);
      when others then
        r := r || jsonb_build_object('dup_entry', case when sqlerrm = '0032-undo' then 'accepted' else 'error: ' || sqlerrm end);
    end;

    -- Entry whose site is not attached to the event.
    begin
      insert into public.comp_events (title, event_type, start_date, end_date)
      values ('0032 verification test 3', 'Invitational Competition', date '2026-01-24', date '2026-01-24')
      returning id into v_ev3;
      insert into public.comp_entries (event_id, site_id) values (v_ev3, v_site);
      raise exception using errcode = 'P0001', message = '0032-undo';
    exception
      when integrity_constraint_violation then
        get stacked diagnostics v = constraint_name;
        r := r || jsonb_build_object('entry_no_site', 'rejected by ' || v);
      when others then
        r := r || jsonb_build_object('entry_no_site', case when sqlerrm = '0032-undo' then 'accepted' else 'error: ' || sqlerrm end);
    end;

    -- Status outside the 9 values.
    begin
      update public.comp_entries set status = 'ready_for_po' where id = v_en1;
      raise exception using errcode = 'P0001', message = '0032-undo';
    exception
      when integrity_constraint_violation then
        get stacked diagnostics v = constraint_name;
        r := r || jsonb_build_object('bad_status', 'rejected by ' || v);
      when others then
        r := r || jsonb_build_object('bad_status', case when sqlerrm = '0032-undo' then 'accepted' else 'error: ' || sqlerrm end);
    end;

    -- uplift_pct above 100.
    begin
      update public.comp_entries set uplift_pct = 150 where id = v_en1;
      raise exception using errcode = 'P0001', message = '0032-undo';
    exception
      when integrity_constraint_violation then
        get stacked diagnostics v = constraint_name;
        r := r || jsonb_build_object('bad_uplift', 'rejected by ' || v);
      when others then
        r := r || jsonb_build_object('bad_uplift', case when sqlerrm = '0032-undo' then 'accepted' else 'error: ' || sqlerrm end);
    end;

    -- Declined without a note.
    begin
      update public.comp_entries set declined_at = now() where id = v_en1;
      raise exception using errcode = 'P0001', message = '0032-undo';
    exception
      when integrity_constraint_violation then
        get stacked diagnostics v = constraint_name;
        r := r || jsonb_build_object('decline_no_note', 'rejected by ' || v);
      when others then
        r := r || jsonb_build_object('decline_no_note', case when sqlerrm = '0032-undo' then 'accepted' else 'error: ' || sqlerrm end);
    end;

    -- A "who" without its "when".
    begin
      update public.comp_entries set signed_off_by = v_profile where id = v_en1;
      raise exception using errcode = 'P0001', message = '0032-undo';
    exception
      when integrity_constraint_violation then
        get stacked diagnostics v = constraint_name;
        r := r || jsonb_build_object('by_without_at', 'rejected by ' || v);
      when others then
        r := r || jsonb_build_object('by_without_at', case when sqlerrm = '0032-undo' then 'accepted' else 'error: ' || sqlerrm end);
    end;

    -- Duplicate fee level label (case and spaces ignored).
    begin
      insert into public.comp_entry_fee_levels (entry_id, label, organiser_fee) values (v_en1, ' opal ', 24);
      raise exception using errcode = 'P0001', message = '0032-undo';
    exception
      when integrity_constraint_violation then
        get stacked diagnostics v = constraint_name;
        r := r || jsonb_build_object('dup_fee_label', 'rejected by ' || v);
      when others then
        r := r || jsonb_build_object('dup_fee_label', case when sqlerrm = '0032-undo' then 'accepted' else 'error: ' || sqlerrm end);
    end;

    -- Gymnast on entry 1 with entry 2's fee level.
    begin
      insert into public.comp_entry_gymnasts (entry_id, fee_level_id, full_name, dob)
      values (v_en1, v_fl2, '0032 Test Gymnast 2', date '2014-01-01');
      raise exception using errcode = 'P0001', message = '0032-undo';
    exception
      when integrity_constraint_violation then
        get stacked diagnostics v = constraint_name;
        r := r || jsonb_build_object('fee_cross_entry', 'rejected by ' || v);
      when others then
        r := r || jsonb_build_object('fee_cross_entry', case when sqlerrm = '0032-undo' then 'accepted' else 'error: ' || sqlerrm end);
    end;

    -- Gymnast with no fee level yet (allowed in draft).
    begin
      insert into public.comp_entry_gymnasts (entry_id, fee_level_id, full_name, dob)
      values (v_en1, null, '0032 Test Gymnast 3', date '2014-01-01');
      raise exception using errcode = 'P0001', message = '0032-undo';
    exception
      when integrity_constraint_violation then
        get stacked diagnostics v = constraint_name;
        r := r || jsonb_build_object('fee_null', 'rejected by ' || v);
      when others then
        r := r || jsonb_build_object('fee_null', case when sqlerrm = '0032-undo' then 'accepted' else 'error: ' || sqlerrm end);
    end;

    -- Entry 1's gymnast choosing entry 2's extra.
    begin
      insert into public.comp_entry_gymnast_extras (entry_id, gymnast_id, extra_id) values (v_en1, v_g1, v_ex2);
      raise exception using errcode = 'P0001', message = '0032-undo';
    exception
      when integrity_constraint_violation then
        get stacked diagnostics v = constraint_name;
        r := r || jsonb_build_object('extra_cross_entry', 'rejected by ' || v);
      when others then
        r := r || jsonb_build_object('extra_cross_entry', case when sqlerrm = '0032-undo' then 'accepted' else 'error: ' || sqlerrm end);
    end;

    -- Name without DOB.
    begin
      insert into public.comp_entry_gymnasts (entry_id, fee_level_id, full_name, dob)
      values (v_en1, v_fl1, '0032 Test Gymnast 4', null);
      raise exception using errcode = 'P0001', message = '0032-undo';
    exception
      when integrity_constraint_violation then
        get stacked diagnostics v = constraint_name;
        r := r || jsonb_build_object('name_no_dob', 'rejected by ' || v);
      when others then
        r := r || jsonb_build_object('name_no_dob', case when sqlerrm = '0032-undo' then 'accepted' else 'error: ' || sqlerrm end);
    end;

    -- Withdrawn without a note.
    begin
      update public.comp_entry_gymnasts set withdrawn = true where id = v_g1;
      raise exception using errcode = 'P0001', message = '0032-undo';
    exception
      when integrity_constraint_violation then
        get stacked diagnostics v = constraint_name;
        r := r || jsonb_build_object('withdrawn_no_note', 'rejected by ' || v);
      when others then
        r := r || jsonb_build_object('withdrawn_no_note', case when sqlerrm = '0032-undo' then 'accepted' else 'error: ' || sqlerrm end);
    end;

    -- Data removal shape: withdrawn gymnast with name, DOB and notes blanked.
    begin
      update public.comp_entry_gymnasts
      set withdrawn = true, withdrawn_note = 'Injury', notes = 'note'
      where id = v_g1;
      update public.comp_entry_gymnasts
      set full_name = null, dob = null, notes = null, withdrawn_note = null, paid = true
      where id = v_g1;
      raise exception using errcode = 'P0001', message = '0032-undo';
    exception
      when integrity_constraint_violation then
        get stacked diagnostics v = constraint_name;
        r := r || jsonb_build_object('removal_shape', 'rejected by ' || v);
      when others then
        r := r || jsonb_build_object('removal_shape', case when sqlerrm = '0032-undo' then 'accepted' else 'error: ' || sqlerrm end);
    end;

    -- A coach row carrying a judge approval.
    begin
      insert into public.comp_entry_staff (entry_id, profile_id, staff_role, judge_approved_at)
      values (v_en2, v_profile, 'coach', now());
      raise exception using errcode = 'P0001', message = '0032-undo';
    exception
      when integrity_constraint_violation then
        get stacked diagnostics v = constraint_name;
        r := r || jsonb_build_object('coach_approved', 'rejected by ' || v);
      when others then
        r := r || jsonb_build_object('coach_approved', case when sqlerrm = '0032-undo' then 'accepted' else 'error: ' || sqlerrm end);
    end;

    -- Unknown transport.
    begin
      insert into public.comp_entry_staff (entry_id, profile_id, staff_role, transport)
      values (v_en2, v_profile, 'judge', 'bus');
      raise exception using errcode = 'P0001', message = '0032-undo';
    exception
      when integrity_constraint_violation then
        get stacked diagnostics v = constraint_name;
        r := r || jsonb_build_object('bad_transport', 'rejected by ' || v);
      when others then
        r := r || jsonb_build_object('bad_transport', case when sqlerrm = '0032-undo' then 'accepted' else 'error: ' || sqlerrm end);
    end;

    -- Same person twice on one entry.
    begin
      insert into public.comp_entry_staff (entry_id, profile_id, staff_role) values (v_en1, v_profile, 'coach');
      raise exception using errcode = 'P0001', message = '0032-undo';
    exception
      when integrity_constraint_violation then
        get stacked diagnostics v = constraint_name;
        r := r || jsonb_build_object('dup_staff', 'rejected by ' || v);
      when others then
        r := r || jsonb_build_object('dup_staff', case when sqlerrm = '0032-undo' then 'accepted' else 'error: ' || sqlerrm end);
    end;

    -- Second details row for the same event.
    begin
      insert into public.comp_external_details (event_id) values (v_ev1);
      raise exception using errcode = 'P0001', message = '0032-undo';
    exception
      when integrity_constraint_violation then
        get stacked diagnostics v = constraint_name;
        r := r || jsonb_build_object('dup_details', 'rejected by ' || v);
      when others then
        r := r || jsonb_build_object('dup_details', case when sqlerrm = '0032-undo' then 'accepted' else 'error: ' || sqlerrm end);
    end;

    -- Deleting an event that has an entry.
    begin
      delete from public.comp_events where id = v_ev1;
      raise exception using errcode = 'P0001', message = '0032-undo';
    exception
      when integrity_constraint_violation then
        get stacked diagnostics v = constraint_name;
        r := r || jsonb_build_object('event_delete', 'rejected by ' || v);
      when others then
        r := r || jsonb_build_object('event_delete', case when sqlerrm = '0032-undo' then 'accepted' else 'error: ' || sqlerrm end);
    end;

    -- Detaching the site from an event while the site has an entry.
    begin
      delete from public.comp_event_sites where event_id = v_ev1 and site_id = v_site;
      raise exception using errcode = 'P0001', message = '0032-undo';
    exception
      when integrity_constraint_violation then
        get stacked diagnostics v = constraint_name;
        r := r || jsonb_build_object('site_detach', 'rejected by ' || v);
      when others then
        r := r || jsonb_build_object('site_detach', case when sqlerrm = '0032-undo' then 'accepted' else 'error: ' || sqlerrm end);
    end;

    -- Deleting a fee level in use (as postgres; RLS would refuse a client):
    -- the gymnast stays, with its level cleared and entry_id kept.
    begin
      v := null;
      delete from public.comp_entry_fee_levels where id = v_fl1;
      select count(*) into n from public.comp_entry_gymnasts
      where id = v_g1 and entry_id = v_en1 and fee_level_id is null;
      v := case when n = 1 then 'gymnast kept, level cleared' else 'gymnast not cleared' end;
      raise exception using errcode = 'P0001', message = '0032-undo';
    exception
      when others then
        r := r || jsonb_build_object('fee_delete', case when sqlerrm = '0032-undo' then v else 'error: ' || sqlerrm end);
    end;

    -- Deleting entry 1 removes every child row and nothing else.
    begin
      v := null;
      delete from public.comp_entries where id = v_en1;
      select (select count(*) from public.comp_entry_fee_levels where entry_id = v_en1)
           + (select count(*) from public.comp_entry_extras where entry_id = v_en1)
           + (select count(*) from public.comp_entry_gymnasts where entry_id = v_en1)
           + (select count(*) from public.comp_entry_gymnast_extras where entry_id = v_en1)
           + (select count(*) from public.comp_entry_staff where entry_id = v_en1)
        into n;
      v := 'deleted, ' || n || ' child rows left';
      select count(*) into n from public.comp_entry_fee_levels where entry_id = v_en2;
      v := v || ', entry 2 fee levels ' || n;
      raise exception using errcode = 'P0001', message = '0032-undo';
    exception
      when others then
        r := r || jsonb_build_object('entry_delete', case when sqlerrm = '0032-undo' then v else 'error: ' || sqlerrm end);
    end;

    raise exception using errcode = 'P0001', message = '0032-fixture-undo';
  exception
    when others then
      if sqlerrm <> '0032-fixture-undo' then
        r := r || jsonb_build_object('control', 'error: ' || sqlerrm);
      end if;
  end;

  perform set_config('comp32.results', r::text, false);
end
$$;

with
titles (ord, job_title) as (
  values (1, 'Coach'), (2, 'Lead Coach'), (3, 'Club Head Coach'),
         (4, 'Regional General Manager'), (5, 'Head of Gymnastics'), (6, 'Head of Operations')
),
caps (ord, cap, expected) as (
  values
    (1,  'view_all_sites',        'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (2,  'all_sites_scope',       'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (3,  'publish_whats_new',     'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (4,  'manage_policies',       'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (5,  'manage_users',          'Regional General Manager, Head of Gymnastics, Head of Operations'),
    (6,  'edit_rota',             'Lead Coach, Club Head Coach, Regional General Manager, Head of Gymnastics, Head of Operations'),
    (7,  'manage_club_meetings',  'Lead Coach, Club Head Coach, Regional General Manager, Head of Gymnastics, Head of Operations'),
    (8,  'manage_club_updates',   'Lead Coach, Club Head Coach, Regional General Manager, Head of Gymnastics, Head of Operations'),
    (9,  'manage_club_roles',     'Club Head Coach, Regional General Manager, Head of Gymnastics, Head of Operations'),
    (10, 'manage_comp_events',    'Regional General Manager, Head of Gymnastics, Head of Operations')
),
new_caps (ord, cap, expected) as (
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
new_matrix as (
  select c.ord, c.cap, c.expected,
         coalesce(string_agg(t.job_title, ', ' order by t.ord)
                  filter (where public.title_has_capability(t.job_title, c.cap)), '(none)') as actual
  from new_caps c cross join titles t
  group by c.ord, c.cap, c.expected
),
new_tables (ord, relname, policies) as (
  values (1, 'comp_external_details', 4), (2, 'comp_entries', 4),
         (3, 'comp_entry_fee_levels', 4), (4, 'comp_entry_extras', 4),
         (5, 'comp_entry_gymnasts', 4), (6, 'comp_entry_gymnast_extras', 3),
         (7, 'comp_entry_staff', 4)
),
comp_rel as (
  select c.oid, c.relname::text as relname, c.relrowsecurity
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relkind = 'r'
    and c.relname in (select relname from new_tables)
),
pol as (
  select tablename::text as tablename, policyname::text as policyname, cmd::text as cmd
  from pg_policies
  where schemaname = 'public' and tablename in (select relname from new_tables)
),
expected_pol (tablename, policyname, cmd) as (
  values
    ('comp_external_details',     'comp_external_details_select_authenticated',                  'SELECT'),
    ('comp_external_details',     'comp_external_details_insert_edit_comp_entries_external',     'INSERT'),
    ('comp_external_details',     'comp_external_details_update_edit_comp_entries_external',     'UPDATE'),
    ('comp_external_details',     'comp_external_details_delete_manage_comp_events',             'DELETE'),
    ('comp_entries',              'comp_entries_select_own_site_or_view_all',                    'SELECT'),
    ('comp_entries',              'comp_entries_insert_edit_comp_entries_site_draft',            'INSERT'),
    ('comp_entries',              'comp_entries_update_edit_comp_entries_site',                  'UPDATE'),
    ('comp_entries',              'comp_entries_delete_edit_comp_entries_site_draft',            'DELETE'),
    ('comp_entry_fee_levels',     'comp_entry_fee_levels_select_own_site_or_view_all',           'SELECT'),
    ('comp_entry_fee_levels',     'comp_entry_fee_levels_insert_edit_comp_entries_site',         'INSERT'),
    ('comp_entry_fee_levels',     'comp_entry_fee_levels_update_edit_comp_entries_site',         'UPDATE'),
    ('comp_entry_fee_levels',     'comp_entry_fee_levels_delete_edit_comp_entries_site_unused',  'DELETE'),
    ('comp_entry_extras',         'comp_entry_extras_select_own_site_or_view_all',               'SELECT'),
    ('comp_entry_extras',         'comp_entry_extras_insert_edit_comp_entries_site',             'INSERT'),
    ('comp_entry_extras',         'comp_entry_extras_update_edit_comp_entries_site',             'UPDATE'),
    ('comp_entry_extras',         'comp_entry_extras_delete_edit_comp_entries_site_unused',      'DELETE'),
    ('comp_entry_gymnasts',       'comp_entry_gymnasts_select_own_site_or_view_all',             'SELECT'),
    ('comp_entry_gymnasts',       'comp_entry_gymnasts_insert_edit_comp_entries_site',           'INSERT'),
    ('comp_entry_gymnasts',       'comp_entry_gymnasts_update_edit_comp_entries_site',           'UPDATE'),
    ('comp_entry_gymnasts',       'comp_entry_gymnasts_delete_edit_comp_entries_site',           'DELETE'),
    ('comp_entry_gymnast_extras', 'comp_entry_gymnast_extras_select_own_site_or_view_all',       'SELECT'),
    ('comp_entry_gymnast_extras', 'comp_entry_gymnast_extras_insert_edit_comp_entries_site',     'INSERT'),
    ('comp_entry_gymnast_extras', 'comp_entry_gymnast_extras_delete_edit_comp_entries_site',     'DELETE'),
    ('comp_entry_staff',          'comp_entry_staff_select_own_site_or_view_all',                'SELECT'),
    ('comp_entry_staff',          'comp_entry_staff_insert_edit_comp_entries_site',              'INSERT'),
    ('comp_entry_staff',          'comp_entry_staff_update_edit_comp_entries_site',              'UPDATE'),
    ('comp_entry_staff',          'comp_entry_staff_delete_edit_comp_entries_site',              'DELETE')
),
pol_diff as (
  (select 'unexpected ' || policyname || ' ' || cmd as d from pol
   except select 'unexpected ' || policyname || ' ' || cmd from expected_pol)
  union all
  (select 'missing ' || policyname || ' ' || cmd from expected_pol
   except select 'missing ' || policyname || ' ' || cmd from pol)
),
results as (
  select current_setting('comp32.results', true)::jsonb as j
),
tests (ord, key, label, expected) as (
  values
    (1,  'control',           'fixture: every valid insert accepted',           'accepted'),
    (2,  'dup_entry',         'second entry for the same event and site',       'rejected by comp_entries_event_id_site_id_key'),
    (3,  'entry_no_site',     'entry whose site is not attached to the event',  'rejected by comp_entries_event_site_fkey'),
    (4,  'bad_status',        'status outside the 9 values',                    'rejected by comp_entries_status_check'),
    (5,  'bad_uplift',        'uplift_pct 150',                                 'rejected by comp_entries_uplift_pct_check'),
    (6,  'decline_no_note',   'declined_at without decline_note',               'rejected by comp_entries_decline_note_check'),
    (7,  'by_without_at',     'signed_off_by without signed_off_at',            'rejected by comp_entries_signed_off_pair_check'),
    (8,  'dup_fee_label',     'fee level label repeated (case, spaces)',        'rejected by comp_entry_fee_levels_entry_label_idx'),
    (9,  'fee_cross_entry',   'gymnast with another entry''s fee level',         'rejected by comp_entry_gymnasts_fee_level_fkey'),
    (10, 'fee_null',          'gymnast with no fee level yet',                  'accepted'),
    (11, 'extra_cross_entry', 'gymnast choosing another entry''s extra',         'rejected by comp_entry_gymnast_extras_extra_fkey'),
    (12, 'name_no_dob',       'gymnast name without DOB',                       'rejected by comp_entry_gymnasts_name_dob_pair_check'),
    (13, 'withdrawn_no_note', 'withdrawn without withdrawn_note',               'rejected by comp_entry_gymnasts_withdrawn_note_check'),
    (14, 'removal_shape',     'withdrawn gymnast blanked as 0034 will',         'accepted'),
    (15, 'coach_approved',    'coach row with a judge approval',                'rejected by comp_entry_staff_judge_approval_role_check'),
    (16, 'bad_transport',     'transport ''bus''',                              'rejected by comp_entry_staff_transport_check'),
    (17, 'dup_staff',         'same person twice on one entry',                 'rejected by comp_entry_staff_entry_id_profile_id_key'),
    (18, 'dup_details',       'second details row for one event',               'rejected by comp_external_details_pkey'),
    (19, 'event_delete',      'delete an event that has an entry',              'rejected by comp_entries_event%fkey'),
    (20, 'site_detach',       'detach a site that has an entry',                'rejected by comp_entries_event_site_fkey'),
    (21, 'fee_delete',        'fee level deleted under a gymnast',              'gymnast kept, level cleared'),
    (22, 'entry_delete',      'entry delete cascades to every child',           'deleted, 0 child rows left, entry 2 fee levels 1')
),
idx (indexname) as (
  select indexname::text from pg_indexes
  where schemaname = 'public' and tablename in (select relname from new_tables)
),
expected_idx (indexname) as (
  values
    ('comp_external_details_pkey'),
    ('comp_entries_pkey'), ('comp_entries_event_id_site_id_key'),
    ('comp_entries_site_id_idx'), ('comp_entries_created_by_idx'),
    ('comp_entries_signoff_requested_by_idx'), ('comp_entries_signed_off_by_idx'),
    ('comp_entries_declined_by_idx'), ('comp_entries_pricing_confirmed_by_idx'),
    ('comp_entries_po_requested_by_idx'), ('comp_entries_po_received_by_idx'),
    ('comp_entries_entered_by_idx'), ('comp_entries_organiser_paid_by_idx'),
    ('comp_entries_completed_by_idx'), ('comp_entries_data_removed_by_idx'),
    ('comp_entry_fee_levels_pkey'), ('comp_entry_fee_levels_entry_id_id_key'),
    ('comp_entry_fee_levels_entry_label_idx'),
    ('comp_entry_extras_pkey'), ('comp_entry_extras_entry_id_id_key'),
    ('comp_entry_extras_entry_label_idx'),
    ('comp_entry_gymnasts_pkey'), ('comp_entry_gymnasts_entry_id_id_key'),
    ('comp_entry_gymnasts_entry_id_fee_level_id_idx'),
    ('comp_entry_gymnast_extras_pkey'), ('comp_entry_gymnast_extras_entry_id_extra_id_idx'),
    ('comp_entry_staff_pkey'), ('comp_entry_staff_entry_id_profile_id_key'),
    ('comp_entry_staff_profile_id_idx'), ('comp_entry_staff_judge_approved_by_idx')
),
idx_diff as (
  (select 'unexpected ' || indexname as d from idx
   except select 'unexpected ' || indexname from expected_idx)
  union all
  (select 'missing ' || indexname from expected_idx
   except select 'missing ' || indexname from idx)
),
fk as (
  select format('%s(%s) -> %s on delete %s%s',
                c.conrelid::regclass::text,
                (select string_agg(a.attname::text, ',' order by k.ord)
                 from unnest(c.conkey) with ordinality k (attnum, ord)
                 join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum),
                c.confrelid::regclass::text,
                case c.confdeltype when 'a' then 'no action' when 'r' then 'restrict'
                                   when 'c' then 'cascade' when 'n' then 'set null'
                                   when 'd' then 'set default' end,
                case when c.confdelsetcols is null then ''
                     else ' (' || (select string_agg(a.attname::text, ',')
                                   from unnest(c.confdelsetcols) k (attnum)
                                   join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) || ')'
                end) as d
  from pg_constraint c
  where c.contype = 'f'
    and c.conrelid in (select oid from comp_rel)
),
expected_fk (d) as (
  values
    ('comp_external_details(event_id) -> comp_events on delete cascade'),
    ('comp_entries(event_id) -> comp_events on delete restrict'),
    ('comp_entries(site_id) -> rota_sites on delete restrict'),
    ('comp_entries(event_id,site_id) -> comp_event_sites on delete restrict'),
    ('comp_entries(created_by) -> profiles on delete set null'),
    ('comp_entries(signoff_requested_by) -> profiles on delete set null'),
    ('comp_entries(signed_off_by) -> profiles on delete set null'),
    ('comp_entries(declined_by) -> profiles on delete set null'),
    ('comp_entries(pricing_confirmed_by) -> profiles on delete set null'),
    ('comp_entries(po_requested_by) -> profiles on delete set null'),
    ('comp_entries(po_received_by) -> profiles on delete set null'),
    ('comp_entries(entered_by) -> profiles on delete set null'),
    ('comp_entries(organiser_paid_by) -> profiles on delete set null'),
    ('comp_entries(completed_by) -> profiles on delete set null'),
    ('comp_entries(data_removed_by) -> profiles on delete set null'),
    ('comp_entry_fee_levels(entry_id) -> comp_entries on delete cascade'),
    ('comp_entry_extras(entry_id) -> comp_entries on delete cascade'),
    ('comp_entry_gymnasts(entry_id) -> comp_entries on delete cascade'),
    ('comp_entry_gymnasts(entry_id,fee_level_id) -> comp_entry_fee_levels on delete set null (fee_level_id)'),
    ('comp_entry_gymnast_extras(entry_id,gymnast_id) -> comp_entry_gymnasts on delete cascade'),
    ('comp_entry_gymnast_extras(entry_id,extra_id) -> comp_entry_extras on delete cascade'),
    ('comp_entry_staff(entry_id) -> comp_entries on delete cascade'),
    ('comp_entry_staff(profile_id) -> profiles on delete restrict'),
    ('comp_entry_staff(judge_approved_by) -> profiles on delete set null')
),
fk_diff as (
  (select 'unexpected ' || d as d from fk
   except select 'unexpected ' || d from expected_fk)
  union all
  (select 'missing ' || d from expected_fk
   except select 'missing ' || d from fk)
),
leftovers as (
  select 'comp_external_details' as t, count(*) as n from public.comp_external_details
  union all select 'comp_entries', count(*) from public.comp_entries
  union all select 'comp_entry_fee_levels', count(*) from public.comp_entry_fee_levels
  union all select 'comp_entry_extras', count(*) from public.comp_entry_extras
  union all select 'comp_entry_gymnasts', count(*) from public.comp_entry_gymnasts
  union all select 'comp_entry_gymnast_extras', count(*) from public.comp_entry_gymnast_extras
  union all select 'comp_entry_staff', count(*) from public.comp_entry_staff
  union all select 'comp_events (0032 verification test%)', count(*)
            from public.comp_events where title like '0032 verification test%'
),
checks as (
  select 10 as ord, 0 as sub,
         'B1 comp entry tables present with RLS enabled' as check_name,
         '7 tables, RLS on all' as expected,
         count(*)::text || ' tables'
           || coalesce(', RLS off: ' || string_agg(relname, ', ') filter (where not relrowsecurity), ', RLS on all') as actual,
         count(*) = 7 and bool_and(relrowsecurity) as pass
  from comp_rel
  union all
  select 20, t.ord, 'B2 policies on ' || t.relname, t.policies::text,
         (select count(*) from pol where pol.tablename = t.relname)::text,
         (select count(*) from pol where pol.tablename = t.relname) = t.policies
  from new_tables t
  union all
  select 20, 8, 'B2 policies on comp entry tables in total', '27', count(*)::text, count(*) = 27
  from pol
  union all
  select 20, 9, 'B2 update / for all policies on comp_entry_gymnast_extras', '0',
         count(*)::text || coalesce(': ' || string_agg(policyname, ', '), ''),
         count(*) = 0
  from pol where tablename = 'comp_entry_gymnast_extras' and cmd in ('UPDATE', 'ALL')
  union all
  select 30, 0, 'B3 policy names and commands as written', '0 differences',
         count(*)::text || ' differences' || coalesce(': ' || string_agg(d, '; ' order by d), ''),
         count(*) = 0
  from pol_diff
  union all
  select 40, ord, 'B4 ' || cap || ' holders', expected, actual, actual = expected
  from new_matrix
  union all
  select 50, ord, 'B5 ' || cap || ' (compare with A5)', expected, actual, actual = expected
  from matrix
  union all
  select 60, 0, 'B6 my_capabilities() lists all 14 capability names', '14',
         (count(*) filter (where p.prosrc like '%''' || n.cap || '''%'))::text
           || coalesce(' (missing: ' || string_agg(n.cap, ', ') filter (where p.prosrc not like '%''' || n.cap || '''%') || ')', ''),
         count(*) filter (where p.prosrc like '%''' || n.cap || '''%') = 14
  from pg_proc p
  cross join (values ('view_all_sites'), ('all_sites_scope'), ('publish_whats_new'),
                     ('manage_policies'), ('manage_users'), ('edit_rota'),
                     ('manage_club_meetings'), ('manage_club_updates'), ('manage_club_roles'),
                     ('manage_comp_events'), ('edit_comp_entries'), ('sign_off_competitions'),
                     ('approve_judges'), ('confirm_comp_pricing')) n (cap)
  where p.oid = 'public.my_capabilities()'::regprocedure
  union all
  select 70, t.ord, 'B7 ' || t.label, replace(t.expected, '%', '…'),
         coalesce(r.j ->> t.key, '(DO block not run)'),
         coalesce(r.j ->> t.key like t.expected, false)
  from tests t cross join results r
  union all
  select 80, 1, 'B8 anon privileges on comp entry tables', '0',
         count(*)::text || coalesce(': ' || string_agg(relname, ', ' order by relname), ''),
         count(*) = 0
  from comp_rel
  where has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_any_column_privilege('anon', oid, 'SELECT,INSERT,UPDATE,REFERENCES')
  union all
  select 80, 2, 'B8 comp entry tables where authenticated lacks SELECT/INSERT/UPDATE/DELETE', '0',
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
  select 90, 3, 'B9 comp_staff_candidates() EXECUTE: public / anon / authenticated', 'false / false / true',
         case when to_regprocedure('public.comp_staff_candidates()') is null then '(missing)'
              else format('%s / %s / %s',
                          coalesce((select bool_or(a.grantee = 0)
                                    from pg_proc p, aclexplode(p.proacl) a
                                    where p.oid = 'public.comp_staff_candidates()'::regprocedure
                                      and a.privilege_type = 'EXECUTE'), false),
                          has_function_privilege('anon', 'public.comp_staff_candidates()', 'EXECUTE'),
                          has_function_privilege('authenticated', 'public.comp_staff_candidates()', 'EXECUTE'))
         end,
         to_regprocedure('public.comp_staff_candidates()') is not null
           and not coalesce((select bool_or(a.grantee = 0)
                             from pg_proc p, aclexplode(p.proacl) a
                             where p.oid = 'public.comp_staff_candidates()'::regprocedure
                               and a.privilege_type = 'EXECUTE'), false)
           and not has_function_privilege('anon', 'public.comp_staff_candidates()', 'EXECUTE')
           and has_function_privilege('authenticated', 'public.comp_staff_candidates()', 'EXECUTE')
  union all
  select 90, 4, 'B9 comp_staff_candidates() shape', 'definer, search_path="", TABLE(id uuid, full_name text, site text)',
         coalesce((select format('%s, %s, %s',
                                 case when p.prosecdef then 'definer' else 'invoker' end,
                                 coalesce(array_to_string(p.proconfig, ','), 'no search_path'),
                                 pg_get_function_result(p.oid))
                   from pg_proc p
                   where p.oid = to_regprocedure('public.comp_staff_candidates()')), '(missing)'),
         coalesce((select p.prosecdef
                          and p.proconfig = array['search_path=""']
                          and pg_get_function_result(p.oid) = 'TABLE(id uuid, full_name text, site text)'
                   from pg_proc p
                   where p.oid = to_regprocedure('public.comp_staff_candidates()')), false)
  union all
  select 100, 1, 'B10 indexes on comp entry tables', '30, 0 differences',
         (select count(*) from idx)::text || ', ' || count(*)::text || ' differences'
           || coalesce(': ' || string_agg(d, '; ' order by d), ''),
         (select count(*) from idx) = 30 and count(*) = 0
  from idx_diff
  union all
  select 100, 2, 'B10 foreign keys on comp entry tables', '24, 0 differences',
         (select count(*) from fk)::text || ', ' || count(*)::text || ' differences'
           || coalesce(': ' || string_agg(d, '; ' order by d), ''),
         (select count(*) from fk) = 24 and count(*) = 0
  from fk_diff
  union all
  select 110, 0, 'B11 rows left in the 7 tables or test events', '0',
         sum(n)::text || coalesce(': ' || string_agg(t || ' ' || n, ', ') filter (where n > 0), ''),
         sum(n) = 0
  from leftovers
)
select check_name, expected, actual, pass
from checks
order by ord, sub;
