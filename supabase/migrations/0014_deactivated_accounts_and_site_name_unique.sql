-- NWG Coaches Hub — deactivated accounts lose data access, and rota_sites.name
-- becomes unique.
--
-- Two findings from the RLS audit, fixed together.
--
-- G1 (high). profiles.active is set to false when an account is deactivated
-- (components/UsersTable.tsx), but no policy and no security-definer function
-- has ever read it. Deactivation is a UI redirect in app/(protected)/layout.tsx
-- and nothing more: the auth.users row is untouched, no session is revoked, and
-- the password still works. A deactivated coach could sign in, get a valid JWT,
-- and reach PostgREST directly with every permission they had the day before —
-- their site's rota, its heroes (with dates of birth and BG numbers), and its
-- club updates. This adds public.is_active_coach() and makes it a condition of
-- every site-scoped policy on those tables, plus the three security-definer
-- functions that authorise their own writes.
--
-- G2 (medium). Every site-scoped policy authorises through `p.site = s.name`,
-- but rota_sites.name carries no unique constraint — only slug does. A second
-- row with a duplicate name would silently widen one site's coaches into the
-- duplicate's rows. Confirmed clean before this was written (see the bottom of
-- this file); the constraint keeps it that way.
--
-- Scope note: this is the RLS half only. Nothing here revokes a session or bans
-- an auth.users row, so a deactivated user's existing JWT stays technically
-- valid until it expires — it just stops being able to read or write anything.
--
-- Deactivated ADMINS are locked out too. is_admin() and can_edit_rota() do not
-- check active, so is_active_coach() is applied as the OUTER conjunct in every
-- predicate below:
--
--     is_active_coach() and ( is_admin() or <site match> )
--
-- rather than being folded into the site-match branch, which would have left
-- admins exempt. Deactivating an admin is exactly the case where the control
-- needs to bite hardest.
--
-- Written with ALTER POLICY rather than 0013's drop-and-recreate. 0013 had no
-- choice: it was changing each policy's command (one FOR ALL into four). Here
-- only the expression moves, so altering in place means the policy never stops
-- existing mid-apply — no window where a table is briefly policy-less and the
-- board is dead — and re-running the file is harmless, since setting the same
-- expression twice is a no-op.
--
-- Out of scope, deliberately:
--   * profiles' own select/update policies. getCurrentProfile() reads the
--     caller's own row to find `active`, and the layout redirect depends on
--     that read succeeding. Gating it would work against the very check it
--     exists to feed.
--   * rota_sites, rota_categories, rota_class_catalogue, club_role_categories,
--     club_roles — shared reference data, select-only, nothing site-scoped.

-- ---------------------------------------------------------------------------
-- is_active_coach()
-- ---------------------------------------------------------------------------

-- Same shape as is_admin() in 0001 and can_edit_rota() in 0013: language sql,
-- security definer, stable, a pinned search_path, and a schema-qualified body.
-- security definer is required for the same reason those two need it — the body
-- reads profiles, and a profiles policy calling it would otherwise recurse.
--
-- Note what is NOT here: there is no is_admin() branch. That omission is the
-- whole of the no-admin-exemption decision. `active` is boolean not null, so the
-- bare column reference needs no coalesce.

create or replace function public.is_active_coach()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active
  );
$$;

-- Both revokes, then an explicit grant — the rule 0012 settled on. A function
-- here is reachable by anon down two independent paths (Postgres's default
-- EXECUTE-to-PUBLIC, and Supabase's `alter default privileges ... grant all on
-- functions to anon`), and closing one alone leaves the other open.

revoke execute on function public.is_active_coach() from public;
revoke execute on function public.is_active_coach() from anon;
grant execute on function public.is_active_coach() to authenticated;

-- ---------------------------------------------------------------------------
-- Rota tables — the 24 policies created by 0013
-- ---------------------------------------------------------------------------
--
-- Each keeps its 0013 name and command. The select policies gain
-- is_active_coach(); the write policies gain it alongside the can_edit_rota()
-- gate 0013 added. The site-match subquery inside is untouched in every case.

-- --- rota_coaches --------------------------------------------------------

alter policy "rota_coaches_select_admin_or_own_site" on public.rota_coaches
using (
  public.is_active_coach()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_coaches.site_id and p.id = auth.uid()
    )
  )
);

alter policy "rota_coaches_insert_can_edit_own_site" on public.rota_coaches
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_coaches.site_id and p.id = auth.uid()
    )
  )
);

alter policy "rota_coaches_update_can_edit_own_site" on public.rota_coaches
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_coaches.site_id and p.id = auth.uid()
    )
  )
)
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_coaches.site_id and p.id = auth.uid()
    )
  )
);

alter policy "rota_coaches_delete_can_edit_own_site" on public.rota_coaches
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_coaches.site_id and p.id = auth.uid()
    )
  )
);

-- --- rota_standard_roster ------------------------------------------------

alter policy "rota_standard_roster_select_admin_or_own_site" on public.rota_standard_roster
using (
  public.is_active_coach()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_standard_roster.site_id and p.id = auth.uid()
    )
  )
);

alter policy "rota_standard_roster_insert_can_edit_own_site" on public.rota_standard_roster
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_standard_roster.site_id and p.id = auth.uid()
    )
  )
);

alter policy "rota_standard_roster_update_can_edit_own_site" on public.rota_standard_roster
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_standard_roster.site_id and p.id = auth.uid()
    )
  )
)
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_standard_roster.site_id and p.id = auth.uid()
    )
  )
);

alter policy "rota_standard_roster_delete_can_edit_own_site" on public.rota_standard_roster
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_standard_roster.site_id and p.id = auth.uid()
    )
  )
);

-- --- rota_standard_classes -----------------------------------------------

alter policy "rota_standard_classes_select_admin_or_own_site" on public.rota_standard_classes
using (
  public.is_active_coach()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_standard_classes.site_id and p.id = auth.uid()
    )
  )
);

alter policy "rota_standard_classes_insert_can_edit_own_site" on public.rota_standard_classes
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_standard_classes.site_id and p.id = auth.uid()
    )
  )
);

alter policy "rota_standard_classes_update_can_edit_own_site" on public.rota_standard_classes
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_standard_classes.site_id and p.id = auth.uid()
    )
  )
)
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_standard_classes.site_id and p.id = auth.uid()
    )
  )
);

alter policy "rota_standard_classes_delete_can_edit_own_site" on public.rota_standard_classes
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_standard_classes.site_id and p.id = auth.uid()
    )
  )
);

-- --- rota_weekly_rotas ---------------------------------------------------

alter policy "rota_weekly_rotas_select_admin_or_own_site" on public.rota_weekly_rotas
using (
  public.is_active_coach()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_weekly_rotas.site_id and p.id = auth.uid()
    )
  )
);

alter policy "rota_weekly_rotas_insert_can_edit_own_site" on public.rota_weekly_rotas
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_weekly_rotas.site_id and p.id = auth.uid()
    )
  )
);

alter policy "rota_weekly_rotas_update_can_edit_own_site" on public.rota_weekly_rotas
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_weekly_rotas.site_id and p.id = auth.uid()
    )
  )
)
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_weekly_rotas.site_id and p.id = auth.uid()
    )
  )
);

alter policy "rota_weekly_rotas_delete_can_edit_own_site" on public.rota_weekly_rotas
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_weekly_rotas.site_id and p.id = auth.uid()
    )
  )
);

-- --- rota_weekly_roster --------------------------------------------------

alter policy "rota_weekly_roster_select_admin_or_own_site" on public.rota_weekly_roster
using (
  public.is_active_coach()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_weekly_rotas wr
      join public.rota_sites s on s.id = wr.site_id
      join public.profiles p on p.site = s.name
      where wr.id = rota_weekly_roster.weekly_rota_id and p.id = auth.uid()
    )
  )
);

alter policy "rota_weekly_roster_insert_can_edit_own_site" on public.rota_weekly_roster
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_weekly_rotas wr
      join public.rota_sites s on s.id = wr.site_id
      join public.profiles p on p.site = s.name
      where wr.id = rota_weekly_roster.weekly_rota_id and p.id = auth.uid()
    )
  )
);

alter policy "rota_weekly_roster_update_can_edit_own_site" on public.rota_weekly_roster
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_weekly_rotas wr
      join public.rota_sites s on s.id = wr.site_id
      join public.profiles p on p.site = s.name
      where wr.id = rota_weekly_roster.weekly_rota_id and p.id = auth.uid()
    )
  )
)
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_weekly_rotas wr
      join public.rota_sites s on s.id = wr.site_id
      join public.profiles p on p.site = s.name
      where wr.id = rota_weekly_roster.weekly_rota_id and p.id = auth.uid()
    )
  )
);

alter policy "rota_weekly_roster_delete_can_edit_own_site" on public.rota_weekly_roster
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_weekly_rotas wr
      join public.rota_sites s on s.id = wr.site_id
      join public.profiles p on p.site = s.name
      where wr.id = rota_weekly_roster.weekly_rota_id and p.id = auth.uid()
    )
  )
);

-- --- rota_weekly_classes -------------------------------------------------

alter policy "rota_weekly_classes_select_admin_or_own_site" on public.rota_weekly_classes
using (
  public.is_active_coach()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_weekly_rotas wr
      join public.rota_sites s on s.id = wr.site_id
      join public.profiles p on p.site = s.name
      where wr.id = rota_weekly_classes.weekly_rota_id and p.id = auth.uid()
    )
  )
);

alter policy "rota_weekly_classes_insert_can_edit_own_site" on public.rota_weekly_classes
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_weekly_rotas wr
      join public.rota_sites s on s.id = wr.site_id
      join public.profiles p on p.site = s.name
      where wr.id = rota_weekly_classes.weekly_rota_id and p.id = auth.uid()
    )
  )
);

alter policy "rota_weekly_classes_update_can_edit_own_site" on public.rota_weekly_classes
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_weekly_rotas wr
      join public.rota_sites s on s.id = wr.site_id
      join public.profiles p on p.site = s.name
      where wr.id = rota_weekly_classes.weekly_rota_id and p.id = auth.uid()
    )
  )
)
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_weekly_rotas wr
      join public.rota_sites s on s.id = wr.site_id
      join public.profiles p on p.site = s.name
      where wr.id = rota_weekly_classes.weekly_rota_id and p.id = auth.uid()
    )
  )
);

alter policy "rota_weekly_classes_delete_can_edit_own_site" on public.rota_weekly_classes
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_weekly_rotas wr
      join public.rota_sites s on s.id = wr.site_id
      join public.profiles p on p.site = s.name
      where wr.id = rota_weekly_classes.weekly_rota_id and p.id = auth.uid()
    )
  )
);


-- ---------------------------------------------------------------------------
-- Club Profile tables
-- ---------------------------------------------------------------------------
--
-- Same gap, same fix, but the shapes here are NOT identical to the rota tables
-- and are handled individually rather than by template:
--
--   * heroes and hero_hours are still single `for all` policies from 0007 —
--     they never went through 0013's four-way split, so each is one ALTER
--     carrying both using and with check.
--   * hero_hours reaches its site through heroes rather than directly, the same
--     way rota_weekly_roster reaches its own through rota_weekly_rotas.
--   * club_updates and club_role_assignments split read from write: the select
--     policy follows the usual admin-or-own-site shape, but all three WRITE
--     policies are `public.is_admin()` alone — no site match, no `or` branch —
--     because only admins ever write either table. Prepending the conjunct
--     there yields `is_active_coach() and is_admin()`, which is a real shape
--     difference from every other policy in this file rather than a template
--     substitution. The two tables were checked against each other and are
--     identical policy for policy, so they are written out the same way.

-- --- heroes --------------------------------------------------------------

alter policy "heroes_all_admin_or_own_site" on public.heroes
using (
  public.is_active_coach()
  and (
    public.is_admin()
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
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = heroes.site_id and p.id = auth.uid()
    )
  )
);

-- --- hero_hours ----------------------------------------------------------

alter policy "hero_hours_all_admin_or_own_site" on public.hero_hours
using (
  public.is_active_coach()
  and (
    public.is_admin()
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
    public.is_admin()
    or exists (
      select 1 from public.heroes h
      join public.rota_sites s on s.id = h.site_id
      join public.profiles p on p.site = s.name
      where h.id = hero_hours.hero_id and p.id = auth.uid()
    )
  )
);

-- --- club_updates --------------------------------------------------------

alter policy "club_updates_select_admin_or_own_site" on public.club_updates
using (
  public.is_active_coach()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = club_updates.site_id and p.id = auth.uid()
    )
  )
);

alter policy "club_updates_insert_admin_only" on public.club_updates
with check (
  public.is_active_coach()
  and public.is_admin()
);

alter policy "club_updates_update_admin_only" on public.club_updates
using (
  public.is_active_coach()
  and public.is_admin()
)
with check (
  public.is_active_coach()
  and public.is_admin()
);

alter policy "club_updates_delete_admin_only" on public.club_updates
using (
  public.is_active_coach()
  and public.is_admin()
);

-- --- club_role_assignments -----------------------------------------------

alter policy "club_role_assignments_select_admin_or_own_site" on public.club_role_assignments
using (
  public.is_active_coach()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = club_role_assignments.site_id and p.id = auth.uid()
    )
  )
);

alter policy "club_role_assignments_insert_admin_only" on public.club_role_assignments
with check (
  public.is_active_coach()
  and public.is_admin()
);

alter policy "club_role_assignments_update_admin_only" on public.club_role_assignments
using (
  public.is_active_coach()
  and public.is_admin()
)
with check (
  public.is_active_coach()
  and public.is_admin()
);

alter policy "club_role_assignments_delete_admin_only" on public.club_role_assignments
using (
  public.is_active_coach()
  and public.is_admin()
);


-- ---------------------------------------------------------------------------
-- upsert_weekly_rota
-- ---------------------------------------------------------------------------
--
-- security definer, so it bypasses RLS and none of the policies above reach it.
-- Its own checks are the boundary. The active test goes first, ahead of the
-- job_title gate 0013 added, so the most fundamental reason wins and the caller
-- gets the message that actually explains the refusal — useGenerateWeek surfaces
-- rpcError.message straight to the user, and telling a deactivated coach their
-- site is wrong would send them to the wrong person for help.
--
-- 0013's job_title gate, the site check, the `on conflict` upsert, both deletes
-- and both template copies are all preserved verbatim.

create or replace function public.upsert_weekly_rota(p_site_id uuid, p_week_start date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_weekly_rota_id uuid;
  v_authorized boolean;
begin
  if not public.is_active_coach() then
    raise exception 'Your account has been deactivated';
  end if;

  if not public.can_edit_rota() then
    raise exception 'Your job title does not have rota edit rights';
  end if;

  select
    public.is_admin()
    or exists (
      select 1
      from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = p_site_id and p.id = auth.uid()
    )
  into v_authorized;

  if not v_authorized then
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

-- `create or replace function` preserves an existing function's privileges, so
-- 0011's and 0012's revokes survive and these are no-ops today. Restated so the
-- grant state is declared next to the definition rather than resting on that
-- behaviour, and so the function stays closed to anon if it is ever dropped and
-- recreated rather than replaced.

revoke execute on function public.upsert_weekly_rota(uuid, date) from public;
revoke execute on function public.upsert_weekly_rota(uuid, date) from anon;
grant execute on function public.upsert_weekly_rota(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- resolve_profile_names
-- ---------------------------------------------------------------------------
--
-- 0008's caller guard was `exists (select 1 from profiles caller where
-- caller.id = auth.uid())` — the caller must be a Hub user. is_active_coach()
-- tests that same row and its active flag together, so it replaces the guard
-- rather than joining it: a deactivated account is no longer a Hub user for
-- this purpose. Behaviour for everyone else is unchanged.
--
-- The rest of 0008 is untouched, including its reasoning that a coach can only
-- resolve ids their own site's rows already handed them.

create or replace function public.resolve_profile_names(profile_ids uuid[])
returns table (id uuid, full_name text)
language sql
security definer
set search_path = public
stable
as $$
  -- Columns are alias-qualified throughout: the RETURNS TABLE output names
  -- (id, full_name) are in scope inside the body and would otherwise be
  -- ambiguous against the profiles columns of the same name.
  select p.id, p.full_name
  from public.profiles p
  where p.id = any(profile_ids)
    and public.is_active_coach();
$$;

revoke execute on function public.resolve_profile_names(uuid[]) from public;
revoke execute on function public.resolve_profile_names(uuid[]) from anon;
grant execute on function public.resolve_profile_names(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- is_admin() — closing the grant gap from 0001
-- ---------------------------------------------------------------------------
--
-- The last security-definer function here that never got 0012's treatment.
-- Confirmed live during the audit: an anon RPC call to is_admin returned
-- 200 false rather than a permission error, so both default grants were still
-- in place. Never exploitable — auth.uid() is null for anon, so it answers
-- false and leaks nothing — but it was the one function still resting on that
-- rather than on a closed grant. The body is untouched.
--
-- The grant to authenticated is not tidying: is_admin() is called from policy
-- expressions, which are evaluated as the invoking user, so revoking PUBLIC out
-- from under an inherited grant without declaring this one would take down
-- every policy that calls it.

revoke execute on function public.is_admin() from public;
revoke execute on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- G2 — rota_sites.name unique
-- ---------------------------------------------------------------------------
--
-- Verified empty before this file was written:
--
--   select name, count(*) from public.rota_sites group by name having count(*) > 1;
--
-- Last, on purpose. If a duplicate did slip in between that check and the apply,
-- this fails with 23505 and — because Postgres runs a multi-statement script as
-- one implicit transaction — takes the whole file down with it, rather than
-- leaving half the G1 fix applied.
--
-- What this does not do: profiles.site is still free text with no foreign key
-- to rota_sites. That direction fails closed (a typo grants nothing), so it is
-- left as it is. This closes the direction that fails open.

alter table public.rota_sites
  add constraint rota_sites_name_key unique (name);
