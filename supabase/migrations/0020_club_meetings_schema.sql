-- NWG Coaches Hub — Club Profile: Meetings schedule (phase 4b, database only)
--
-- Adds a per-site meetings schedule to Club Profile: club_meetings holds each
-- site's fixed meeting definitions (what/when/where), club_meeting_cycle_entries
-- tracks whether a given meeting ran or was cancelled for a given week of the
-- shared 9-week cycle (cycle_weeks, 0018), and club_meeting_cycle_attendees
-- links each of those weeks to the rota_coaches who attended. Attendance is
-- edited via a single modal covering all 9 cycle weeks for one meeting at once
-- — not week-to-week — which is why cycle attendance keys off cycle_week_id
-- rather than a live calendar date.
--
-- Unlike 0015/0017/0018's reference tables, this content is edited through the
-- app (Lead Coach or higher, same as can_edit_rota()), not the Table Editor —
-- so, following 0016's lead, these three tables are created straight into the
-- CURRENT (post-0013/0014) site-scoped RLS shape rather than starting from
-- 0002's single `for all` policy and replaying history:
--
--   select: is_active_coach() and (is_admin() or profiles.site = rota_sites.name)
--   insert/update/delete: is_active_coach() and can_edit_rota() and (is_admin() or site match)
--
-- club_meetings carries site_id directly, matching rota_coaches/heroes/
-- club_updates. club_meeting_cycle_entries reaches its site by joining through
-- club_meetings, the same way rota_weekly_roster reaches its own through
-- rota_weekly_rotas. club_meeting_cycle_attendees is one join further still —
-- through club_meeting_cycle_entries then club_meetings — the same chained
-- pattern rota_restructure_roster/rota_restructure_classes use to reach
-- rota_sites through rota_restructures.
--
-- Modeled on: 0016_restructure_schema.sql (table shape + RLS split — the most
-- direct precedent for "create new site-scoped tables straight into the final
-- policy shape"), 0014_deactivated_accounts_and_site_name_unique.sql (origin
-- of is_active_coach() and the exact predicate text), 0013_rota_edit_rights_by_job_title.sql
-- (origin of can_edit_rota() and its role list), 0007_club_profile_schema.sql
-- (FK indexing convention — every FK column gets its own single-column index,
-- including one that already sits in a composite unique constraint but not as
-- its leading column, e.g. club_role_assignments.coach_id), and
-- 0018_cycle_weeks.sql (the cycle_weeks table this keys off).
--
-- Additive only — no existing table is touched. No seed data: sites add their
-- own meetings through the UI once phase 4c ships. No down migration, matching
-- every migration so far (0001–0019).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.club_meetings (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.rota_sites (id) on delete cascade,
  category text not null,
  title text not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  location text,
  display_order smallint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.club_meetings (site_id);

create table public.club_meeting_cycle_entries (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.club_meetings (id) on delete cascade,
  cycle_week_id uuid not null references public.cycle_weeks (id) on delete cascade,
  cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (meeting_id, cycle_week_id)
);
-- meeting_id is covered by the unique constraint above (it's the leading
-- column); cycle_week_id is not, and the Monthly view will need to look entries
-- up by cycle_week_id across meetings, so it gets its own index — same reason
-- club_role_assignments.coach_id (0007) is indexed despite sitting in a
-- composite unique too.
create index on public.club_meeting_cycle_entries (cycle_week_id);

create table public.club_meeting_cycle_attendees (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.club_meeting_cycle_entries (id) on delete cascade,
  coach_id uuid not null references public.rota_coaches (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (entry_id, coach_id)
);
create index on public.club_meeting_cycle_attendees (coach_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.club_meetings enable row level security;
alter table public.club_meeting_cycle_entries enable row level security;
alter table public.club_meeting_cycle_attendees enable row level security;

-- --- club_meetings -----------------------------------------------------------

create policy "club_meetings_select_admin_or_own_site"
on public.club_meetings
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = club_meetings.site_id and p.id = auth.uid()
    )
  )
);

create policy "club_meetings_insert_can_edit_own_site"
on public.club_meetings
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = club_meetings.site_id and p.id = auth.uid()
    )
  )
);

create policy "club_meetings_update_can_edit_own_site"
on public.club_meetings
for update
to authenticated
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = club_meetings.site_id and p.id = auth.uid()
    )
  )
)
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = club_meetings.site_id and p.id = auth.uid()
    )
  )
);

create policy "club_meetings_delete_can_edit_own_site"
on public.club_meetings
for delete
to authenticated
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = club_meetings.site_id and p.id = auth.uid()
    )
  )
);

-- --- club_meeting_cycle_entries ----------------------------------------------
-- No site_id of its own; reaches it by joining through club_meetings, the same
-- way rota_weekly_roster reaches its own through rota_weekly_rotas.

create policy "club_meeting_cycle_entries_select_admin_or_own_site"
on public.club_meeting_cycle_entries
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
      where m.id = club_meeting_cycle_entries.meeting_id and p.id = auth.uid()
    )
  )
);

create policy "club_meeting_cycle_entries_insert_can_edit_own_site"
on public.club_meeting_cycle_entries
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
      where m.id = club_meeting_cycle_entries.meeting_id and p.id = auth.uid()
    )
  )
);

create policy "club_meeting_cycle_entries_update_can_edit_own_site"
on public.club_meeting_cycle_entries
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
      where m.id = club_meeting_cycle_entries.meeting_id and p.id = auth.uid()
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
      where m.id = club_meeting_cycle_entries.meeting_id and p.id = auth.uid()
    )
  )
);

create policy "club_meeting_cycle_entries_delete_can_edit_own_site"
on public.club_meeting_cycle_entries
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
      where m.id = club_meeting_cycle_entries.meeting_id and p.id = auth.uid()
    )
  )
);

-- --- club_meeting_cycle_attendees ----------------------------------------------
-- One join further than club_meeting_cycle_entries: reaches its site through
-- club_meeting_cycle_entries -> club_meetings, the same chained shape
-- rota_restructure_roster/rota_restructure_classes use through
-- rota_restructures -> rota_sites.

create policy "club_meeting_cycle_attendees_select_admin_or_own_site"
on public.club_meeting_cycle_attendees
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.is_admin()
    or exists (
      select 1 from public.club_meeting_cycle_entries e
      join public.club_meetings m on m.id = e.meeting_id
      join public.rota_sites s on s.id = m.site_id
      join public.profiles p on p.site = s.name
      where e.id = club_meeting_cycle_attendees.entry_id and p.id = auth.uid()
    )
  )
);

create policy "club_meeting_cycle_attendees_insert_can_edit_own_site"
on public.club_meeting_cycle_attendees
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.club_meeting_cycle_entries e
      join public.club_meetings m on m.id = e.meeting_id
      join public.rota_sites s on s.id = m.site_id
      join public.profiles p on p.site = s.name
      where e.id = club_meeting_cycle_attendees.entry_id and p.id = auth.uid()
    )
  )
);

create policy "club_meeting_cycle_attendees_update_can_edit_own_site"
on public.club_meeting_cycle_attendees
for update
to authenticated
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.club_meeting_cycle_entries e
      join public.club_meetings m on m.id = e.meeting_id
      join public.rota_sites s on s.id = m.site_id
      join public.profiles p on p.site = s.name
      where e.id = club_meeting_cycle_attendees.entry_id and p.id = auth.uid()
    )
  )
)
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.club_meeting_cycle_entries e
      join public.club_meetings m on m.id = e.meeting_id
      join public.rota_sites s on s.id = m.site_id
      join public.profiles p on p.site = s.name
      where e.id = club_meeting_cycle_attendees.entry_id and p.id = auth.uid()
    )
  )
);

create policy "club_meeting_cycle_attendees_delete_can_edit_own_site"
on public.club_meeting_cycle_attendees
for delete
to authenticated
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.club_meeting_cycle_entries e
      join public.club_meetings m on m.id = e.meeting_id
      join public.rota_sites s on s.id = m.site_id
      join public.profiles p on p.site = s.name
      where e.id = club_meeting_cycle_attendees.entry_id and p.id = auth.uid()
    )
  )
);
