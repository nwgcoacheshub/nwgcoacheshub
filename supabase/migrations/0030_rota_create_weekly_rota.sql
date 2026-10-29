-- NWG Coaches Hub — Rota landing redesign: create-only weeks, roster-filtered copies
--
-- Follows docs/investigations/rota-landing-phase1-investigation.md (sections C,
-- D, F3, G) and the 21 decisions approved after it. Report:
-- docs/investigations/rota-landing-0030-migration.md.
--
-- What this file does, in order:
--   1. Adds a CHECK constraint on rota_weekly_rotas: week_start_date must be a
--      Monday (ISO day 1). There are 0 weekly rows today, so nothing can fail.
--   2. Adds copy_into_weekly_rota(uuid, uuid, uuid), an internal helper that
--      fills a weekly rota from the Standard Rota or from another week of the
--      same site, keeping only coaches who are assignable at the site
--      (site_rota_roster). EXECUTE is revoked from public, anon and
--      authenticated; only the two functions below call it.
--   3. Adds create_weekly_rota(uuid, date, uuid default null), the create-only
--      "Add week" path. Same 3 caller checks as upsert_weekly_rota, a Monday
--      check, and a range check (this London week to +16 weeks). A week that
--      already exists raises unique_violation (23505).
--   4. Replaces upsert_weekly_rota(uuid, date) and makes it Regenerate-only.
--      Same signature and caller checks, plus a Monday check. It no longer
--      creates weeks: a week that doesn't exist raises P0002. It locks the
--      week row (FOR UPDATE) before refilling it from the Standard Rota with
--      the same roster filtering as item 3. search_path moves from public
--      to ''.
--   5. Drops the policy rota_weekly_rotas_insert_edit_rota_site, so weeks are
--      created only through create_weekly_rota. The select, update and
--      delete policies on rota_weekly_rotas, and every child-table policy, are
--      unchanged.
--
-- Roster filtering (items 2-4). "Assignable" is whatever site_rota_roster
-- (0029) returns: active profiles at the site titled Coach, Lead Coach or Club
-- Head Coach. It is reused, not re-implemented.
--   * Roster rows whose coach is not assignable are dropped.
--   * Class rows are all copied. coach_id and set_coach_id are set to NULL
--     where they are not assignable (the class then shows as Unassigned).
--     Orphans (an assignable coach not rostered that day) are copied as-is.
--   * A copy from another week resets roster status to 'working'; leave and
--     sick belong to the source week. A copy from the Standard Rota keeps
--     status as-is.
--
-- site_rota_roster returns an empty set, not an error, to a caller who cannot
-- read the site's rota. Its caller check (is_active_coach() and either
-- view_all_sites or the caller's site name-matching) passes for every caller
-- who passes has_site_capability('edit_rota', site): all_sites_scope and
-- view_all_sites are held by the same 3 titles in title_has_capability(), and
-- the own-site branch is the same name join. If either check is ever changed,
-- recheck this, or copies would silently drop every coach.
--
-- upsert_restructure, site_rota_roster, site_rota_people and every standard
-- and restructure table and policy are untouched. No app code changes here;
-- the app moves to create_weekly_rota in Phase 2b.
--
-- Applied manually by Jamie as a single paste in the Supabase SQL Editor.
-- Wrapped in an explicit transaction for the reasons 0026 gives: all or
-- nothing. No down migration, matching 0001-0029.

begin;

-- ---------------------------------------------------------------------------
-- 1. Weeks start on a Monday
-- ---------------------------------------------------------------------------
--
-- The app already canonicalises to Monday (lib/rota/week.ts); this makes it a
-- database rule. Both functions below also check it themselves, so callers get
-- a readable message rather than a constraint violation.

alter table public.rota_weekly_rotas
  add constraint rota_weekly_rotas_week_start_is_monday
  check (extract(isodow from week_start_date) = 1);

-- ---------------------------------------------------------------------------
-- 2. copy_into_weekly_rota(uuid, uuid, uuid) — internal
-- ---------------------------------------------------------------------------
--
-- Fills the (empty) weekly rota p_weekly_rota_id at site p_site_id from:
--   * the site's Standard Rota, when p_source_weekly_rota_id is NULL;
--   * that weekly rota otherwise. The source is joined on site_id =
--     p_site_id, so another site's week copies nothing even if a caller
--     forgot to check; create_weekly_rota checks and raises first.
--
-- It does no authorisation of its own. Its callers do, and EXECUTE is revoked
-- from public, anon and authenticated, so only they (running as the function
-- owner) can reach it. service_role keeps its Supabase default grant, as
-- title_has_capability() does.
--
-- site_rota_roster is called once, as the caller (auth.uid() is unchanged
-- under security definer), and its ids held in an array. A NULL coach_id or
-- set_coach_id fails `= any (...)` and stays NULL.
--
-- The source rows are already unique on (parent, day, coach) and satisfy the
-- one-lead / one-cash-up indexes, so any subset of them does too.

create function public.copy_into_weekly_rota(
  p_weekly_rota_id uuid,
  p_site_id uuid,
  p_source_weekly_rota_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignable uuid[];
begin
  select coalesce(array_agg(r.id), '{}')
    into v_assignable
  from public.site_rota_roster(p_site_id) r;

  if p_source_weekly_rota_id is null then
    insert into public.rota_weekly_roster (
      weekly_rota_id, day_of_week, coach_id, sort_order,
      shift_start_mins, shift_end_mins, status,
      is_key_holder, is_lead, is_cashing_up
    )
    select
      p_weekly_rota_id, r.day_of_week, r.coach_id, r.sort_order,
      r.shift_start_mins, r.shift_end_mins, r.status,
      r.is_key_holder, r.is_lead, r.is_cashing_up
    from public.rota_standard_roster r
    where r.site_id = p_site_id
      and r.coach_id = any (v_assignable);

    insert into public.rota_weekly_classes (
      weekly_rota_id, day_of_week, coach_id, set_coach_id,
      class_catalogue_id, title, category_key, meta,
      start_mins, duration_mins
    )
    select
      p_weekly_rota_id, c.day_of_week,
      case when c.coach_id = any (v_assignable) then c.coach_id end,
      case when c.set_coach_id = any (v_assignable) then c.set_coach_id end,
      c.class_catalogue_id, c.title, c.category_key, c.meta,
      c.start_mins, c.duration_mins
    from public.rota_standard_classes c
    where c.site_id = p_site_id;
  else
    insert into public.rota_weekly_roster (
      weekly_rota_id, day_of_week, coach_id, sort_order,
      shift_start_mins, shift_end_mins, status,
      is_key_holder, is_lead, is_cashing_up
    )
    select
      p_weekly_rota_id, r.day_of_week, r.coach_id, r.sort_order,
      r.shift_start_mins, r.shift_end_mins, 'working',
      r.is_key_holder, r.is_lead, r.is_cashing_up
    from public.rota_weekly_roster r
    join public.rota_weekly_rotas w on w.id = r.weekly_rota_id
    where r.weekly_rota_id = p_source_weekly_rota_id
      and w.site_id = p_site_id
      and r.coach_id = any (v_assignable);

    insert into public.rota_weekly_classes (
      weekly_rota_id, day_of_week, coach_id, set_coach_id,
      class_catalogue_id, title, category_key, meta,
      start_mins, duration_mins
    )
    select
      p_weekly_rota_id, c.day_of_week,
      case when c.coach_id = any (v_assignable) then c.coach_id end,
      case when c.set_coach_id = any (v_assignable) then c.set_coach_id end,
      c.class_catalogue_id, c.title, c.category_key, c.meta,
      c.start_mins, c.duration_mins
    from public.rota_weekly_classes c
    join public.rota_weekly_rotas w on w.id = c.weekly_rota_id
    where c.weekly_rota_id = p_source_weekly_rota_id
      and w.site_id = p_site_id;
  end if;
end;
$$;

revoke all on function public.copy_into_weekly_rota(uuid, uuid, uuid) from public;
revoke all on function public.copy_into_weekly_rota(uuid, uuid, uuid) from anon;
revoke all on function public.copy_into_weekly_rota(uuid, uuid, uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- 3. create_weekly_rota(uuid, date, uuid) — "Add week"
-- ---------------------------------------------------------------------------
--
-- Create-only. The INSERT has no ON CONFLICT clause, so a week that already
-- exists raises unique_violation (23505) on unique (site_id, week_start_date).
-- That also settles two simultaneous requests: the second waits on the first
-- and then fails.
--
-- The 3 caller checks and their messages are the ones upsert_weekly_rota has
-- used since 0026, so the app can show them the same way.
--
-- "This week" is the Monday of today in Europe/London. The range is that
-- Monday to +16 weeks inclusive: 17 possible weeks.
--
-- Any existing week of the same site, past or future, can be the source.

create function public.create_weekly_rota(
  p_site_id uuid,
  p_week_start date,
  p_source_weekly_rota_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_this_monday date;
  v_weekly_rota_id uuid;
begin
  if not public.is_active_coach() then
    raise exception 'Your account has been deactivated';
  end if;

  if not public.has_capability('edit_rota') then
    raise exception 'Your job title does not have rota edit rights';
  end if;

  if not public.has_site_capability('edit_rota', p_site_id) then
    raise exception 'Not authorized to generate a rota for this site';
  end if;

  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception 'A week must start on a Monday'
      using errcode = '22023';
  end if;

  v_today := (now() at time zone 'Europe/London')::date;
  v_this_monday := v_today - (extract(isodow from v_today)::int - 1);

  if p_week_start < v_this_monday or p_week_start > v_this_monday + 16 * 7 then
    raise exception 'A week can only be added from this week up to 16 weeks ahead'
      using errcode = '22023';
  end if;

  if p_source_weekly_rota_id is not null and not exists (
    select 1 from public.rota_weekly_rotas w
    where w.id = p_source_weekly_rota_id and w.site_id = p_site_id
  ) then
    raise exception 'The week to copy was not found at this site'
      using errcode = 'P0002';
  end if;

  insert into public.rota_weekly_rotas (site_id, week_start_date, generated_at, generated_by)
  values (p_site_id, p_week_start, now(), auth.uid())
  returning id into v_weekly_rota_id;

  perform public.copy_into_weekly_rota(v_weekly_rota_id, p_site_id, p_source_weekly_rota_id);

  return v_weekly_rota_id;
end;
$$;

revoke all on function public.create_weekly_rota(uuid, date, uuid) from public;
revoke all on function public.create_weekly_rota(uuid, date, uuid) from anon;
grant execute on function public.create_weekly_rota(uuid, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. upsert_weekly_rota(uuid, date) — Regenerate
-- ---------------------------------------------------------------------------
--
-- Regenerate-only. Same signature, return type and caller checks (order and
-- messages) as 0026. New: a Monday check, and the week must already exist.
-- The function no longer inserts into rota_weekly_rotas, so create_weekly_rota
-- is the only way to create a week, with its create-only rule and 17-week
-- range. A missing week raises P0002.
--
-- The week row is locked FOR UPDATE before its child rows are deleted, so two
-- Regenerates of the same week, or a Regenerate racing a Delete week, run one
-- after the other. The row id is kept, generated_at/generated_by are bumped,
-- and both child tables are emptied and refilled from the Standard Rota
-- through copy_into_weekly_rota, so the refill is roster-filtered. No range
-- check: Regenerate works on any existing week.
--
-- After this file is applied, the current app's Generate button (on an
-- uncreated week) calls this function and gets the P0002 error, until Phase
-- 2a removes that button.
--
-- search_path changes from public to '' (0029 style); every reference was
-- already schema-qualified.

create or replace function public.upsert_weekly_rota(p_site_id uuid, p_week_start date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_weekly_rota_id uuid;
begin
  if not public.is_active_coach() then
    raise exception 'Your account has been deactivated';
  end if;

  if not public.has_capability('edit_rota') then
    raise exception 'Your job title does not have rota edit rights';
  end if;

  if not public.has_site_capability('edit_rota', p_site_id) then
    raise exception 'Not authorized to generate a rota for this site';
  end if;

  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception 'A week must start on a Monday'
      using errcode = '22023';
  end if;

  select w.id
    into v_weekly_rota_id
  from public.rota_weekly_rotas w
  where w.site_id = p_site_id
    and w.week_start_date = p_week_start
  for update;

  if v_weekly_rota_id is null then
    raise exception 'This week has not been created yet'
      using errcode = 'P0002';
  end if;

  update public.rota_weekly_rotas
     set generated_at = now(),
         generated_by = auth.uid()
   where id = v_weekly_rota_id;

  delete from public.rota_weekly_classes where weekly_rota_id = v_weekly_rota_id;
  delete from public.rota_weekly_roster where weekly_rota_id = v_weekly_rota_id;

  perform public.copy_into_weekly_rota(v_weekly_rota_id, p_site_id, null);

  return v_weekly_rota_id;
end;
$$;

revoke all on function public.upsert_weekly_rota(uuid, date) from public;
revoke all on function public.upsert_weekly_rota(uuid, date) from anon;
grant execute on function public.upsert_weekly_rota(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Weeks are created only through the functions above
-- ---------------------------------------------------------------------------
--
-- No app code inserts into rota_weekly_rotas directly (the investigation's C1;
-- the two .from("rota_weekly_rotas") calls in app/ are selects). Both
-- functions are security definer and do not need this policy.

drop policy "rota_weekly_rotas_insert_edit_rota_site" on public.rota_weekly_rotas;

commit;
