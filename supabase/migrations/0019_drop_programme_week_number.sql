-- NWG Coaches Hub — Shared 9-week cycle extraction (phase 3 of 3, cleanup)
--
-- 0018 created cycle_weeks, backfilled it from the union of both programme
-- tables, and added a backfilled cycle_week_id FK to each — deliberately
-- leaving each table's own week_number column in place until the app layer
-- was confirmed reading week numbers through cycle_week_id → cycle_weeks.
--
-- That's now done and browser-verified (WeeklyFocusHero and the
-- /gymnastics/weekly-overview page both resolve week_number via cycle_weeks),
-- and a repo-wide grep confirms nothing reads week_number off either
-- programme table. These two columns are dead weight and a second, drifting
-- source of truth, so they go.
--
-- Note: programme_gymnastics_weeks' 2025-12-29 pre-cycle partial week already
-- had week_number is null (it was excluded from the 0018 backfill and so has
-- cycle_week_id null too) — dropping the column loses nothing for that row.
--
-- Drops only the two week_number columns. cycle_week_id, cycle_weeks, and
-- every content column (rotation, warm_up, skill_focus, category,
-- mini_theme) are untouched.

alter table public.programme_gymnastics_weeks
  drop column week_number;

alter table public.programme_preschool_weeks
  drop column week_number;
