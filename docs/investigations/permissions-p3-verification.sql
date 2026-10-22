-- NWG Coaches Hub — Permissions retcon P3: verification
--
-- Companion to supabase/migrations/0026_capability_helpers.sql. Written, not
-- executed.
--
-- ---------------------------------------------------------------------------
-- PASTE ORDER
-- ---------------------------------------------------------------------------
--
--   Paste A  (Section 0, pre-flight)  -> run BEFORE 0026
--   apply    supabase/migrations/0026_capability_helpers.sql
--   Paste B  (Section 1, behaviour test DO block)
--   Paste C  (Sections 2–8, post-apply checks)
--   curl     docs/investigations/permissions-p3-curl-checks.md
--   Paste D  (optional, info only) post-apply role x job_title x active
--            snapshot, to compare with Paste A's info rows
--
-- Each paste is one self-contained block between the PASTE banners below.
-- Paste each one into the Supabase SQL Editor on its own, as the editor's
-- default role (postgres). Each returns a single result:
--
--   Paste A  one result set: check_name | expected | actual | pass
--            Check rows must show pass = true. Rows whose check_name starts
--            with "0b info" are the role x job_title x active breakdown. They
--            have pass = null and are there to be read, not passed or failed.
--   Paste B  one deliberate ERROR whose message is the result.
--            A pass reads: "P3 check complete: <n> checks, 0 failures."
--   Paste C  one result set: check_name | expected | actual | pass.
--            A fully passing run shows pass = true on every row. When a check
--            fails, its actual column names what was wrong.
--   Paste D  plain counts, no pass column.
--
-- Do not continue past a paste that fails. In particular, a failing Paste A
-- means 0026 will refuse to run (Head of People), or will fail on a policy
-- name that has drifted on the live database (live drift).


-- ===========================================================================
-- PASTE A — Section 0: pre-flight (run BEFORE applying 0026)
-- ===========================================================================
--
--   0a  Head of People profiles. Expect 0, or 0026 refuses to run.
--   0c  Live drift: policies that call is_admin(). Expect 66, matching P1's
--       inventory. Anything else means the live database has drifted from the
--       migration files. Stop and reconcile first, because 0026's DROP POLICY
--       statements name each policy exactly. To see which policies, run:
--         select tablename, policyname, cmd from pg_policies
--         where schemaname = 'public'
--           and (coalesce(qual, '') ilike '%is_admin%'
--                or coalesce(with_check, '') ilike '%is_admin%')
--         order by 1, 3, 2;
--   0d  The two sites Paste B tests against: Burnley and Coventry. Both are
--       seeded by 0002, and no later migration renames or deletes a rota_sites
--       row. If this fails, change v_site_a / v_site_b at the top of Paste B to
--       two names from `select name from public.rota_sites order by sort_order`.
--   0b  info rows (pass = null): who holds what today (inventory §8). If every
--       role = admin row is a Regional General Manager / Head of Gymnastics /
--       Head of Operations, and every one of those titles is role = admin, the
--       P3→P4 app/database mismatch is empty.

with
hop as (
  select count(*) as n
  from public.profiles
  where job_title = 'Head of People'
),
drift as (
  select count(*) as n
  from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') ilike '%is_admin%' or coalesce(with_check, '') ilike '%is_admin%')
),
sites as (
  select count(*) as n, string_agg(name, ', ' order by name) as names
  from public.rota_sites
  where name in ('Burnley', 'Coventry')
),
breakdown as (
  select role, job_title, active, count(*) as n
  from public.profiles
  group by role, job_title, active
),
checks as (
  select 1 as ord,
         '0a Head of People profiles' as check_name,
         '0' as expected,
         n::text as actual,
         n = 0 as pass
  from hop
  union all
  select 2,
         '0c live drift: policies calling is_admin()',
         '66',
         n::text,
         n = 66
  from drift
  union all
  select 3,
         '0d test sites exist in rota_sites',
         'Burnley, Coventry',
         coalesce(names, '(none)'),
         n = 2
  from sites
  union all
  select 4,
         format('0b info: role=%s, job_title=%s, active=%s', role, job_title, active),
         'info only',
         n::text,
         null::boolean
  from breakdown
)
select check_name, expected, actual, pass
from checks
order by ord, check_name;


-- ===========================================================================
-- PASTE B — Section 1: BEHAVIOUR TEST (helpers, matrix, Head Office, trigger,
-- profiles RLS). Run AFTER applying 0026.
-- ===========================================================================
--
-- One DO block. It ALWAYS ends with an error. That is deliberate: the error
-- rolls back every change the test made to your profile (and to one other
-- profile, if any exist), so nothing it does is ever committed.
--
-- PASS looks like:
--   ERROR: P3 check complete: <n> checks, 0 failures. (Deliberate error: it rolls back every test change.)
-- FAIL looks like:
--   ERROR: P3 check complete: <n> checks, <k> failures. ... Failures: <details>
-- Any OTHER error, such as a setup failure or an unexpected SQL error, means
-- the test itself didn't finish. Read the message.
--
-- How it works: it sets request.jwt.claims so auth.uid() returns your profile
-- id, then rewrites your own row's job_title / active / site (as postgres,
-- which the trigger lets through) and checks every helper's answer against an
-- expected matrix written out independently below. That matrix is not read
-- from title_has_capability(), so a mistake in 0026's matrix shows up as a
-- failure rather than being copied. For the trigger and RLS tests it switches
-- to the `authenticated` role, the role PostgREST uses for a signed-in user.
--
-- Sites: Burnley (own site, v_site_a) and Coventry (another site, v_site_b).
-- See 0d.

do $$
declare
  v_site_a constant text := 'Burnley';
  v_site_b constant text := 'Coventry';
  v_titles constant text[] := array[
    'Coach', 'Lead Coach', 'Club Head Coach',
    'Regional General Manager', 'Head of Gymnastics', 'Head of Operations'
  ];
  v_caps constant text[] := array[
    'view_all_sites', 'all_sites_scope', 'publish_whats_new', 'manage_policies',
    'manage_users', 'edit_rota', 'manage_club_meetings', 'manage_club_updates',
    'manage_club_roles'
  ];
  v_bogus constant text[] := array['not_a_capability', '', 'EDIT_ROTA', ' edit_rota', 'admin'];

  v_me uuid;
  v_other uuid;
  v_site_a_id uuid;
  v_site_b_id uuid;
  v_title text;
  v_active boolean;
  v_cap text;
  v_set text;
  v_holds boolean;
  v_scope boolean;
  v_rows integer;
  v_checks integer := 0;
  v_fail text[] := '{}';
begin
  -- --- setup ---------------------------------------------------------------
  select id into v_me from public.profiles where email = 'jamie@nilewilsongymnastics.com';
  if v_me is null then
    raise exception 'Setup: no profile for jamie@nilewilsongymnastics.com';
  end if;

  select id into v_site_a_id from public.rota_sites where name = v_site_a;
  select id into v_site_b_id from public.rota_sites where name = v_site_b;
  if v_site_a_id is null or v_site_b_id is null then
    raise exception 'Setup: rota_sites has no row named % and/or %. See check 0d.', v_site_a, v_site_b;
  end if;

  select id into v_other from public.profiles where id <> v_me order by created_at limit 1;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_me, 'role', 'authenticated')::text,
    true
  );
  if auth.uid() is distinct from v_me then
    raise exception 'Setup: auth.uid() did not pick up the simulated JWT claims';
  end if;

  -- --- A. matrix: 6 titles x active/inactive x 9 capabilities --------------
  --
  -- Expected (independent copy of the P2 matrix):
  --   global 5 caps         -> RGM, HoG, HoO
  --   edit_rota, manage_club_meetings, manage_club_updates -> LC, CHC, RGM, HoG, HoO
  --   manage_club_roles     -> CHC, RGM, HoG, HoO
  -- and nothing at all when inactive.
  --
  -- Per title/active/cap, four checks:
  --   has_capability(cap)                      = holds
  --   has_site_capability(cap, own site)       = holds
  --   has_site_capability(cap, another site)   = holds and all_sites_scope
  --   has_site_capability(cap, null)           = false

  foreach v_title in array v_titles loop
    foreach v_active in array array[true, false] loop
      update public.profiles
      set job_title = v_title, active = v_active, site = v_site_a
      where id = v_me;

      v_scope := v_active and v_title in (
        'Regional General Manager', 'Head of Gymnastics', 'Head of Operations');

      foreach v_cap in array v_caps loop
        v_holds := v_active and exists (
          select 1
          from (values
            ('view_all_sites',       'Regional General Manager'),
            ('view_all_sites',       'Head of Gymnastics'),
            ('view_all_sites',       'Head of Operations'),
            ('all_sites_scope',      'Regional General Manager'),
            ('all_sites_scope',      'Head of Gymnastics'),
            ('all_sites_scope',      'Head of Operations'),
            ('publish_whats_new',    'Regional General Manager'),
            ('publish_whats_new',    'Head of Gymnastics'),
            ('publish_whats_new',    'Head of Operations'),
            ('manage_policies',      'Regional General Manager'),
            ('manage_policies',      'Head of Gymnastics'),
            ('manage_policies',      'Head of Operations'),
            ('manage_users',         'Regional General Manager'),
            ('manage_users',         'Head of Gymnastics'),
            ('manage_users',         'Head of Operations'),
            ('edit_rota',            'Lead Coach'),
            ('edit_rota',            'Club Head Coach'),
            ('edit_rota',            'Regional General Manager'),
            ('edit_rota',            'Head of Gymnastics'),
            ('edit_rota',            'Head of Operations'),
            ('manage_club_meetings', 'Lead Coach'),
            ('manage_club_meetings', 'Club Head Coach'),
            ('manage_club_meetings', 'Regional General Manager'),
            ('manage_club_meetings', 'Head of Gymnastics'),
            ('manage_club_meetings', 'Head of Operations'),
            ('manage_club_updates',  'Lead Coach'),
            ('manage_club_updates',  'Club Head Coach'),
            ('manage_club_updates',  'Regional General Manager'),
            ('manage_club_updates',  'Head of Gymnastics'),
            ('manage_club_updates',  'Head of Operations'),
            ('manage_club_roles',    'Club Head Coach'),
            ('manage_club_roles',    'Regional General Manager'),
            ('manage_club_roles',    'Head of Gymnastics'),
            ('manage_club_roles',    'Head of Operations')
          ) as m(cap, title)
          where m.cap = v_cap and m.title = v_title
        );

        v_checks := v_checks + 4;
        if public.has_capability(v_cap) is distinct from v_holds then
          v_fail := v_fail || format('A %s/%s: has_capability(%s) <> %s',
            v_title, case when v_active then 'active' else 'inactive' end, v_cap, v_holds);
        end if;
        if public.has_site_capability(v_cap, v_site_a_id) is distinct from v_holds then
          v_fail := v_fail || format('A %s/%s: has_site_capability(%s, own site) <> %s',
            v_title, case when v_active then 'active' else 'inactive' end, v_cap, v_holds);
        end if;
        if public.has_site_capability(v_cap, v_site_b_id) is distinct from (v_holds and v_scope) then
          v_fail := v_fail || format('A %s/%s: has_site_capability(%s, other site) <> %s',
            v_title, case when v_active then 'active' else 'inactive' end, v_cap, v_holds and v_scope);
        end if;
        if public.has_site_capability(v_cap, null) is distinct from false then
          v_fail := v_fail || format('A %s: has_site_capability(%s, null) was not false', v_title, v_cap);
        end if;
      end loop;

      -- Unknown capability names and null: always false, never an error.
      foreach v_cap in array v_bogus loop
        v_checks := v_checks + 2;
        if public.has_capability(v_cap) is distinct from false then
          v_fail := v_fail || format('A %s: has_capability(%L) was not false', v_title, v_cap);
        end if;
        if public.has_site_capability(v_cap, v_site_a_id) is distinct from false then
          v_fail := v_fail || format('A %s: has_site_capability(%L, own site) was not false', v_title, v_cap);
        end if;
      end loop;
      v_checks := v_checks + 1;
      if public.has_capability(null) is distinct from false then
        v_fail := v_fail || format('A %s: has_capability(null) was not false', v_title);
      end if;
    end loop;
  end loop;

  -- --- B. the matrix function directly: removed / unknown titles ----------
  foreach v_cap in array v_caps loop
    v_checks := v_checks + 3;
    if public.title_has_capability('Head of People', v_cap) is distinct from false then
      v_fail := v_fail || format('B title_has_capability(Head of People, %s) was not false', v_cap);
    end if;
    if public.title_has_capability(null, v_cap) is distinct from false then
      v_fail := v_fail || format('B title_has_capability(null, %s) was not false', v_cap);
    end if;
    if public.title_has_capability('Admin', v_cap) is distinct from false then
      v_fail := v_fail || format('B title_has_capability(Admin, %s) was not false', v_cap);
    end if;
  end loop;

  -- --- C. Head Office: access only through all_sites_scope ----------------
  -- A Head Office profile matches no rota_sites row. Full-access titles reach
  -- both sites; every other title reaches neither.
  foreach v_title in array v_titles loop
    update public.profiles
    set job_title = v_title, active = true, site = 'Head Office'
    where id = v_me;

    v_scope := v_title in ('Regional General Manager', 'Head of Gymnastics', 'Head of Operations');

    v_checks := v_checks + 5;
    if public.has_capability('view_all_sites') is distinct from v_scope then
      v_fail := v_fail || format('C Head Office %s: view_all_sites <> %s', v_title, v_scope);
    end if;
    if public.has_site_capability('edit_rota', v_site_a_id) is distinct from v_scope then
      v_fail := v_fail || format('C Head Office %s: edit_rota at %s <> %s', v_title, v_site_a, v_scope);
    end if;
    if public.has_site_capability('edit_rota', v_site_b_id) is distinct from v_scope then
      v_fail := v_fail || format('C Head Office %s: edit_rota at %s <> %s', v_title, v_site_b, v_scope);
    end if;
    if public.has_site_capability('manage_club_roles', v_site_a_id) is distinct from v_scope then
      v_fail := v_fail || format('C Head Office %s: manage_club_roles at %s <> %s', v_title, v_site_a, v_scope);
    end if;
    if public.has_site_capability('manage_club_updates', v_site_b_id) is distinct from v_scope then
      v_fail := v_fail || format('C Head Office %s: manage_club_updates at %s <> %s', v_title, v_site_b, v_scope);
    end if;
  end loop;

  -- --- D. trigger + profiles RLS as `authenticated` ------------------------
  --
  -- Setup statements run as postgres, which the trigger lets through. Each
  -- test runs inside its own BEGIN ... EXCEPTION block, so SET LOCAL ROLE is
  -- undone when the block errors. Each test also ends with RESET ROLE in case
  -- it didn't error.

  -- D1. Active full-access user cannot change their OWN job_title / site /
  -- active / role. Each attempt must raise 42501 from the trigger.
  foreach v_set in array array[
    'job_title = ''Coach''',
    format('site = %L', v_site_b),
    'active = false',
    'role = case when role = ''admin'' then ''coach'' else ''admin'' end'
  ] loop
    update public.profiles
    set job_title = 'Head of Gymnastics', active = true, site = 'Head Office'
    where id = v_me;

    v_checks := v_checks + 1;
    begin
      set local role authenticated;
      execute format('update public.profiles set %s where id = $1', v_set) using v_me;
      reset role;
      v_fail := v_fail || format('D1 self-update allowed: set %s', v_set);
    exception
      when insufficient_privilege then
        null; -- expected
    end;
    reset role;
  end loop;

  -- D2. The same user CAN change their own full_name. That column isn't guarded.
  v_checks := v_checks + 1;
  set local role authenticated;
  update public.profiles set full_name = full_name || ' (p3 test)' where id = v_me;
  get diagnostics v_rows = row_count;
  reset role;
  if v_rows <> 1 then
    v_fail := v_fail || format('D2 own full_name update by manage_users holder hit %s rows, expected 1', v_rows);
  end if;

  if v_other is null then
    v_fail := v_fail || 'D3-D9 SKIPPED: no second profile exists to test against (counted as a failure so it is not missed)';
  else
    -- D3. Active manage_users holder CAN read and change ANOTHER user's
    -- privileged columns.
    v_checks := v_checks + 3;
    set local role authenticated;
    select count(*) into v_rows from public.profiles where id = v_other;
    reset role;
    if v_rows <> 1 then
      v_fail := v_fail || format('D3 manage_users holder sees %s rows of another profile, expected 1', v_rows);
    end if;

    set local role authenticated;
    update public.profiles
    set site = case when site = v_site_b then v_site_a else v_site_b end
    where id = v_other;
    get diagnostics v_rows = row_count;
    reset role;
    if v_rows <> 1 then
      v_fail := v_fail || format('D3 manage_users holder changing another user''s site hit %s rows, expected 1', v_rows);
    end if;

    set local role authenticated;
    update public.profiles set active = not active where id = v_other;
    get diagnostics v_rows = row_count;
    reset role;
    if v_rows <> 1 then
      v_fail := v_fail || format('D3 manage_users holder toggling another user''s active hit %s rows, expected 1', v_rows);
    end if;

    -- D4–D6. The same title, now INACTIVE: GAP-1 closed. Can read own row
    -- only, and cannot update anyone.
    update public.profiles
    set job_title = 'Head of Gymnastics', active = false, site = 'Head Office'
    where id = v_me;

    v_checks := v_checks + 3;
    set local role authenticated;
    select count(*) into v_rows from public.profiles where id = v_other;
    reset role;
    if v_rows <> 0 then
      v_fail := v_fail || format('D4 inactive HoG sees %s rows of another profile, expected 0', v_rows);
    end if;

    set local role authenticated;
    select count(*) into v_rows from public.profiles where id = v_me;
    reset role;
    if v_rows <> 1 then
      v_fail := v_fail || format('D5 inactive user sees %s rows of own profile, expected 1', v_rows);
    end if;

    set local role authenticated;
    update public.profiles set active = true where id = v_me;
    get diagnostics v_rows = row_count;
    reset role;
    if v_rows <> 0 then
      v_fail := v_fail || format('D6 inactive HoG reactivating self hit %s rows, expected 0 (GAP-1)', v_rows);
    end if;

    -- D7–D9. Active Coach: reads own row only, updates no row.
    update public.profiles
    set job_title = 'Coach', active = true, site = v_site_a
    where id = v_me;

    v_checks := v_checks + 3;
    set local role authenticated;
    select count(*) into v_rows from public.profiles where id = v_other;
    reset role;
    if v_rows <> 0 then
      v_fail := v_fail || format('D7 Coach sees %s rows of another profile, expected 0', v_rows);
    end if;

    set local role authenticated;
    update public.profiles set full_name = full_name where id = v_me;
    get diagnostics v_rows = row_count;
    reset role;
    if v_rows <> 0 then
      v_fail := v_fail || format('D8 Coach updating own row hit %s rows, expected 0', v_rows);
    end if;

    set local role authenticated;
    update public.profiles set active = false where id = v_other;
    get diagnostics v_rows = row_count;
    reset role;
    if v_rows <> 0 then
      v_fail := v_fail || format('D9 Coach deactivating another user hit %s rows, expected 0', v_rows);
    end if;
  end if;

  -- --- E. job_title constraint rejects Head of People ----------------------
  v_checks := v_checks + 1;
  begin
    update public.profiles set job_title = 'Head of People' where id = v_me;
    v_fail := v_fail || 'E job_title = ''Head of People'' was accepted';
  exception
    when check_violation then
      null; -- expected
  end;

  -- --- result (always an error, so everything above rolls back) -----------
  raise exception 'P3 check complete: % checks, % failures.%',
    v_checks,
    coalesce(array_length(v_fail, 1), 0),
    case
      when coalesce(array_length(v_fail, 1), 0) = 0
        then ' (Deliberate error: it rolls back every test change.)'
      else ' Failures: ' || array_to_string(v_fail, ' | ')
    end;
end
$$;


-- ===========================================================================
-- PASTE C — Sections 2–8: post-apply checks (run AFTER 0026 and Paste B)
-- ===========================================================================
--
-- One query, one result set: check_name | expected | actual | pass.
-- A fully passing run shows pass = true on every row. Rows are numbered by
-- the section they came from:
--
--   2a  no policy calls is_admin() or can_edit_rota()
--   2b  no function calls is_admin() or can_edit_rota(). is_admin()'s own
--       body never names itself, and the can_edit_rota() shim's body is
--       has_capability('edit_rota').
--   2c  no policy keeps an old name (_admin_or_own_site / _admin_only /
--       _can_edit_own_site / _own_or_admin)
--   3a  every capability name passed to has_capability / has_site_capability
--       in a policy or function is one of the 9 real ones. An unknown name
--       returns false rather than erroring, so a typo would quietly lock
--       everyone out of that table.
--   3b  number of policies using each capability (9 rows), plus the total of
--       66. has_site_capability() checks all_sites_scope internally. That use
--       is inside the function, not in a policy, so it does not count here.
--   4a  policy count per affected table (19 rows), plus the total of 68: the
--       66 replaced policies plus policies_select_authenticated and
--       whats_new_select_authenticated, which 0026 leaves alone.
--   4b  all 66 new policies exist with the right command, to authenticated only
--   5   security settings and grants for each of the 7 functions:
--       secdef / volatility / config (search_path) / anon / authenticated /
--       PUBLIC execute. config `search_path=""` is how Postgres stores
--       `set search_path = ''`.
--         authenticated keeps Supabase's default grant on the trigger function.
--         That's harmless: a trigger function cannot be called directly, and
--         firing a trigger does not check EXECUTE.
--         service_role keeps its default grant on all of them (agreed), so it
--         isn't checked.
--   6   trigger profiles_guard_privileged_columns: present, enabled (O),
--       BEFORE UPDATE ... FOR EACH ROW WHEN (... IS DISTINCT FROM ...)
--   7a  profiles check constraints: 3 in total. job_title holds exactly the 6
--       agreed titles with no Head of People. role still holds exactly 'admin'
--       and 'coach', and site the 7 sites plus Head Office (both unchanged).
--       The role and site constraint names were generated by Postgres from
--       0001's inline checks, so they are matched by column, not by name.
--   7b  profiles.role default still 'coach'::text
--   7c  is_admin() still exists (P5 drops it)
--   8   no profile has job_title = 'Head of People'. The role x job_title x
--       active snapshot that used to be part of section 8 is now Paste D (info
--       only), so every row here has a pass/fail answer.

with
pol as (
  select tablename::text as tablename,
         policyname::text as policyname,
         cmd,
         roles,
         coalesce(qual, '') || ' ' || coalesce(with_check, '') as body
  from pg_policies
  where schemaname = 'public'
),
fn as (
  select p.oid, p.proname::text as proname, p.prosrc
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
),

-- --- 2 ------------------------------------------------------------------
c2a as (
  select count(*) as n,
         string_agg(tablename || '.' || policyname, ', ' order by tablename, policyname) as list
  from pol
  where body ~ '(is_admin|can_edit_rota)\s*\('
),
c2b as (
  select count(*) as n,
         string_agg(proname, ', ' order by proname) as list
  from fn
  where prosrc ~ '(is_admin|can_edit_rota)\s*\('
),
c2c as (
  select count(*) as n,
         string_agg(tablename || '.' || policyname, ', ' order by tablename, policyname) as list
  from pol
  where policyname ~ '(_admin_or_own_site|_admin_only|_can_edit_own_site|_own_or_admin)$'
),

-- --- 3 ------------------------------------------------------------------
cap_expected (cap, n) as (
  values
    ('all_sites_scope', 2),
    ('edit_rota', 27),
    ('manage_club_meetings', 9),
    ('manage_club_roles', 3),
    ('manage_club_updates', 3),
    ('manage_policies', 3),
    ('manage_users', 2),
    ('publish_whats_new', 3),
    ('view_all_sites', 14)
),
literals as (
  select 'policy ' || tablename || '.' || policyname as source,
         tablename || '.' || policyname as policy_key,
         m[1] as cap
  from pol,
       regexp_matches(body, 'has_(?:site_)?capability\(\s*''([^'']*)''', 'g') as m
  union all
  select 'function ' || proname,
         null,
         m[1]
  from fn,
       regexp_matches(prosrc, 'has_(?:site_)?capability\(\s*''([^'']*)''', 'g') as m
),
c3a as (
  select count(*) as n,
         string_agg(source || ' -> ' || quote_literal(cap), ', ' order by source) as list
  from literals
  where cap not in (select cap from cap_expected)
),
cap_actual as (
  select cap, count(distinct policy_key) as n
  from literals
  where policy_key is not null
  group by cap
),

-- --- 4 ------------------------------------------------------------------
tbl_expected (tablename, n) as (
  values
    ('profiles', 2),
    ('rota_coaches', 4),
    ('rota_standard_roster', 4),
    ('rota_standard_classes', 4),
    ('rota_weekly_rotas', 4),
    ('rota_weekly_roster', 4),
    ('rota_weekly_classes', 4),
    ('rota_restructures', 4),
    ('rota_restructure_roster', 4),
    ('rota_restructure_classes', 4),
    ('club_meetings', 4),
    ('club_meeting_attendees', 4),
    ('club_meeting_cycle_weeks', 4),
    ('heroes', 1),
    ('hero_hours', 1),
    ('club_updates', 4),
    ('club_role_assignments', 4),
    ('policies', 4),
    ('whats_new', 4)
),
tbl_actual as (
  select e.tablename, e.n as expected, count(p.policyname) as actual
  from tbl_expected e
  left join pol p on p.tablename = e.tablename
  group by e.tablename, e.n
),
pol_expected (tablename, policyname, cmd) as (
  values
    ('profiles', 'profiles_select_own_or_manage_users', 'SELECT'),
    ('profiles', 'profiles_update_manage_users', 'UPDATE'),
    ('rota_coaches', 'rota_coaches_select_own_site_or_view_all', 'SELECT'),
    ('rota_coaches', 'rota_coaches_insert_edit_rota_site', 'INSERT'),
    ('rota_coaches', 'rota_coaches_update_edit_rota_site', 'UPDATE'),
    ('rota_coaches', 'rota_coaches_delete_edit_rota_site', 'DELETE'),
    ('rota_standard_roster', 'rota_standard_roster_select_own_site_or_view_all', 'SELECT'),
    ('rota_standard_roster', 'rota_standard_roster_insert_edit_rota_site', 'INSERT'),
    ('rota_standard_roster', 'rota_standard_roster_update_edit_rota_site', 'UPDATE'),
    ('rota_standard_roster', 'rota_standard_roster_delete_edit_rota_site', 'DELETE'),
    ('rota_standard_classes', 'rota_standard_classes_select_own_site_or_view_all', 'SELECT'),
    ('rota_standard_classes', 'rota_standard_classes_insert_edit_rota_site', 'INSERT'),
    ('rota_standard_classes', 'rota_standard_classes_update_edit_rota_site', 'UPDATE'),
    ('rota_standard_classes', 'rota_standard_classes_delete_edit_rota_site', 'DELETE'),
    ('rota_weekly_rotas', 'rota_weekly_rotas_select_own_site_or_view_all', 'SELECT'),
    ('rota_weekly_rotas', 'rota_weekly_rotas_insert_edit_rota_site', 'INSERT'),
    ('rota_weekly_rotas', 'rota_weekly_rotas_update_edit_rota_site', 'UPDATE'),
    ('rota_weekly_rotas', 'rota_weekly_rotas_delete_edit_rota_site', 'DELETE'),
    ('rota_weekly_roster', 'rota_weekly_roster_select_own_site_or_view_all', 'SELECT'),
    ('rota_weekly_roster', 'rota_weekly_roster_insert_edit_rota_site', 'INSERT'),
    ('rota_weekly_roster', 'rota_weekly_roster_update_edit_rota_site', 'UPDATE'),
    ('rota_weekly_roster', 'rota_weekly_roster_delete_edit_rota_site', 'DELETE'),
    ('rota_weekly_classes', 'rota_weekly_classes_select_own_site_or_view_all', 'SELECT'),
    ('rota_weekly_classes', 'rota_weekly_classes_insert_edit_rota_site', 'INSERT'),
    ('rota_weekly_classes', 'rota_weekly_classes_update_edit_rota_site', 'UPDATE'),
    ('rota_weekly_classes', 'rota_weekly_classes_delete_edit_rota_site', 'DELETE'),
    ('rota_restructures', 'rota_restructures_select_own_site_or_view_all', 'SELECT'),
    ('rota_restructures', 'rota_restructures_insert_edit_rota_site', 'INSERT'),
    ('rota_restructures', 'rota_restructures_update_edit_rota_site', 'UPDATE'),
    ('rota_restructures', 'rota_restructures_delete_edit_rota_site', 'DELETE'),
    ('rota_restructure_roster', 'rota_restructure_roster_select_own_site_or_view_all', 'SELECT'),
    ('rota_restructure_roster', 'rota_restructure_roster_insert_edit_rota_site', 'INSERT'),
    ('rota_restructure_roster', 'rota_restructure_roster_update_edit_rota_site', 'UPDATE'),
    ('rota_restructure_roster', 'rota_restructure_roster_delete_edit_rota_site', 'DELETE'),
    ('rota_restructure_classes', 'rota_restructure_classes_select_own_site_or_view_all', 'SELECT'),
    ('rota_restructure_classes', 'rota_restructure_classes_insert_edit_rota_site', 'INSERT'),
    ('rota_restructure_classes', 'rota_restructure_classes_update_edit_rota_site', 'UPDATE'),
    ('rota_restructure_classes', 'rota_restructure_classes_delete_edit_rota_site', 'DELETE'),
    ('club_meetings', 'club_meetings_select_own_site_or_view_all', 'SELECT'),
    ('club_meetings', 'club_meetings_insert_manage_meetings_site', 'INSERT'),
    ('club_meetings', 'club_meetings_update_manage_meetings_site', 'UPDATE'),
    ('club_meetings', 'club_meetings_delete_manage_meetings_site', 'DELETE'),
    ('club_meeting_attendees', 'club_meeting_attendees_select_own_site_or_view_all', 'SELECT'),
    ('club_meeting_attendees', 'club_meeting_attendees_insert_manage_meetings_site', 'INSERT'),
    ('club_meeting_attendees', 'club_meeting_attendees_update_manage_meetings_site', 'UPDATE'),
    ('club_meeting_attendees', 'club_meeting_attendees_delete_manage_meetings_site', 'DELETE'),
    ('club_meeting_cycle_weeks', 'club_meeting_cycle_weeks_select_own_site_or_view_all', 'SELECT'),
    ('club_meeting_cycle_weeks', 'club_meeting_cycle_weeks_insert_manage_meetings_site', 'INSERT'),
    ('club_meeting_cycle_weeks', 'club_meeting_cycle_weeks_update_manage_meetings_site', 'UPDATE'),
    ('club_meeting_cycle_weeks', 'club_meeting_cycle_weeks_delete_manage_meetings_site', 'DELETE'),
    ('heroes', 'heroes_all_own_site_or_all_sites', 'ALL'),
    ('hero_hours', 'hero_hours_all_own_site_or_all_sites', 'ALL'),
    ('club_role_assignments', 'club_role_assignments_select_own_site_or_view_all', 'SELECT'),
    ('club_role_assignments', 'club_role_assignments_insert_manage_club_roles', 'INSERT'),
    ('club_role_assignments', 'club_role_assignments_update_manage_club_roles', 'UPDATE'),
    ('club_role_assignments', 'club_role_assignments_delete_manage_club_roles', 'DELETE'),
    ('club_updates', 'club_updates_select_own_site_or_view_all', 'SELECT'),
    ('club_updates', 'club_updates_insert_manage_club_updates', 'INSERT'),
    ('club_updates', 'club_updates_update_manage_club_updates', 'UPDATE'),
    ('club_updates', 'club_updates_delete_manage_club_updates', 'DELETE'),
    ('policies', 'policies_insert_manage_policies', 'INSERT'),
    ('policies', 'policies_update_manage_policies', 'UPDATE'),
    ('policies', 'policies_delete_manage_policies', 'DELETE'),
    ('whats_new', 'whats_new_insert_publish_whats_new', 'INSERT'),
    ('whats_new', 'whats_new_update_publish_whats_new', 'UPDATE'),
    ('whats_new', 'whats_new_delete_publish_whats_new', 'DELETE')
),
c4b as (
  select count(*) as n,
         string_agg(
           e.tablename || '.' || e.policyname ||
             case
               when p.policyname is null then ' (missing)'
               when p.cmd <> e.cmd then ' (cmd ' || p.cmd || ', expected ' || e.cmd || ')'
               else ' (roles ' || p.roles::text || ')'
             end,
           ', ' order by e.tablename, e.policyname
         ) as list
  from pol_expected e
  left join pol p on p.tablename = e.tablename and p.policyname = e.policyname
  where p.policyname is null
     or p.cmd <> e.cmd
     or p.roles <> array['authenticated']::name[]
),

-- --- 5 ------------------------------------------------------------------
fn_expected (proname, expected) as (
  values
    ('can_edit_rota',                     'secdef=true vol=s config=search_path="" anon=false authn=true public=false'),
    ('has_capability',                    'secdef=true vol=s config=search_path="" anon=false authn=true public=false'),
    ('has_site_capability',               'secdef=true vol=s config=search_path="" anon=false authn=true public=false'),
    ('profiles_guard_privileged_columns', 'secdef=false vol=v config=search_path="" anon=false authn=true public=false'),
    ('title_has_capability',              'secdef=false vol=i config=search_path="" anon=false authn=false public=false'),
    ('upsert_restructure',                'secdef=true vol=v config=search_path=public anon=false authn=true public=false'),
    ('upsert_weekly_rota',                'secdef=true vol=v config=search_path=public anon=false authn=true public=false')
),
fn_actual as (
  select f.proname,
         format(
           'secdef=%s vol=%s config=%s anon=%s authn=%s public=%s',
           p.prosecdef::text,
           p.provolatile::text,
           coalesce(array_to_string(p.proconfig, ','), '(none)'),
           has_function_privilege('anon', p.oid, 'execute')::text,
           has_function_privilege('authenticated', p.oid, 'execute')::text,
           exists (
             select 1
             from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
             where a.grantee = 0 and a.privilege_type = 'EXECUTE'
           )::text
         ) as actual
  from fn f
  join pg_proc p on p.oid = f.oid
),

-- --- 6 ------------------------------------------------------------------
c6 as (
  select count(*) as n,
         string_agg(t.tgname::text || ' enabled=' || t.tgenabled::text, ', ') as list,
         coalesce(bool_and(
           t.tgname = 'profiles_guard_privileged_columns'
           and t.tgenabled = 'O'
           and pg_get_triggerdef(t.oid) ~ 'BEFORE UPDATE .* FOR EACH ROW WHEN .* IS DISTINCT FROM'
         ), false) as ok
  from pg_trigger t
  where t.tgrelid = 'public.profiles'::regclass
    and not t.tgisinternal
),

-- --- 7 ------------------------------------------------------------------
con as (
  select c.conname::text as conname,
         pg_get_constraintdef(c.oid) as def,
         (select array_agg(a.attname::text order by a.attname)
          from pg_attribute a
          where a.attrelid = c.conrelid and a.attnum = any (c.conkey)) as cols
  from pg_constraint c
  where c.conrelid = 'public.profiles'::regclass
    and c.contype = 'c'
),
con_check (ord, label, col, expected_values, forbidden) as (
  values
    (1, 'job_title', 'job_title',
        array['Coach', 'Lead Coach', 'Club Head Coach', 'Regional General Manager',
              'Head of Gymnastics', 'Head of Operations'],
        'Head of People'),
    (2, 'role', 'role',
        array['admin', 'coach'],
        null),
    (3, 'site', 'site',
        array['Burnley', 'Coventry', 'Leeds', 'Mansfield', 'Rotherham', 'Wirral',
              'Wolverhampton', 'Head Office'],
        null)
),
c7a as (
  select k.ord,
         k.label,
         k.expected_values,
         count(c.conname) as n,
         string_agg(c.conname || ': ' || c.def, ' | ') as list,
         coalesce(bool_and(
           -- every expected value is quoted in the definition ...
           (select bool_and(c.def like '%''' || v || '''%') from unnest(k.expected_values) v)
           -- ... nothing else is (count the quoted ::text literals) ...
           and array_length(regexp_split_to_array(c.def, '::text'), 1) - 1
               = cardinality(k.expected_values)
           -- ... and the forbidden value is absent
           and (k.forbidden is null or c.def not like '%' || k.forbidden || '%')
         ), false) as ok
  from con_check k
  left join con c on c.cols = array[k.col]
  group by k.ord, k.label, k.expected_values
),
c7b as (
  select coalesce(max(column_default), '(no default)') as actual
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles' and column_name = 'role'
),
c7c as (
  select count(*) as n
  from fn
  where proname = 'is_admin'
),

-- --- 8 ------------------------------------------------------------------
c8 as (
  select count(*) as n
  from public.profiles
  where job_title = 'Head of People'
),

-- --- assemble -----------------------------------------------------------
checks as (
  select 10 as ord, 0 as sub,
         '2a policies calling is_admin()/can_edit_rota()' as check_name,
         '0' as expected,
         n::text || coalesce(': ' || list, '') as actual,
         n = 0 as pass
  from c2a
  union all
  select 20, 0, '2b functions calling is_admin()/can_edit_rota()', '0',
         n::text || coalesce(': ' || list, ''), n = 0
  from c2b
  union all
  select 30, 0, '2c policies with old names', '0',
         n::text || coalesce(': ' || list, ''), n = 0
  from c2c
  union all
  select 40, 0, '3a unknown capability names in policies/functions', '0',
         n::text || coalesce(': ' || list, ''), n = 0
  from c3a
  union all
  select 50, row_number() over (order by e.cap),
         '3b policies using ' || e.cap,
         e.n::text,
         coalesce(a.n, 0)::text,
         coalesce(a.n, 0) = e.n
  from cap_expected e
  left join cap_actual a on a.cap = e.cap
  union all
  select 59, 0, '3b total policy uses across the 9 capabilities', '66',
         coalesce(sum(a.n), 0)::text, coalesce(sum(a.n), 0) = 66
  from cap_actual a
  where a.cap in (select cap from cap_expected)
  union all
  select 60, row_number() over (order by tablename),
         '4a policies on ' || tablename,
         expected::text,
         actual::text,
         actual = expected
  from tbl_actual
  union all
  select 69, 0, '4a total policies on the 19 affected tables', '68',
         count(*)::text, count(*) = 68
  from pol
  where tablename in (select tablename from tbl_expected)
  union all
  select 70, 0, '4b the 66 new policies: present, right command, to authenticated',
         '0 problems',
         n::text || ' problems' || coalesce(': ' || list, ''),
         n = 0
  from c4b
  union all
  select 80, row_number() over (order by e.proname),
         '5 function ' || e.proname,
         e.expected,
         coalesce(string_agg(a.actual, ' || '), '(function missing)'),
         coalesce(bool_and(a.actual = e.expected) and count(a.actual) = 1, false)
  from fn_expected e
  left join fn_actual a on a.proname = e.proname
  group by e.proname, e.expected
  union all
  select 90, 0, '6 trigger profiles_guard_privileged_columns',
         '1 trigger: profiles_guard_privileged_columns enabled=O, BEFORE UPDATE FOR EACH ROW WHEN ... IS DISTINCT FROM',
         n::text || coalesce(': ' || list, ''),
         n = 1 and ok
  from c6
  union all
  select 100, 0, '7a profiles check constraints (total)', '3',
         count(*)::text, count(*) = 3
  from con
  union all
  select 100, ord,
         '7a ' || label || ' check constraint',
         'exactly: ' || array_to_string(expected_values, ', '),
         coalesce(list, '(no check constraint on ' || label || ')'),
         n = 1 and ok
  from c7a
  union all
  select 110, 0, '7b profiles.role default', '''coach''::text',
         actual, actual = '''coach''::text'
  from c7b
  union all
  select 120, 0, '7c is_admin() still exists (dropped in P5)', '1',
         n::text, n = 1
  from c7c
  union all
  select 130, 0, '8 Head of People profiles', '0',
         n::text, n = 0
  from c8
)
select check_name, expected, actual, pass
from checks
order by ord, sub;


-- ===========================================================================
-- PASTE D — optional, info only: post-apply role x job_title x active snapshot
-- ===========================================================================
--
-- Same breakdown as Paste A's "0b info" rows. Compare the two to see who
-- gained or lost what (see permissions-p3-phase-a.md, flags E1–E4 / U1–U4).
-- No pass column: this is for reading.

select role, job_title, active, count(*) as profiles
from public.profiles
group by role, job_title, active
order by role, job_title, active desc;
