-- NWG Coaches Hub — Rota Tool, phase 1 (database only)
-- rota_ tables, RLS policies, seed reference data
-- No UI/routes in this phase. profiles table is untouched.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.rota_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order smallint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.rota_categories (
  key text primary key,
  label text not null,
  color_hex text not null,
  sort_order smallint not null default 0,
  active boolean not null default true
);

create table public.rota_class_catalogue (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category_key text not null references public.rota_categories (key),
  default_meta text,
  default_duration_mins smallint not null default 60,
  active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create table public.rota_coaches (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.rota_sites (id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.rota_coaches (site_id);

create table public.rota_standard_roster (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.rota_sites (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0=Mon..6=Sun
  coach_id uuid not null references public.rota_coaches (id) on delete cascade,
  sort_order smallint not null default 0,
  shift_start_mins smallint not null default 480,
  shift_end_mins smallint not null default 1320,
  is_key_holder boolean not null default false,
  is_lead boolean not null default false,
  is_cashing_up boolean not null default false,
  unique (site_id, day_of_week, coach_id)
);
create unique index one_cashup_per_standard_day
  on public.rota_standard_roster (site_id, day_of_week) where is_cashing_up;
create unique index one_lead_per_standard_day
  on public.rota_standard_roster (site_id, day_of_week) where is_lead;

create table public.rota_standard_classes (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.rota_sites (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  coach_id uuid not null references public.rota_coaches (id) on delete cascade,
  set_coach_id uuid references public.rota_coaches (id) on delete set null,
  class_catalogue_id uuid references public.rota_class_catalogue (id) on delete set null,
  title text not null,
  category_key text not null references public.rota_categories (key),
  meta text,
  start_mins smallint not null,
  duration_mins smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.rota_standard_classes (site_id, day_of_week);

create table public.rota_weekly_rotas (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.rota_sites (id) on delete cascade,
  week_start_date date not null,
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users (id),
  unique (site_id, week_start_date)
);

create table public.rota_weekly_roster (
  id uuid primary key default gen_random_uuid(),
  weekly_rota_id uuid not null references public.rota_weekly_rotas (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  coach_id uuid not null references public.rota_coaches (id) on delete cascade,
  sort_order smallint not null default 0,
  shift_start_mins smallint not null,
  shift_end_mins smallint not null,
  status text not null default 'working' check (status in ('working', 'leave', 'sick')),
  is_key_holder boolean not null default false,
  is_lead boolean not null default false,
  is_cashing_up boolean not null default false,
  unique (weekly_rota_id, day_of_week, coach_id)
);
create unique index one_cashup_per_week_day
  on public.rota_weekly_roster (weekly_rota_id, day_of_week) where is_cashing_up;
create unique index one_lead_per_week_day
  on public.rota_weekly_roster (weekly_rota_id, day_of_week) where is_lead;

create table public.rota_weekly_classes (
  id uuid primary key default gen_random_uuid(),
  weekly_rota_id uuid not null references public.rota_weekly_rotas (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  coach_id uuid not null references public.rota_coaches (id) on delete cascade,
  set_coach_id uuid references public.rota_coaches (id) on delete set null,
  class_catalogue_id uuid references public.rota_class_catalogue (id) on delete set null,
  title text not null,
  category_key text not null references public.rota_categories (key),
  meta text,
  start_mins smallint not null,
  duration_mins smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.rota_weekly_classes (weekly_rota_id, day_of_week);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.rota_sites enable row level security;
alter table public.rota_categories enable row level security;
alter table public.rota_class_catalogue enable row level security;
alter table public.rota_coaches enable row level security;
alter table public.rota_standard_roster enable row level security;
alter table public.rota_standard_classes enable row level security;
alter table public.rota_weekly_rotas enable row level security;
alter table public.rota_weekly_roster enable row level security;
alter table public.rota_weekly_classes enable row level security;

-- Shared reference data: readable by any authenticated user with a
-- profiles row, no site restriction. No insert/update/delete policies —
-- these are maintained directly in the table editor for now.

create policy "rota_sites_select_authenticated"
on public.rota_sites
for select
to authenticated
using (
  exists (select 1 from public.profiles where id = auth.uid())
);

create policy "rota_categories_select_authenticated"
on public.rota_categories
for select
to authenticated
using (
  exists (select 1 from public.profiles where id = auth.uid())
);

create policy "rota_class_catalogue_select_authenticated"
on public.rota_class_catalogue
for select
to authenticated
using (
  exists (select 1 from public.profiles where id = auth.uid())
);

-- Site-scoped data: admins get every site; coaches are restricted to rows
-- whose site matches their profiles.site, joined by name since
-- profiles.site is free text (not a foreign key) in this phase.
-- Reuses public.is_admin() from 0001_init.sql rather than duplicating logic.

create policy "rota_coaches_all_admin_or_own_site"
on public.rota_coaches
for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.rota_sites s
    join public.profiles p on p.site = s.name
    where s.id = rota_coaches.site_id and p.id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.rota_sites s
    join public.profiles p on p.site = s.name
    where s.id = rota_coaches.site_id and p.id = auth.uid()
  )
);

create policy "rota_standard_roster_all_admin_or_own_site"
on public.rota_standard_roster
for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.rota_sites s
    join public.profiles p on p.site = s.name
    where s.id = rota_standard_roster.site_id and p.id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.rota_sites s
    join public.profiles p on p.site = s.name
    where s.id = rota_standard_roster.site_id and p.id = auth.uid()
  )
);

create policy "rota_standard_classes_all_admin_or_own_site"
on public.rota_standard_classes
for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.rota_sites s
    join public.profiles p on p.site = s.name
    where s.id = rota_standard_classes.site_id and p.id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.rota_sites s
    join public.profiles p on p.site = s.name
    where s.id = rota_standard_classes.site_id and p.id = auth.uid()
  )
);

create policy "rota_weekly_rotas_all_admin_or_own_site"
on public.rota_weekly_rotas
for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.rota_sites s
    join public.profiles p on p.site = s.name
    where s.id = rota_weekly_rotas.site_id and p.id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.rota_sites s
    join public.profiles p on p.site = s.name
    where s.id = rota_weekly_rotas.site_id and p.id = auth.uid()
  )
);

-- rota_weekly_roster/rota_weekly_classes have no site_id directly —
-- join through rota_weekly_rotas to apply the same site rule.

create policy "rota_weekly_roster_all_admin_or_own_site"
on public.rota_weekly_roster
for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.rota_weekly_rotas wr
    join public.rota_sites s on s.id = wr.site_id
    join public.profiles p on p.site = s.name
    where wr.id = rota_weekly_roster.weekly_rota_id and p.id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.rota_weekly_rotas wr
    join public.rota_sites s on s.id = wr.site_id
    join public.profiles p on p.site = s.name
    where wr.id = rota_weekly_roster.weekly_rota_id and p.id = auth.uid()
  )
);

create policy "rota_weekly_classes_all_admin_or_own_site"
on public.rota_weekly_classes
for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.rota_weekly_rotas wr
    join public.rota_sites s on s.id = wr.site_id
    join public.profiles p on p.site = s.name
    where wr.id = rota_weekly_classes.weekly_rota_id and p.id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.rota_weekly_rotas wr
    join public.rota_sites s on s.id = wr.site_id
    join public.profiles p on p.site = s.name
    where wr.id = rota_weekly_classes.weekly_rota_id and p.id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- Seed data — reference tables only. rota_coaches, rota_standard_roster,
-- rota_standard_classes, rota_weekly_rotas, rota_weekly_roster, and
-- rota_weekly_classes start empty; real data is added later via the UI.
-- ---------------------------------------------------------------------------

insert into public.rota_sites (name, slug, sort_order) values
('Burnley', 'burnley', 1),
('Coventry', 'coventry', 2),
('Leeds', 'leeds', 3),
('Mansfield', 'mansfield', 4),
('Rotherham', 'rotherham', 5),
('Wirral', 'wirral', 6),
('Wolverhampton', 'wolverhampton', 7);

insert into public.rota_categories (key, label, color_hex, sort_order) values
('tumblers', 'Tiny Tumblers', '#E85D9C', 1),
('openplay', 'Preschool Open Play', '#F2994A', 2),
('flippers', 'Little Flippers', '#F2B84B', 3),
('fun', 'Fun Session', '#D6467A', 4),
('wagGold', 'WAG Gold', '#B8860B', 5),
('wagSilver', 'WAG Silver', '#8A94A3', 6),
('wagBronze', 'WAG Bronze', '#8B5E3C', 7),
('wagPearl', 'WAG Pearl', '#8B5CF6', 8),
('wagTurquoise', 'WAG Turquoise', '#17B6C4', 9),
('ruby', 'Ruby Squad', '#D6483F', 10),
('sapphire', 'Sapphire Squad', '#3B6FD6', 11),
('emerald', 'Emerald Squad', '#3FA66A', 12),
('topaz', 'Topaz Squad', '#C08A2E', 13),
('onyx', 'Onyx Squad', '#24262B', 14),
('diamond', 'Diamond Squad', '#9FB0C3', 15),
('amethyst', 'Amethyst Squad', '#B98FDE', 16),
('quartz', 'Quartz Squad', '#EBA9CB', 17),
('amber', 'Amber Squad', '#F0D42A', 18),
('opal', 'Opal Squad', '#5B2A6B', 19),
('turquoiseSquad', 'Turquoise Squad', '#78CBE0', 20),
('bronzeSquad', 'Bronze Squad', '#9C6B3F', 21),
('silverSquad', 'Silver Squad', '#9AA1AC', 22);

insert into public.rota_class_catalogue (title, category_key, default_duration_mins, sort_order) values
('Little Flippers', 'flippers', 60, 1),
('Tiny Tumblers', 'tumblers', 60, 2),
('4-5 Emerald', 'emerald', 60, 3),
('5-7 Sapphire', 'sapphire', 60, 4),
('7-10 Sapphire', 'sapphire', 60, 5),
('10+ Sapphire', 'sapphire', 60, 6),
('5-7 Ruby', 'ruby', 60, 7),
('7-10 Ruby', 'ruby', 60, 8),
('10+ Ruby', 'ruby', 60, 9),
('5-7 Diamond', 'diamond', 60, 10),
('7-10 Diamond', 'diamond', 60, 11),
('10+ Diamond', 'diamond', 60, 12),
('7-10 Topaz', 'topaz', 60, 13),
('10+ Topaz', 'topaz', 60, 14),
('7-10 Onyx', 'onyx', 120, 15),
('10+ Onyx', 'onyx', 120, 16);
