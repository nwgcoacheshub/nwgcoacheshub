-- NWG Coaches Hub — Club Profile, phase A (database only)
-- club_role_categories, club_roles, club_role_assignments, heroes, hero_hours,
-- their RLS policies, and the reference-list seeds. No UI/routes in this phase.
--
-- Two people-shaped tables already existed and are NOT interchangeable:
-- rota_coaches is a per-site list of names on the rota board (no login), while
-- profiles is a real Hub account. Club role assignments and hero-hour logs both
-- represent actions by real logged-in accounts, so coach_id and
-- logged_by_coach_id reference public.profiles (id) rather than rota_coaches.
--
-- Because the two were previously unlinked entirely, this migration also adds
-- rota_coaches.profile_id so a board entry can point at an account where one
-- exists. It stays nullable — plenty of rota coaches have no Hub login — and a
-- partial unique index stops the same account being attached twice at one site.
-- rota_coaches is otherwise do-not-modify; this column is the only change to it.
--
-- RLS follows the pattern already set by 0002: public.is_admin() or a
-- profiles.site -> rota_sites.name join, with tables that have no site_id of
-- their own reaching it through their parent. club_role_assignments is the one
-- table that splits read from write (coaches read, admins edit), which follows
-- the split already used on profiles in 0001 rather than 0002's single
-- `for all` policy.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.club_role_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order smallint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.club_roles (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.club_role_categories (id) on delete cascade,
  name text not null,
  sort_order smallint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.club_roles (category_id);

-- Many-to-many: a role can be held by several coaches at a site, and a coach
-- can hold several roles. The unique constraint stops the same person being
-- attached to the same role at the same site twice.
create table public.club_role_assignments (
  id uuid primary key default gen_random_uuid(),
  club_role_id uuid not null references public.club_roles (id) on delete cascade,
  site_id uuid not null references public.rota_sites (id) on delete cascade,
  coach_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (club_role_id, site_id, coach_id)
);
create index on public.club_role_assignments (site_id);
create index on public.club_role_assignments (coach_id);

create table public.heroes (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.rota_sites (id) on delete cascade,
  name text not null,
  dob date,
  bg_number text,
  email text,
  days_coaching text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.heroes (site_id);

-- logged_by_coach_id is nullable with `on delete set null` so removing an
-- account never destroys the hours already logged under it — same reasoning as
-- rota_standard_classes.set_coach_id in 0002.
create table public.hero_hours (
  id uuid primary key default gen_random_uuid(),
  hero_id uuid not null references public.heroes (id) on delete cascade,
  date date not null,
  duration_minutes integer not null,
  logged_by_coach_id uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create index on public.hero_hours (hero_id);

-- ---------------------------------------------------------------------------
-- rota_coaches -> profiles link
-- ---------------------------------------------------------------------------

alter table public.rota_coaches
  add column profile_id uuid references public.profiles (id) on delete set null;

create unique index one_rota_coach_per_profile_per_site
  on public.rota_coaches (site_id, profile_id) where profile_id is not null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.club_role_categories enable row level security;
alter table public.club_roles enable row level security;
alter table public.club_role_assignments enable row level security;
alter table public.heroes enable row level security;
alter table public.hero_hours enable row level security;

-- Shared reference data: readable by any authenticated user with a profiles
-- row, no site restriction. No insert/update/delete policies — these lists are
-- maintained directly in the table editor, matching rota_categories.

create policy "club_role_categories_select_authenticated"
on public.club_role_categories
for select
to authenticated
using (
  exists (select 1 from public.profiles where id = auth.uid())
);

create policy "club_roles_select_authenticated"
on public.club_roles
for select
to authenticated
using (
  exists (select 1 from public.profiles where id = auth.uid())
);

-- club_role_assignments: coaches read their own site, admins read everything,
-- but only admins write — this backs the admin-only edit control on the Club
-- Profile page. Read and write are therefore separate policies rather than
-- 0002's single `for all`.

create policy "club_role_assignments_select_admin_or_own_site"
on public.club_role_assignments
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.rota_sites s
    join public.profiles p on p.site = s.name
    where s.id = club_role_assignments.site_id and p.id = auth.uid()
  )
);

create policy "club_role_assignments_insert_admin_only"
on public.club_role_assignments
for insert
to authenticated
with check (public.is_admin());

create policy "club_role_assignments_update_admin_only"
on public.club_role_assignments
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "club_role_assignments_delete_admin_only"
on public.club_role_assignments
for delete
to authenticated
using (public.is_admin());

-- heroes: site-scoped read and write for coaches, everything for admins —
-- the same `for all` shape the rota_ tables use.

create policy "heroes_all_admin_or_own_site"
on public.heroes
for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.rota_sites s
    join public.profiles p on p.site = s.name
    where s.id = heroes.site_id and p.id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.rota_sites s
    join public.profiles p on p.site = s.name
    where s.id = heroes.site_id and p.id = auth.uid()
  )
);

-- hero_hours has no site_id directly — join through heroes to apply the same
-- site rule, mirroring how rota_weekly_roster reaches its site via
-- rota_weekly_rotas in 0002.

create policy "hero_hours_all_admin_or_own_site"
on public.hero_hours
for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.heroes h
    join public.rota_sites s on s.id = h.site_id
    join public.profiles p on p.site = s.name
    where h.id = hero_hours.hero_id and p.id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.heroes h
    join public.rota_sites s on s.id = h.site_id
    join public.profiles p on p.site = s.name
    where h.id = hero_hours.hero_id and p.id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- Seed data — reference lists only. club_role_assignments, heroes and
-- hero_hours start empty; real data is added later via the UI.
-- ---------------------------------------------------------------------------

insert into public.club_role_categories (name, sort_order) values
('Admin', 1),
('Co-ordinators', 2),
('Other', 3);

insert into public.club_roles (category_id, name, sort_order)
select (select id from public.club_role_categories where name = 'Admin'), v.name, v.sort_order
from (values
  ('Annual leave/Absences', 1),
  ('BG''s', 2),
  ('Cash log', 3),
  ('Camps', 4),
  ('Cleaning/Gap rota''s', 5),
  ('Club competition', 6),
  ('Emails', 7),
  ('Expenses', 8),
  ('Free Taster', 9),
  ('Fire alarm testing', 10),
  ('Joiners/Leavers', 11),
  ('Large equipment checks', 12),
  ('Movers', 13),
  ('Party''s', 14),
  ('Payments', 15),
  ('RISE checks', 16),
  ('Rotations', 17),
  ('Stock lists', 18),
  ('Quality assurance (observations, etc.)', 19)
) as v(name, sort_order);

insert into public.club_roles (category_id, name, sort_order)
select (select id from public.club_role_categories where name = 'Co-ordinators'), v.name, v.sort_order
from (values
  ('Competition Co-ordinator', 1),
  ('Cover Co-ordinator', 2),
  ('Heroes Co-ordinator', 3),
  ('Socials & Marketing Co-ordinator', 4)
) as v(name, sort_order);

insert into public.club_roles (category_id, name, sort_order)
select (select id from public.club_role_categories where name = 'Other'), v.name, v.sort_order
from (values
  ('Lead Coaches', 1),
  ('Welfare Officer', 2)
) as v(name, sort_order);
