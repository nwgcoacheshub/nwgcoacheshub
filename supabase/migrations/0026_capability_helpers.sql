-- NWG Coaches Hub — Permissions retcon, phase P3: capability helpers
--
-- Replaces profiles.role ('admin' | 'coach') as the database's permission
-- source with capabilities derived from profiles.job_title. Every RLS policy and
-- security-definer function that gated on is_admin() or can_edit_rota() is
-- repointed at the new helpers. P1's inventory
-- (docs/investigations/permissions-role-inventory.md) is the list of affected
-- objects: 66 policies and 2 RPCs. The design and the full per-policy mapping
-- were approved in docs/investigations/permissions-p3-phase-a.md.
--
-- What this file does, in order:
--   1. Refuses to run if any profile still has job_title = 'Head of People'.
--   2. Adds the capability helpers: title_has_capability() (the matrix, and the
--      only copy of it), has_capability() and has_site_capability().
--   3. Adds a BEFORE UPDATE trigger on profiles. No user may change their own
--      job_title, site, active or role, and only an active manage_users holder
--      may change anyone else's.
--   4. Drops and recreates all 66 policies under capability-based names, then
--      replaces upsert_weekly_rota() and upsert_restructure(), and turns
--      can_edit_rota() into a shim with no callers.
--   5. Replaces the job_title check constraint with the 6 agreed titles.
--
-- What it deliberately does NOT do:
--   * Drop profiles.role, is_admin(), the role default or the role check
--     constraint. That is P5. After this file is applied, is_admin() has no
--     caller in the database.
--   * Touch any app code. lib/rota/canEdit.ts, lib/admin-guard.ts and the
--     service-role routes still read role until P4. Until P4 ships, the UI and
--     the database can disagree, and the service-role routes (create-user,
--     reset-password, policies upload/delete) are still gated on role. GAP-2
--     stays open until P4. This file closes GAP-1 only.
--   * Revoke anon's table grants on profiles, club_updates,
--     club_role_assignments or the rota tables. That is a separate migration
--     after P4.
--   * Widen profiles SELECT for the Staff Roles picker (G13). Deferred to P4.
--
-- ---------------------------------------------------------------------------
-- Atomicity: explicit BEGIN / COMMIT
-- ---------------------------------------------------------------------------
--
-- The whole file is wrapped in an explicit transaction, so it is all-or-nothing
-- however it is applied:
--
--   * Supabase SQL Editor (how this project's migrations are applied). The
--     editor sends the file as one multi-statement query. Earlier migrations
--     (0014, 0024) relied on Postgres running such a query as one implicit
--     transaction. That still holds, but the explicit BEGIN makes it a stated
--     property of the file rather than of the client. On any error, Postgres
--     skips every remaining statement, including the COMMIT, so nothing is
--     committed.
--   * psql -f. Without the BEGIN, psql would autocommit statement by
--     statement. With it, an error aborts the transaction. Every later
--     statement fails with "current transaction is aborted", and the final
--     COMMIT is turned into a ROLLBACK. Use `-v ON_ERROR_STOP=1` to stop at
--     the first error instead.
--
-- The Head of People guard (step 1) runs inside this transaction. Its RAISE
-- EXCEPTION therefore aborts the whole file, not just the guard's own
-- statement.
--
-- Because all of this runs in one transaction, there is no window where a
-- table has lost its old policy and not yet gained its new one: each DROP
-- POLICY holds an ACCESS EXCLUSIVE lock on its table until COMMIT, so other
-- sessions see either every old policy or every new one, never neither. The
-- helpers are created before any policy that calls them.
--
-- No down migration, matching every migration so far (0001–0025).

begin;

-- ---------------------------------------------------------------------------
-- 1. Head of People guard
-- ---------------------------------------------------------------------------
--
-- 'Head of People' leaves the job_title list in step 5. A profile still holding
-- it would make that constraint fail at the very end. It would also leave a user
-- whose title matches no capability, silently losing every right they had
-- through can_edit_rota(). Fail first, loudly, with nothing applied.
--
-- Step 5's constraint is the backstop if a row is changed to 'Head of People'
-- between this check and the end of the file (for example by the service-role
-- create-user route). It fails the same way and rolls back the whole file.

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.profiles
  where job_title = 'Head of People';

  if v_count > 0 then
    raise exception
      'P3 aborted: % profile(s) still have job_title = ''Head of People''. Reassign them to one of the 6 agreed titles and re-run this file. Nothing has been applied.',
      v_count;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Capability helpers
-- ---------------------------------------------------------------------------
--
-- Capabilities (agreed in P2):
--
--   Global       view_all_sites, all_sites_scope, publish_whats_new,
--                manage_policies, manage_users
--                  -> Regional General Manager, Head of Gymnastics,
--                     Head of Operations
--   Site-scoped  edit_rota, manage_club_meetings, manage_club_updates
--                  -> Lead Coach, Club Head Coach + the three above
--                manage_club_roles
--                  -> Club Head Coach + the three above
--
-- 'Coach' holds no capability. A site-scoped capability applies at the
-- holder's own profiles.site, or at every site if they also hold
-- all_sites_scope. Every capability requires profiles.active = true.
--
-- Unknown capability names, unknown titles and nulls all return false, never
-- an error. A typo in a policy therefore fails closed, but silently. The
-- verification file
-- (docs/investigations/permissions-p3-verification.sql) checks every
-- capability literal used in a policy or function against the list above.

-- --- title_has_capability ----------------------------------------------------
--
-- The matrix itself, and the only copy of it. It is pure: it reads no table and
-- knows nothing about the caller, so it can be tested title by title.
--
-- SECURITY INVOKER, unlike every other helper here, because security definer
-- gives nothing to a function that reads no tables. It is internal: EXECUTE
-- is revoked from public, anon and authenticated, so only the definer helpers
-- below (which run as the function owner) can reach it. service_role keeps its
-- Supabase default grant, as every function here does.
--
-- Titles are listed explicitly, never as `<> 'Coach'`, for the reason 0013
-- gives: an explicit list fails closed when a new title is added.

create function public.title_has_capability(p_job_title text, p_cap text)
returns boolean
language sql
security invoker
immutable
set search_path = ''
as $$
  select coalesce(
    case p_cap
      when 'view_all_sites' then p_job_title in (
        'Regional General Manager', 'Head of Gymnastics', 'Head of Operations')
      when 'all_sites_scope' then p_job_title in (
        'Regional General Manager', 'Head of Gymnastics', 'Head of Operations')
      when 'publish_whats_new' then p_job_title in (
        'Regional General Manager', 'Head of Gymnastics', 'Head of Operations')
      when 'manage_policies' then p_job_title in (
        'Regional General Manager', 'Head of Gymnastics', 'Head of Operations')
      when 'manage_users' then p_job_title in (
        'Regional General Manager', 'Head of Gymnastics', 'Head of Operations')
      when 'edit_rota' then p_job_title in (
        'Lead Coach', 'Club Head Coach',
        'Regional General Manager', 'Head of Gymnastics', 'Head of Operations')
      when 'manage_club_meetings' then p_job_title in (
        'Lead Coach', 'Club Head Coach',
        'Regional General Manager', 'Head of Gymnastics', 'Head of Operations')
      when 'manage_club_updates' then p_job_title in (
        'Lead Coach', 'Club Head Coach',
        'Regional General Manager', 'Head of Gymnastics', 'Head of Operations')
      when 'manage_club_roles' then p_job_title in (
        'Club Head Coach',
        'Regional General Manager', 'Head of Gymnastics', 'Head of Operations')
      else false
    end,
    false
  );
$$;

revoke execute on function public.title_has_capability(text, text) from public;
revoke execute on function public.title_has_capability(text, text) from anon;
revoke execute on function public.title_has_capability(text, text) from authenticated;

-- --- has_capability ------------------------------------------------------------
--
-- True if the caller has an active profile whose job_title holds p_cap.
-- For a site-scoped capability this answers "holds it somewhere"; policies
-- that need a site use has_site_capability() instead.
--
-- security definer for the reason is_admin() (0001) needs it: the body reads
-- profiles, and a profiles policy calling it would otherwise recurse.
-- search_path is pinned to '' and every reference is schema-qualified, which
-- is stricter than the `= public` the earlier helpers use.
--
-- Both revokes, then an explicit grant: the rule 0012 settled on.

create function public.has_capability(p_cap text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active
      and public.title_has_capability(p.job_title, p_cap)
  );
$$;

revoke execute on function public.has_capability(text) from public;
revoke execute on function public.has_capability(text) from anon;
grant execute on function public.has_capability(text) to authenticated;

-- --- has_site_capability -------------------------------------------------------
--
-- True if the caller holds p_cap AND either holds all_sites_scope or their
-- profiles.site name-matches the rota_sites row p_site_id. The name join is the
-- same `p.site = s.name` every site-scoped policy has used since 0002, and
-- rota_sites.name has been unique since 0014.
--
-- Takes a site uuid, not a site name: every gated table carries site_id (or
-- reaches it through its parent), never a name.
--
-- A null p_site_id returns false even for an all_sites_scope holder. A child
-- row whose parent is missing or not visible to the caller therefore fails
-- closed rather than matching "every site".
--
-- Head Office has no rota_sites row, so for a Head Office profile the own-site
-- branch is always false. Their access comes only from all_sites_scope, which
-- needs a full-access title, and never depends on profiles.site.

create function public.has_site_capability(p_cap text, p_site_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select p_site_id is not null
    and public.has_capability(p_cap)
    and (
      public.has_capability('all_sites_scope')
      or exists (
        select 1 from public.rota_sites s
        join public.profiles p on p.site = s.name
        where s.id = p_site_id and p.id = auth.uid()
      )
    );
$$;

revoke execute on function public.has_site_capability(text, uuid) from public;
revoke execute on function public.has_site_capability(text, uuid) from anon;
grant execute on function public.has_site_capability(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. profiles self-edit guard
-- ---------------------------------------------------------------------------
--
-- RLS cannot compare a row's old and new values, so these rules need a
-- trigger:
--
--   * Nobody may change their own job_title, site, active or role. Once titles
--     drive capabilities, changing your own job_title is granting yourself
--     permissions. Changing your own active flag is how a deactivated
--     admin re-entered the system in P1's GAP-1. role is included because until
--     P4 it still unlocks the service-role routes.
--   * Only an active manage_users holder may change those columns on anyone
--     else's row. profiles_update_manage_users below already enforces that
--     through RLS; the trigger restates it so the rule doesn't depend on that
--     policy staying exactly as written.
--
-- full_name and email are not guarded. A manage_users holder may still correct
-- their own name.
--
-- SECURITY INVOKER on purpose. The bypass for trusted roles has to read the
-- caller's current_user, and inside a security definer function current_user
-- is always the function owner. A definer trigger would therefore wave
-- everyone through. Under PostgREST, current_user is `authenticated` (or
-- `anon`). In the SQL Editor and table editor it is `postgres` /
-- `supabase_admin`, and for the secret-key server routes it is `service_role`.
-- Those three are trusted. Any other role is checked, so an unexpected role
-- fails closed.
--
-- This is a trigger function, not a helper. Firing a trigger does not check
-- EXECUTE, and a trigger function cannot be called directly anyway. The revokes
-- are there only so it doesn't appear as callable to anon.

create function public.profiles_guard_privileged_columns()
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
    raise exception 'You cannot change your own job title, site, active status or role'
      using errcode = '42501';
  end if;

  if not public.has_capability('manage_users') then
    raise exception 'Only an active user with manage_users can change job title, site, active status or role'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.profiles_guard_privileged_columns() from public;
revoke execute on function public.profiles_guard_privileged_columns() from anon;

-- The WHEN clause means updates that touch none of the four columns, such as
-- a full_name edit, never enter the function.

create trigger profiles_guard_privileged_columns
before update on public.profiles
for each row
when (
  (old.job_title, old.site, old.active, old.role)
  is distinct from (new.job_title, new.site, new.active, new.role)
)
execute function public.profiles_guard_privileged_columns();

-- ---------------------------------------------------------------------------
-- 4. Policies: drop and recreate under capability-based names
-- ---------------------------------------------------------------------------
--
-- 66 policies across 19 tables, grouped as in P1's inventory:
--
--   profiles                        2
--   site-scoped reads              14   is_admin()     -> view_all_sites
--   rota / meeting writes          36   can_edit_rota() + is_admin()
--                                         -> edit_rota (27) / manage_club_meetings (9)
--   heroes / hero_hours             2   is_admin()     -> all_sites_scope (UNMAPPED-DEFAULTED, confirmed)
--   admin-only writes              12   is_admin()     -> manage_club_roles / manage_club_updates
--                                                        (site-scoped), manage_policies /
--                                                        publish_whats_new (global)
--
-- Every condition keeps is_active_coach() as its outer conjunct, as 0014 set
-- out, even though the capability helpers check active themselves. The two
-- profiles policies are the exception: own-row read stays deliberately
-- ungated, as 0014 explained, because getCurrentProfile() has to read
-- `active`.
--
-- Read policies keep their site-match subquery byte-identical to 0013–0022.
-- Only the is_admin() branch changes. Write policies move the site test into
-- has_site_capability(). Tables without a site_id of their own pass it as a
-- scalar subquery through the same parent their old policy joined through.
-- That subquery runs under the parent table's own select policy, exactly as
-- the old join did. Anyone allowed to write a child row can read its parent.
--
-- Command shapes are unchanged: insert takes with check only, delete takes
-- using only, and update takes both, so a row cannot be moved to a site the
-- caller has no rights at.

-- --- profiles ------------------------------------------------------------------
--
-- SELECT: your own row, active or not, as before. Every other row needs
-- manage_users, which requires active, so a deactivated admin no longer reads
-- every profile. This closes GAP-1.
-- UPDATE: manage_users only, plus the trigger above. Coaches still cannot
-- update any row, including their own (build doc §1, §6).
-- INSERT / DELETE: still no policy, so still denied to every client role. User
-- creation stays server-side through the service-role create-user route.

drop policy "profiles_select_own_or_admin" on public.profiles;
drop policy "profiles_update_admin_only" on public.profiles;

create policy "profiles_select_own_or_manage_users"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.has_capability('manage_users')
);

create policy "profiles_update_manage_users"
on public.profiles
for update
to authenticated
using (
  public.has_capability('manage_users')
)
with check (
  public.has_capability('manage_users')
);

-- --- Site-scoped reads + rota writes (9 tables: 9 reads, 27 writes) ---------

-- --- rota_coaches ---------------------------------------------------------

drop policy "rota_coaches_select_admin_or_own_site" on public.rota_coaches;
drop policy "rota_coaches_insert_can_edit_own_site" on public.rota_coaches;
drop policy "rota_coaches_update_can_edit_own_site" on public.rota_coaches;
drop policy "rota_coaches_delete_can_edit_own_site" on public.rota_coaches;

create policy "rota_coaches_select_own_site_or_view_all"
on public.rota_coaches
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('view_all_sites')
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_coaches.site_id and p.id = auth.uid()
    )
  )
);

create policy "rota_coaches_insert_edit_rota_site"
on public.rota_coaches
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_site_capability('edit_rota', rota_coaches.site_id)
);

create policy "rota_coaches_update_edit_rota_site"
on public.rota_coaches
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability('edit_rota', rota_coaches.site_id)
)
with check (
  public.is_active_coach()
  and public.has_site_capability('edit_rota', rota_coaches.site_id)
);

create policy "rota_coaches_delete_edit_rota_site"
on public.rota_coaches
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability('edit_rota', rota_coaches.site_id)
);

-- --- rota_standard_roster -------------------------------------------------

drop policy "rota_standard_roster_select_admin_or_own_site" on public.rota_standard_roster;
drop policy "rota_standard_roster_insert_can_edit_own_site" on public.rota_standard_roster;
drop policy "rota_standard_roster_update_can_edit_own_site" on public.rota_standard_roster;
drop policy "rota_standard_roster_delete_can_edit_own_site" on public.rota_standard_roster;

create policy "rota_standard_roster_select_own_site_or_view_all"
on public.rota_standard_roster
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('view_all_sites')
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_standard_roster.site_id and p.id = auth.uid()
    )
  )
);

create policy "rota_standard_roster_insert_edit_rota_site"
on public.rota_standard_roster
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_site_capability('edit_rota', rota_standard_roster.site_id)
);

create policy "rota_standard_roster_update_edit_rota_site"
on public.rota_standard_roster
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability('edit_rota', rota_standard_roster.site_id)
)
with check (
  public.is_active_coach()
  and public.has_site_capability('edit_rota', rota_standard_roster.site_id)
);

create policy "rota_standard_roster_delete_edit_rota_site"
on public.rota_standard_roster
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability('edit_rota', rota_standard_roster.site_id)
);

-- --- rota_standard_classes ------------------------------------------------

drop policy "rota_standard_classes_select_admin_or_own_site" on public.rota_standard_classes;
drop policy "rota_standard_classes_insert_can_edit_own_site" on public.rota_standard_classes;
drop policy "rota_standard_classes_update_can_edit_own_site" on public.rota_standard_classes;
drop policy "rota_standard_classes_delete_can_edit_own_site" on public.rota_standard_classes;

create policy "rota_standard_classes_select_own_site_or_view_all"
on public.rota_standard_classes
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('view_all_sites')
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_standard_classes.site_id and p.id = auth.uid()
    )
  )
);

create policy "rota_standard_classes_insert_edit_rota_site"
on public.rota_standard_classes
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_site_capability('edit_rota', rota_standard_classes.site_id)
);

create policy "rota_standard_classes_update_edit_rota_site"
on public.rota_standard_classes
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability('edit_rota', rota_standard_classes.site_id)
)
with check (
  public.is_active_coach()
  and public.has_site_capability('edit_rota', rota_standard_classes.site_id)
);

create policy "rota_standard_classes_delete_edit_rota_site"
on public.rota_standard_classes
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability('edit_rota', rota_standard_classes.site_id)
);

-- --- rota_weekly_rotas ----------------------------------------------------

drop policy "rota_weekly_rotas_select_admin_or_own_site" on public.rota_weekly_rotas;
drop policy "rota_weekly_rotas_insert_can_edit_own_site" on public.rota_weekly_rotas;
drop policy "rota_weekly_rotas_update_can_edit_own_site" on public.rota_weekly_rotas;
drop policy "rota_weekly_rotas_delete_can_edit_own_site" on public.rota_weekly_rotas;

create policy "rota_weekly_rotas_select_own_site_or_view_all"
on public.rota_weekly_rotas
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('view_all_sites')
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_weekly_rotas.site_id and p.id = auth.uid()
    )
  )
);

create policy "rota_weekly_rotas_insert_edit_rota_site"
on public.rota_weekly_rotas
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_site_capability('edit_rota', rota_weekly_rotas.site_id)
);

create policy "rota_weekly_rotas_update_edit_rota_site"
on public.rota_weekly_rotas
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability('edit_rota', rota_weekly_rotas.site_id)
)
with check (
  public.is_active_coach()
  and public.has_site_capability('edit_rota', rota_weekly_rotas.site_id)
);

create policy "rota_weekly_rotas_delete_edit_rota_site"
on public.rota_weekly_rotas
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability('edit_rota', rota_weekly_rotas.site_id)
);

-- --- rota_weekly_roster ---------------------------------------------------

drop policy "rota_weekly_roster_select_admin_or_own_site" on public.rota_weekly_roster;
drop policy "rota_weekly_roster_insert_can_edit_own_site" on public.rota_weekly_roster;
drop policy "rota_weekly_roster_update_can_edit_own_site" on public.rota_weekly_roster;
drop policy "rota_weekly_roster_delete_can_edit_own_site" on public.rota_weekly_roster;

create policy "rota_weekly_roster_select_own_site_or_view_all"
on public.rota_weekly_roster
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('view_all_sites')
    or exists (
      select 1 from public.rota_weekly_rotas wr
      join public.rota_sites s on s.id = wr.site_id
      join public.profiles p on p.site = s.name
      where wr.id = rota_weekly_roster.weekly_rota_id and p.id = auth.uid()
    )
  )
);

create policy "rota_weekly_roster_insert_edit_rota_site"
on public.rota_weekly_roster
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_rota',
    (
      select wr.site_id from public.rota_weekly_rotas wr
      where wr.id = rota_weekly_roster.weekly_rota_id
    )
  )
);

create policy "rota_weekly_roster_update_edit_rota_site"
on public.rota_weekly_roster
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_rota',
    (
      select wr.site_id from public.rota_weekly_rotas wr
      where wr.id = rota_weekly_roster.weekly_rota_id
    )
  )
)
with check (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_rota',
    (
      select wr.site_id from public.rota_weekly_rotas wr
      where wr.id = rota_weekly_roster.weekly_rota_id
    )
  )
);

create policy "rota_weekly_roster_delete_edit_rota_site"
on public.rota_weekly_roster
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_rota',
    (
      select wr.site_id from public.rota_weekly_rotas wr
      where wr.id = rota_weekly_roster.weekly_rota_id
    )
  )
);

-- --- rota_weekly_classes --------------------------------------------------

drop policy "rota_weekly_classes_select_admin_or_own_site" on public.rota_weekly_classes;
drop policy "rota_weekly_classes_insert_can_edit_own_site" on public.rota_weekly_classes;
drop policy "rota_weekly_classes_update_can_edit_own_site" on public.rota_weekly_classes;
drop policy "rota_weekly_classes_delete_can_edit_own_site" on public.rota_weekly_classes;

create policy "rota_weekly_classes_select_own_site_or_view_all"
on public.rota_weekly_classes
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('view_all_sites')
    or exists (
      select 1 from public.rota_weekly_rotas wr
      join public.rota_sites s on s.id = wr.site_id
      join public.profiles p on p.site = s.name
      where wr.id = rota_weekly_classes.weekly_rota_id and p.id = auth.uid()
    )
  )
);

create policy "rota_weekly_classes_insert_edit_rota_site"
on public.rota_weekly_classes
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_rota',
    (
      select wr.site_id from public.rota_weekly_rotas wr
      where wr.id = rota_weekly_classes.weekly_rota_id
    )
  )
);

create policy "rota_weekly_classes_update_edit_rota_site"
on public.rota_weekly_classes
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_rota',
    (
      select wr.site_id from public.rota_weekly_rotas wr
      where wr.id = rota_weekly_classes.weekly_rota_id
    )
  )
)
with check (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_rota',
    (
      select wr.site_id from public.rota_weekly_rotas wr
      where wr.id = rota_weekly_classes.weekly_rota_id
    )
  )
);

create policy "rota_weekly_classes_delete_edit_rota_site"
on public.rota_weekly_classes
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_rota',
    (
      select wr.site_id from public.rota_weekly_rotas wr
      where wr.id = rota_weekly_classes.weekly_rota_id
    )
  )
);

-- --- rota_restructures ----------------------------------------------------

drop policy "rota_restructures_select_admin_or_own_site" on public.rota_restructures;
drop policy "rota_restructures_insert_can_edit_own_site" on public.rota_restructures;
drop policy "rota_restructures_update_can_edit_own_site" on public.rota_restructures;
drop policy "rota_restructures_delete_can_edit_own_site" on public.rota_restructures;

create policy "rota_restructures_select_own_site_or_view_all"
on public.rota_restructures
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('view_all_sites')
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_restructures.site_id and p.id = auth.uid()
    )
  )
);

create policy "rota_restructures_insert_edit_rota_site"
on public.rota_restructures
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_site_capability('edit_rota', rota_restructures.site_id)
);

create policy "rota_restructures_update_edit_rota_site"
on public.rota_restructures
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability('edit_rota', rota_restructures.site_id)
)
with check (
  public.is_active_coach()
  and public.has_site_capability('edit_rota', rota_restructures.site_id)
);

create policy "rota_restructures_delete_edit_rota_site"
on public.rota_restructures
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability('edit_rota', rota_restructures.site_id)
);

-- --- rota_restructure_roster ----------------------------------------------

drop policy "rota_restructure_roster_select_admin_or_own_site" on public.rota_restructure_roster;
drop policy "rota_restructure_roster_insert_can_edit_own_site" on public.rota_restructure_roster;
drop policy "rota_restructure_roster_update_can_edit_own_site" on public.rota_restructure_roster;
drop policy "rota_restructure_roster_delete_can_edit_own_site" on public.rota_restructure_roster;

create policy "rota_restructure_roster_select_own_site_or_view_all"
on public.rota_restructure_roster
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('view_all_sites')
    or exists (
      select 1 from public.rota_restructures r
      join public.rota_sites s on s.id = r.site_id
      join public.profiles p on p.site = s.name
      where r.id = rota_restructure_roster.restructure_id and p.id = auth.uid()
    )
  )
);

create policy "rota_restructure_roster_insert_edit_rota_site"
on public.rota_restructure_roster
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_rota',
    (
      select r.site_id from public.rota_restructures r
      where r.id = rota_restructure_roster.restructure_id
    )
  )
);

create policy "rota_restructure_roster_update_edit_rota_site"
on public.rota_restructure_roster
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_rota',
    (
      select r.site_id from public.rota_restructures r
      where r.id = rota_restructure_roster.restructure_id
    )
  )
)
with check (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_rota',
    (
      select r.site_id from public.rota_restructures r
      where r.id = rota_restructure_roster.restructure_id
    )
  )
);

create policy "rota_restructure_roster_delete_edit_rota_site"
on public.rota_restructure_roster
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_rota',
    (
      select r.site_id from public.rota_restructures r
      where r.id = rota_restructure_roster.restructure_id
    )
  )
);

-- --- rota_restructure_classes ---------------------------------------------

drop policy "rota_restructure_classes_select_admin_or_own_site" on public.rota_restructure_classes;
drop policy "rota_restructure_classes_insert_can_edit_own_site" on public.rota_restructure_classes;
drop policy "rota_restructure_classes_update_can_edit_own_site" on public.rota_restructure_classes;
drop policy "rota_restructure_classes_delete_can_edit_own_site" on public.rota_restructure_classes;

create policy "rota_restructure_classes_select_own_site_or_view_all"
on public.rota_restructure_classes
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('view_all_sites')
    or exists (
      select 1 from public.rota_restructures r
      join public.rota_sites s on s.id = r.site_id
      join public.profiles p on p.site = s.name
      where r.id = rota_restructure_classes.restructure_id and p.id = auth.uid()
    )
  )
);

create policy "rota_restructure_classes_insert_edit_rota_site"
on public.rota_restructure_classes
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_rota',
    (
      select r.site_id from public.rota_restructures r
      where r.id = rota_restructure_classes.restructure_id
    )
  )
);

create policy "rota_restructure_classes_update_edit_rota_site"
on public.rota_restructure_classes
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_rota',
    (
      select r.site_id from public.rota_restructures r
      where r.id = rota_restructure_classes.restructure_id
    )
  )
)
with check (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_rota',
    (
      select r.site_id from public.rota_restructures r
      where r.id = rota_restructure_classes.restructure_id
    )
  )
);

create policy "rota_restructure_classes_delete_edit_rota_site"
on public.rota_restructure_classes
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_rota',
    (
      select r.site_id from public.rota_restructures r
      where r.id = rota_restructure_classes.restructure_id
    )
  )
);

-- --- Site-scoped reads + meeting writes (3 tables: 3 reads, 9 writes) -------

-- --- club_meetings --------------------------------------------------------

drop policy "club_meetings_select_admin_or_own_site" on public.club_meetings;
drop policy "club_meetings_insert_can_edit_own_site" on public.club_meetings;
drop policy "club_meetings_update_can_edit_own_site" on public.club_meetings;
drop policy "club_meetings_delete_can_edit_own_site" on public.club_meetings;

create policy "club_meetings_select_own_site_or_view_all"
on public.club_meetings
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('view_all_sites')
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = club_meetings.site_id and p.id = auth.uid()
    )
  )
);

create policy "club_meetings_insert_manage_meetings_site"
on public.club_meetings
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_site_capability('manage_club_meetings', club_meetings.site_id)
);

create policy "club_meetings_update_manage_meetings_site"
on public.club_meetings
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability('manage_club_meetings', club_meetings.site_id)
)
with check (
  public.is_active_coach()
  and public.has_site_capability('manage_club_meetings', club_meetings.site_id)
);

create policy "club_meetings_delete_manage_meetings_site"
on public.club_meetings
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability('manage_club_meetings', club_meetings.site_id)
);

-- --- club_meeting_attendees -----------------------------------------------

drop policy "club_meeting_attendees_select_admin_or_own_site" on public.club_meeting_attendees;
drop policy "club_meeting_attendees_insert_can_edit_own_site" on public.club_meeting_attendees;
drop policy "club_meeting_attendees_update_can_edit_own_site" on public.club_meeting_attendees;
drop policy "club_meeting_attendees_delete_can_edit_own_site" on public.club_meeting_attendees;

create policy "club_meeting_attendees_select_own_site_or_view_all"
on public.club_meeting_attendees
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('view_all_sites')
    or exists (
      select 1 from public.club_meetings m
      join public.rota_sites s on s.id = m.site_id
      join public.profiles p on p.site = s.name
      where m.id = club_meeting_attendees.meeting_id and p.id = auth.uid()
    )
  )
);

create policy "club_meeting_attendees_insert_manage_meetings_site"
on public.club_meeting_attendees
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_site_capability(
    'manage_club_meetings',
    (
      select m.site_id from public.club_meetings m
      where m.id = club_meeting_attendees.meeting_id
    )
  )
);

create policy "club_meeting_attendees_update_manage_meetings_site"
on public.club_meeting_attendees
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability(
    'manage_club_meetings',
    (
      select m.site_id from public.club_meetings m
      where m.id = club_meeting_attendees.meeting_id
    )
  )
)
with check (
  public.is_active_coach()
  and public.has_site_capability(
    'manage_club_meetings',
    (
      select m.site_id from public.club_meetings m
      where m.id = club_meeting_attendees.meeting_id
    )
  )
);

create policy "club_meeting_attendees_delete_manage_meetings_site"
on public.club_meeting_attendees
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability(
    'manage_club_meetings',
    (
      select m.site_id from public.club_meetings m
      where m.id = club_meeting_attendees.meeting_id
    )
  )
);

-- --- club_meeting_cycle_weeks ---------------------------------------------

drop policy "club_meeting_cycle_weeks_select_admin_or_own_site" on public.club_meeting_cycle_weeks;
drop policy "club_meeting_cycle_weeks_insert_can_edit_own_site" on public.club_meeting_cycle_weeks;
drop policy "club_meeting_cycle_weeks_update_can_edit_own_site" on public.club_meeting_cycle_weeks;
drop policy "club_meeting_cycle_weeks_delete_can_edit_own_site" on public.club_meeting_cycle_weeks;

create policy "club_meeting_cycle_weeks_select_own_site_or_view_all"
on public.club_meeting_cycle_weeks
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('view_all_sites')
    or exists (
      select 1 from public.club_meetings m
      join public.rota_sites s on s.id = m.site_id
      join public.profiles p on p.site = s.name
      where m.id = club_meeting_cycle_weeks.meeting_id and p.id = auth.uid()
    )
  )
);

create policy "club_meeting_cycle_weeks_insert_manage_meetings_site"
on public.club_meeting_cycle_weeks
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_site_capability(
    'manage_club_meetings',
    (
      select m.site_id from public.club_meetings m
      where m.id = club_meeting_cycle_weeks.meeting_id
    )
  )
);

create policy "club_meeting_cycle_weeks_update_manage_meetings_site"
on public.club_meeting_cycle_weeks
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability(
    'manage_club_meetings',
    (
      select m.site_id from public.club_meetings m
      where m.id = club_meeting_cycle_weeks.meeting_id
    )
  )
)
with check (
  public.is_active_coach()
  and public.has_site_capability(
    'manage_club_meetings',
    (
      select m.site_id from public.club_meetings m
      where m.id = club_meeting_cycle_weeks.meeting_id
    )
  )
);

create policy "club_meeting_cycle_weeks_delete_manage_meetings_site"
on public.club_meeting_cycle_weeks
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability(
    'manage_club_meetings',
    (
      select m.site_id from public.club_meetings m
      where m.id = club_meeting_cycle_weeks.meeting_id
    )
  )
);

-- --- Heroes / hero hours (2 policies, UNMAPPED-DEFAULTED, confirmed) --------

-- --- heroes ---------------------------------------------------------------

drop policy "heroes_all_admin_or_own_site" on public.heroes;

create policy "heroes_all_own_site_or_all_sites"
on public.heroes
for all
to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('all_sites_scope')
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = heroes.site_id and p.id = auth.uid()
    )
  )
)
with check (
  public.is_active_coach()
  and (
    public.has_capability('all_sites_scope')
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = heroes.site_id and p.id = auth.uid()
    )
  )
);

-- --- hero_hours -----------------------------------------------------------

drop policy "hero_hours_all_admin_or_own_site" on public.hero_hours;

create policy "hero_hours_all_own_site_or_all_sites"
on public.hero_hours
for all
to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('all_sites_scope')
    or exists (
      select 1 from public.heroes h
      join public.rota_sites s on s.id = h.site_id
      join public.profiles p on p.site = s.name
      where h.id = hero_hours.hero_id and p.id = auth.uid()
    )
  )
)
with check (
  public.is_active_coach()
  and (
    public.has_capability('all_sites_scope')
    or exists (
      select 1 from public.heroes h
      join public.rota_sites s on s.id = h.site_id
      join public.profiles p on p.site = s.name
      where h.id = hero_hours.hero_id and p.id = auth.uid()
    )
  )
);

-- --- Club roles + club updates (2 reads, 6 site-scoped admin-only writes) ---

-- --- club_role_assignments ------------------------------------------------

drop policy "club_role_assignments_select_admin_or_own_site" on public.club_role_assignments;
drop policy "club_role_assignments_insert_admin_only" on public.club_role_assignments;
drop policy "club_role_assignments_update_admin_only" on public.club_role_assignments;
drop policy "club_role_assignments_delete_admin_only" on public.club_role_assignments;

create policy "club_role_assignments_select_own_site_or_view_all"
on public.club_role_assignments
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('view_all_sites')
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = club_role_assignments.site_id and p.id = auth.uid()
    )
  )
);

create policy "club_role_assignments_insert_manage_club_roles"
on public.club_role_assignments
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_site_capability('manage_club_roles', club_role_assignments.site_id)
);

create policy "club_role_assignments_update_manage_club_roles"
on public.club_role_assignments
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability('manage_club_roles', club_role_assignments.site_id)
)
with check (
  public.is_active_coach()
  and public.has_site_capability('manage_club_roles', club_role_assignments.site_id)
);

create policy "club_role_assignments_delete_manage_club_roles"
on public.club_role_assignments
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability('manage_club_roles', club_role_assignments.site_id)
);

-- --- club_updates ---------------------------------------------------------

drop policy "club_updates_select_admin_or_own_site" on public.club_updates;
drop policy "club_updates_insert_admin_only" on public.club_updates;
drop policy "club_updates_update_admin_only" on public.club_updates;
drop policy "club_updates_delete_admin_only" on public.club_updates;

create policy "club_updates_select_own_site_or_view_all"
on public.club_updates
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('view_all_sites')
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = club_updates.site_id and p.id = auth.uid()
    )
  )
);

create policy "club_updates_insert_manage_club_updates"
on public.club_updates
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_site_capability('manage_club_updates', club_updates.site_id)
);

create policy "club_updates_update_manage_club_updates"
on public.club_updates
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability('manage_club_updates', club_updates.site_id)
)
with check (
  public.is_active_coach()
  and public.has_site_capability('manage_club_updates', club_updates.site_id)
);

create policy "club_updates_delete_manage_club_updates"
on public.club_updates
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability('manage_club_updates', club_updates.site_id)
);

-- --- Policies library + What's New (6 global admin-only writes) -------------

-- --- policies -------------------------------------------------------------

drop policy "policies_insert_admin_only" on public.policies;
drop policy "policies_update_admin_only" on public.policies;
drop policy "policies_delete_admin_only" on public.policies;

create policy "policies_insert_manage_policies"
on public.policies
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_capability('manage_policies')
);

create policy "policies_update_manage_policies"
on public.policies
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_capability('manage_policies')
)
with check (
  public.is_active_coach()
  and public.has_capability('manage_policies')
);

create policy "policies_delete_manage_policies"
on public.policies
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_capability('manage_policies')
);

-- --- whats_new ------------------------------------------------------------

drop policy "whats_new_insert_admin_only" on public.whats_new;
drop policy "whats_new_update_admin_only" on public.whats_new;
drop policy "whats_new_delete_admin_only" on public.whats_new;

create policy "whats_new_insert_publish_whats_new"
on public.whats_new
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_capability('publish_whats_new')
);

create policy "whats_new_update_publish_whats_new"
on public.whats_new
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_capability('publish_whats_new')
)
with check (
  public.is_active_coach()
  and public.has_capability('publish_whats_new')
);

create policy "whats_new_delete_publish_whats_new"
on public.whats_new
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_capability('publish_whats_new')
);

-- ---------------------------------------------------------------------------
-- 4b. upsert_weekly_rota / upsert_restructure
-- ---------------------------------------------------------------------------
--
-- Both are security definer and bypass RLS, so their own checks are the
-- authorization boundary (0004, 0013). The three checks keep their 0014/0016
-- order and their exact error messages, which useGenerateWeek /
-- useGenerateRestructure show to the user:
--
--   deactivated  -> is_active_coach()                    (unchanged)
--   job title    -> has_capability('edit_rota')          (was can_edit_rota())
--   site         -> has_site_capability('edit_rota', id) (was is_admin() or site match)
--
-- v_authorized is no longer needed and is removed. The rest of each body (the
-- `on conflict` upsert, both deletes and both template copies) is copied
-- verbatim. search_path stays `= public`, as each function already had.

create or replace function public.upsert_weekly_rota(p_site_id uuid, p_week_start date)
returns uuid
language plpgsql
security definer
set search_path = public
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

  insert into public.rota_weekly_rotas (site_id, week_start_date, generated_by)
  values (p_site_id, p_week_start, auth.uid())
  on conflict (site_id, week_start_date)
  do update set generated_at = now(), generated_by = auth.uid()
  returning id into v_weekly_rota_id;

  delete from public.rota_weekly_classes where weekly_rota_id = v_weekly_rota_id;
  delete from public.rota_weekly_roster where weekly_rota_id = v_weekly_rota_id;

  insert into public.rota_weekly_roster (
    weekly_rota_id, day_of_week, coach_id, sort_order,
    shift_start_mins, shift_end_mins, status,
    is_key_holder, is_lead, is_cashing_up
  )
  select
    v_weekly_rota_id, day_of_week, coach_id, sort_order,
    shift_start_mins, shift_end_mins, status,
    is_key_holder, is_lead, is_cashing_up
  from public.rota_standard_roster
  where site_id = p_site_id;

  insert into public.rota_weekly_classes (
    weekly_rota_id, day_of_week, coach_id, set_coach_id,
    class_catalogue_id, title, category_key, meta,
    start_mins, duration_mins
  )
  select
    v_weekly_rota_id, day_of_week, coach_id, set_coach_id,
    class_catalogue_id, title, category_key, meta,
    start_mins, duration_mins
  from public.rota_standard_classes
  where site_id = p_site_id;

  return v_weekly_rota_id;
end;
$$;

revoke execute on function public.upsert_weekly_rota(uuid, date) from public;
revoke execute on function public.upsert_weekly_rota(uuid, date) from anon;
grant execute on function public.upsert_weekly_rota(uuid, date) to authenticated;

create or replace function public.upsert_restructure(p_site_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restructure_id uuid;
begin
  if not public.is_active_coach() then
    raise exception 'Your account has been deactivated';
  end if;

  if not public.has_capability('edit_rota') then
    raise exception 'Your job title does not have rota edit rights';
  end if;

  if not public.has_site_capability('edit_rota', p_site_id) then
    raise exception 'Not authorized to generate a restructure for this site';
  end if;

  insert into public.rota_restructures (site_id, generated_by)
  values (p_site_id, auth.uid())
  on conflict (site_id)
  do update set generated_at = now(), generated_by = auth.uid()
  returning id into v_restructure_id;

  delete from public.rota_restructure_classes where restructure_id = v_restructure_id;
  delete from public.rota_restructure_roster where restructure_id = v_restructure_id;

  insert into public.rota_restructure_roster (
    restructure_id, day_of_week, coach_id, sort_order,
    shift_start_mins, shift_end_mins, status,
    is_key_holder, is_lead, is_cashing_up
  )
  select
    v_restructure_id, day_of_week, coach_id, sort_order,
    shift_start_mins, shift_end_mins, status,
    is_key_holder, is_lead, is_cashing_up
  from public.rota_standard_roster
  where site_id = p_site_id;

  insert into public.rota_restructure_classes (
    restructure_id, day_of_week, coach_id, set_coach_id,
    class_catalogue_id, title, category_key, meta,
    start_mins, duration_mins
  )
  select
    v_restructure_id, day_of_week, coach_id, set_coach_id,
    class_catalogue_id, title, category_key, meta,
    start_mins, duration_mins
  from public.rota_standard_classes
  where site_id = p_site_id;

  return v_restructure_id;
end;
$$;

revoke execute on function public.upsert_restructure(uuid) from public;
revoke execute on function public.upsert_restructure(uuid) from anon;
grant execute on function public.upsert_restructure(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4c. can_edit_rota(): shim with no callers, dropped in P5
-- ---------------------------------------------------------------------------
--
-- After this file, no policy or function in the repo calls can_edit_rota(),
-- and no app code calls it over RPC (lib/rota/canEdit.ts only mirrors its old
-- title list, and that is P4). It is kept rather than dropped so that any
-- caller added directly to the live database outside a migration (0005 and
-- 0012 both record live-first changes) gets the new rules rather than
-- the old is_admin() + Head of People list. The body no longer
-- mentions either.

create or replace function public.can_edit_rota()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.has_capability('edit_rota');
$$;

revoke execute on function public.can_edit_rota() from public;
revoke execute on function public.can_edit_rota() from anon;
grant execute on function public.can_edit_rota() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. job_title check constraint: 6 agreed titles
-- ---------------------------------------------------------------------------
--
-- 0001 declared the job_title check inline, so its name was generated by
-- Postgres (almost certainly profiles_job_title_check). Rather than rely on
-- that, the block below drops every CHECK constraint on profiles whose column
-- set is exactly {job_title}. The role and site checks are on other columns
-- and are untouched.
--
-- Last on purpose, as in 0014 and 0024: this is the one statement that can
-- fail on existing data. If a 'Head of People' row appeared after step 1, it
-- fails with 23514 and the whole file rolls back.

do $$
declare
  v_con record;
begin
  for v_con in
    select c.conname
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute a
      on a.attrelid = c.conrelid and a.attname = 'job_title'
    where c.conrelid = 'public.profiles'::regclass
      and c.contype = 'c'
      and c.conkey = array[a.attnum]
  loop
    execute format('alter table public.profiles drop constraint %I', v_con.conname);
  end loop;
end
$$;

alter table public.profiles
  add constraint profiles_job_title_check
  check (job_title in (
    'Coach',
    'Lead Coach',
    'Club Head Coach',
    'Regional General Manager',
    'Head of Gymnastics',
    'Head of Operations'
  ));

commit;
