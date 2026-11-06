# Staff Roles: Head Office staff assignable on every club (Phase 1 investigation)

Read-only investigation. No code, SQL or migrations were changed or run. Line numbers
refer to the working tree on 2026-11-06. `components/clubProfile/StaffRolesModal.tsx` has
uncommitted changes (the `useOptimistic` rework), and this report reads that version.

## Summary

- The picker list comes from a **security-definer RPC, `site_role_candidates(p_site_id)`**
  (0027). The site filter is inside that function's SQL. It is not in app code and not in
  an RLS policy. Head Office profiles can never match it, because Head Office has no
  `rota_sites` row.
- **A migration is needed** for the stated goal. Club Head Coaches can't read Head Office
  profiles at all, and no app-only change can fix that without widening `profiles` RLS.
- **The assignment table already accepts Head Office assignees.** The INSERT/DELETE
  policies check only the *caller's* rights at the row's `site_id`. Nothing checks the
  assignee's site. No policy, constraint or trigger on `club_role_assignments` needs to
  change.
- **Names already display.** `resolve_profile_names()` has no site restriction, so Head
  Office assignees resolve for everyone who can read the club's assignments, Coaches
  included.
- **The Head Office spelling is `'Head Office'`, and a CHECK constraint enforces it.**
  The active count **could not be confirmed** in this session because SQL was out of
  scope. A query for Jamie to run is in §5.

---

## 1. How the eligible-coach list is built today

**Loader:** `app/(protected)/club-profile/[siteSlug]/page.tsx:203-205`

```ts
const { data: siteAccounts } = canManageRoles
  ? await supabase.rpc("site_role_candidates", { p_site_id: site.id })
  : { data: [] as { id: string; full_name: string | null }[] };
```

- `canManageRoles = hasSiteCapability(capabilities, "manage_club_roles", site.id)`
  (`page.tsx:62`). This only decides whether to fetch. It is UI gating.
- The result is mapped to `{ id, name: full_name?.trim() || "Unnamed account" }`
  (`page.tsx:318-321`). It is passed through `ClubQuickLinks` (`ClubQuickLinks.tsx:118`)
  into `StaffRolesModal` as `siteAccounts`.
- In the modal, each role's dropdown is `siteAccounts` minus the people already on that
  role (`StaffRolesModal.tsx:186-187`). There is no other client-side filtering.

**The RPC:** `supabase/migrations/0027_capability_rpcs.sql:102-117`

```sql
create function public.site_role_candidates(p_site_id uuid)
returns table (id uuid, full_name text)
language sql
security definer
stable
set search_path = ''
as $$
  select p.id, p.full_name
  from public.profiles p
  join public.rota_sites s on s.name = p.site
  where s.id = p_site_id
    and p.active
    and public.has_site_capability('manage_club_roles', p_site_id)
  order by p.full_name;
$$;
```

Grants: revoked from `public` and `anon`, granted to `authenticated` (0027:119-121).

**Where the site filtering happens:** in the RPC body, through
`join rota_sites s on s.name = p.site where s.id = p_site_id`. The function is security
definer, so `profiles` RLS doesn't apply inside it. The only gate on the caller is
`has_site_capability('manage_club_roles', p_site_id)`.

The filters are:
- the profile's site name-matches the club;
- `p.active`;
- **no job-title filter.** Every active account at the site appears, unlike the rota's
  `site_rota_roster`.

The 0027 comment says this outright: *"Head Office profiles have no rota_sites row and so
never appear."*

## 2. Can each editing job title read Head Office profiles under RLS?

Staff-roles edit rights are `manage_club_roles` (0026 `title_has_capability`, lines
171-173). It is held by Club Head Coach (own site only), and by Regional General Manager,
Head of Gymnastics and Head of Operations (every site, through `all_sites_scope`).

The `profiles` SELECT policy is `0026_capability_helpers.sql:371-378`:

```sql
create policy "profiles_select_own_or_manage_users"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.has_capability('manage_users')
);
```

| Job title (active) | Edits staff roles at | Direct `profiles` read of Head Office rows | Via `site_role_candidates` |
|---|---|---|---|
| Club Head Coach | own site only | **No.** Only their own row. | No. The join excludes Head Office. |
| Regional General Manager | every site | **Yes**, through `manage_users` | No. The join excludes Head Office. |
| Head of Gymnastics | every site | **Yes**, through `manage_users` | No. The join excludes Head Office. |
| Head of Operations | every site | **Yes**, through `manage_users` | No. The join excludes Head Office. |
| Lead Coach, Coach | none | No | Empty set (fails the capability gate) |

Edge case: a Club Head Coach whose own `site` is `'Head Office'` matches no `rota_sites`
row. They therefore hold `manage_club_roles` nowhere, and `getSiteAccess()` sends them to
"profile-site-unmatched". This change doesn't affect that.

## 3. Assignment-table policies: is the assignee's site checked?

**No.** The current policies (0026, lines 1284-1313; the 0007 originals were dropped)
check only the caller, against the row's `site_id`:

```sql
create policy "club_role_assignments_insert_manage_club_roles"
on public.club_role_assignments
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.has_site_capability('manage_club_roles', club_role_assignments.site_id)
);

create policy "club_role_assignments_update_manage_club_roles"
on public.club_role_assignments
for update
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability('manage_club_roles', club_role_assignments.site_id)
)
with check (
  public.is_active_coach()
  and public.has_site_capability('manage_club_roles', club_role_assignments.site_id)
);

create policy "club_role_assignments_delete_manage_club_roles"
on public.club_role_assignments
for delete
to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability('manage_club_roles', club_role_assignments.site_id)
);
```

These are the table's other constraints (0007:49-57):
- `coach_id uuid not null references public.profiles (id) on delete cascade`. This is a
  plain FK with no site condition.
- `unique (club_role_id, site_id, coach_id)`. One Head Office person can therefore hold
  the same role at several clubs, which is what we want.
- **No triggers** on `club_role_assignments`. A search of the migrations found none.

**Conclusion:** the database already allows inserting a Head Office `coach_id` at any
club the caller manages. The picker is the only thing stopping it.

**Pre-existing, not caused by this change:** a Club Head Coach could insert *any* profile
uuid, from any site, if they obtained it, because nothing ties the assignee to the club.
This is a data-integrity gap, not a confidentiality one. Optional hardening is covered
in §7.

## 4. How assigned Head Office staff would display

Chip names come from `resolveProfileNames()` (`lib/clubProfile/names.ts`). It is called
once per page with every assignment `coach_id` (`page.tsx:192-195`) and goes to
`resolve_profile_names()`. Its current definition is
`0014_deactivated_accounts_and_site_name_unique.sql:776-794`:

```sql
create or replace function public.resolve_profile_names(profile_ids uuid[])
returns table (id uuid, full_name text)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.full_name
  from public.profiles p
  where p.id = any(profile_ids)
    and public.is_active_coach();
$$;

revoke execute on function public.resolve_profile_names(uuid[]) from public;
revoke execute on function public.resolve_profile_names(uuid[]) from anon;
grant execute on function public.resolve_profile_names(uuid[]) to authenticated;
```

- **Cross-site names work.** There is no site condition. Any active caller can resolve
  any profile id they pass. Head Office assignees therefore render by name.
- **The read-only view for Coaches works.** A Coach (or Lead Coach) at the club can read
  that club's assignment rows through `club_role_assignments_select_own_site_or_view_all`
  (0026:1268-1282), so they hold the ids and the names resolve. Nothing changes.
- **Inactive assignees still show.** `resolve_profile_names` doesn't filter on the
  *target's* `active`, and the chips carry no "(inactive)" or "(moved)" tag. That already
  applies to club staff, and it would apply the same way to Head Office staff.
- Side note: the function is wider than 0008's own comment suggests ("a coach can only
  resolve ids their own site's rows already gave them"). It is bounded only by which
  uuids a caller can obtain. This is pre-existing, and this change doesn't make it worse.

## 5. Head Office site string and active count

**Spelling:** `'Head Office'` is the only spelling, and the database enforces it.
- `profiles.site` has a CHECK constraint (`0001_init.sql:21-30`):
  `check (site in ('Burnley', …, 'Wolverhampton', 'Head Office'))`. Nothing in 0002-0030
  drops or alters it. 0026 and 0028 drop only the `job_title` and `role` check
  constraints.
- App mirror: `lib/profileOptions.ts:18-27` (`SITES`, which includes `"Head Office"`).
  `components/UsersTable.tsx:240` uses it as the Add-user default.
- No variants turned up anywhere in `app/`, `components/`, `lib/` or `supabase/`
  ("HQ", "Head office", "head_office", "HEAD_OFFICE" and similar). The task brief says
  `profiles.site` is free text. It isn't: it is constrained text, though not an FK. The
  "free text" comments in `lib/rota/resolveSiteAccess.ts:26-27` are stale, as
  `rota-retcon-p1-investigation.md` §1 already noted.

**Active count: NOT CONFIRMED.** Counting needs a database query, and this session
excluded SQL. No earlier investigation doc records a count. The only known row is the
0001 seed: one Head Office profile, "Jamie H", Head of Gymnastics. Jamie, please run
this in the SQL editor:

```sql
-- Spelling check: should return exactly one row, 'Head Office'
select site, count(*) as total, count(*) filter (where active) as active
from public.profiles
where site ilike '%head%' or site ilike '%office%' or site ilike 'hq%'
group by site;

-- Confirm the site CHECK constraint is still in place
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.profiles'::regclass and contype = 'c';

-- Active Head Office profiles, by job title (no names)
select job_title, count(*)
from public.profiles
where site = 'Head Office' and active
group by job_title order by job_title;
```

## 6. Other places that assume assignees belong to the club's own site

| Area | Uses `club_role_assignments`? | Affected? |
|---|---|---|
| Staff Hours (`sumWorkedMinutes`, `page.tsx:315`) | No. It comes from `rota_weekly_roster` | No |
| Attendance grid | No. It comes from the rota roster | No |
| Rota board, roster picker (`site_rota_roster`, 0029) | No. It is title-filtered and its join excludes Head Office | No |
| Meeting attendee picker (`site_rota_roster`) and labels (`site_rota_people`) | No | No, though Head Office staff stay unpickable for meetings (out of scope) |
| Counts of role holders | None exist. No code counts assignments | No |
| `StaffRolesModal.tsx:254-259` empty-state text | Shows "No active accounts are set to this site…" when `siteAccounts` is empty | **Wording.** It would rarely fire, and would read oddly if Head Office staff are present |
| `StaffRolesModal.tsx:236` "+ Add coach" and `:145` "That coach already holds this role." | n/a | **Wording.** Head Office staff aren't coaches. Optional |
| JSDoc and comments: `StaffRolesModal.tsx:62-64`, `page.tsx:197-202`, 0027 header | Describe the list as "active accounts at this site" | **Comments.** Need updating |
| Site moves and deactivation | Assignments persist when someone changes `site` or is deactivated. The FK cascades only on hard delete | Pre-existing. Equally true for Head Office staff |

Nothing else reads `club_role_assignments`. Repo-wide, the only readers are `page.tsx`
and `StaffRolesModal.tsx`.

## 7. Implementation options

### Option A: extend `site_role_candidates` to add Head Office (recommended)

Migration: drop and recreate `site_role_candidates(uuid)`. If an output column is added,
`create or replace` can't change a `returns table` signature, so it must be dropped and
recreated. Keep the same grants (revoke `public` and `anon`, grant `authenticated`).

The policy change in words:
- The function returns every active profile at the club, **plus every active profile
  whose `site` is exactly `'Head Office'`**.
- The existing gate, `has_site_capability('manage_club_roles', p_site_id)`, applies to
  both halves unchanged.
- The output is still `id` and `full_name`, plus one boolean (e.g. `is_head_office`) if
  the UI should group them (§8). No email, job title or site text.
- No RLS policy changes. `club_role_assignments` and `profiles` are untouched.

App: map the extra field in `page.tsx`, extend the `SiteAccount` type, and update
comments and wording.

- **Pros:** one RPC, one call, the gate is already proven. It works the same for Club
  Head Coaches and the full-access titles. It is the smallest change to the database's
  trust surface.
- **Cons:** needs a migration, and the function's documented contract changes.

### Option B: a separate `head_office_role_candidates(p_site_id)` RPC

Same gate and same output columns, returning only the Head Office profiles. The loader
calls both RPCs and merges the results.

- **Pros:** the existing function's contract is untouched. Easy to drop or roll back.
- **Cons:** a second RPC to maintain and grant, and a second round-trip per page load
  for editors. It also needs a migration anyway.

### Option C: app-only, a direct `profiles` select for `manage_users` holders

For RGM, Head of Gymnastics and Head of Operations, `select id, full_name from profiles
where site = 'Head Office' and active` already passes RLS.

- **Pros:** no migration.
- **Cons:** **doesn't meet the goal.** Club Head Coaches would get nothing, because RLS
  shows them only their own row. The picker would then differ by job title, which breaks
  "every club's Staff Roles". Not recommended.

### Rejected: widen the `profiles` SELECT policy

This would expose every column (email, job title, site, active) of Head Office rows to
Club Head Coaches. 0008 rejected the same approach for the same reason.

**Migration required: YES** (Option A or B).

### Ways this could widen access beyond the intent, and guards

1. **Club Head Coaches gain a list of active Head Office staff names.** That is the
   intended widening. Keep it to `id` and `full_name`. Don't return `job_title`, `email`
   or `site` text, even for labelling: use a boolean.
2. **Other clubs' staff must not leak.** Match Head Office with the literal
   `p.site = 'Head Office'`. Never use "any site other than mine", "`p_site_id` is null"
   or a missing-join fallback, which could pull in other clubs.
3. **Keep the `p_site_id` capability gate on the Head Office half.** Gating it on
   `has_capability('manage_club_roles')` alone would let a caller with a null or arbitrary
   `p_site_id` list Head Office staff. That is harmless today, but sloppy.
4. **Which Head Office accounts?** Today the list isn't title-filtered, so every active
   Head Office account would appear, including any account at Head Office with a
   coaching title. **Decision for Jamie:** all active Head Office accounts (consistent
   with how club staff are listed now), or only certain titles?
5. **Optional hardening, a separate decision:** add an assignee check to the INSERT and
   UPDATE `with check` clauses, so the assignee's `profiles.site` must be the club's site
   or `'Head Office'`. That closes the pre-existing gap in §3. It would need a
   security-definer helper, because the policy runs as a Club Head Coach who can't read
   other `profiles` rows. The trade-off is more policy surface for a gap that is
   integrity-only, so it isn't required for this feature.

## 8. Should Head Office staff be visually distinguished?

**Recommendation:**
- In the **dropdown**, use a native `<optgroup label="Head Office">` after the club's own
  people.
- Leave the **chips** unchanged.

**Trade-offs:**
- **Dropdown grouping** makes it obvious who is club staff and who isn't, which matters
  once a dozen or more extra names appear in every club's picker. A native `optgroup`
  adds no colours or styling, which fits CLAUDE.md's no-embellishment rule. It needs the
  boolean from §7. The cost is one more field through the RPC and the type.
- **A chip suffix** such as "Sam T (Head Office)" helps Coaches reading the roles
  understand why an unfamiliar name holds a club role. It also makes chips longer in a
  layout that was just tightened (see `staff-roles-add-coach-latency-and-width.md`), and
  it is a new visual element no one has asked for. Worth adding only if Jamie expects
  confusion at club level.
- **No distinction anywhere** is the simplest option, needs no extra field, and is fine
  if Head Office staff are few and well known. With duplicate or similar names it risks
  mis-picks.

---

## Exit criteria

- [x] Current eligible-coach query traced (§1)
- [x] RLS read access to Head Office profiles stated per editing job title (§2)
- [x] Assignment INSERT/DELETE policies quoted; no assignee-site rule exists (§3)
- [x] Name display for cross-site assignees checked (§4)
- [~] Head Office site string confirmed (`'Head Office'`, CHECK-enforced). **The active
  count is not confirmed and needs the §5 query**
- [x] Knock-on areas listed (§6)
- [x] Options with pros and cons. **Migration needed: yes** (§7)
- [x] HARD STOP. No code or SQL changes made. Awaiting Jamie's approval.

---

## Phase 2a — migration

**File:** `supabase/migrations/0031_staff_roles_head_office_candidates.sql`. It has not
been applied or committed. No other file in `supabase/migrations/` was changed.

### What it does

1. **`site_role_candidates(p_site_id)` is dropped and recreated.** It now returns the
   club's active profiles plus every active profile whose `site` is exactly
   `'Head Office'`. The columns are `id`, `full_name` and a new `is_head_office`
   boolean, with no other profile fields. The caller gate is still
   `has_site_capability('manage_club_roles', p_site_id)`, and it covers both halves.
   Security definer, `stable`, `search_path = ''` and `order by full_name` are all as
   in 0027. Grants: `revoke all` from `public` and `anon`, `execute` to
   `authenticated`.
   - One small tightening: `rota_sites` is joined on `p_site_id` first, so a uuid
     with no site row returns nothing, including no Head Office names. Before this,
     an all-sites holder passing a random uuid would have got the Head Office list
     (Phase 1 §7, guard 3).
2. **New helper `club_role_assignee_eligible(p_coach_id, p_site_id)`.** It returns
   true only if the profile is active and its site is either the club's site or
   `'Head Office'`, which is the same set the picker offers. Security definer,
   `stable`, `search_path = ''`; revoked from `public` and `anon`, granted to
   `authenticated`.
   - It also requires the caller to hold `manage_club_roles` at that site. Otherwise
     any signed-in user could call it through REST to test whether a uuid is an
     active account at a given site. With the check, it tells a caller nothing that
     `site_role_candidates` wouldn't already show them.
   - Nulls, unknown ids and unknown sites all return false.
3. **Policies.** The INSERT policy's `with check` and the UPDATE policy's `with check`
   each gain the helper as a third condition. `is_active_coach()` and the
   `has_site_capability` caller check stay exactly as 0026 wrote them. The UPDATE
   `using` clause, SELECT and DELETE are unchanged.
   - `alter policy` is used, which keeps the policy names and the `to authenticated`
     role.
   - The app never updates assignments, but the UPDATE check stops someone changing
     an existing row's `coach_id` or `site_id` to get around the INSERT rule.

**Existing rows are not re-checked.** Any current assignment that breaks the rule
(inactive assignee, or assignee at another club) stays readable and deletable. It
can't be UPDATEd until it is fixed. Run the pre-check below **before** applying to
see how many rows that is.

### Callers affected by the return-type change

| Caller | Effect |
|---|---|
| `app/(protected)/club-profile/[siteSlug]/page.tsx:203-205`: the only call, `supabase.rpc("site_role_candidates", …)` | **No break.** The result is cast to `{ id, full_name }[]` (`:205`, `:330`) and mapped to `{ id, name }`. The extra column is ignored. Head Office names appear in the picker right away, ungrouped, until Phase 2b reads `is_head_office`. |
| `components/clubProfile/StaffRolesModal.tsx`, `ClubQuickLinks.tsx` | Receive the mapped `SiteAccount[]`, not the raw RPC rows. No break. |
| SQL callers (functions, views, policies) | **None.** It is mentioned only in comments in 0027 and 0029. |
| Generated DB types | None in the repo. RPC results are untyped, so no type file needs regenerating. |

Phase 2b still needs to: add `is_head_office` to the cast and mapping in `page.tsx` and
to `SiteAccount`; add the `optgroup`; and update the comments at `page.tsx:197-202`,
`StaffRolesModal.tsx:62-64` and the empty-state text at `StaffRolesModal.tsx:254`.

### Pre-check: existing assignments that would violate the new rule (run before applying)

Run this as `postgres` in the SQL Editor. `coach_id` is NOT NULL with an FK, so the
inner joins drop nothing.

```sql
-- Exact count
select count(*) as violating_assignments
from public.club_role_assignments a
join public.rota_sites s on s.id = a.site_id
join public.profiles p on p.id = a.coach_id
where not (p.active and (p.site = s.name or p.site = 'Head Office'));

-- The rows themselves, with the reason
select a.id as assignment_id, s.name as club, r.name as role,
       p.full_name, p.site as assignee_site, p.active as assignee_active,
       case when not p.active then 'inactive assignee'
            else 'assignee at another club' end as reason
from public.club_role_assignments a
join public.rota_sites s on s.id = a.site_id
join public.club_roles r on r.id = a.club_role_id
join public.profiles p on p.id = a.coach_id
where not (p.active and (p.site = s.name or p.site = 'Head Office'))
order by s.name, r.name, p.full_name;
```

### Verification SQL (run after applying)

**V1. Function settings, return type and grants.** Run as `postgres`.

```sql
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       pg_get_function_result(p.oid) as returns,
       p.prosecdef as security_definer,
       p.provolatile as volatility,           -- 's' = stable
       p.proconfig as settings,               -- expect {search_path=""}
       has_function_privilege('anon',          p.oid, 'execute') as anon_exec,          -- false
       has_function_privilege('public',        p.oid, 'execute') as public_exec,        -- false
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec  -- true
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('site_role_candidates', 'club_role_assignee_eligible');
```

Expected: two rows, both `security_definer = true`, `volatility = s`,
`settings = {search_path=""}`, anon and public `false`, authenticated `true`. The
`site_role_candidates` returns column should read
`TABLE(id uuid, full_name text, is_head_office boolean)`.

**V2. Policies.**

```sql
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'club_role_assignments'
order by cmd;
```

Expected:
- INSERT and UPDATE `with_check` contain `is_active_coach()`,
  `has_site_capability('manage_club_roles', site_id)` and
  `club_role_assignee_eligible(coach_id, site_id)`.
- UPDATE `qual` (its USING clause), DELETE and SELECT are unchanged from 0026.

**Find the ids for V3 to V5.** Run as `postgres`.

```sql
select id, name from public.rota_sites order by sort_order;
select id, name from public.club_roles where active order by sort_order;
select id, full_name, job_title, site, active
from public.profiles
where active
  and (job_title in ('Coach', 'Club Head Coach') or site = 'Head Office')
order by site, job_title, full_name;
```

Choose these, then substitute them in the snippets:
- `<CLUB_SITE_ID>`: a club, e.g. Burnley.
- `<EDITOR_ID>`: an active **Club Head Coach at that club**. This is the case RLS
  limits most. If there isn't one, use an all-sites title (e.g. Jamie's own id).
- `<NON_EDITOR_ID>`: an active **Coach** at that club.
- `<OTHER_CHC_ID>`, optional: a Club Head Coach at a *different* club.
- `<OTHER_CLUB_PROFILE_ID>`: an active profile at a different club.
- `<HEAD_OFFICE_PROFILE_ID>`: an active Head Office profile.
- `<OWN_CLUB_PROFILE_ID>`: an active profile at the chosen club.
- `<ROLE_ID>`: a role that **neither** of the last two holds at that club, so the
  unique constraint doesn't fire.

Run each snippet **on its own**, because an expected error aborts the transaction.
Every snippet ends in `rollback`, so nothing is saved.

**V3. Editing caller sees club staff plus Head Office, with Head Office flagged.**

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', '<EDITOR_ID>', 'role', 'authenticated')::text, true);
set local role authenticated;
select auth.uid();  -- sanity: should equal <EDITOR_ID>
select * from public.site_role_candidates('<CLUB_SITE_ID>');
select count(*) filter (where is_head_office) as head_office_rows,
       count(*) filter (where not is_head_office) as club_rows
from public.site_role_candidates('<CLUB_SITE_ID>');
rollback;
```

Expected:
- Every active Head Office profile is listed with `is_head_office = true`.
- The club's active profiles are listed with `false`.
- No other club's profiles appear.
- `head_office_rows` matches the Phase 1 §5 active Head Office count.

**V4. Non-editing callers get nothing.** Run this once with `<NON_EDITOR_ID>`, and
again with `<OTHER_CHC_ID>` if you have one.

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', '<NON_EDITOR_ID>', 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) from public.site_role_candidates('<CLUB_SITE_ID>');                           -- 0
select public.club_role_assignee_eligible('<HEAD_OFFICE_PROFILE_ID>', '<CLUB_SITE_ID>');    -- false
rollback;
```

**V4b. A random site uuid returns nothing, even for an all-sites editor.**

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', '<EDITOR_ID>', 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) from public.site_role_candidates(gen_random_uuid());  -- 0
rollback;
```

**V5. Assignment inserts.** Run as `<EDITOR_ID>`, one snippet at a time.

```sql
-- V5a: assignee from a different club → REJECTED
-- expect: ERROR 42501 new row violates row-level security policy for table "club_role_assignments"
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', '<EDITOR_ID>', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.club_role_assignments (club_role_id, site_id, coach_id)
values ('<ROLE_ID>', '<CLUB_SITE_ID>', '<OTHER_CLUB_PROFILE_ID>');
rollback;
```

```sql
-- V5b: Head Office assignee → ACCEPTED (1 row), then rolled back
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', '<EDITOR_ID>', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.club_role_assignments (club_role_id, site_id, coach_id)
values ('<ROLE_ID>', '<CLUB_SITE_ID>', '<HEAD_OFFICE_PROFILE_ID>')
returning id;
rollback;
```

```sql
-- V5c (regression): own-club assignee → ACCEPTED (1 row), then rolled back
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', '<EDITOR_ID>', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.club_role_assignments (club_role_id, site_id, coach_id)
values ('<ROLE_ID>', '<CLUB_SITE_ID>', '<OWN_CLUB_PROFILE_ID>')
returning id;
rollback;
```

V5d, optional: repeat V5a with an **inactive** profile from the club or from Head
Office. It should be rejected with the same 42501 error.

**V6. anon cannot execute either function.**

```sql
begin;
set local role anon;
select * from public.site_role_candidates(gen_random_uuid());
-- expect: ERROR 42501 permission denied for function site_role_candidates
rollback;
```

```sql
begin;
set local role anon;
select public.club_role_assignee_eligible(gen_random_uuid(), gen_random_uuid());
-- expect: ERROR 42501 permission denied for function club_role_assignee_eligible
rollback;
```

### curl check (anon key, REST RPC endpoint)

With only the publishable key and no user JWT, PostgREST runs as `anon`. Both calls
should fail with a permission error: HTTP 401, body `"code":"42501"`,
`"message":"permission denied for function …"`. They should **not** return 200 and
`[]` or `false`.

```bash
curl -i -X POST \
  'https://wwizreekicrjqwwptdmx.supabase.co/rest/v1/rpc/site_role_candidates' \
  -H 'apikey: sb_publishable_m_sRPnqR2n6ScIealVT_Iw_QGLwu6y8' \
  -H 'Content-Type: application/json' \
  -d '{"p_site_id":"00000000-0000-0000-0000-000000000000"}'

curl -i -X POST \
  'https://wwizreekicrjqwwptdmx.supabase.co/rest/v1/rpc/club_role_assignee_eligible' \
  -H 'apikey: sb_publishable_m_sRPnqR2n6ScIealVT_Iw_QGLwu6y8' \
  -H 'Content-Type: application/json' \
  -d '{"p_coach_id":"00000000-0000-0000-0000-000000000000","p_site_id":"00000000-0000-0000-0000-000000000000"}'
```

### Rollback SQL (not a migration file)

This restores the 0027 function (signature, body and grants) and the 0026 INSERT and
UPDATE `with check` clauses, then drops the helper. The policies are altered first,
because the helper can't be dropped while a policy references it.

```sql
begin;

alter policy "club_role_assignments_insert_manage_club_roles"
on public.club_role_assignments
with check (
  public.is_active_coach()
  and public.has_site_capability('manage_club_roles', club_role_assignments.site_id)
);

alter policy "club_role_assignments_update_manage_club_roles"
on public.club_role_assignments
with check (
  public.is_active_coach()
  and public.has_site_capability('manage_club_roles', club_role_assignments.site_id)
);

drop function public.club_role_assignee_eligible(uuid, uuid);

drop function public.site_role_candidates(uuid);

create function public.site_role_candidates(p_site_id uuid)
returns table (id uuid, full_name text)
language sql
security definer
stable
set search_path = ''
as $$
  select p.id, p.full_name
  from public.profiles p
  join public.rota_sites s on s.name = p.site
  where s.id = p_site_id
    and p.active
    and public.has_site_capability('manage_club_roles', p_site_id)
  order by p.full_name;
$$;

revoke execute on function public.site_role_candidates(uuid) from public;
revoke execute on function public.site_role_candidates(uuid) from anon;
grant execute on function public.site_role_candidates(uuid) to authenticated;

commit;
```

Notes on rollback:
- Any Head Office assignments saved in the meantime **stay**. The old policies allow
  them, and the 0027 picker simply stops offering Head Office names. Delete them
  first if you want a clean revert.
- If Phase 2b has shipped, the app still works after rollback: `is_head_office` comes
  back `undefined`, and everyone lands in the club group.

### Phase 2a exit criteria

- [x] One new migration file, `0031`, next in sequence. Nothing else in
  `supabase/migrations/` changed
- [x] `site_role_candidates` is dropped and recreated with `is_head_office`. Gate,
  ordering, volatility, definer and `search_path` are preserved. `revoke all` from
  `public` and `anon`, `execute` to `authenticated`
- [x] The helper is security definer with `search_path = ''`, revoked from `public`
  and `anon`, and granted to `authenticated`
- [x] INSERT and UPDATE `with check` add the eligibility check (active, plus the
  club's site or Head Office). Both existing conditions are kept verbatim. DELETE,
  SELECT and UPDATE `using` are untouched
- [x] Callers affected by the return-type change are listed. None break
- [x] Pre-check, verification SQL, curl check and rollback SQL are written above
- [x] Not applied, not committed, not pushed
- [ ] **HARD STOP:** awaiting Jamie's review before applying

---

## Phase 2 (revised) — app-only

**Phase 2a (draft migration 0031) was abandoned.** It was never applied, and the file
has been deleted. Ignore the Phase 2a section above. Nothing under `supabase/` changes in
this phase. `site_role_candidates()` is unchanged, and so are the
`club_role_assignments` policies.

The approach is Option C from §7. Only full-access users (Regional General Manager,
Head of Gymnastics, Head of Operations) can add Head Office staff. They already read
every profile through `profiles_select_own_or_manage_users`, and the assignment INSERT
policy checks only the caller's rights at the club (§3). Club Head Coaches and Lead
Coaches see exactly what they saw before.

### What changed

**`app/(protected)/club-profile/[siteSlug]/page.tsx` (loader)**
- `canAddHeadOffice = canManageRoles && capabilities.caps.has("manage_users")`. This
  uses the existing `getCapabilities()` set. No job-title strings are compared, and
  `manage_users` is the capability that grants the RLS read this query depends on.
- When `canAddHeadOffice` is true: `supabase.from("profiles").select("id, full_name")
  .eq("site", "Head Office").eq("active", true).order("full_name")`. This runs on the
  user-session server client (`lib/supabaseServer`), so RLS applies. The secret key is
  not used.
- It runs in a `Promise.all` with the existing `site_role_candidates` call, which was
  already its own await. That adds no sequential round trip.
- Every other viewer skips the query and gets `[]`.
- A shared `toAccount` mapper (`full_name` trimmed, or "Unnamed account") feeds both
  lists. The comment now reads "add-staff picker".

**`components/clubProfile/ClubQuickLinks.tsx`.** This is a pass-through only: one new
`headOfficeAccounts: SiteAccount[]` prop, forwarded to the modal. The file is outside
the original allowed list, but Jamie approved it during the session because the loader
reaches the modal only through this file.

**`components/clubProfile/StaffRolesModal.tsx`**
- New prop `headOfficeAccounts: SiteAccount[]`.
- The dropdown lists the club's people first, then `<optgroup label="Head Office">`. The
  group renders only when at least one Head Office person is still available for that
  role, so it is never empty. Non-full-access viewers always get `[]`, so they never see
  it.
- Head Office order comes from the query's `order("full_name")`.
- Optimistic filtering: both lists filter on `assignedIds`, which comes from the
  `useOptimistic` groups. A just-added Head Office person leaves the list at once, and
  a removed one returns at once.
- The placeholder becomes "No one left to add" only when **both** lists are exhausted.
- `handleAdd` looks the id up in both lists.
- Labels and copy:
  - "+ Add coach" → "+ Add staff"
  - aria-label "Add a coach to …" → "Add staff to …"
  - The duplicate error now reads "That person already holds this role."
  - The bottom empty state now reads "No active staff accounts are set to this site…"
    and shows only when both lists are empty.
  - The component doc comment and `addCoachSelectClass` → `addStaffSelectClass` were
    updated to match.
- Kept from the latency/width fix:
  - `useOptimistic`
  - `.select("id")` zero-row checks on insert and delete
  - `router.refresh()` on success and on failure
  - per-role `writingRoles` disabling
  - the optimistic-chip ✕ disabled
  - `w-40` picker under the chips
- Chips are unchanged.

**Width (`w-40`):** "+ Add staff" is the same length as "+ Add coach", and "No one left
to add" is unchanged, so both still fit as they did after the width fix. The bottom
empty-state paragraph is not inside the select, so `w-40` doesn't constrain it. Long
names and the "Head Office" group label appear in the native dropdown list, which sizes
itself independently of the closed select.

### Checks
- `npx tsc --noEmit`: passes, no output.
- `npm run lint`: passes, no warnings or errors.
- `git status`: nothing under `supabase/` has changed.

### Manual test steps
1. **As Head of Gymnastics, on club A:** open Staff roles and click Edit roles. Each
   role's picker shows the club's people, then a "Head Office" group. Add a Head Office
   person to a role:
   - The chip appears at once.
   - That person leaves the role's picker at once.
   - The chip's ✕ enables after the refresh.

   Reload and check that the chip persists.
2. **Same user, club B:** the Head Office group appears there too. Add the **same** Head
   Office person to a role. This should be accepted, because the unique constraint is
   per club. Then remove them with ✕. The chip disappears and the person returns to the
   picker at once. Reload and check they stay removed. Clean up club A the same way.
3. **Exhaustion:** on a role, add every available Head Office person. The "Head Office"
   group disappears rather than showing empty. If the club's people are also all
   assigned, the placeholder reads "No one left to add" and the select is disabled.
4. **As a Club Head Coach at club A** (with a Head Office chip left in place from step
   1, or added again):
   - Edit roles shows no "Head Office" group.
   - The existing Head Office chip shows the person's name.
   - ✕ on that chip removes it (the delete policy checks only the caller's rights at
     the club).
5. **As a Coach at club A** (with a Head Office chip assigned): Staff roles is read-only,
   with no Edit button, and the Head Office chip shows the person's name.
