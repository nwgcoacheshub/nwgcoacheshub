-- NWG Coaches Hub — Club Profile, phase A.6
-- Adds club_updates, the per-site admin-editable updates feed.
--
-- Same access shape as club_role_assignments in 0007: coaches read their own
-- site, admins read every site, and only admins write. Read and write are
-- therefore separate policies rather than 0002's single `for all`, which
-- follows the split first used on profiles in 0001.
--
-- created_by is nullable with `on delete set null` so removing an account never
-- destroys the updates written under it, matching hero_hours.logged_by_coach_id
-- in 0007.
--
-- updated_at has no trigger behind it — it takes now() on insert and is set by
-- the caller on edit, matching rota_standard_classes/rota_weekly_classes in
-- 0002. There is no updated_at trigger convention in this project to follow.

create table public.club_updates (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.rota_sites (id) on delete cascade,
  title text not null,
  body text not null,
  pinned boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Supports the feed's one query shape: a site's updates, pinned first, then
-- newest first. Both sort keys reverse together, so `order by pinned desc,
-- created_at desc` is served by a backward scan of this ascending index.
create index on public.club_updates (site_id, pinned, created_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.club_updates enable row level security;

create policy "club_updates_select_admin_or_own_site"
on public.club_updates
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.rota_sites s
    join public.profiles p on p.site = s.name
    where s.id = club_updates.site_id and p.id = auth.uid()
  )
);

create policy "club_updates_insert_admin_only"
on public.club_updates
for insert
to authenticated
with check (public.is_admin());

create policy "club_updates_update_admin_only"
on public.club_updates
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "club_updates_delete_admin_only"
on public.club_updates
for delete
to authenticated
using (public.is_admin());
