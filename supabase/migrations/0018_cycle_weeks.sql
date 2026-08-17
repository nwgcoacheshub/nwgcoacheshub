-- NWG Coaches Hub — Shared 9-week cycle extraction (additive, phase 2 of 3)
--
-- programme_gymnastics_weeks and programme_preschool_weeks (0017) each carry
-- their own manually-seeded week_number column against week_commencing.
-- Investigation confirmed the two are actually one synchronized cycle — every
-- shared week_commencing has an identical week_number, with no drift — so
-- this extracts a single source of truth, cycle_weeks, that a later meetings
-- feature can also key off.
--
-- This migration is additive only:
--   - creates cycle_weeks and backfills it from the union of both tables
--   - adds a nullable cycle_week_id FK to both programme tables and backfills it
--   - does NOT drop or rename either table's existing week_number column —
--     that's phase 3, once the app layer (WeeklyFocusHero, weekly-overview
--     page) is confirmed reading from cycle_weeks instead.
--
-- RLS mirrors 0017/0015 exactly: content is managed by hand in the Table
-- Editor via the service role, which bypasses RLS, so this table gets only a
-- single select policy gated by is_active_coach() (0014) and no
-- insert/update/delete policy.

create table public.cycle_weeks (
  id uuid primary key default gen_random_uuid(),
  week_commencing date not null unique,
  week_number smallint not null check (week_number between 1 and 9),
  created_at timestamptz not null default now()
);

comment on table public.cycle_weeks is
  'Single source of truth for the repeating 9-week cycle shared by programme_gymnastics_weeks and programme_preschool_weeks (and, from a later phase, the meetings feature). Content managed directly in the Table Editor, same as the tables it was extracted from.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.cycle_weeks enable row level security;

create policy "cycle_weeks_select_authenticated"
on public.cycle_weeks
for select
to authenticated
using (
  public.is_active_coach()
);

-- ---------------------------------------------------------------------------
-- FK columns on the two existing programme tables
-- ---------------------------------------------------------------------------

alter table public.programme_gymnastics_weeks
  add column cycle_week_id uuid references public.cycle_weeks (id);

alter table public.programme_preschool_weeks
  add column cycle_week_id uuid references public.cycle_weeks (id);

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

-- Union (not union all) collapses the 51 shared week_commencing dates — which
-- investigation confirmed always carry identical week_number in both source
-- tables — down to one row each. Excludes the one row with week_number is
-- null (programme_gymnastics_weeks' 2025-12-29 pre-cycle partial week).
insert into public.cycle_weeks (week_commencing, week_number)
select week_commencing, week_number
from public.programme_gymnastics_weeks
where week_number is not null
union
select week_commencing, week_number
from public.programme_preschool_weeks
where week_number is not null;

update public.programme_gymnastics_weeks g
set cycle_week_id = c.id
from public.cycle_weeks c
where c.week_commencing = g.week_commencing;

update public.programme_preschool_weeks p
set cycle_week_id = c.id
from public.cycle_weeks c
where c.week_commencing = p.week_commencing;
