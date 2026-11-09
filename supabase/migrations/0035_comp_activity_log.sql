-- NWG Coaches Hub — Competitions, phase 3e: activity log and gymnast data removal
--
-- Adds the activity log behind the External Entry page's Activity panel, and
-- the manual action that removes gymnast details 12 months after a
-- competition. The last schema step before the External Entries UI (Phase
-- 4a). Follows the 0032 and 0033 headers (their "0034 will ..." notes are
-- this file), docs/investigations/competitions-phase1.md section 6, the
-- Activity panel in reference/external-entry-mockup.html and the approved
-- Phase 3e Step A design and decisions.
--
-- What this file does, in order:
--   1. Refuses to run if 0034 is missing, if any object below already
--      exists, if comp_events or comp_event_sites already has a trigger, or
--      if the live capability matrix differs from the 14 capabilities in
--      0032 (48 pairs).
--   2. Re-creates title_has_capability() and my_capabilities() with create
--      or replace, adding 1 capability:
--        remove_comp_gymnast_data  global  Regional General Manager,
--                                          Head of Gymnastics
--      The 14 existing branches and names are unchanged. Grants are
--      restated. A second guard checks the full 15-capability matrix (50
--      pairs).
--   3. Creates comp_activity_log.
--   4. Enables RLS on it with 1 select policy, and grants select only.
--   5. Adds the logger, comp_activity_log_write() (security definer), and
--      attaches it AFTER INSERT OR UPDATE OR DELETE to the 9 logged tables:
--        comp_events, comp_event_sites, comp_external_details,
--        comp_entries, comp_entry_fee_levels, comp_entry_extras,
--        comp_entry_gymnasts, comp_entry_gymnast_extras, comp_entry_staff
--      24 triggers in all on those 9 tables (15 from 0033/0034, 9 here).
--   6. Adds comp_entry_remove_gymnast_data(p_entry_id), the data removal.
--   7. Post-checks that the new functions and the log table are owned by a
--      trusted role.
--
-- The log:
--   * One row per logged row change: who (actor_id, from auth.uid(); null
--     = system or SQL Editor), when, which table and row, which entry
--     and/or event, and what changed (changed columns only, old -> new).
--   * Event-level rows (comp_events, comp_event_sites,
--     comp_external_details) have entry_id null and are read by every
--     active coach. Entry rows follow the entry's read rule: own site or
--     view_all_sites. site_id is copied onto each entry row, so the rule
--     still works after a draft entry is deleted.
--   * Append-only. Only the logger (security definer, owned by postgres)
--     writes it. Clients have select only; no insert, update or delete
--     policy or grant, for authenticated or service_role.
--   * Plain-English lines. action holds a fixed key the logger derives from
--     the change itself (e.g. status awaiting_signoff -> collecting is
--     'sign_off'). The 0033 guards mean a gated column only changes through
--     an entry action (or a trusted role), so each action's update is
--     recognisable and the 14 RPCs are unchanged. Ordinary edits have
--     action null and the UI describes them from table_name, op and the
--     keys in changes. Names are looked up live from row_id, row_key and
--     actor_id; none is stored. tx_id groups one request's rows ("Added 9
--     gymnasts").
--
-- PII. No value of these columns ever reaches the log, by any path
-- (client writes, entry actions, cascades, SQL Editor, data removal):
--   comp_entry_gymnasts  every column except id, entry_id, fee_level_id,
--                        debt_added, paid, amount_paid, credit_used,
--                        paid_date, marked_paid_bars, withdrawn, created_at,
--                        updated_at (an allowlist, so full_name, dob, notes,
--                        withdrawn_note and any column added later are
--                        redacted)
--   comp_entries         notes, decline_note, withdrawal_note (they may
--                        mention a child or health)
-- The logger records the NAMES of redacted columns that changed in
-- redacted, then removes their keys from both row images before anything
-- else is read from them. comp_events.notes is logged (everyone can read
-- the calendar anyway).
--
-- Data removal (remove_comp_gymnast_data: RGM, HOG). Allowed on a
-- completed, declined or withdrawn entry, once the competition's end_date
-- is 12 months or more before today (Europe/London), and once only. It
-- blanks full_name, dob, notes and withdrawn_note on all the entry's
-- gymnasts, clears comp_entries.notes, sets decline_note and
-- withdrawal_note to '[removed]' where set (their checks need text while
-- declined/withdrawn), and sets data_removed_by/_at. Fee levels, extras and
-- payment columns are kept. It logs one line, action 'remove_gymnast_data'
-- with detail {"gymnasts": N}. The app shows "Gymnast 1, 2 ..." afterwards
-- (created_at order) and computes "due for removal" (end_date + 12 months);
-- neither is stored.
--
-- Errors (the 0033 order and codes): 42501 deactivated, missing capability
-- or a direct write to the log; P0002 entry not found; 55000 wrong stage,
-- already removed, or under 12 months.
--
-- What it deliberately does NOT do:
--   * Change any 0033/0034 function or trigger, or any existing table or
--     policy. The 14 RPCs are not re-created.
--   * Keep a decline reason after resubmission. comp_entry_request_signoff
--     clears decline_note, and the log keeps only "Declined" and
--     "Resubmitted" (approved, Step A 7.2).
--   * Log "Ready for PO". It is derived in the app, never written.
--   * Store gymnast or people names, or "due for removal".
--   * Log TRUNCATE (owner only).
--   * App code, apart from the Capability union in lib/capabilities.ts.
--
-- Applied manually by Jamie as a single paste in the Supabase SQL Editor.
-- Verification: docs/investigations/comp-entries-0035-verification.sql
-- (Paste A before, Paste B after). Wrapped in an explicit transaction for the
-- reasons 0026 gives: all or nothing. No down migration, matching 0001-0034.

begin;

-- ---------------------------------------------------------------------------
-- 1. Guards
-- ---------------------------------------------------------------------------
--
-- 1a. 0034 (and so 0031-0033) is applied, and nothing this file creates
--     exists yet. A trigger already on comp_events or comp_event_sites, or
--     any *_activity_log trigger, means someone has been here first.
-- 1b. create or replace overwrites title_has_capability() wholesale.
--     Compare every (title, capability) pair for the 6 titles and 15
--     capability names against the 0032 matrix (48 pairs), so drift fails
--     here and the new name must resolve to no title today.

do $$
begin
  if to_regprocedure('public.comp_entry_lock_guard()') is null
     or to_regprocedure('public.comp_entry_for_action(uuid, text, text, boolean)') is null
     or not exists (
       select 1 from pg_trigger
       where tgrelid = 'public.comp_entry_gymnasts'::regclass
         and tgname = 'comp_entry_gymnasts_lock_delete'
     ) then
    raise exception
      '0035 aborted: 0033 or 0034 is not applied. Nothing has been applied.';
  end if;

  if to_regclass('public.comp_activity_log') is not null then
    raise exception
      '0035 aborted: public.comp_activity_log already exists. Nothing has been applied.';
  end if;

  if to_regprocedure('public.comp_activity_log_write()') is not null
     or to_regprocedure('public.comp_entry_remove_gymnast_data(uuid)') is not null then
    raise exception
      '0035 aborted: one of the 0035 functions already exists. Nothing has been applied.';
  end if;

  if exists (
    select 1 from pg_trigger t
    where not t.tgisinternal
      and (t.tgrelid in ('public.comp_events'::regclass, 'public.comp_event_sites'::regclass)
           or t.tgname like '%activity_log%')
  ) then
    raise exception
      '0035 aborted: comp_events or comp_event_sites already has a trigger, or an activity log trigger exists. Nothing has been applied.';
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
           ('confirm_comp_pricing'),
           ('remove_comp_gymnast_data')
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
      '0035 aborted: the live title_has_capability() differs from 0032 (%). Re-creating it would overwrite that. Nothing has been applied.',
      v_diff;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Capability
-- ---------------------------------------------------------------------------
--
--   remove_comp_gymnast_data (global): Regional General Manager, Head of
--     Gymnastics. Runs the 12-month gymnast data removal (section 6). Both
--     titles hold view_all_sites, so no site check is needed.
--
-- Same three places as 0031/0032: title_has_capability() (the matrix, its
-- only copy), the name array in my_capabilities(), and the Capability union
-- in lib/capabilities.ts. Both functions keep their signature, language,
-- security, volatility and search_path. The 14 existing branches and names
-- are copied unchanged; the new one is appended after confirm_comp_pricing.
-- Titles are listed explicitly (the 0013 rule).

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
      when 'remove_comp_gymnast_data' then p_job_title in (
        'Regional General Manager', 'Head of Gymnastics')
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
        'confirm_comp_pricing',
        'remove_comp_gymnast_data'
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

-- Post-check: the new capability resolves to exactly its 2 titles and
-- nothing else moved (50 pairs in total). Same comparison as 1b.

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
           ('confirm_comp_pricing'),
           ('remove_comp_gymnast_data')
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
    union all
    select 'remove_comp_gymnast_data', t.job_title
    from (values ('Regional General Manager'), ('Head of Gymnastics')) t (job_title)
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
      '0035 aborted: the re-created title_has_capability() is not the expected matrix (%). Nothing has been applied.',
      v_diff;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. comp_activity_log
-- ---------------------------------------------------------------------------
--
-- The log must outlive the rows it describes, so entry_id, event_id,
-- site_id and row_id have no foreign keys: deleting a draft entry or an
-- event leaves its log rows in place. actor_id follows the authorship rule
-- (profiles, on delete set null); the logger stores null for an auth.uid()
-- with no profile, so it can never fail a write.
--
--   tx_id     txid_current(): every row written by one request shares it,
--             so the UI can group "Added 9 gymnasts" into one line.
--   row_id    the row's uuid key (comp_external_details: event_id); null
--             for comp_event_sites and comp_entry_gymnast_extras.
--   row_key   the primary key column(s) as jsonb, for every table.
--   site_id   entry rows: the entry's site (never changes: 0033 guard).
--             comp_event_sites rows: the attached site. Otherwise null.
--   action    a fixed key, derived by the logger (section 5); null for
--             ordinary edits, inserts and deletes.
--   changes   {"column": {"old": x, "new": y}} for changed, non-redacted
--             columns. Inserts list non-null columns (old null), deletes
--             list non-null columns (new null). id, created_at and
--             updated_at are never listed.
--   redacted  names of redacted (PII) columns that changed, were set on
--             insert, or were set on delete. Never values.
--   detail    extra facts for an action; only {"gymnasts": N} on
--             remove_gymnast_data.

create table public.comp_activity_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  tx_id bigint not null default txid_current(),
  actor_id uuid references public.profiles (id) on delete set null,
  table_name text not null,
  op text not null,
  row_id uuid,
  row_key jsonb not null,
  entry_id uuid,
  event_id uuid,
  site_id uuid,
  action text,
  changes jsonb not null default '{}'::jsonb,
  redacted text[] not null default '{}',
  detail jsonb,

  constraint comp_activity_log_table_name_check
    check (table_name in (
      'comp_events',
      'comp_event_sites',
      'comp_external_details',
      'comp_entries',
      'comp_entry_fee_levels',
      'comp_entry_extras',
      'comp_entry_gymnasts',
      'comp_entry_gymnast_extras',
      'comp_entry_staff'
    )),
  constraint comp_activity_log_op_check
    check (op in ('insert', 'update', 'delete')),
  constraint comp_activity_log_action_check
    check (action is null or action in (
      'request_signoff',
      'sign_off',
      'decline',
      'confirm_pricing',
      'pricing_cleared',
      'po_request_sent',
      'record_po_number',
      'correct_po_number',
      'mark_entered',
      'mark_organiser_paid',
      'undo_organiser_paid',
      'complete',
      'withdraw',
      'undo_po_request',
      'undo_entered',
      'status_changed',
      'approve_judge',
      'judge_approval_reset',
      'withdraw_gymnast',
      'reinstate_gymnast',
      'remove_gymnast_data'
    )),
  constraint comp_activity_log_entry_site_check
    check (entry_id is null or site_id is not null)
);

comment on table public.comp_activity_log is
  'Append-only activity log for competition events and External Competition Entries (0035). Written only by comp_activity_log_write(). Gymnast PII and entry free text are never stored as values: only their column names, in redacted. Entry rows: own site or view_all_sites; event rows (entry_id null): every active coach.';

create index comp_activity_log_entry_id_idx on public.comp_activity_log (entry_id, id);
create index comp_activity_log_event_id_idx on public.comp_activity_log (event_id, id);
create index comp_activity_log_row_idx on public.comp_activity_log (table_name, row_id);
create index comp_activity_log_actor_id_idx on public.comp_activity_log (actor_id);

-- ---------------------------------------------------------------------------
-- 4. RLS and grants
-- ---------------------------------------------------------------------------
--
-- Select only. is_active_coach() is the outer conjunct, as in 0032. Entry
-- rows use the 0032 READ(S) rule on the copied site_id, so they stay
-- readable (to the right people) after the entry is gone.
--
-- No insert, update or delete policy. Grants: Supabase's default privileges
-- give authenticated and service_role every privilege on a new table, so
-- revoke all first and grant select back. service_role keeps select only,
-- so even the secret key can't edit the log. The logger runs as postgres,
-- the table owner.

alter table public.comp_activity_log enable row level security;

create policy "comp_activity_log_select_entry_site_or_event"
on public.comp_activity_log
for select
to authenticated
using (
  public.is_active_coach()
  and (
    comp_activity_log.entry_id is null
    or public.has_capability('view_all_sites')
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = comp_activity_log.site_id and p.id = auth.uid()
    )
  )
);

revoke all on table public.comp_activity_log from public;
revoke all on table public.comp_activity_log from anon;
revoke all on table public.comp_activity_log from authenticated;
revoke all on table public.comp_activity_log from service_role;
grant select on table public.comp_activity_log to authenticated;
grant select on table public.comp_activity_log to service_role;

-- ---------------------------------------------------------------------------
-- 5. The logger
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER, owned by postgres: it inserts into a table clients
-- can't write. The actor is auth.uid(), which is unchanged under definer
-- (null in the SQL Editor and for service_role). One function for the 9
-- tables, branching on tg_table_name; AFTER ... FOR EACH ROW, so it sees
-- the final row (after the 0033 guards' changes) and only rows that were
-- actually written.
--
-- Steps, in order:
--   a. Row images: to_jsonb(old) and to_jsonb(new).
--   b. Redaction. The PII keys for this table: comp_entry_gymnasts every
--      key not on the allowlist; comp_entries notes, decline_note,
--      withdrawal_note. Their names go into redacted if the value changed
--      (null counts as a value), and the keys are removed from both images
--      straight away. Nothing below reads the unredacted images.
--   c. Context: row_id, row_key, entry_id, event_id, site_id.
--   d. Skips:
--        cascades: a child row whose parent is already gone in this
--          transaction (entry for the 5 entry child tables; event for
--          comp_event_sites and comp_external_details; gymnast or extra
--          for a comp_entry_gymnast_extras delete). The parent's own
--          delete row stands for them.
--        no-ops: an update that changes nothing but id, created_at or
--          updated_at.
--        data removal: a gymnast update that only blanks redacted
--          columns, on an entry whose data_removed_at is set (only the
--          removal does this: RLS requires a name and DOB on every client
--          update and refuses them once removed). The entry's
--          remove_gymnast_data line stands for them.
--   e. action, derived from the change (see the keys in the action check).
--   f. Insert.
--
-- The logger never refuses a write: every action key it can produce is in
-- the action check, and actor_id is checked against profiles first.

create function public.comp_activity_log_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_pii text[] := '{}';
  v_redacted text[];
  v_blanked boolean := false;
  v_changes jsonb;
  v_row_id uuid;
  v_row_key jsonb;
  v_entry_id uuid;
  v_event_id uuid;
  v_site_id uuid;
  v_removed boolean := false;
  v_action text;
  v_detail jsonb;
  v_os text;
  v_ns text;
begin
  -- a. Row images.
  if tg_op <> 'INSERT' then
    v_old := to_jsonb(old);
  end if;
  if tg_op <> 'DELETE' then
    v_new := to_jsonb(new);
  end if;

  -- b. Redaction.
  if tg_table_name = 'comp_entry_gymnasts' then
    select coalesce(array_agg(k), '{}') into v_pii
    from jsonb_object_keys(coalesce(v_new, v_old)) as k
    where k <> all (array[
      'id', 'entry_id', 'fee_level_id', 'debt_added', 'paid', 'amount_paid',
      'credit_used', 'paid_date', 'marked_paid_bars', 'withdrawn',
      'created_at', 'updated_at'
    ]);
    v_blanked := tg_op = 'UPDATE'
      and coalesce((
        select bool_and(v_new -> k = 'null'::jsonb) from unnest(v_pii) as k
      ), true);
  elsif tg_table_name = 'comp_entries' then
    v_pii := array['notes', 'decline_note', 'withdrawal_note'];
  end if;

  select coalesce(array_agg(k order by k), '{}') into v_redacted
  from unnest(v_pii) as k
  where coalesce(v_old -> k, 'null'::jsonb) is distinct from coalesce(v_new -> k, 'null'::jsonb);

  v_old := v_old - v_pii;
  v_new := v_new - v_pii;
  v_row := coalesce(v_new, v_old);

  -- c. Context.
  if tg_table_name = 'comp_event_sites' then
    v_row_key := jsonb_build_object('event_id', v_row -> 'event_id', 'site_id', v_row -> 'site_id');
  elsif tg_table_name = 'comp_external_details' then
    v_row_key := jsonb_build_object('event_id', v_row -> 'event_id');
    v_row_id := (v_row ->> 'event_id')::uuid;
  elsif tg_table_name = 'comp_entry_gymnast_extras' then
    v_row_key := jsonb_build_object(
      'entry_id', v_row -> 'entry_id',
      'gymnast_id', v_row -> 'gymnast_id',
      'extra_id', v_row -> 'extra_id');
  else
    v_row_key := jsonb_build_object('id', v_row -> 'id');
    v_row_id := (v_row ->> 'id')::uuid;
  end if;

  if tg_table_name = 'comp_events' then
    v_event_id := (v_row ->> 'id')::uuid;
  elsif tg_table_name in ('comp_event_sites', 'comp_external_details') then
    v_event_id := (v_row ->> 'event_id')::uuid;
    v_site_id := (v_row ->> 'site_id')::uuid;
    -- d. Cascade from an event delete.
    if tg_op = 'DELETE'
       and not exists (select 1 from public.comp_events e where e.id = v_event_id) then
      return null;
    end if;
  elsif tg_table_name = 'comp_entries' then
    v_entry_id := (v_row ->> 'id')::uuid;
    v_event_id := (v_row ->> 'event_id')::uuid;
    v_site_id := (v_row ->> 'site_id')::uuid;
  else
    v_entry_id := (v_row ->> 'entry_id')::uuid;
    select en.event_id, en.site_id, en.data_removed_at is not null
      into v_event_id, v_site_id, v_removed
    from public.comp_entries en
    where en.id = v_entry_id;
    -- d. Cascade from an entry delete.
    if not found then
      return null;
    end if;
    -- d. Cascade from a gymnast or extra delete.
    if tg_table_name = 'comp_entry_gymnast_extras' and tg_op = 'DELETE'
       and (not exists (
              select 1 from public.comp_entry_gymnasts g
              where g.id = (v_row ->> 'gymnast_id')::uuid)
            or not exists (
              select 1 from public.comp_entry_extras x
              where x.id = (v_row ->> 'extra_id')::uuid)) then
      return null;
    end if;
  end if;

  select coalesce(
           jsonb_object_agg(k, jsonb_build_object('old', v_old -> k, 'new', v_new -> k)),
           '{}'::jsonb)
    into v_changes
  from jsonb_object_keys(v_row) as k
  where k <> all (array['id', 'created_at', 'updated_at'])
    and coalesce(v_old -> k, 'null'::jsonb) is distinct from coalesce(v_new -> k, 'null'::jsonb);

  -- d. No-ops, and the removal's gymnast blanking.
  if tg_op = 'UPDATE' and v_changes = '{}'::jsonb then
    if cardinality(v_redacted) = 0 then
      return null;
    end if;
    if v_blanked and v_removed then
      return null;
    end if;
  end if;

  -- e. action.
  if tg_op = 'UPDATE' then
    if tg_table_name = 'comp_entries' then
      v_os := v_old ->> 'status';
      v_ns := v_new ->> 'status';
      if v_os is distinct from v_ns then
        v_action := case
          when v_os in ('draft', 'declined') and v_ns = 'awaiting_signoff' then 'request_signoff'
          when v_os = 'awaiting_signoff' and v_ns = 'collecting' then 'sign_off'
          when v_os = 'awaiting_signoff' and v_ns = 'declined' then 'decline'
          when v_os = 'collecting' and v_ns = 'po_request_sent' then 'po_request_sent'
          when v_os = 'po_request_sent' and v_ns = 'po_received' then 'record_po_number'
          when v_os = 'po_received' and v_ns = 'entered' then 'mark_entered'
          when v_os = 'entered' and v_ns = 'completed' then 'complete'
          when v_ns = 'withdrawn' then 'withdraw'
          when v_os = 'po_request_sent' and v_ns = 'collecting' then 'undo_po_request'
          when v_os = 'entered' and v_ns = 'po_received' then 'undo_entered'
          else 'status_changed'
        end;
      elsif v_changes ? 'data_removed_at' and v_new ->> 'data_removed_at' is not null then
        v_action := 'remove_gymnast_data';
        v_detail := jsonb_build_object('gymnasts', (
          select count(*) from public.comp_entry_gymnasts g where g.entry_id = v_entry_id));
      elsif v_changes ? 'pricing_confirmed_at' then
        v_action := case when v_new ->> 'pricing_confirmed_at' is null
                         then 'pricing_cleared' else 'confirm_pricing' end;
      elsif v_changes ? 'organiser_paid_at' then
        v_action := case when v_new ->> 'organiser_paid_at' is null
                         then 'undo_organiser_paid' else 'mark_organiser_paid' end;
      elsif v_changes ? 'po_number' then
        v_action := 'correct_po_number';
      end if;
    elsif tg_table_name = 'comp_entry_staff' then
      if v_changes ? 'judge_approved_at' then
        v_action := case when v_new ->> 'judge_approved_at' is null
                         then 'judge_approval_reset' else 'approve_judge' end;
      end if;
    elsif tg_table_name = 'comp_entry_gymnasts' then
      if v_changes ? 'withdrawn' then
        v_action := case when (v_new ->> 'withdrawn')::boolean
                         then 'withdraw_gymnast' else 'reinstate_gymnast' end;
      end if;
    end if;
  end if;

  -- f. Insert.
  insert into public.comp_activity_log (
    actor_id, table_name, op, row_id, row_key, entry_id, event_id, site_id,
    action, changes, redacted, detail
  )
  values (
    (select p.id from public.profiles p where p.id = auth.uid()),
    tg_table_name,
    lower(tg_op),
    v_row_id,
    v_row_key,
    v_entry_id,
    v_event_id,
    v_site_id,
    v_action,
    v_changes,
    v_redacted,
    v_detail
  );

  return null;
end;
$$;

-- A trigger function can't be called directly and firing it doesn't check
-- EXECUTE; the revokes are there so it doesn't appear callable (the 0026
-- note).
revoke all on function public.comp_activity_log_write() from public;
revoke all on function public.comp_activity_log_write() from anon;
revoke all on function public.comp_activity_log_write() from authenticated;

create trigger comp_events_activity_log
after insert or update or delete on public.comp_events
for each row
execute function public.comp_activity_log_write();

create trigger comp_event_sites_activity_log
after insert or update or delete on public.comp_event_sites
for each row
execute function public.comp_activity_log_write();

create trigger comp_external_details_activity_log
after insert or update or delete on public.comp_external_details
for each row
execute function public.comp_activity_log_write();

create trigger comp_entries_activity_log
after insert or update or delete on public.comp_entries
for each row
execute function public.comp_activity_log_write();

create trigger comp_entry_fee_levels_activity_log
after insert or update or delete on public.comp_entry_fee_levels
for each row
execute function public.comp_activity_log_write();

create trigger comp_entry_extras_activity_log
after insert or update or delete on public.comp_entry_extras
for each row
execute function public.comp_activity_log_write();

create trigger comp_entry_gymnasts_activity_log
after insert or update or delete on public.comp_entry_gymnasts
for each row
execute function public.comp_activity_log_write();

create trigger comp_entry_gymnast_extras_activity_log
after insert or update or delete on public.comp_entry_gymnast_extras
for each row
execute function public.comp_activity_log_write();

create trigger comp_entry_staff_activity_log
after insert or update or delete on public.comp_entry_staff
for each row
execute function public.comp_activity_log_write();

-- ---------------------------------------------------------------------------
-- 6. comp_entry_remove_gymnast_data
-- ---------------------------------------------------------------------------
--
-- remove_comp_gymnast_data (global: RGM, HOG). The 0033 shape: caller
-- checks and row lock through comp_entry_for_action(), then stage and
-- preconditions, fixed messages. Allowed when:
--   * the entry is completed, declined or withdrawn;
--   * its data hasn't been removed already;
--   * the competition's end_date plus 12 months is on or before today
--     (Europe/London). 29 Feb + 12 months is 28 Feb.
-- The entry update comes first, so the logger's remove_gymnast_data line
-- counts the gymnasts (every row, withdrawn included) and then skips each
-- gymnast's blanking. Every value it writes to a free-text column is
-- redacted from the log. comp_entries_guard and the gymnast RLS don't
-- apply: this runs as its owner, postgres, which the guards trust.

create function public.comp_entry_remove_gymnast_data(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.comp_entries;
  v_end date;
begin
  v_entry := public.comp_entry_for_action(
    p_entry_id, 'remove_comp_gymnast_data', 'remove gymnast details', false);

  if v_entry.status not in ('completed', 'declined', 'withdrawn') then
    raise exception 'Gymnast details can only be removed from a completed, declined or withdrawn entry'
      using errcode = '55000';
  end if;

  if v_entry.data_removed_at is not null then
    raise exception 'Gymnast details have already been removed from this entry'
      using errcode = '55000';
  end if;

  select e.end_date into v_end
  from public.comp_events e
  where e.id = v_entry.event_id;

  if (v_end + interval '12 months')::date > (now() at time zone 'Europe/London')::date then
    raise exception 'Gymnast details can only be removed 12 months after the competition'
      using errcode = '55000';
  end if;

  update public.comp_entries
     set data_removed_by = auth.uid(),
         data_removed_at = now(),
         notes = null,
         decline_note = case when decline_note is null then null else '[removed]' end,
         withdrawal_note = case when withdrawal_note is null then null else '[removed]' end,
         updated_at = now()
   where id = v_entry.id;

  update public.comp_entry_gymnasts
     set full_name = null,
         dob = null,
         notes = null,
         withdrawn_note = null,
         updated_at = now()
   where entry_id = v_entry.id;
end;
$$;

revoke all on function public.comp_entry_remove_gymnast_data(uuid) from public;
revoke all on function public.comp_entry_remove_gymnast_data(uuid) from anon;
grant execute on function public.comp_entry_remove_gymnast_data(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Post-check: owners
-- ---------------------------------------------------------------------------
--
-- The logger must run as a role that can insert into the log and read
-- every logged table; the removal must run as a role the 0033 guards trust.
-- Both, and the log table, must be owned by a trusted role. Also confirms
-- the 9 triggers were created.

do $$
declare
  v_count int;
  v_bad text;
  v_triggers int;
begin
  select count(*),
         string_agg(p.proname || ' (' || pg_get_userbyid(p.proowner) || ')', ', ')
           filter (where pg_get_userbyid(p.proowner) not in ('postgres', 'supabase_admin', 'service_role'))
    into v_count, v_bad
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('comp_activity_log_write', 'comp_entry_remove_gymnast_data');

  if v_count <> 2 then
    raise exception
      '0035 aborted: expected 2 new functions, found %. Nothing has been applied.', v_count;
  end if;

  if v_bad is not null then
    raise exception
      '0035 aborted: these functions are not owned by a trusted role: %. Run this file as postgres. Nothing has been applied.',
      v_bad;
  end if;

  if (select pg_get_userbyid(c.relowner) from pg_class c
      where c.oid = 'public.comp_activity_log'::regclass)
     not in ('postgres', 'supabase_admin') then
    raise exception
      '0035 aborted: comp_activity_log is not owned by postgres. Run this file as postgres. Nothing has been applied.';
  end if;

  select count(*) into v_triggers
  from pg_trigger t
  where not t.tgisinternal
    and t.tgfoid = 'public.comp_activity_log_write()'::regprocedure;

  if v_triggers <> 9 then
    raise exception
      '0035 aborted: expected 9 activity log triggers, found %. Nothing has been applied.', v_triggers;
  end if;
end
$$;

commit;
