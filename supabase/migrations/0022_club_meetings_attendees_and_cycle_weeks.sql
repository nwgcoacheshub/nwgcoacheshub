-- NWG Coaches Hub — Club Profile: Meetings schedule redesign (phase 5b, database only)
--
-- 0020 modelled meetings at per-cycle-week granularity: club_meeting_cycle_entries
-- (one row per meeting per cycle_weeks row, carrying a cancelled flag) and
-- club_meeting_cycle_attendees (attendees hung off each of those weekly entries).
-- Review of the phase 4c UI concluded that's more granularity than the feature
-- actually wants. The agreed shape instead is:
--
--   - Attendees belong to the MEETING, as one fixed list — not re-picked per week.
--   - A meeting either recurs every week, or is restricted to one or more specific
--     weeks of the 9-week cycle (e.g. only weeks 2 and 5).
--   - There is no per-occurrence cancellation at all.
--
-- So both 0020 tables are dropped outright and replaced by club_meeting_attendees
-- and club_meeting_cycle_weeks. Neither dropped table has ever held data — there
-- was no UI writing to them before phase 4c and phase 4c is not deployed — so this
-- is destructive in form only. Child before parent: club_meeting_cycle_attendees
-- FKs club_meeting_cycle_entries.
--
-- club_meeting_cycle_weeks stores a plain week number (1–9) rather than an FK to
-- cycle_weeks (0018): the restriction is a property of the repeating cycle, not of
-- any one dated instance of it, so it must not be re-stated every time the cycle
-- comes round again.
--
-- club_meetings itself is untouched — every column (site_id, category, title,
-- day_of_week, start_time, end_time, location, display_order, active), its
-- site_id index, its four RLS policies, and 0021's category check constraint all
-- stay exactly as they are.
--
-- RLS on both new tables reuses 0020's site-scoped shape verbatim:
--
--   select: is_active_coach() and (is_admin() or profiles.site = rota_sites.name)
--   insert/update/delete: is_active_coach() and can_edit_rota() and (is_admin() or site match)
--
-- — but one FK hop shorter than club_meeting_cycle_attendees had it, since both
-- new tables reference club_meetings directly rather than reaching it through
-- club_meeting_cycle_entries. That makes them structurally identical to 0020's
-- club_meeting_cycle_entries policies, which is the pattern copied below.
--
-- App-layer changes (lib/clubProfile/meetings.ts, ClubMeetingsAttendanceModal,
-- the [siteSlug] page) are phase 5c, not this migration.
--
-- No down migration, matching every migration so far (0001–0021).

-- ---------------------------------------------------------------------------
-- Drop the 0020 per-week tables (child first)
-- ---------------------------------------------------------------------------

drop table public.club_meeting_cycle_attendees;
drop table public.club_meeting_cycle_entries;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.club_meeting_attendees (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.club_meetings (id) on delete cascade,
  coach_id uuid not null references public.rota_coaches (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (meeting_id, coach_id)
);

comment on table public.club_meeting_attendees is
  'The fixed attendee list for a meeting. Attendance is a property of the meeting, not of any individual week — the same coaches are expected at every occurrence.';

-- meeting_id is the leading column of the unique constraint above, so it is
-- already covered; coach_id is not, and gets its own index — same reason
-- club_role_assignments.coach_id (0007) is indexed despite sitting in a
-- composite unique too.
create index on public.club_meeting_attendees (coach_id);

create table public.club_meeting_cycle_weeks (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.club_meetings (id) on delete cascade,
  cycle_week_number smallint not null check (cycle_week_number between 1 and 9),
  created_at timestamptz not null default now(),
  unique (meeting_id, cycle_week_number)
);

comment on table public.club_meeting_cycle_weeks is
  'Restricts a meeting to specific weeks of the shared 9-week cycle. ZERO rows for a given meeting_id means the meeting recurs EVERY week — the absence of a restriction is the restriction. One or more rows means the meeting occurs only in those cycle weeks. Stores the cycle week number directly rather than an FK to cycle_weeks, because the restriction repeats with the cycle rather than applying to one dated week.';

-- No index beyond the unique constraint: meeting_id is its leading column, and
-- cycle_week_number is not an FK, so nothing here needs the trailing-column
-- index that club_meeting_attendees.coach_id gets above.

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.club_meeting_attendees enable row level security;
alter table public.club_meeting_cycle_weeks enable row level security;

-- --- club_meeting_attendees --------------------------------------------------
-- No site_id of its own; reaches it by joining through club_meetings, the same
-- way rota_weekly_roster reaches its own through rota_weekly_rotas.

create policy "club_meeting_attendees_select_admin_or_own_site"
on public.club_meeting_attendees
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.is_admin()
    or exists (
      select 1 from public.club_meetings m
      join public.rota_sites s on s.id = m.site_id
      join public.profiles p on p.site = s.name
      where m.id = club_meeting_attendees.meeting_id and p.id = auth.uid()
    )
  )
);

create policy "club_meeting_attendees_insert_can_edit_own_site"
on public.club_meeting_attendees
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.club_meetings m
      join public.rota_sites s on s.id = m.site_id
      join public.profiles p on p.site = s.name
      where m.id = club_meeting_attendees.meeting_id and p.id = auth.uid()
    )
  )
);

create policy "club_meeting_attendees_update_can_edit_own_site"
on public.club_meeting_attendees
for update
to authenticated
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.club_meetings m
      join public.rota_sites s on s.id = m.site_id
      join public.profiles p on p.site = s.name
      where m.id = club_meeting_attendees.meeting_id and p.id = auth.uid()
    )
  )
)
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.club_meetings m
      join public.rota_sites s on s.id = m.site_id
      join public.profiles p on p.site = s.name
      where m.id = club_meeting_attendees.meeting_id and p.id = auth.uid()
    )
  )
);

create policy "club_meeting_attendees_delete_can_edit_own_site"
on public.club_meeting_attendees
for delete
to authenticated
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.club_meetings m
      join public.rota_sites s on s.id = m.site_id
      join public.profiles p on p.site = s.name
      where m.id = club_meeting_attendees.meeting_id and p.id = auth.uid()
    )
  )
);

-- --- club_meeting_cycle_weeks ------------------------------------------------
-- Same one-hop chain through club_meetings as club_meeting_attendees above.

create policy "club_meeting_cycle_weeks_select_admin_or_own_site"
on public.club_meeting_cycle_weeks
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.is_admin()
    or exists (
      select 1 from public.club_meetings m
      join public.rota_sites s on s.id = m.site_id
      join public.profiles p on p.site = s.name
      where m.id = club_meeting_cycle_weeks.meeting_id and p.id = auth.uid()
    )
  )
);

create policy "club_meeting_cycle_weeks_insert_can_edit_own_site"
on public.club_meeting_cycle_weeks
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.club_meetings m
      join public.rota_sites s on s.id = m.site_id
      join public.profiles p on p.site = s.name
      where m.id = club_meeting_cycle_weeks.meeting_id and p.id = auth.uid()
    )
  )
);

create policy "club_meeting_cycle_weeks_update_can_edit_own_site"
on public.club_meeting_cycle_weeks
for update
to authenticated
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.club_meetings m
      join public.rota_sites s on s.id = m.site_id
      join public.profiles p on p.site = s.name
      where m.id = club_meeting_cycle_weeks.meeting_id and p.id = auth.uid()
    )
  )
)
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.club_meetings m
      join public.rota_sites s on s.id = m.site_id
      join public.profiles p on p.site = s.name
      where m.id = club_meeting_cycle_weeks.meeting_id and p.id = auth.uid()
    )
  )
);

create policy "club_meeting_cycle_weeks_delete_can_edit_own_site"
on public.club_meeting_cycle_weeks
for delete
to authenticated
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.club_meetings m
      join public.rota_sites s on s.id = m.site_id
      join public.profiles p on p.site = s.name
      where m.id = club_meeting_cycle_weeks.meeting_id and p.id = auth.uid()
    )
  )
);
