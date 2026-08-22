-- NWG Coaches Hub — Policies Library (phase 2, database only)
--
-- Adds the `policies` table (document metadata) and the private `policies`
-- Storage bucket (the document bytes). Nothing here touches application code;
-- the upload UI and the server-side signed-URL route are phase 3.
--
-- Naming: unprefixed `policies`, the same grouping convention as `mantras`
-- (0015) and `cycle_weeks` (0018) — a single club-wide table with no site
-- scoping, as opposed to the rota_* / club_* families. Note the mild collision
-- between the table name and the RLS policies named after it below
-- (`policies_select_authenticated` etc.); that follows from the
-- <table>_<command>_<gate> convention every other table here uses, and is
-- preferred over inventing a one-off naming scheme for this table alone.
--
-- ---------------------------------------------------------------------------
-- Access model
-- ---------------------------------------------------------------------------
--
-- Table:  select = is_active_coach()  (0014)
--         insert/update/delete = is_active_coach() and is_admin()  (0001/0014)
--
-- This is NOT the site-scoped shape used by the rota and club_* tables. A
-- policy document is club-wide — there is no site_id — so every active coach
-- reads every row, and there is no site match to AND in. The write shape is the
-- one 0014 settled on for club_updates and club_role_assignments: admin-only
-- writes are written as `is_active_coach() and is_admin()`, with
-- is_active_coach() as the OUTER conjunct so a deactivated admin is locked out
-- too. is_admin() is reused directly from 0001 rather than re-deriving an admin
-- check.
--
-- can_edit_rota() is deliberately NOT used. Publishing club policy is an admin
-- act, not a Lead-Coach-and-above act; the two gates are independent by design
-- (0013 spells out that job_title and role do not imply each other).
--
-- Storage:  no storage.objects policies at all.
--
-- This is the first Storage bucket in the project, so there is no existing
-- pattern to follow and the default chosen is the closed one. Supabase ships
-- storage.objects with RLS enabled and no permissive policies of its own, so a
-- bucket with no policies written against it is unreachable by both the anon
-- and the authenticated roles — no list, no download, no upload, no signed-URL
-- creation from the browser. `public = false` on the bucket row separately
-- closes the unauthenticated /object/public/ path.
--
-- That leaves the service role as the only way in, which is the intent: phase 3
-- mints short-lived signed URLs from a server-side route holding the secret
-- key, so the client never gets a durable handle on a document and the download
-- decision stays on the server where the caller's profile can be checked. Do
-- not "fix" a phase-3 403 by adding a storage.objects policy for authenticated
-- — that would hand every logged-in browser direct bucket access and bypass the
-- server check entirely.
--
-- ---------------------------------------------------------------------------
-- Column decisions
-- ---------------------------------------------------------------------------
--
-- tags — free-text text[], no check constraint, deliberately. 0021 locked
-- club_meetings.category to a fixed list, but that is not the precedent here:
-- category is exactly one value drawn from four agreed ones, whereas tags is an
-- open-ended, multi-valued label set with no vocabulary agreed in phase 1.
-- Constraining it now would either invent that vocabulary unilaterally or
-- freeze whatever the first upload happens to use. If a fixed tag list is
-- agreed later it can be added the same way 0021 added its constraint — as its
-- own migration, against a table whose rows can be checked first.
--
-- uploaded_by — nullable, `on delete set null`, matching club_updates.created_by
-- (0009). A document must survive the departure of the person who uploaded it;
-- cascade would delete club policy along with a leaver's profile row.
--
-- updated_at — no trigger. 0009 established there is no updated_at trigger
-- convention in this project: the column takes now() on insert and is set
-- explicitly by the writer on update.
--
-- file_path — the object key inside the `policies` bucket. No unique constraint:
-- one was considered (two rows sharing a key would mean deleting either row
-- orphans or double-claims the same object) but it is not in the agreed phase-2
-- spec, so it is left for phase 3 to decide once the upload path's key-naming
-- scheme is settled.
--
-- Additive only — no existing table, policy or function is modified. No seed
-- data. No down migration, matching every migration so far (0001–0022).

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.policies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  tags text[] not null default '{}',
  file_path text not null,
  file_size integer not null,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.policies is
  'Club-wide policy documents. Holds metadata only — the file itself lives in the private `policies` Storage bucket at file_path, reachable only through a server-side signed URL. Not site-scoped: every active coach reads every row.';

-- Every FK column gets its own single-column index — the convention 0007 set
-- and 0020/0022 followed.
create index on public.policies (uploaded_by);

-- No GIN index on tags. The library is expected to hold tens of rows, not
-- thousands, so a sequential scan with an array containment filter is cheaper
-- than maintaining the index; revisit if the row count ever justifies it.

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.policies enable row level security;

-- SELECT: any active coach, admin or not. Uses is_active_coach() (0014) so a
-- deactivated account with a still-valid JWT reads nothing.

create policy "policies_select_authenticated"
on public.policies
for select
to authenticated
using (
  public.is_active_coach()
);

-- INSERT / UPDATE / DELETE: admins only, and only active ones. Same shape as
-- club_updates_*_admin_only after 0014 — no site branch, is_active_coach() on
-- the outside so it also bites on a deactivated admin.

create policy "policies_insert_admin_only"
on public.policies
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.is_admin()
);

create policy "policies_update_admin_only"
on public.policies
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

create policy "policies_delete_admin_only"
on public.policies
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
-- table-level form of the same rule.
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
-- service_role's default-privilege grant is deliberately untouched — the
-- phase-3 signed-URL route reads this table with the secret key.

revoke all on table public.policies from public;
revoke all on table public.policies from anon;
grant select, insert, update, delete on table public.policies to authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket
-- ---------------------------------------------------------------------------
--
-- `public = false`: no unauthenticated /storage/v1/object/public/ access. The
-- bucket is created by row insert rather than by the JS/CLI client so that the
-- bucket's existence and its private flag are versioned in this repo alongside
-- the table, the same as any other schema object.
--
-- Deliberately NOT set here: file_size_limit and allowed_mime_types. Both are
-- real hardening levers and both should be set — but the accepted file types
-- and the size ceiling are phase-3 decisions (they have to agree with whatever
-- the upload UI validates client-side), and guessing them now would either
-- reject valid documents or advertise a limit the UI does not enforce.
--
-- No `create policy ... on storage.objects` follows, and none should be added
-- without a deliberate decision to change the access model above. Supabase
-- enables RLS on storage.objects and ships no permissive policy of its own, so
-- the absence of policies here is what keeps the bucket closed to every client
-- role. The bucket is reachable only by the service role.

insert into storage.buckets (id, name, public)
values ('policies', 'policies', false);
