-- NWG Coaches Hub — Club Profile, phase A.5
-- Adds resolve_profile_names(), a narrow name-lookup helper.
--
-- 0007 pointed club_role_assignments.coach_id and hero_hours.logged_by_coach_id
-- at profiles. But profiles_select_own_or_admin (0001) lets a non-admin coach
-- read only their own profiles row, so the Club Profile page could read the
-- assignment rows for its site and still not turn those uuids into names —
-- every role would render as an unresolvable id for anyone who isn't an admin.
--
-- Rather than widen the profiles select policy (which would expose email,
-- job_title, role and site to every coach), this is a security definer function
-- returning nothing but id and full_name, following the precedent set by
-- public.is_admin() in 0001: security definer, stable, and a pinned search_path
-- so the body can't be redirected by a caller-controlled search_path.
--
-- The uuids have to come from somewhere, and every table exposing them
-- (club_role_assignments, hero_hours via heroes) is already site-scoped by RLS.
-- So a coach can only resolve names for people whose ids their own site's rows
-- already gave them. The caller is additionally required to have a profiles row
-- of their own, matching the check the reference-data policies in 0002 use —
-- an authenticated session that isn't a Hub user resolves nothing.
--
-- Unlike is_admin() and upsert_weekly_rota(), this one does NOT rely on the
-- default EXECUTE-to-PUBLIC grant. That default is revoked and execute is then
-- granted to `authenticated` alone, so anon sessions cannot call it at all.
-- The revoke is required: a bare grant would be additive on top of the default
-- PUBLIC grant and would leave anon still able to execute.

create function public.resolve_profile_names(profile_ids uuid[])
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
    and exists (
      select 1 from public.profiles caller where caller.id = auth.uid()
    );
$$;

revoke execute on function public.resolve_profile_names(uuid[]) from public;
grant execute on function public.resolve_profile_names(uuid[]) to authenticated;
