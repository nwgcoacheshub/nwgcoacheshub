-- NWG Coaches Hub — Competitions, phase 3c: External Competition Entries schema
--
-- Adds the tables behind External Competition Entries: one club entry per
-- (external event, site), its fee levels and extras, its gymnasts (the only
-- place child data is stored) and the staff going. Also adds four
-- capabilities and a company-wide staff picker. Follows
-- docs/investigations/competitions-phase1.md (sections 2-7, 15 and
-- "Recommendations for 0031/0032"), the approved Phase 3c Step A design and
-- the External Entry mockup (reference/external-entry-mockup.html).
--
-- What this file does, in order:
--   1. Refuses to run if any of the 7 tables or comp_staff_candidates()
--      already exists, if comp_events / comp_event_sites are missing, if the
--      server is older than Postgres 15 (step 7 uses ON DELETE SET NULL with a
--      column list), or if the live capability matrix differs from the 10
--      capabilities in 0031.
--   2. Re-creates title_has_capability() (0026/0031) and my_capabilities()
--      (0027/0031) with create or replace, adding 4 capabilities:
--        edit_comp_entries      site-scoped  all 6 titles, Coach included
--        sign_off_competitions  global       Head of Gymnastics
--        approve_judges         global       Regional General Manager,
--                                            Head of Gymnastics
--        confirm_comp_pricing   site-scoped  Club Head Coach,
--                                            Head of Gymnastics
--      The 10 existing branches and names are unchanged. Grants are restated.
--      A second guard checks the full 14-capability matrix.
--   3. Creates comp_external_details: shared deadlines, one row per external
--      event.
--   4. Creates comp_entries: one row per (event, site).
--   5. Creates comp_entry_fee_levels and comp_entry_extras.
--   6. Creates comp_entry_gymnasts (name + DOB: the only child data in the
--      Hub) and comp_entry_gymnast_extras.
--   7. Creates comp_entry_staff (coaches and judges).
--   8. Enables RLS on all 7 tables and adds 27 policies.
--   9. Revokes all 7 tables from public and anon; grants select, insert,
--      update and delete to authenticated.
--  10. Adds comp_staff_candidates(): id, full_name and site of every active
--      profile, for the coach and judge pickers.
--
-- Access model:
--   * Read an entry and everything under it (gymnasts included): your own
--     site, or view_all_sites.
--   * Write an entry and everything under it: edit_comp_entries at the
--     entry's site (has_site_capability: own site, or every site with
--     all_sites_scope). An entry is inserted as yourself, in status 'draft',
--     with every gated column empty, for an external event whose site is
--     already attached in comp_event_sites. It is deleted only while 'draft'.
--     Ordinary updates (notes, judges_required, uplift_pct ...) are allowed
--     at any status.
--   * comp_external_details: every active coach reads; edit_comp_entries
--     holders insert and update for external events; manage_comp_events
--     deletes.
--   * All-site access comes from the job-title capability, never from
--     profiles.site = 'Head Office'.
--
-- GATED COLUMNS — DIRECTLY WRITABLE UNTIL 0033 IS APPLIED.
-- The insert policies force them empty, but until 0033 an edit_comp_entries
-- holder can update them on their own site's rows with a hand-made request.
-- No app code uses these tables before 0034. 0033 will guard, through definer
-- RPCs plus an invoker guard trigger:
--   comp_entries:
--     status, late_notice_acknowledged,
--     signoff_requested_by/_at, signed_off_by/_at, declined_by/_at,
--     decline_note, pricing_confirmed_by/_at, po_requested_by/_at, po_number,
--     po_received_by/_at, entered_by/_at, organiser_paid_by/_at,
--     completed_by/_at, data_removed_by/_at,
--     and event_id, site_id, created_by (fixed after insert)
--   comp_entry_staff:
--     judge_approved_by/_at (and reset them if profile_id or staff_role
--     changes)
--   0033 also decides whether a fee, extra or uplift_pct change after price
--   confirmation clears that confirmation, and checks that every gymnast has
--   a fee level before sign-off is requested.
--
-- 0034 will:
--   * add comp_activity_log and its triggers. Who/when for every action
--     comes from that log; the who/when pairs here are only the ones the UI
--     needs directly.
--   * keep comp_entry_gymnasts.full_name, dob, notes and withdrawn_note out of
--     the log entirely (names are looked up live).
--   * add the manual data-removal action: it blanks full_name, dob, notes and
--     withdrawn_note on the entry's gymnasts, keeps the payment columns, and
--     sets comp_entries.data_removed_by/_at.
--
-- What it deliberately does NOT do:
--   * Status-transition RPCs or the guard trigger (0033), the activity log or
--     data removal (0034).
--   * Store "Ready for PO". The app derives it: status 'collecting' and every
--     non-withdrawn gymnast has debt_added, paid and marked_paid_bars.
--   * Store parent prices. The app computes organiser_fee * (1 + uplift_pct /
--     100) plus extras (extras are not uplifted).
--   * Parent contact data, gymnast profiles, or any reuse of gymnasts across
--     entries (the CLAUDE.md carve-out).
--   * An updated_at trigger (no such convention: 0009, 0023, 0025, 0031).
--   * Touch any existing table, policy or function other than the two
--     capability functions in step 2. No app code changes here apart from the
--     Capability union in lib/capabilities.ts.
--
-- Applied manually by Jamie as a single paste in the Supabase SQL Editor.
-- Verification: docs/investigations/comp-entries-0032-verification.sql
-- (Paste A before, Paste B after). Wrapped in an explicit transaction for the
-- reasons 0026 gives: all or nothing. No down migration, matching 0001-0031.

begin;

-- ---------------------------------------------------------------------------
-- 1. Guards
-- ---------------------------------------------------------------------------
--
-- 1a. None of the new objects may exist yet, and the 0031 tables they
--     reference must.
-- 1b. ON DELETE SET NULL (column list), used by comp_entry_gymnasts, needs
--     Postgres 15.
-- 1c. create or replace overwrites title_has_capability() wholesale. Compare
--     every (title, capability) pair for the 6 titles and 14 capability names
--     against the 0031 matrix (37 pairs), so drift fails here and the 4 new
--     names must resolve to no title today.

do $$
begin
  if to_regclass('public.comp_external_details') is not null
     or to_regclass('public.comp_entries') is not null
     or to_regclass('public.comp_entry_fee_levels') is not null
     or to_regclass('public.comp_entry_extras') is not null
     or to_regclass('public.comp_entry_gymnasts') is not null
     or to_regclass('public.comp_entry_gymnast_extras') is not null
     or to_regclass('public.comp_entry_staff') is not null then
    raise exception
      '0032 aborted: one of the comp entry tables already exists. Nothing has been applied.';
  end if;

  if to_regprocedure('public.comp_staff_candidates()') is not null then
    raise exception
      '0032 aborted: public.comp_staff_candidates() already exists. Nothing has been applied.';
  end if;

  if to_regclass('public.comp_events') is null
     or to_regclass('public.comp_event_sites') is null then
    raise exception
      '0032 aborted: public.comp_events or public.comp_event_sites is missing. Apply 0031 first. Nothing has been applied.';
  end if;

  if current_setting('server_version_num')::int < 150000 then
    raise exception
      '0032 aborted: Postgres 15 or later is required (server_version_num %). Nothing has been applied.',
      current_setting('server_version_num');
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
           ('manage_comp_events'),
           ('edit_comp_entries'), ('sign_off_competitions'), ('approve_judges'),
           ('confirm_comp_pricing')
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
      '0032 aborted: the live title_has_capability() differs from 0031 (%). Re-creating it would overwrite that. Nothing has been applied.',
      v_diff;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Capabilities
-- ---------------------------------------------------------------------------
--
--   edit_comp_entries (site-scoped): all 6 titles. The first capability Coach
--     holds. Create and edit entries, gymnasts, fees, extras and staff at
--     your own site; all_sites_scope holders (RGM, HOG, HOO) at every site.
--   sign_off_competitions (global): Head of Gymnastics. Used by 0033.
--   approve_judges (global): Regional General Manager, Head of Gymnastics.
--     Used by 0033.
--   confirm_comp_pricing (site-scoped): Club Head Coach, Head of Gymnastics.
--     Through has_site_capability(): CHC at their own site, HOG at every site
--     (HOG holds all_sites_scope). RGM and HOO hold all_sites_scope but not
--     this capability, so they never get it. Intended. Used by 0033.
--
-- Same three places as 0031: title_has_capability() (the matrix, its only
-- copy), the name array in my_capabilities(), and the Capability union in
-- lib/capabilities.ts. Both functions keep their signature, language,
-- security, volatility and search_path. The 10 existing branches and names
-- are copied unchanged; the new ones are appended after manage_comp_events.
-- Titles are listed explicitly, never as "every title", for the reason 0013
-- gives: an explicit list fails closed when a new title is added.

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
      when 'edit_comp_entries' then p_job_title in (
        'Coach', 'Lead Coach', 'Club Head Coach',
        'Regional General Manager', 'Head of Gymnastics', 'Head of Operations')
      when 'sign_off_competitions' then p_job_title in (
        'Head of Gymnastics')
      when 'approve_judges' then p_job_title in (
        'Regional General Manager', 'Head of Gymnastics')
      when 'confirm_comp_pricing' then p_job_title in (
        'Club Head Coach', 'Head of Gymnastics')
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
        'manage_comp_events',
        'edit_comp_entries',
        'sign_off_competitions',
        'approve_judges',
        'confirm_comp_pricing'
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

-- Post-check: the 4 new capabilities resolve to exactly their titles (11
-- pairs) and nothing else moved (48 pairs in total). Same comparison as 1c.

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
           ('manage_comp_events'),
           ('edit_comp_entries'), ('sign_off_competitions'), ('approve_judges'),
           ('confirm_comp_pricing')
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
    union all
    select 'edit_comp_entries', t.job_title
    from titles t
    union all
    select 'sign_off_competitions', 'Head of Gymnastics'
    union all
    select 'approve_judges', t.job_title
    from (values ('Regional General Manager'), ('Head of Gymnastics')) t (job_title)
    union all
    select 'confirm_comp_pricing', t.job_title
    from (values ('Club Head Coach'), ('Head of Gymnastics')) t (job_title)
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
      '0032 aborted: the re-created title_has_capability() is not the expected matrix (%). Nothing has been applied.',
      v_diff;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. comp_external_details
-- ---------------------------------------------------------------------------
--
-- Deadlines every club shares for one external event. The event is the key:
-- at most one row per event. "External only" is enforced in RLS (section 8),
-- as 0031 does for comp_event_sites; a composite FK would need a new unique
-- constraint on comp_events.
--
-- event_id cascades: the details go with their event. An event with entries
-- cannot be deleted anyway (comp_entries, section 4).

create table public.comp_external_details (
  event_id uuid primary key references public.comp_events (id) on delete cascade,
  entry_deadline date,
  organiser_payment_deadline date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.comp_external_details is
  'Competition-level deadlines for an external comp_events row, shared by every club. Every active coach reads; edit_comp_entries holders insert and update; manage_comp_events deletes.';

-- ---------------------------------------------------------------------------
-- 4. comp_entries
-- ---------------------------------------------------------------------------
--
-- One club's entry to one external event. site_id references rota_sites, so
-- Head Office can never have an entry.
--
-- Deleting an event that has entries is blocked twice:
--   * event_id -> comp_events on delete restrict.
--   * (event_id, site_id) -> comp_event_sites on delete restrict. An entry
--     needs its site attached to the event, so the calendar and the entries
--     cannot disagree. Deleting the event cascades to comp_event_sites
--     (0031), which this FK refuses; detaching the site is refused too.
--
-- Who/when pairs: *_by references profiles on delete set null (the
-- authorship rule, as created_by in 0031). The pair check is one-directional,
-- "by is null or at is not null", because set null on a profile delete must
-- not break it.
--
-- late_notice_acknowledged: set by the 0033 sign-off RPC when HOG accepts a
-- PO request under 4 weeks before the entry deadline.
--
-- Note checks use coalesce: btrim(null) <> '' is null, and a null CHECK
-- passes.

create table public.comp_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.comp_events (id) on delete restrict,
  site_id uuid not null references public.rota_sites (id) on delete restrict,
  status text not null default 'draft',
  uplift_pct numeric(5, 2) not null default 20,
  judges_required smallint not null default 0,
  notes text,

  signoff_requested_by uuid references public.profiles (id) on delete set null,
  signoff_requested_at timestamptz,
  late_notice_acknowledged boolean not null default false,
  signed_off_by uuid references public.profiles (id) on delete set null,
  signed_off_at timestamptz,
  declined_by uuid references public.profiles (id) on delete set null,
  declined_at timestamptz,
  decline_note text,
  pricing_confirmed_by uuid references public.profiles (id) on delete set null,
  pricing_confirmed_at timestamptz,
  po_requested_by uuid references public.profiles (id) on delete set null,
  po_requested_at timestamptz,
  po_number text,
  po_received_by uuid references public.profiles (id) on delete set null,
  po_received_at timestamptz,
  entered_by uuid references public.profiles (id) on delete set null,
  entered_at timestamptz,
  organiser_paid_by uuid references public.profiles (id) on delete set null,
  organiser_paid_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  data_removed_by uuid references public.profiles (id) on delete set null,
  data_removed_at timestamptz,

  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint comp_entries_event_id_site_id_key
    unique (event_id, site_id),
  constraint comp_entries_event_site_fkey
    foreign key (event_id, site_id)
    references public.comp_event_sites (event_id, site_id) on delete restrict,
  constraint comp_entries_status_check
    check (status in (
      'draft',
      'awaiting_signoff',
      'collecting',
      'po_request_sent',
      'po_received',
      'entered',
      'completed',
      'declined',
      'withdrawn'
    )),
  constraint comp_entries_uplift_pct_check
    check (uplift_pct between 0 and 100),
  constraint comp_entries_judges_required_check
    check (judges_required between 0 and 20),
  constraint comp_entries_po_number_check
    check (po_number is null or length(btrim(po_number)) between 1 and 100),
  constraint comp_entries_decline_note_check
    check (declined_at is null or btrim(coalesce(decline_note, '')) <> ''),
  constraint comp_entries_signoff_requested_pair_check
    check (signoff_requested_by is null or signoff_requested_at is not null),
  constraint comp_entries_signed_off_pair_check
    check (signed_off_by is null or signed_off_at is not null),
  constraint comp_entries_declined_pair_check
    check (declined_by is null or declined_at is not null),
  constraint comp_entries_pricing_confirmed_pair_check
    check (pricing_confirmed_by is null or pricing_confirmed_at is not null),
  constraint comp_entries_po_requested_pair_check
    check (po_requested_by is null or po_requested_at is not null),
  constraint comp_entries_po_received_pair_check
    check (po_received_by is null or po_received_at is not null),
  constraint comp_entries_entered_pair_check
    check (entered_by is null or entered_at is not null),
  constraint comp_entries_organiser_paid_pair_check
    check (organiser_paid_by is null or organiser_paid_at is not null),
  constraint comp_entries_completed_pair_check
    check (completed_by is null or completed_at is not null),
  constraint comp_entries_data_removed_pair_check
    check (data_removed_by is null or data_removed_at is not null)
);

comment on table public.comp_entries is
  'One club entry (site) to one external competition. Read: own site or view_all_sites. Write: edit_comp_entries at the site. Status and the who/when columns are gated by 0033.';
comment on column public.comp_entries.uplift_pct is
  'Parent price = organiser fee * (1 + uplift_pct / 100), computed in the app. Extras are not uplifted.';
comment on column public.comp_entries.data_removed_at is
  'When gymnast names, DOBs and notes were blanked (0034). Due 12 months after the competition.';

-- event_id is covered by comp_entries_event_id_site_id_key. Every other FK
-- column gets its own index (the 0007 convention).
create index comp_entries_site_id_idx on public.comp_entries (site_id);
create index comp_entries_created_by_idx on public.comp_entries (created_by);
create index comp_entries_signoff_requested_by_idx on public.comp_entries (signoff_requested_by);
create index comp_entries_signed_off_by_idx on public.comp_entries (signed_off_by);
create index comp_entries_declined_by_idx on public.comp_entries (declined_by);
create index comp_entries_pricing_confirmed_by_idx on public.comp_entries (pricing_confirmed_by);
create index comp_entries_po_requested_by_idx on public.comp_entries (po_requested_by);
create index comp_entries_po_received_by_idx on public.comp_entries (po_received_by);
create index comp_entries_entered_by_idx on public.comp_entries (entered_by);
create index comp_entries_organiser_paid_by_idx on public.comp_entries (organiser_paid_by);
create index comp_entries_completed_by_idx on public.comp_entries (completed_by);
create index comp_entries_data_removed_by_idx on public.comp_entries (data_removed_by);

-- ---------------------------------------------------------------------------
-- 5. comp_entry_fee_levels, comp_entry_extras
-- ---------------------------------------------------------------------------
--
-- Fee levels (e.g. Opal £24, Diamond £28) and extras (e.g. T-shirt £10) are
-- per entry. unique (entry_id, id) is the target of the composite FKs in
-- section 6, which guarantee a gymnast's fee level and extras belong to the
-- gymnast's own entry. It also covers entry_id for the cascade from
-- comp_entries. Labels are unique per entry, ignoring case.

create table public.comp_entry_fee_levels (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.comp_entries (id) on delete cascade,
  label text not null,
  organiser_fee numeric(8, 2) not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),

  constraint comp_entry_fee_levels_entry_id_id_key unique (entry_id, id),
  constraint comp_entry_fee_levels_label_check
    check (length(btrim(label)) between 1 and 100),
  constraint comp_entry_fee_levels_organiser_fee_check
    check (organiser_fee >= 0)
);

comment on table public.comp_entry_fee_levels is
  'Organiser fee levels for one entry. Every gymnast on the entry picks one.';

create unique index comp_entry_fee_levels_entry_label_idx
  on public.comp_entry_fee_levels (entry_id, lower(btrim(label)));

create table public.comp_entry_extras (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.comp_entries (id) on delete cascade,
  label text not null,
  price numeric(8, 2) not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),

  constraint comp_entry_extras_entry_id_id_key unique (entry_id, id),
  constraint comp_entry_extras_label_check
    check (length(btrim(label)) between 1 and 100),
  constraint comp_entry_extras_price_check
    check (price >= 0)
);

comment on table public.comp_entry_extras is
  'Optional extras for one entry (e.g. T-shirt), chosen per gymnast. Not uplifted.';

create unique index comp_entry_extras_entry_label_idx
  on public.comp_entry_extras (entry_id, lower(btrim(label)));

-- ---------------------------------------------------------------------------
-- 6. comp_entry_gymnasts, comp_entry_gymnast_extras
-- ---------------------------------------------------------------------------
--
-- comp_entry_gymnasts is the ONLY table holding child data: full_name, dob,
-- notes and withdrawn_note. No parent contact data. 0034's removal blanks
-- all four 12 months after the competition and keeps the payment columns,
-- so full_name and dob are nullable; the pair check keeps them both set or
-- both blank. RLS (section 8) requires both on every client insert and
-- update, and refuses both once the entry's data_removed_at is set, so a
-- blanked row cannot be refilled.
--
-- fee_level_id is nullable: the mockup lets a draft gymnast have no level
-- yet, and 0033 checks every gymnast has one before sign-off is requested.
-- (entry_id, fee_level_id) -> comp_entry_fee_levels (entry_id, id) keeps the
-- level on the same entry (MATCH SIMPLE: a null fee_level_id is not checked).
-- ON DELETE SET NULL (fee_level_id) clears only the level, never entry_id.
-- The fee level delete policy refuses a level that is in use, so in practice
-- this action only runs during an entry delete, where an entry's fee levels
-- and gymnasts are both cascaded and the order of the two cascades doesn't
-- matter. (A NO ACTION or RESTRICT FK here could fail on that order.)
--
-- withdrawn_note is required when withdrawn, unless the data has been
-- removed (full_name is null), since removal blanks it.

create table public.comp_entry_gymnasts (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.comp_entries (id) on delete cascade,
  fee_level_id uuid,
  full_name text,
  dob date,
  notes text,
  debt_added boolean not null default false,
  paid boolean not null default false,
  amount_paid numeric(8, 2),
  credit_used numeric(8, 2),
  paid_date date,
  marked_paid_bars boolean not null default false,
  withdrawn boolean not null default false,
  withdrawn_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint comp_entry_gymnasts_entry_id_id_key unique (entry_id, id),
  constraint comp_entry_gymnasts_fee_level_fkey
    foreign key (entry_id, fee_level_id)
    references public.comp_entry_fee_levels (entry_id, id)
    on delete set null (fee_level_id),
  constraint comp_entry_gymnasts_full_name_check
    check (full_name is null or length(btrim(full_name)) between 1 and 200),
  constraint comp_entry_gymnasts_name_dob_pair_check
    check ((full_name is null) = (dob is null)),
  constraint comp_entry_gymnasts_amount_paid_check
    check (amount_paid is null or amount_paid >= 0),
  constraint comp_entry_gymnasts_credit_used_check
    check (credit_used is null or credit_used >= 0),
  constraint comp_entry_gymnasts_withdrawn_note_check
    check (not withdrawn or full_name is null or btrim(coalesce(withdrawn_note, '')) <> '')
);

comment on table public.comp_entry_gymnasts is
  'Gymnasts on one competition entry: name, DOB, fee level and payment checklist. The only child data in the Hub (CLAUDE.md carve-out). full_name, dob, notes and withdrawn_note are blanked by the 0034 data removal and never logged.';

create index comp_entry_gymnasts_entry_id_fee_level_id_idx
  on public.comp_entry_gymnasts (entry_id, fee_level_id);

-- Which extras each gymnast chose. Both FKs share entry_id, so the extra is
-- on the gymnast's own entry. Both cascade: removing a gymnast or an extra
-- removes the selection. The extras delete policy refuses an extra that is
-- in use, so a client cannot silently drop selections; the cascade only runs
-- during an entry delete (or a postgres/service_role delete).
-- Insert/delete only: no other columns, no update policy. The primary key
-- covers the gymnast FK; (entry_id, extra_id) gets its own index.

create table public.comp_entry_gymnast_extras (
  entry_id uuid not null,
  gymnast_id uuid not null,
  extra_id uuid not null,

  constraint comp_entry_gymnast_extras_pkey
    primary key (entry_id, gymnast_id, extra_id),
  constraint comp_entry_gymnast_extras_gymnast_fkey
    foreign key (entry_id, gymnast_id)
    references public.comp_entry_gymnasts (entry_id, id) on delete cascade,
  constraint comp_entry_gymnast_extras_extra_fkey
    foreign key (entry_id, extra_id)
    references public.comp_entry_extras (entry_id, id) on delete cascade
);

comment on table public.comp_entry_gymnast_extras is
  'Extras chosen by each gymnast on an entry. Insert/delete only.';

create index comp_entry_gymnast_extras_entry_id_extra_id_idx
  on public.comp_entry_gymnast_extras (entry_id, extra_id);

-- ---------------------------------------------------------------------------
-- 7. comp_entry_staff
-- ---------------------------------------------------------------------------
--
-- Coaches and judges going to the competition, picked from any active
-- profile company-wide (comp_staff_candidates(), section 10). One row per
-- person per entry. profile_id restricts (the 0029 rule for assigned people:
-- deactivate, don't delete). transport is planning information only.
--
-- A judge with judge_approved_at null is awaiting approval (approve_judges,
-- 0033). There is no rejected state: an unapproved judge is removed. Only
-- judges carry an approval.
--
-- RLS cannot read other people's profiles, so "the picked profile is active"
-- is left to the app and 0033.

create table public.comp_entry_staff (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.comp_entries (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete restrict,
  staff_role text not null,
  transport text,
  judge_approved_by uuid references public.profiles (id) on delete set null,
  judge_approved_at timestamptz,
  created_at timestamptz not null default now(),

  constraint comp_entry_staff_entry_id_profile_id_key unique (entry_id, profile_id),
  constraint comp_entry_staff_role_check
    check (staff_role in ('coach', 'judge')),
  constraint comp_entry_staff_transport_check
    check (transport is null
           or transport in ('own_car', 'carpool', 'public_transport', 'taxi')),
  constraint comp_entry_staff_judge_approved_pair_check
    check (judge_approved_by is null or judge_approved_at is not null),
  constraint comp_entry_staff_judge_approval_role_check
    check (staff_role = 'judge' or (judge_approved_by is null and judge_approved_at is null))
);

comment on table public.comp_entry_staff is
  'Coaches and judges for one entry, from any active profile. Judges need approve_judges approval (0033).';

-- entry_id is covered by comp_entry_staff_entry_id_profile_id_key.
create index comp_entry_staff_profile_id_idx on public.comp_entry_staff (profile_id);
create index comp_entry_staff_judge_approved_by_idx on public.comp_entry_staff (judge_approved_by);

-- ---------------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------------
--
-- is_active_coach() is the outer conjunct everywhere, so a deactivated
-- account with a still-valid JWT reads and writes nothing.
--
-- READ(S)  = view_all_sites, or the caller's profiles.site name-matches site
--            S (the 0026 own-site join).
-- WRITE(S) = has_site_capability('edit_comp_entries', S).
-- Child tables reach S through a scalar subquery on comp_entries (the 0026
-- child pattern). Anyone with WRITE(S) also has READ(S), so that subquery
-- always sees the parent; an invisible or missing parent gives null, and
-- has_site_capability(_, null) is false.
-- Writes: insert = with check only, delete = using only, update = both, so a
-- row cannot be moved to a site the caller cannot write.
--
-- Cascades from an entry delete are FK actions and do not consult the
-- children's RLS.

alter table public.comp_external_details enable row level security;
alter table public.comp_entries enable row level security;
alter table public.comp_entry_fee_levels enable row level security;
alter table public.comp_entry_extras enable row level security;
alter table public.comp_entry_gymnasts enable row level security;
alter table public.comp_entry_gymnast_extras enable row level security;
alter table public.comp_entry_staff enable row level security;

-- --- comp_external_details (4) ----------------------------------------------
--
-- Deadlines are event-level and shared, so any edit_comp_entries holder may
-- set them (not only one site), for external events only. The comp_events
-- lookup passes comp_events RLS for every active coach.

create policy "comp_external_details_select_authenticated"
on public.comp_external_details
for select
to authenticated
using (
  public.is_active_coach()
);

create policy "comp_external_details_insert_edit_comp_entries_external"
on public.comp_external_details
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_capability('edit_comp_entries')
  and exists (
    select 1 from public.comp_events e
    where e.id = comp_external_details.event_id and e.source = 'external'
  )
);

create policy "comp_external_details_update_edit_comp_entries_external"
on public.comp_external_details
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_capability('edit_comp_entries')
  and exists (
    select 1 from public.comp_events e
    where e.id = comp_external_details.event_id and e.source = 'external'
  )
)
with check (
  public.is_active_coach()
  and public.has_capability('edit_comp_entries')
  and exists (
    select 1 from public.comp_events e
    where e.id = comp_external_details.event_id and e.source = 'external'
  )
);

create policy "comp_external_details_delete_manage_comp_events"
on public.comp_external_details
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_capability('manage_comp_events')
);

-- --- comp_entries (4) -------------------------------------------------------
--
-- Insert: as yourself, at a site you can write, for an external event, in
-- 'draft', with late_notice_acknowledged false and every gated column empty
-- (num_nonnulls over the 22 who/when/PO/decline columns). The site must
-- already be attached to the event (comp_entries_event_site_fkey).
--
-- Update: WRITE(site) only, at any status. Gated columns are left to 0033.
--
-- Delete: WRITE(site) and still 'draft'. A submitted entry ends as declined,
-- withdrawn or completed instead, keeping its payment rows.

create policy "comp_entries_select_own_site_or_view_all"
on public.comp_entries
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('view_all_sites')
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = comp_entries.site_id and p.id = auth.uid()
    )
  )
);

create policy "comp_entries_insert_edit_comp_entries_site_draft"
on public.comp_entries
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_site_capability('edit_comp_entries', comp_entries.site_id)
  and created_by = auth.uid()
  and status = 'draft'
  and not late_notice_acknowledged
  and num_nonnulls(
    signoff_requested_by, signoff_requested_at,
    signed_off_by, signed_off_at,
    declined_by, declined_at, decline_note,
    pricing_confirmed_by, pricing_confirmed_at,
    po_requested_by, po_requested_at, po_number,
    po_received_by, po_received_at,
    entered_by, entered_at,
    organiser_paid_by, organiser_paid_at,
    completed_by, completed_at,
    data_removed_by, data_removed_at
  ) = 0
  and exists (
    select 1 from public.comp_events e
    where e.id = comp_entries.event_id and e.source = 'external'
  )
);

create policy "comp_entries_update_edit_comp_entries_site"
on public.comp_entries
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability('edit_comp_entries', comp_entries.site_id)
)
with check (
  public.is_active_coach()
  and public.has_site_capability('edit_comp_entries', comp_entries.site_id)
);

create policy "comp_entries_delete_edit_comp_entries_site_draft"
on public.comp_entries
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability('edit_comp_entries', comp_entries.site_id)
  and status = 'draft'
);

-- --- comp_entry_fee_levels (4) ----------------------------------------------
--
-- Delete also requires the level to be unused: change or remove the
-- gymnasts' level first.

create policy "comp_entry_fee_levels_select_own_site_or_view_all"
on public.comp_entry_fee_levels
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('view_all_sites')
    or exists (
      select 1 from public.comp_entries en
      join public.rota_sites s on s.id = en.site_id
      join public.profiles p on p.site = s.name
      where en.id = comp_entry_fee_levels.entry_id and p.id = auth.uid()
    )
  )
);

create policy "comp_entry_fee_levels_insert_edit_comp_entries_site"
on public.comp_entry_fee_levels
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_comp_entries',
    (select en.site_id from public.comp_entries en where en.id = comp_entry_fee_levels.entry_id)
  )
);

create policy "comp_entry_fee_levels_update_edit_comp_entries_site"
on public.comp_entry_fee_levels
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_comp_entries',
    (select en.site_id from public.comp_entries en where en.id = comp_entry_fee_levels.entry_id)
  )
)
with check (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_comp_entries',
    (select en.site_id from public.comp_entries en where en.id = comp_entry_fee_levels.entry_id)
  )
);

create policy "comp_entry_fee_levels_delete_edit_comp_entries_site_unused"
on public.comp_entry_fee_levels
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_comp_entries',
    (select en.site_id from public.comp_entries en where en.id = comp_entry_fee_levels.entry_id)
  )
  and not exists (
    select 1 from public.comp_entry_gymnasts g
    where g.entry_id = comp_entry_fee_levels.entry_id
      and g.fee_level_id = comp_entry_fee_levels.id
  )
);

-- --- comp_entry_extras (4) --------------------------------------------------
--
-- Delete also requires the extra to be unused: untick it on every gymnast
-- first, so selections (and what parents owe) never disappear silently.

create policy "comp_entry_extras_select_own_site_or_view_all"
on public.comp_entry_extras
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('view_all_sites')
    or exists (
      select 1 from public.comp_entries en
      join public.rota_sites s on s.id = en.site_id
      join public.profiles p on p.site = s.name
      where en.id = comp_entry_extras.entry_id and p.id = auth.uid()
    )
  )
);

create policy "comp_entry_extras_insert_edit_comp_entries_site"
on public.comp_entry_extras
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_comp_entries',
    (select en.site_id from public.comp_entries en where en.id = comp_entry_extras.entry_id)
  )
);

create policy "comp_entry_extras_update_edit_comp_entries_site"
on public.comp_entry_extras
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_comp_entries',
    (select en.site_id from public.comp_entries en where en.id = comp_entry_extras.entry_id)
  )
)
with check (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_comp_entries',
    (select en.site_id from public.comp_entries en where en.id = comp_entry_extras.entry_id)
  )
);

create policy "comp_entry_extras_delete_edit_comp_entries_site_unused"
on public.comp_entry_extras
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_comp_entries',
    (select en.site_id from public.comp_entries en where en.id = comp_entry_extras.entry_id)
  )
  and not exists (
    select 1 from public.comp_entry_gymnast_extras ge
    where ge.entry_id = comp_entry_extras.entry_id
      and ge.extra_id = comp_entry_extras.id
  )
);

-- --- comp_entry_gymnasts (4) ------------------------------------------------
--
-- Gymnast rows are visible to anyone who can read the entry.
-- Insert and update (with check) also require full_name and dob, and that
-- the entry's data has not been removed. The 0034 removal runs as a definer
-- function and is not subject to these policies.

create policy "comp_entry_gymnasts_select_own_site_or_view_all"
on public.comp_entry_gymnasts
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('view_all_sites')
    or exists (
      select 1 from public.comp_entries en
      join public.rota_sites s on s.id = en.site_id
      join public.profiles p on p.site = s.name
      where en.id = comp_entry_gymnasts.entry_id and p.id = auth.uid()
    )
  )
);

create policy "comp_entry_gymnasts_insert_edit_comp_entries_site"
on public.comp_entry_gymnasts
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_comp_entries',
    (select en.site_id from public.comp_entries en where en.id = comp_entry_gymnasts.entry_id)
  )
  and full_name is not null
  and dob is not null
  and not exists (
    select 1 from public.comp_entries en
    where en.id = comp_entry_gymnasts.entry_id and en.data_removed_at is not null
  )
);

create policy "comp_entry_gymnasts_update_edit_comp_entries_site"
on public.comp_entry_gymnasts
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_comp_entries',
    (select en.site_id from public.comp_entries en where en.id = comp_entry_gymnasts.entry_id)
  )
)
with check (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_comp_entries',
    (select en.site_id from public.comp_entries en where en.id = comp_entry_gymnasts.entry_id)
  )
  and full_name is not null
  and dob is not null
  and not exists (
    select 1 from public.comp_entries en
    where en.id = comp_entry_gymnasts.entry_id and en.data_removed_at is not null
  )
);

create policy "comp_entry_gymnasts_delete_edit_comp_entries_site"
on public.comp_entry_gymnasts
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_comp_entries',
    (select en.site_id from public.comp_entries en where en.id = comp_entry_gymnasts.entry_id)
  )
);

-- --- comp_entry_gymnast_extras (3) ------------------------------------------
--
-- No update policy: untick by deleting, tick by inserting.

create policy "comp_entry_gymnast_extras_select_own_site_or_view_all"
on public.comp_entry_gymnast_extras
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('view_all_sites')
    or exists (
      select 1 from public.comp_entries en
      join public.rota_sites s on s.id = en.site_id
      join public.profiles p on p.site = s.name
      where en.id = comp_entry_gymnast_extras.entry_id and p.id = auth.uid()
    )
  )
);

create policy "comp_entry_gymnast_extras_insert_edit_comp_entries_site"
on public.comp_entry_gymnast_extras
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_comp_entries',
    (select en.site_id from public.comp_entries en where en.id = comp_entry_gymnast_extras.entry_id)
  )
);

create policy "comp_entry_gymnast_extras_delete_edit_comp_entries_site"
on public.comp_entry_gymnast_extras
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_comp_entries',
    (select en.site_id from public.comp_entries en where en.id = comp_entry_gymnast_extras.entry_id)
  )
);

-- --- comp_entry_staff (4) ---------------------------------------------------
--
-- Insert also requires no judge approval: a judge is added pending.

create policy "comp_entry_staff_select_own_site_or_view_all"
on public.comp_entry_staff
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('view_all_sites')
    or exists (
      select 1 from public.comp_entries en
      join public.rota_sites s on s.id = en.site_id
      join public.profiles p on p.site = s.name
      where en.id = comp_entry_staff.entry_id and p.id = auth.uid()
    )
  )
);

create policy "comp_entry_staff_insert_edit_comp_entries_site"
on public.comp_entry_staff
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_comp_entries',
    (select en.site_id from public.comp_entries en where en.id = comp_entry_staff.entry_id)
  )
  and judge_approved_by is null
  and judge_approved_at is null
);

create policy "comp_entry_staff_update_edit_comp_entries_site"
on public.comp_entry_staff
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_comp_entries',
    (select en.site_id from public.comp_entries en where en.id = comp_entry_staff.entry_id)
  )
)
with check (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_comp_entries',
    (select en.site_id from public.comp_entries en where en.id = comp_entry_staff.entry_id)
  )
);

create policy "comp_entry_staff_delete_edit_comp_entries_site"
on public.comp_entry_staff
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability(
    'edit_comp_entries',
    (select en.site_id from public.comp_entries en where en.id = comp_entry_staff.entry_id)
  )
);

-- ---------------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------------
--
-- As 0031: the anon revoke is a restatement since 0028, kept so the grant
-- state is declared here. comp_entry_gymnast_extras gets update too, as
-- comp_event_sites did; with no update policy, RLS refuses every update.

revoke all on table public.comp_external_details from public;
revoke all on table public.comp_external_details from anon;
grant select, insert, update, delete on table public.comp_external_details to authenticated;

revoke all on table public.comp_entries from public;
revoke all on table public.comp_entries from anon;
grant select, insert, update, delete on table public.comp_entries to authenticated;

revoke all on table public.comp_entry_fee_levels from public;
revoke all on table public.comp_entry_fee_levels from anon;
grant select, insert, update, delete on table public.comp_entry_fee_levels to authenticated;

revoke all on table public.comp_entry_extras from public;
revoke all on table public.comp_entry_extras from anon;
grant select, insert, update, delete on table public.comp_entry_extras to authenticated;

revoke all on table public.comp_entry_gymnasts from public;
revoke all on table public.comp_entry_gymnasts from anon;
grant select, insert, update, delete on table public.comp_entry_gymnasts to authenticated;

revoke all on table public.comp_entry_gymnast_extras from public;
revoke all on table public.comp_entry_gymnast_extras from anon;
grant select, insert, update, delete on table public.comp_entry_gymnast_extras to authenticated;

revoke all on table public.comp_entry_staff from public;
revoke all on table public.comp_entry_staff from anon;
grant select, insert, update, delete on table public.comp_entry_staff to authenticated;

-- ---------------------------------------------------------------------------
-- 10. comp_staff_candidates()
-- ---------------------------------------------------------------------------
--
-- The coach and judge picker. Judges especially are cross-site, and profiles
-- RLS only shows a coach their own row, so this definer RPC lists every
-- ACTIVE profile company-wide, Head Office included: id, full_name and site
-- only. No email, job title or active flag. The 0029 style
-- (site_rota_roster): language sql, security definer, search_path '', casts
-- to text.
--
-- This is the first company-wide staff list a Coach can read (approved in
-- Phase 3c Step A). Any active user may call it; is_active_coach() makes it
-- return nothing to a deactivated account.

create function public.comp_staff_candidates()
returns table (id uuid, full_name text, site text)
language sql
security definer
stable
set search_path = ''
as $$
  select p.id, p.full_name::text, p.site::text
  from public.profiles p
  where p.active
    and public.is_active_coach()
  order by p.full_name;
$$;

revoke execute on function public.comp_staff_candidates() from public;
revoke execute on function public.comp_staff_candidates() from anon;
grant execute on function public.comp_staff_candidates() to authenticated;

commit;
