-- NWG Coaches Hub — Weekly Overview: gymnastics + pre-school schedules
--
-- Adds two NWG-wide (no site column) reference tables backing the dashboard's
-- "This week" hero: a gymnastics weekly rotation schedule and a pre-school
-- theme schedule. Both are content managed directly in the Supabase Table
-- Editor via the service role, which bypasses RLS — so, exactly like
-- mantras (0015), neither table gets an insert/update/delete policy, only a
-- single select policy gated by is_active_coach() (0014).
--
-- Schema and RLS only — no seed data. Seeding and the WeeklyFocusHero/page
-- wiring are separate follow-up work.

create table public.programme_gymnastics_weeks (
  id uuid primary key default gen_random_uuid(),
  week_commencing date not null unique,
  week_number smallint,
  rotation smallint,
  warm_up text,
  skill_focus text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.programme_gymnastics_weeks.week_number is
  'Position (1-9) in the repeating gymnastics rotation cycle. Not check-constrained — documentation only.';
comment on column public.programme_gymnastics_weeks.rotation is
  'Rotation number (1-3) within the week.';

create table public.programme_preschool_weeks (
  id uuid primary key default gen_random_uuid(),
  week_commencing date not null unique,
  week_number smallint,
  category text,
  mini_theme text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.programme_preschool_weeks.week_number is
  'Position (1-9) within the category block. Not check-constrained — documentation only.';
comment on column public.programme_preschool_weeks.category is
  'One of: Our World / People That Help Us / The Jungle / All About Me / Outer Space / Celebrations. Not check-constrained — documentation only.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.programme_gymnastics_weeks enable row level security;

create policy "programme_gymnastics_weeks_select_authenticated"
on public.programme_gymnastics_weeks
for select
to authenticated
using (
  public.is_active_coach()
);

alter table public.programme_preschool_weeks enable row level security;

create policy "programme_preschool_weeks_select_authenticated"
on public.programme_preschool_weeks
for select
to authenticated
using (
  public.is_active_coach()
);
