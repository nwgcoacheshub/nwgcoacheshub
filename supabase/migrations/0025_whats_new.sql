-- NWG Coaches Hub — What's New (phase 2, database only)
--
-- Adds the `whats_new` table: the club-wide announcement feed that currently
-- renders as hardcoded placeholder markup in the dashboard sidebar. Nothing here
-- touches application code — wiring the sidebar to this table, and any admin
-- authoring UI, is a later phase.
--
-- Naming: unprefixed `whats_new`, the same grouping convention as `mantras`
-- (0015), `cycle_weeks` (0018) and `policies` (0023) — a single club-wide table
-- with no site scoping, as opposed to the rota_* / club_* families. As in 0023,
-- the RLS policies below are named `<table>_<command>_<gate>`
-- (`whats_new_select_authenticated` etc.), the convention every other table here
-- uses.
--
-- ---------------------------------------------------------------------------
-- Access model
-- ---------------------------------------------------------------------------
--
-- Table:  select = is_active_coach()  (0014)
--         insert/update/delete = is_active_coach() and is_admin()  (0001/0014)
--
-- Identical to `policies` (0023), and for the same reasons. An announcement is
-- club-wide — there is no site_id — so every active coach reads every row, and
-- there is no site match to AND in. The write shape is the one 0014 settled on
-- for club_updates and club_role_assignments: admin-only writes are written as
-- `is_active_coach() and is_admin()`, with is_active_coach() as the OUTER
-- conjunct so a deactivated admin is locked out too.
--
-- can_edit_rota() is deliberately NOT used, on 0023's reasoning: publishing a
-- club-wide announcement is an admin act, not a Lead-Coach-and-above act, and
-- 0013 spells out that job_title and role do not imply each other.
--
-- Note this is a different table from club_updates (0009), despite the similar
-- shape. club_updates is site-scoped — coaches read their own site's updates.
-- whats_new is the club-wide feed with no site branch, which is why it is a new
-- table rather than a nullable site_id bolted onto that one.
--
-- ---------------------------------------------------------------------------
-- Column decisions
-- ---------------------------------------------------------------------------
--
-- published_at — separate from created_at, and the column the feed orders by.
-- created_at records when the row was written; published_at is the date the
-- announcement is presented as carrying, so a backdated or pre-written item
-- sorts where it belongs rather than where it was typed. Defaults to now(), so
-- the common case needs no thought at the call site.
--
-- link_url / link_label — both nullable. An announcement does not have to point
-- anywhere. Not constrained to require each other: no check constraint is added
-- here because the pairing rule (label without url, url without label) is a
-- presentation decision for the phase that builds the authoring UI, and 0023's
-- precedent on `tags` is to leave an unagreed rule out of the schema rather than
-- invent it unilaterally.
--
-- created_by — nullable, `on delete set null`, matching club_updates.created_by
-- (0009) and policies.uploaded_by (0023). An announcement must survive the
-- departure of the person who wrote it; cascade would delete club content along
-- with a leaver's profile row, and the Postgres default (no action) would instead
-- block the profile delete outright.
--
-- updated_at — no trigger. 0009 established there is no updated_at trigger
-- convention in this project, and 0023 restates it: the column takes now() on
-- insert and is set explicitly by the writer on update. Confirmed against 0023
-- before writing this — no trigger there, so none invented here.
--
-- Additive only — no existing table, policy or function is modified. No seed
-- data. No down migration, matching every migration so far (0001–0024).

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.whats_new (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  link_url text,
  link_label text,
  published_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.whats_new is
  'Club-wide What''s New announcements shown in the dashboard sidebar. Not site-scoped: every active coach reads every row. Ordered by published_at, which is the date the item claims, not the date the row was written.';

-- Every FK column gets its own single-column index — the convention 0007 set and
-- 0020/0022/0023 followed.
create index on public.whats_new (created_by);

-- No index on published_at. The feed is expected to hold tens of rows and the
-- sidebar reads the newest handful, so a sequential scan and sort is cheaper
-- than maintaining the index; revisit if the row count ever justifies it. Same
-- call 0023 made about a GIN index on tags.

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.whats_new enable row level security;

-- SELECT: any active coach, admin or not. Uses is_active_coach() (0014) so a
-- deactivated account with a still-valid JWT reads nothing.

create policy "whats_new_select_authenticated"
on public.whats_new
for select
to authenticated
using (
  public.is_active_coach()
);

-- INSERT / UPDATE / DELETE: admins only, and only active ones. Same shape as
-- policies_*_admin_only (0023) and club_updates_*_admin_only after 0014 — no
-- site branch, is_active_coach() on the outside so it also bites on a
-- deactivated admin.

create policy "whats_new_insert_admin_only"
on public.whats_new
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.is_admin()
);

create policy "whats_new_update_admin_only"
on public.whats_new
for update
to authenticated
using (
  public.is_active_coach()
  and public.is_admin()
)
with check (
  public.is_active_coach()
  and public.is_admin()
);

create policy "whats_new_delete_admin_only"
on public.whats_new
for delete
to authenticated
using (
  public.is_active_coach()
  and public.is_admin()
);

-- ---------------------------------------------------------------------------
-- Grants — the anon revoke
-- ---------------------------------------------------------------------------
--
-- 0010/0011/0012 and the 0013–0014 audit established the rule for functions:
-- both revokes, then an explicit grant, because a public-schema object is
-- reachable by anon down two independent paths (Postgres's default grant to
-- PUBLIC, and Supabase's `alter default privileges in schema public grant all
-- on ... to anon`), and closing either alone leaves the other open. This is the
-- table-level form of the same rule, as applied in 0023.
--
-- Every policy above is `to authenticated`, so anon already matches no policy
-- and RLS denies it — but that is one control, expressed in one place. Revoking
-- the grant means an anon request is refused at the privilege layer with 42501
-- before RLS is consulted at all, so a future policy accidentally written
-- without a `to` clause (which defaults to PUBLIC, and would therefore include
-- anon) cannot silently open the table.
--
-- The revoke from PUBLIC is a no-op today: Supabase's default privileges name
-- anon/authenticated/service_role explicitly and Postgres grants nothing on new
-- tables to PUBLIC. It is stated anyway so the grant state is declared here
-- rather than resting on that remaining true.
--
-- service_role's default-privilege grant is deliberately untouched.

revoke all on table public.whats_new from public;
revoke all on table public.whats_new from anon;
grant select, insert, update, delete on table public.whats_new to authenticated;
