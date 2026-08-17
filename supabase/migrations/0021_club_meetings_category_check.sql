-- NWG Coaches Hub — Club Profile: Meetings schedule, category check constraint
--
-- club_meetings.category was created as free text in 0020_club_meetings_schema.sql.
-- Decision made before either migration is applied: lock it to a fixed list,
-- the same way profiles.role/job_title/site are constrained in 0001_init.sql.
-- Written as a separate migration rather than editing 0020 — migration files
-- are never edited after the fact in this project, even ones not yet applied.
--
-- If 0020 has already been applied by the time this runs, the constraint add
-- would fail on any existing row whose category isn't one of the four values
-- below — but club_meetings is a brand-new table with no UI to write to it yet
-- (phase 4c), so no such row should exist.

alter table public.club_meetings
  add constraint club_meetings_category_check
  check (category in (
    '1:1s with CHC',
    '1:1s with RGM',
    'Department Meetings',
    'Other'
  ));
