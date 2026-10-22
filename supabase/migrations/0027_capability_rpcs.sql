-- NWG Coaches Hub — Permissions retcon, phase P4: capability RPCs for the app
--
-- P3 (0026) moved every database permission from profiles.role to capabilities
-- derived from profiles.job_title. P4 moves the app onto the same model. This
-- file adds the two read paths the app needs and nothing else. The design was
-- approved in P4 Phase A (decisions D1, D6).
--
-- What this file does, in order:
--   1. my_capabilities(): the caller's capability list and own site id, read
--      once per request by the server (lib/capabilities.ts) to decide what the
--      UI offers. Server-side guards on secret-key routes do NOT use it; they
--      call has_capability() directly.
--   2. site_role_candidates(uuid): the active accounts at one site, for the
--      Staff Roles picker (G13). After 0026 a Club Head Coach can read only
--      their own profiles row, so the picker needs a narrow definer read rather
--      than a wider profiles SELECT policy.
--   3. An explicit service_role grant on title_has_capability(), which the
--      secret-key reset-password route calls to refuse full-access targets.
--
-- What it deliberately does NOT do:
--   * Change the matrix. title_has_capability() (0026) stays its only copy.
--   * Widen profiles SELECT, or touch any policy.
--   * Drop profiles.role, is_admin() or the can_edit_rota() shim. That is P5.
--
-- ORDER: apply this file BEFORE deploying the P4 app code. The P4 app calls
-- my_capabilities() on every protected page. If the app ships first, the RPC is
-- missing, every page fails closed (no Admin nav, no edit controls, and Head
-- Office users see "profile-site-unmatched" on Rota and Club Profile) until
-- this file is applied.
--
-- Wrapped in an explicit transaction for the reasons 0026 gives. No down
-- migration, matching every migration so far.

begin;

-- ---------------------------------------------------------------------------
-- 1. my_capabilities()
-- ---------------------------------------------------------------------------
--
-- One row: every capability the caller holds, plus the rota_sites id matching
-- their profiles.site. own_site_id is null for Head Office, which has no
-- rota_sites row. No row at all if the caller has no profile.
--
-- An inactive caller gets an empty array, the same answer has_capability()
-- gives them for every name.
--
-- The capability NAMES are listed here as well as in title_has_capability().
-- The title assignments are not: each name is passed through the matrix, so
-- the matrix still has one copy. Adding a capability means adding its name to
-- both functions (and to the Capability type in lib/capabilities.ts).
--
-- security definer for the same reason as has_capability(): the body reads
-- profiles and calls title_has_capability(), which authenticated cannot
-- execute.

create function public.my_capabilities()
returns table (capabilities text[], own_site_id uuid)
language sql
security definer
stable
set search_path = ''
as $$
  select
    array(
      select c.cap
      from unnest(array[
        'view_all_sites',
        'all_sites_scope',
        'publish_whats_new',
        'manage_policies',
        'manage_users',
        'edit_rota',
        'manage_club_meetings',
        'manage_club_updates',
        'manage_club_roles'
      ]::text[]) as c(cap)
      where p.active
        and public.title_has_capability(p.job_title, c.cap)
    ),
    (select s.id from public.rota_sites s where s.name = p.site)
  from public.profiles p
  where p.id = auth.uid();
$$;

revoke execute on function public.my_capabilities() from public;
revoke execute on function public.my_capabilities() from anon;
grant execute on function public.my_capabilities() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. site_role_candidates(uuid)
-- ---------------------------------------------------------------------------
--
-- id and full_name only, for active profiles whose profiles.site name-matches
-- the rota_sites row p_site_id, and only if the caller holds manage_club_roles
-- at that site. Anyone else gets an empty set rather than an error, the same
-- way resolve_profile_names() (0008, 0014) answers callers it won't serve.
--
-- Head Office profiles have no rota_sites row and so never appear, which
-- matches the picker's behaviour before P4.
--
-- Columns are alias-qualified: the RETURNS TABLE names (id, full_name) are in
-- scope inside the body and would otherwise be ambiguous.

create function public.site_role_candidates(p_site_id uuid)
returns table (id uuid, full_name text)
language sql
security definer
stable
set search_path = ''
as $$
  select p.id, p.full_name
  from public.profiles p
  join public.rota_sites s on s.name = p.site
  where s.id = p_site_id
    and p.active
    and public.has_site_capability('manage_club_roles', p_site_id)
  order by p.full_name;
$$;

revoke execute on function public.site_role_candidates(uuid) from public;
revoke execute on function public.site_role_candidates(uuid) from anon;
grant execute on function public.site_role_candidates(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. title_has_capability(): explicit service_role grant
-- ---------------------------------------------------------------------------
--
-- /api/admin/reset-password (secret key) refuses any target whose job_title
-- holds manage_users, whether that account is active or not, so that
-- reactivating a full-access account can never restore it with a password
-- someone else set. It asks the matrix directly, through this function, rather
-- than keeping a TypeScript copy of the full-access titles.
--
-- 0026 noted service_role keeps its Supabase default grant. This states it, so
-- the route's dependency is visible and doesn't rest on a default. The revokes
-- from public, anon and authenticated in 0026 are unchanged.

grant execute on function public.title_has_capability(text, text) to service_role;

commit;
