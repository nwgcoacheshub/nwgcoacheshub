-- NWG Coaches Hub — Competitions, phase 3a: Competition Calendar foundation
--
-- Adds the shared competition events table that every Competitions page writes
-- to and the Competition Calendar reads, plus the sites attending each event
-- and one new global capability. Follows
-- docs/investigations/competitions-phase1.md (sections 2, 3, 6, 7 and
-- "Recommendations for 0031/0032") and the approved Phase 2 calendar mockup
-- (reference/competition-calendar-mockup.html).
--
-- What this file does, in order:
--   1. Refuses to run if comp_events or comp_event_sites already exists, or if
--      the live capability matrix differs from the 9 capabilities in 0026.
--   2. Re-creates title_has_capability() (0026) and my_capabilities() (0027)
--      with create or replace, adding manage_comp_events (global) for Regional
--      General Manager, Head of Gymnastics and Head of Operations. The 9
--      existing branches and names are unchanged. Their grants are restated.
--      A second guard checks the new matrix before anything else is created.
--   3. Creates public.comp_events: one row per competition, with event_type
--      limited to the 4 calendar types.
--   4. Creates public.comp_event_sites: which rota_sites attend each event.
--   5. Enables RLS and adds 7 policies (4 on comp_events, 3 on
--      comp_event_sites).
--   6. Revokes both tables from public and anon, and grants select, insert,
--      update and delete to authenticated.
--
-- Access model:
--   * Every active coach reads every event and every event site. The calendar
--     is company-wide (the 0023/0025 read-all pattern).
--   * Any active coach may create an EXTERNAL event, as themselves
--     (created_by = auth.uid()): source = 'external' and event_type
--     'Invitational Competition' or 'Regional/National Competition'. They need
--     one to start an entry. manage_comp_events holders may create any source
--     and any event_type, also as themselves.
--   * Only manage_comp_events holders may edit or delete an event.
--   * Any active coach may attach or detach THEIR OWN site on an EXTERNAL
--     event (source = 'external'; the heroes own-site join, 0026).
--     manage_comp_events holders may attach or detach any site on any event,
--     so sites on NWG-run events ('club', 'nwg') are theirs alone. Rows are
--     insert/delete only; there is no update policy.
--   * All-site access comes from the job-title capability, never from
--     profiles.site = 'Head Office'.
--
-- What it deliberately does NOT do:
--   * Deadlines, fees, entries, gymnasts, staff, judges or an activity log.
--     Those are 0032 onward.
--   * An "all sites" flag. 'NWG All Competition' means every site attends; the
--     app derives that from event_type.
--   * Block duplicate competitions. The app warns on the same title and start
--     date; a non-unique index supports that lookup.
--   * An updated_at trigger. There is no updated_at trigger convention (0009,
--     0023, 0025): the column takes now() on insert and the writer sets it on
--     edit.
--   * Touch any existing table, policy or function other than the two
--     capability functions in step 2. No app code changes here apart from the
--     Capability union in lib/capabilities.ts; the calendar UI is Phase 3b.
--
-- Applied manually by Jamie as a single paste in the Supabase SQL Editor.
-- Verification: docs/investigations/comp-calendar-0031-verification.sql
-- (Paste A before, Paste B after). Wrapped in an explicit transaction for the
-- reasons 0026 gives: all or nothing. No down migration, matching 0001-0030.

begin;

-- ---------------------------------------------------------------------------
-- 1. Guards
-- ---------------------------------------------------------------------------
--
-- 1a. Neither table may exist yet. The file creates both without IF NOT
--     EXISTS, so a re-run would fail anyway; this fails first, with a clear
--     message.
--
-- 1b. create or replace overwrites title_has_capability() wholesale. If the
--     live function has drifted from 0026 (a branch changed or added outside
--     the migrations), step 2 would silently undo that change. Compare every
--     (title, capability) pair for the 6 titles and 9 capabilities against the
--     0026 matrix, and confirm manage_comp_events is unknown today.

do $$
begin
  if to_regclass('public.comp_events') is not null
     or to_regclass('public.comp_event_sites') is not null then
    raise exception
      '0031 aborted: public.comp_events or public.comp_event_sites already exists. Nothing has been applied.';
  end if;
end
$$;

do $$
declare
  v_diff text;
begin
  with
  titles (job_title) as (
    values ('Coach'), ('Lead Coach'), ('Club Head Coach'),
           ('Regional General Manager'), ('Head of Gymnastics'), ('Head of Operations')
  ),
  caps (cap) as (
    values ('view_all_sites'), ('all_sites_scope'), ('publish_whats_new'),
           ('manage_policies'), ('manage_users'), ('edit_rota'),
           ('manage_club_meetings'), ('manage_club_updates'), ('manage_club_roles'),
           ('manage_comp_events')
  ),
  expected (cap, job_title) as (
    select c.cap, t.job_title
    from (values ('view_all_sites'), ('all_sites_scope'), ('publish_whats_new'),
                 ('manage_policies'), ('manage_users')) c (cap)
    cross join (values ('Regional General Manager'), ('Head of Gymnastics'),
                       ('Head of Operations')) t (job_title)
    union all
    select c.cap, t.job_title
    from (values ('edit_rota'), ('manage_club_meetings'), ('manage_club_updates')) c (cap)
    cross join (values ('Lead Coach'), ('Club Head Coach'), ('Regional General Manager'),
                       ('Head of Gymnastics'), ('Head of Operations')) t (job_title)
    union all
    select 'manage_club_roles', t.job_title
    from (values ('Club Head Coach'), ('Regional General Manager'),
                 ('Head of Gymnastics'), ('Head of Operations')) t (job_title)
  ),
  actual (cap, job_title) as (
    select c.cap, t.job_title
    from caps c cross join titles t
    where public.title_has_capability(t.job_title, c.cap)
  ),
  diff as (
    (select 'unexpected ' || cap || ' -> ' || job_title as d from actual
     except select 'unexpected ' || cap || ' -> ' || job_title from expected)
    union all
    (select 'missing ' || cap || ' -> ' || job_title from expected
     except select 'missing ' || cap || ' -> ' || job_title from actual)
  )
  select string_agg(d, '; ' order by d) into v_diff from diff;

  if v_diff is not null then
    raise exception
      '0031 aborted: the live title_has_capability() differs from 0026 (%). Re-creating it would overwrite that. Nothing has been applied.',
      v_diff;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Capability: manage_comp_events (global)
-- ---------------------------------------------------------------------------
--
-- Held by Regional General Manager, Head of Gymnastics and Head of Operations:
-- the three titles that already hold every other global capability. It gates
-- editing and deleting events, and attaching or detaching any site.
--
-- Per CLAUDE.md, a new capability's name goes in three places in the same
-- change: title_has_capability() (the matrix, its only copy), the name array
-- in my_capabilities(), and the Capability union in lib/capabilities.ts.
--
-- Both functions keep their 0026/0027 signature, language, security,
-- volatility and search_path. The 9 existing branches and names are copied
-- unchanged; the new one is appended after manage_club_roles.
--
-- create or replace keeps a function's existing ACL, so the grants below are
-- restatements, not changes: title_has_capability() stays internal (revoked
-- from public, anon and authenticated; explicit service_role grant from 0027),
-- and my_capabilities() stays callable by authenticated only.

create or replace function public.title_has_capability(p_job_title text, p_cap text)
returns boolean
language sql
security invoker
immutable
set search_path = ''
as $$
  select coalesce(
    case p_cap
      when 'view_all_sites' then p_job_title in (
        'Regional General Manager', 'Head of Gymnastics', 'Head of Operations')
      when 'all_sites_scope' then p_job_title in (
        'Regional General Manager', 'Head of Gymnastics', 'Head of Operations')
      when 'publish_whats_new' then p_job_title in (
        'Regional General Manager', 'Head of Gymnastics', 'Head of Operations')
      when 'manage_policies' then p_job_title in (
        'Regional General Manager', 'Head of Gymnastics', 'Head of Operations')
      when 'manage_users' then p_job_title in (
        'Regional General Manager', 'Head of Gymnastics', 'Head of Operations')
      when 'edit_rota' then p_job_title in (
        'Lead Coach', 'Club Head Coach',
        'Regional General Manager', 'Head of Gymnastics', 'Head of Operations')
      when 'manage_club_meetings' then p_job_title in (
        'Lead Coach', 'Club Head Coach',
        'Regional General Manager', 'Head of Gymnastics', 'Head of Operations')
      when 'manage_club_updates' then p_job_title in (
        'Lead Coach', 'Club Head Coach',
        'Regional General Manager', 'Head of Gymnastics', 'Head of Operations')
      when 'manage_club_roles' then p_job_title in (
        'Club Head Coach',
        'Regional General Manager', 'Head of Gymnastics', 'Head of Operations')
      when 'manage_comp_events' then p_job_title in (
        'Regional General Manager', 'Head of Gymnastics', 'Head of Operations')
      else false
    end,
    false
  );
$$;

revoke execute on function public.title_has_capability(text, text) from public;
revoke execute on function public.title_has_capability(text, text) from anon;
revoke execute on function public.title_has_capability(text, text) from authenticated;
grant execute on function public.title_has_capability(text, text) to service_role;

create or replace function public.my_capabilities()
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
        'manage_club_roles',
        'manage_comp_events'
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

-- Post-check: manage_comp_events now resolves for exactly the 3 titles, and
-- nothing else moved. Same comparison as guard 1b.

do $$
declare
  v_diff text;
begin
  with
  titles (job_title) as (
    values ('Coach'), ('Lead Coach'), ('Club Head Coach'),
           ('Regional General Manager'), ('Head of Gymnastics'), ('Head of Operations')
  ),
  caps (cap) as (
    values ('view_all_sites'), ('all_sites_scope'), ('publish_whats_new'),
           ('manage_policies'), ('manage_users'), ('edit_rota'),
           ('manage_club_meetings'), ('manage_club_updates'), ('manage_club_roles'),
           ('manage_comp_events')
  ),
  expected (cap, job_title) as (
    select c.cap, t.job_title
    from (values ('view_all_sites'), ('all_sites_scope'), ('publish_whats_new'),
                 ('manage_policies'), ('manage_users'), ('manage_comp_events')) c (cap)
    cross join (values ('Regional General Manager'), ('Head of Gymnastics'),
                       ('Head of Operations')) t (job_title)
    union all
    select c.cap, t.job_title
    from (values ('edit_rota'), ('manage_club_meetings'), ('manage_club_updates')) c (cap)
    cross join (values ('Lead Coach'), ('Club Head Coach'), ('Regional General Manager'),
                       ('Head of Gymnastics'), ('Head of Operations')) t (job_title)
    union all
    select 'manage_club_roles', t.job_title
    from (values ('Club Head Coach'), ('Regional General Manager'),
                 ('Head of Gymnastics'), ('Head of Operations')) t (job_title)
  ),
  actual (cap, job_title) as (
    select c.cap, t.job_title
    from caps c cross join titles t
    where public.title_has_capability(t.job_title, c.cap)
  ),
  diff as (
    (select 'unexpected ' || cap || ' -> ' || job_title as d from actual
     except select 'unexpected ' || cap || ' -> ' || job_title from expected)
    union all
    (select 'missing ' || cap || ' -> ' || job_title from expected
     except select 'missing ' || cap || ' -> ' || job_title from actual)
  )
  select string_agg(d, '; ' order by d) into v_diff from diff;

  if v_diff is not null then
    raise exception
      '0031 aborted: the re-created title_has_capability() is not the expected matrix (%). Nothing has been applied.',
      v_diff;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. comp_events
-- ---------------------------------------------------------------------------
--
-- One row per competition, whichever Competitions page created it. source
-- records which page that was ('external' = External Competition Entries;
-- 'club' and 'nwg' are the future Club / NWG Competitions pages).
--
-- Dates are date, not timestamptz, to match week_start_date and the
-- "YYYY-MM-DD" helpers in lib/rota/week.ts.
--
-- created_by: nullable, on delete set null, matching whats_new (0025) and
-- club_updates (0009): an event outlives its author's profile. It defaults to
-- auth.uid(), and the insert policy requires it to equal auth.uid().
--
-- source also drives permissions (section 5): a coach without
-- manage_comp_events may only create 'external' events, and may only attach
-- or detach their own site on 'external' events.
--
-- No unique constraint on (title, start_date): duplicates are warned about in
-- the app, not blocked. comp_events_title_start_date_idx supports that lookup.

create table public.comp_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_type text not null,
  start_date date not null,
  end_date date not null,
  venue text,
  organiser text,
  link text,
  notes text,
  source text not null default 'external',
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint comp_events_title_check
    check (length(btrim(title)) between 1 and 200),
  constraint comp_events_event_type_check
    check (event_type in (
      'NWG All Competition',
      'NWG Club Competition',
      'Invitational Competition',
      'Regional/National Competition'
    )),
  constraint comp_events_dates_check
    check (end_date >= start_date),
  constraint comp_events_source_check
    check (source in ('external', 'club', 'nwg'))
);

comment on table public.comp_events is
  'Every competition across all sites, shared by all Competitions pages and read by the Competition Calendar. Every active coach reads every row; edits and deletes need manage_comp_events.';

create index comp_events_start_date_idx
  on public.comp_events (start_date);

create index comp_events_title_start_date_idx
  on public.comp_events (lower(title), start_date);

-- Every FK column gets its own single-column index, the convention 0007 set
-- and 0020/0022/0023/0025 followed.
create index comp_events_created_by_idx
  on public.comp_events (created_by);

-- ---------------------------------------------------------------------------
-- 4. comp_event_sites
-- ---------------------------------------------------------------------------
--
-- Which sites attend an event. site_id references rota_sites, the de facto
-- sites table (competitions-phase1.md §15.8). Head Office has no rota_sites
-- row, so it can never be attached.
--
-- event_id cascades: deleting an event removes its site rows. site_id
-- restricts: a site with events cannot be deleted. event_id is covered by the
-- primary key; site_id gets its own index.

create table public.comp_event_sites (
  event_id uuid not null references public.comp_events (id) on delete cascade,
  site_id uuid not null references public.rota_sites (id) on delete restrict,
  primary key (event_id, site_id)
);

comment on table public.comp_event_sites is
  'Sites attending each comp_events row. Insert/delete only. Any active coach may attach or detach their own site on an external event; manage_comp_events holders may attach or detach any site on any event.';

create index comp_event_sites_site_id_idx
  on public.comp_event_sites (site_id);

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
--
-- is_active_coach() is the outer conjunct everywhere, so a deactivated account
-- with a still-valid JWT reads and writes nothing.

alter table public.comp_events enable row level security;
alter table public.comp_event_sites enable row level security;

-- --- comp_events ----------------------------------------------------------

create policy "comp_events_select_authenticated"
on public.comp_events
for select
to authenticated
using (
  public.is_active_coach()
);

-- Insert: always as yourself. Without manage_comp_events, only an external
-- event of an external type: an 'NWG All Competition' or 'NWG Club
-- Competition' shows on other sites' calendars, so only manage_comp_events
-- holders create those (and any 'club' or 'nwg' source row).

create policy "comp_events_insert_external_or_manage_comp_events"
on public.comp_events
for insert
to authenticated
with check (
  public.is_active_coach()
  and created_by = auth.uid()
  and (
    public.has_capability('manage_comp_events')
    or (source = 'external'
        and event_type in ('Invitational Competition', 'Regional/National Competition'))
  )
);

create policy "comp_events_update_manage_comp_events"
on public.comp_events
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_capability('manage_comp_events')
)
with check (
  public.is_active_coach()
  and public.has_capability('manage_comp_events')
);

create policy "comp_events_delete_manage_comp_events"
on public.comp_events
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_capability('manage_comp_events')
);

-- --- comp_event_sites -----------------------------------------------------
--
-- Insert and delete use the same rule: manage_comp_events holders may attach
-- or detach any site on any event. Anyone else needs both:
--   * the event is external (comp_events.source = 'external'). Sites on
--     NWG-run events ('club', 'nwg') are managed by manage_comp_events
--     holders only.
--   * the site is their own: the heroes join (0026), where the caller's
--     profiles.site name-matches the rota_sites row.
-- This applies to any external event, not only events the caller created.
-- The comp_events lookup runs under comp_events RLS, which every active coach
-- passes (comp_events_select_authenticated).
--
-- No update policy: change a site by deleting one row and inserting another.

create policy "comp_event_sites_select_authenticated"
on public.comp_event_sites
for select
to authenticated
using (
  public.is_active_coach()
);

create policy "comp_event_sites_insert_own_site_external_or_manage_comp_events"
on public.comp_event_sites
for insert
to authenticated
with check (
  public.is_active_coach()
  and (
    public.has_capability('manage_comp_events')
    or (
      exists (
        select 1 from public.comp_events e
        where e.id = comp_event_sites.event_id and e.source = 'external'
      )
      and exists (
        select 1 from public.rota_sites s
        join public.profiles p on p.site = s.name
        where s.id = comp_event_sites.site_id and p.id = auth.uid()
      )
    )
  )
);

create policy "comp_event_sites_delete_own_site_external_or_manage_comp_events"
on public.comp_event_sites
for delete
to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('manage_comp_events')
    or (
      exists (
        select 1 from public.comp_events e
        where e.id = comp_event_sites.event_id and e.source = 'external'
      )
      and exists (
        select 1 from public.rota_sites s
        join public.profiles p on p.site = s.name
        where s.id = comp_event_sites.site_id and p.id = auth.uid()
      )
    )
  )
);

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------
--
-- The table form of the 0012 rule, as 0023 and 0025 restate it. Since 0028,
-- tables created by postgres no longer default to anon, so the anon revoke is
-- a restatement; it is kept so the grant state is declared here. An anon
-- request is refused with 42501 before RLS is consulted. service_role's
-- default grant is untouched.

revoke all on table public.comp_events from public;
revoke all on table public.comp_events from anon;
grant select, insert, update, delete on table public.comp_events to authenticated;

revoke all on table public.comp_event_sites from public;
revoke all on table public.comp_event_sites from anon;
grant select, insert, update, delete on table public.comp_event_sites to authenticated;

commit;
