-- NWG Coaches Hub — Rota retcon, phase 2: rota_coaches -> profiles
--
-- Replaces rota_coaches with profiles as the single source of rota coaches.
-- All rota data and club meeting attendee lists are wiped deliberately; no
-- history is kept. rota_sites, rota_categories and rota_class_catalogue are
-- untouched.
--
-- In order:
--   1. Truncate the 8 rota data tables and club_meeting_attendees.
--   2. Drop the 10 FKs that reference rota_coaches (names are the Postgres
--      defaults for the inline references in 0002, 0016 and 0022; a wrong name
--      aborts the whole file).
--   3. Drop rota_coaches (and with it its 4 RLS policies).
--   4. Re-add the 10 FKs to profiles (id), ON DELETE RESTRICT. Profiles are
--      deactivated, not deleted. Deleting an auth user (which cascades to
--      profiles) now fails while they appear on a rota or meeting.
--   5. Make coach_id nullable on the 3 class tables (standard, weekly,
--      restructure). Roster coach_id stays NOT NULL.
--   6. Add site_rota_roster(uuid) and its grants.
--   7. Add site_rota_people(uuid) and its grants.
--
-- coach_id IS NULL on a class row means an unassigned class.
--
-- upsert_weekly_rota and upsert_restructure are unchanged: they only copy
-- coach_id values between tables, and copy a NULL coach_id as-is.
--
-- One transaction: all-or-nothing, with no window where the FKs are missing.
-- No down migration, matching 0001-0028.

begin;

-- ---------------------------------------------------------------------------
-- 1. Wipe
-- ---------------------------------------------------------------------------

truncate table
  public.rota_standard_roster,
  public.rota_standard_classes,
  public.rota_weekly_rotas,
  public.rota_weekly_roster,
  public.rota_weekly_classes,
  public.rota_restructures,
  public.rota_restructure_roster,
  public.rota_restructure_classes,
  public.club_meeting_attendees;

-- ---------------------------------------------------------------------------
-- 2. Drop the old FKs
-- ---------------------------------------------------------------------------

alter table public.rota_standard_roster
  drop constraint rota_standard_roster_coach_id_fkey;
alter table public.rota_standard_classes
  drop constraint rota_standard_classes_coach_id_fkey;
alter table public.rota_standard_classes
  drop constraint rota_standard_classes_set_coach_id_fkey;
alter table public.rota_weekly_roster
  drop constraint rota_weekly_roster_coach_id_fkey;
alter table public.rota_weekly_classes
  drop constraint rota_weekly_classes_coach_id_fkey;
alter table public.rota_weekly_classes
  drop constraint rota_weekly_classes_set_coach_id_fkey;
alter table public.rota_restructure_roster
  drop constraint rota_restructure_roster_coach_id_fkey;
alter table public.rota_restructure_classes
  drop constraint rota_restructure_classes_coach_id_fkey;
alter table public.rota_restructure_classes
  drop constraint rota_restructure_classes_set_coach_id_fkey;
alter table public.club_meeting_attendees
  drop constraint club_meeting_attendees_coach_id_fkey;

-- ---------------------------------------------------------------------------
-- 3. Drop rota_coaches
-- ---------------------------------------------------------------------------

drop table public.rota_coaches;

-- ---------------------------------------------------------------------------
-- 4. New FKs to profiles (id)
-- ---------------------------------------------------------------------------

alter table public.rota_standard_roster
  add constraint rota_standard_roster_coach_id_fkey
  foreign key (coach_id) references public.profiles (id) on delete restrict;
alter table public.rota_standard_classes
  add constraint rota_standard_classes_coach_id_fkey
  foreign key (coach_id) references public.profiles (id) on delete restrict;
alter table public.rota_standard_classes
  add constraint rota_standard_classes_set_coach_id_fkey
  foreign key (set_coach_id) references public.profiles (id) on delete restrict;
alter table public.rota_weekly_roster
  add constraint rota_weekly_roster_coach_id_fkey
  foreign key (coach_id) references public.profiles (id) on delete restrict;
alter table public.rota_weekly_classes
  add constraint rota_weekly_classes_coach_id_fkey
  foreign key (coach_id) references public.profiles (id) on delete restrict;
alter table public.rota_weekly_classes
  add constraint rota_weekly_classes_set_coach_id_fkey
  foreign key (set_coach_id) references public.profiles (id) on delete restrict;
alter table public.rota_restructure_roster
  add constraint rota_restructure_roster_coach_id_fkey
  foreign key (coach_id) references public.profiles (id) on delete restrict;
alter table public.rota_restructure_classes
  add constraint rota_restructure_classes_coach_id_fkey
  foreign key (coach_id) references public.profiles (id) on delete restrict;
alter table public.rota_restructure_classes
  add constraint rota_restructure_classes_set_coach_id_fkey
  foreign key (set_coach_id) references public.profiles (id) on delete restrict;
alter table public.club_meeting_attendees
  add constraint club_meeting_attendees_coach_id_fkey
  foreign key (coach_id) references public.profiles (id) on delete restrict;

-- ---------------------------------------------------------------------------
-- 5. coach_id nullable on the 3 class tables
-- ---------------------------------------------------------------------------
--
-- coach_id IS NULL means an unassigned class (the board's Unassigned column).
-- Roster coach_id stays NOT NULL. All three change together because the
-- upsert RPCs copy standard classes into the weekly and restructure tables.

alter table public.rota_standard_classes alter column coach_id drop not null;
alter table public.rota_weekly_classes alter column coach_id drop not null;
alter table public.rota_restructure_classes alter column coach_id drop not null;

-- ---------------------------------------------------------------------------
-- 6. site_rota_roster(uuid)
-- ---------------------------------------------------------------------------
--
-- The assignable roster for a site: active profiles whose site name-matches
-- the rota_sites row p_site_id, titled Coach, Lead Coach or Club Head Coach.
-- id, full_name and job_title only.
--
-- Access mirrors rota_standard_roster_select_own_site_or_view_all (0026):
-- whoever can read a site's rota can list its roster. Anyone else gets an
-- empty set, not an error, as resolve_profile_names() and
-- site_role_candidates() do. Head Office profiles have no rota_sites row and
-- never appear.
--
-- Output columns are alias-qualified: the RETURNS TABLE names (id, full_name,
-- job_title) are in scope in the body and would otherwise be ambiguous.
-- The ::text casts guard against a varchar or enum column not matching the
-- RETURNS TABLE text types in a language sql function.

create function public.site_rota_roster(p_site_id uuid)
returns table (id uuid, full_name text, job_title text)
language sql
security definer
stable
set search_path = ''
as $$
  select p.id, p.full_name::text, p.job_title::text
  from public.profiles p
  join public.rota_sites s on s.name = p.site
  where s.id = p_site_id
    and p.active
    and p.job_title in ('Coach', 'Lead Coach', 'Club Head Coach')
    and public.is_active_coach()
    and (
      public.has_capability('view_all_sites')
      or exists (
        select 1 from public.rota_sites cs
        join public.profiles caller on caller.site = cs.name
        where cs.id = p_site_id and caller.id = auth.uid()
      )
    )
  order by p.full_name;
$$;

revoke execute on function public.site_rota_roster(uuid) from public;
revoke execute on function public.site_rota_roster(uuid) from anon;
grant execute on function public.site_rota_roster(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. site_rota_people(uuid)
-- ---------------------------------------------------------------------------
--
-- Everyone a site's rota and meeting rows point at: each distinct, non-NULL
-- profile id in coach_id or set_coach_id across the standard, weekly and
-- restructure roster and class tables, and in club_meeting_attendees.coach_id,
-- for the rota_sites row p_site_id. Returns id, full_name, active and site
-- whatever the profile's current active or site, so the app can flag coaches
-- who have moved site or been deactivated. Coaches can otherwise read only
-- their own profiles row.
--
-- Access is identical to site_rota_roster: is_active_coach() and either
-- view_all_sites or the caller's profiles.site name-matching p_site_id.
-- Anyone else gets an empty set, not an error.
--
-- It takes a site, not an array of ids, so it can only reveal profiles that
-- the site's rows already reference, and only to callers who can read that
-- site's rota. An id-array argument would let any caller look up the active
-- and site of any profile id they held.
--
-- Output columns are alias-qualified and cast to text, as in site_rota_roster.

create function public.site_rota_people(p_site_id uuid)
returns table (id uuid, full_name text, active boolean, site text)
language sql
security definer
stable
set search_path = ''
as $$
  with refs (coach_id) as (
    select r.coach_id from public.rota_standard_roster r
      where r.site_id = p_site_id
    union
    select c.coach_id from public.rota_standard_classes c
      where c.site_id = p_site_id
    union
    select c.set_coach_id from public.rota_standard_classes c
      where c.site_id = p_site_id
    union
    select r.coach_id from public.rota_weekly_roster r
      join public.rota_weekly_rotas w on w.id = r.weekly_rota_id
      where w.site_id = p_site_id
    union
    select c.coach_id from public.rota_weekly_classes c
      join public.rota_weekly_rotas w on w.id = c.weekly_rota_id
      where w.site_id = p_site_id
    union
    select c.set_coach_id from public.rota_weekly_classes c
      join public.rota_weekly_rotas w on w.id = c.weekly_rota_id
      where w.site_id = p_site_id
    union
    select r.coach_id from public.rota_restructure_roster r
      join public.rota_restructures rs on rs.id = r.restructure_id
      where rs.site_id = p_site_id
    union
    select c.coach_id from public.rota_restructure_classes c
      join public.rota_restructures rs on rs.id = c.restructure_id
      where rs.site_id = p_site_id
    union
    select c.set_coach_id from public.rota_restructure_classes c
      join public.rota_restructures rs on rs.id = c.restructure_id
      where rs.site_id = p_site_id
    union
    select a.coach_id from public.club_meeting_attendees a
      join public.club_meetings m on m.id = a.meeting_id
      where m.site_id = p_site_id
  )
  select p.id, p.full_name::text, p.active, p.site::text
  from refs
  join public.profiles p on p.id = refs.coach_id
  where refs.coach_id is not null
    and public.is_active_coach()
    and (
      public.has_capability('view_all_sites')
      or exists (
        select 1 from public.rota_sites cs
        join public.profiles caller on caller.site = cs.name
        where cs.id = p_site_id and caller.id = auth.uid()
      )
    )
  order by p.full_name;
$$;

revoke execute on function public.site_rota_people(uuid) from public;
revoke execute on function public.site_rota_people(uuid) from anon;
grant execute on function public.site_rota_people(uuid) to authenticated;

commit;
