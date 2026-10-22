# Permissions retcon — P1: `profiles.role` dependency inventory

Read-only investigation, 2026-10-22, against `main` @ `2702dd1`. Nothing in the
repo was modified apart from this file. No SQL was run, no supabase CLI, no git
writes. This replaces an earlier, uncommitted draft of the same file (2026-10-06).
No migration or app file has changed since that draft. Every finding below was
re-derived from source, not copied from it.

## 0. Scope notes and caveats

- **The DB-layer source of truth is the migration files**, `supabase/migrations/0001`–`0025`,
  replayed in order to get the *current effective* state. The live database was
  not queried. Migrations 0005 and 0012 both say statements were run live before
  being written to a file, so the live database may have drifted from the files.
  §8 includes an optional read-only `pg_policies` query to confirm the live state.
- **`PROMPT_CONVENTIONS.md` does not exist** in the repo, so it could not be pre-read.
- **The column is `profiles.active`, not `is_active`.** Every reference below uses
  the real name.
- **Classification key** for app-layer gates. Each gate is classified by the
  strongest control that backs it:
  - **RLS-enforced**: the database refuses the action even if the app check is bypassed.
  - **Server-enforced only**: a Next.js server check is the only barrier. This is
    usually because the action runs with the service-role key, which bypasses RLS.
  - **UI-only**: decides only what is shown. Nothing stands behind it.

---

## 1. Database layer: current effective objects referencing `role`, `'admin'` or `is_admin()`

### 1a. Counts

| Category | Count |
|---|---|
| Functions | **4** |
| RLS policies | **66** |
| Triggers | **0** |
| Views | **0** |
| Column defaults | **1** |
| Check constraints | **1** |
| **Total current DB objects** | **72** |
| Grant statements (all on `is_admin()`, all in 0014) | **3** |

The grep also found a literal `'Admin'` that is **not counted**. It is the
`club_role_categories` seed row `('Admin', 1)` in 0007. That is a club-duties
category name (Cash log, Emails, etc.), not a permission.

### 1b. Functions (4)

| # | Function | Defined | Superseded by | References | What it gates |
|---|---|---|---|---|---|
| F1 | `is_admin()` | 0001 | — (grants changed in 0014) | `profiles.role = 'admin'` for `auth.uid()`. SECURITY DEFINER, does **not** check `active` | Root admin check. Called by all 66 policies and by F2–F4 |
| F2 | `can_edit_rota()` | 0013 | — | `is_admin() or job_title in (6 titles)` (see §2) | Rota, restructure and club-meetings write rights |
| F3 | `upsert_weekly_rota(uuid, date)` | 0004 | 0013 (job_title gate), then **0014** (current: active gate) | `is_active_coach()`, then `can_edit_rota()`, then `is_admin() or site match` | Generate/regenerate a week. SECURITY DEFINER, so its own checks are the boundary |
| F4 | `upsert_restructure(uuid)` | 0016 | — | Same 3 checks as F3 | Generate/regenerate a site's Restructure. SECURITY DEFINER |

These functions do not reference role and are not counted: `is_active_coach()`
(0014) and `resolve_profile_names()` (0008, rewritten in 0014).

### 1c. RLS policies (66): current state by gate shape

Every policy is `to authenticated`. The "Defined → last altered" column gives the
migration that created the policy and the one that last changed its expression.

**Shape P: profiles (2). No `is_active_coach()`.**

| Policy | Table | Cmd | Expression | Defined → last altered |
|---|---|---|---|---|
| `profiles_select_own_or_admin` | profiles | SELECT | `id = auth.uid() or is_admin()` | 0001 → 0001 |
| `profiles_update_admin_only` | profiles | UPDATE | using/with check `is_admin()` | 0001 → 0001 |

**Shape S: site-scoped read (14).** The expression is `is_active_coach() and (is_admin() or <site match>)`.
The `is_admin()` branch gives cross-site read. Admins sit at Head Office, which
has no `rota_sites` row, so this branch is their only access path.

| Table | Policy | Defined → last altered |
|---|---|---|
| rota_coaches | `rota_coaches_select_admin_or_own_site` | 0013 → 0014 |
| rota_standard_roster | `rota_standard_roster_select_admin_or_own_site` | 0013 → 0014 |
| rota_standard_classes | `rota_standard_classes_select_admin_or_own_site` | 0013 → 0014 |
| rota_weekly_rotas | `rota_weekly_rotas_select_admin_or_own_site` | 0013 → 0014 |
| rota_weekly_roster | `rota_weekly_roster_select_admin_or_own_site` | 0013 → 0014 |
| rota_weekly_classes | `rota_weekly_classes_select_admin_or_own_site` | 0013 → 0014 |
| rota_restructures | `rota_restructures_select_admin_or_own_site` | 0016 |
| rota_restructure_roster | `rota_restructure_roster_select_admin_or_own_site` | 0016 |
| rota_restructure_classes | `rota_restructure_classes_select_admin_or_own_site` | 0016 |
| club_role_assignments | `club_role_assignments_select_admin_or_own_site` | 0007 → 0014 |
| club_updates | `club_updates_select_admin_or_own_site` | 0009 → 0014 |
| club_meetings | `club_meetings_select_admin_or_own_site` | 0020 |
| club_meeting_attendees | `club_meeting_attendees_select_admin_or_own_site` | 0022 |
| club_meeting_cycle_weeks | `club_meeting_cycle_weeks_select_admin_or_own_site` | 0022 |

**Shape W: job_title-gated site-scoped write (36).** The expression is
`is_active_coach() and can_edit_rota() and (is_admin() or <site match>)`.
`is_admin()` appears twice in each: inside `can_edit_rota()` and in the site branch.
Each table has `_insert_can_edit_own_site`, `_update_can_edit_own_site` and
`_delete_can_edit_own_site`.

| Tables (3 policies each) | Defined → last altered |
|---|---|
| rota_coaches, rota_standard_roster, rota_standard_classes, rota_weekly_rotas, rota_weekly_roster, rota_weekly_classes (18) | 0013 → 0014 |
| rota_restructures, rota_restructure_roster, rota_restructure_classes (9) | 0016 |
| club_meetings (3) | 0020 |
| club_meeting_attendees, club_meeting_cycle_weeks (6) | 0022 |

**Shape H: site-scoped read+write, no job_title gate (2).** The expression is
`is_active_coach() and (is_admin() or <site match>)`, `for all`.

| Policy | Table | Defined → last altered | Gates |
|---|---|---|---|
| `heroes_all_admin_or_own_site` | heroes | 0007 → 0014 | Any active coach at the site may read/write heroes. Admins may at every site |
| `hero_hours_all_admin_or_own_site` | hero_hours | 0007 → 0014 | Same, through `heroes` |

**Shape A: admin-only write (12).** The expression is `is_active_coach() and is_admin()`.

| Table | Policies | Defined → last altered | Gates |
|---|---|---|---|
| club_role_assignments | `_insert/_update/_delete_admin_only` | 0007 → 0014 | Assigning club duties (Staff Roles modal) |
| club_updates | `_insert/_update/_delete_admin_only` | 0009 → 0014 | Posting per-site club updates |
| policies | `policies_insert/_update/_delete_admin_only` | 0023 | Policy-library rows. Unused in practice: the app writes through service-role routes (§5) |
| whats_new | `whats_new_insert/_update/_delete_admin_only` | 0025 | Club-wide What's New announcements |

Total: 2 + 14 + 36 + 2 + 12 = **66**.

**Superseded or dropped objects (history only, not in the counts):**

- The 6 `*_all_admin_or_own_site` `for all` rota policies from 0002 were dropped
  in 0013 and replaced by the S and W policies above.
- The 8 policies on `club_meeting_cycle_entries` and `club_meeting_cycle_attendees`
  were created in 0020. Both tables were dropped in 0022, which dropped the policies with them.
- Earlier bodies of `upsert_weekly_rota` (0004, 0013) were replaced by 0014.

### 1d. Default, constraint, grants

| Object | Defined | Detail |
|---|---|---|
| Default | 0001 | `profiles.role default 'coach'` |
| Check constraint | 0001 | `profiles.role check (role in ('admin','coach'))`. The name is auto-generated (likely `profiles_role_check`) |
| Grants on `is_admin()` | 0014 (lines 812–814) | `revoke … from public`, `revoke … from anon`, `grant execute … to authenticated`. 0001 declared no grant |

Data, not schema: the 0001 seed `insert` writes `role = 'admin'` for jamie@….
No `supabase/seed.sql` exists (see §7).

---

## 2. Helpers that reference `job_title`

| Helper | Layer | Exact title list | Notes |
|---|---|---|---|
| `public.can_edit_rota()` (0013, unchanged since) | DB, SECURITY DEFINER | `'Lead Coach'`, `'Club Head Coach'`, `'Regional General Manager'`, `'Head of Gymnastics'`, `'Head of People'`, `'Head of Operations'`. Plus `is_admin()` OR'd in | Excludes only `'Coach'`. The list is explicit and fails closed for new titles. The folded-in `is_admin()` means an admin whose job_title is `Coach` still passes |
| `ROTA_EDIT_JOB_TITLES` / `resolveCanEdit()` / `getCanEditRota()`, in `lib/rota/canEdit.ts:13-54` | App (UI mirror) | The same 6 titles, same order. `resolveCanEdit` short-circuits `true` on `profile.role === "admin"` | UI only. The comment says it must stay in step with 0013 |

No other function, policy or app helper reads `job_title` for a decision. The
other `job_title` references are the 0001 check constraint, `lib/profileOptions.ts`
`JOB_TITLES` (dropdown and create-user validation), and `RoleBadge` (display only).

Objects gated by `can_edit_rota()`: **36 policies** (all of Shape W) and **2
functions** (`upsert_weekly_rota`, `upsert_restructure`).

---

## 3. `profiles` UPDATE / INSERT policies and self-escalation

Exact current state. 0001 created these, and no later migration altered them;
0014 explicitly left `profiles` out of scope.

```sql
create policy "profiles_select_own_or_admin"
on public.profiles for select to authenticated
using ( id = auth.uid() or public.is_admin() );

create policy "profiles_update_admin_only"
on public.profiles for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- INSERT: no policy  → denied to anon/authenticated (RLS default-deny)
-- DELETE: no policy  → denied to anon/authenticated
```

**Can a signed-in non-admin update their own row via REST (anon key + their JWT)?**

| Column | Answer |
|---|---|
| `role` | **No** |
| `job_title` | **No** |
| `site` | **No** |
| `active` | **No** |

The only UPDATE policy requires `is_admin()`. For a coach, `is_admin()` reads
their own row and returns false, so a `PATCH /rest/v1/profiles?id=eq.<self>`
matches zero rows. PostgREST returns success with an empty result, not an error.
They also cannot INSERT a row, because there is no policy. No trigger or function
copies `auth.users` metadata into `profiles`, so `auth.updateUser()` cannot reach
these columns either.

**The exception is a deactivated admin (`role='admin'`, `active=false`). The answer is Yes for all four columns.**
Neither profiles policy checks `is_active_coach()`, and `is_admin()` ignores
`active`. 0014 notes that deactivation does not revoke the password. A
deactivated admin can therefore sign in, PATCH their own row back to
`active = true`, and read or edit every profile. This is listed as gap **GAP-1**
in §10.

Any *active* admin can change any row's `role`, `job_title`, `site` and `active`,
including their own. That is the intended design.

---

## 4. App layer: every `role` / `'admin'` / `isAdmin` dependency

Searched repo-wide (app, components, lib, proxy.ts) for: `role`, `'admin'`,
`"admin"`, `isAdmin`, `requireAdmin`, `requireActiveAdmin`, `is_admin`,
`profile.role`, `createAdminClient`, `SUPABASE_SECRET_KEY`. False positives were
excluded: club-role (duties) code, ARIA `role=` attributes, and the
`RoleBadge` component name (it renders `job_title`).

### 4a. Role-read decision sites (10)

These are the places where `role === "admin"` is actually evaluated.

| # | File:line | Function / component | Feeds |
|---|---|---|---|
| R1 | `lib/admin-guard.ts:27` | `requireAdmin()` | G5, G6 |
| R2 | `lib/admin-guard.ts:101` | `requireActiveAdmin()` | G7, G8 |
| R3 | `app/(protected)/admin/page.tsx:7` | `AdminPage` redirect | G2 |
| R4 | `app/(protected)/admin/users/page.tsx:9` | `UsersPage` redirect | G3 |
| R5 | `app/(protected)/layout.tsx:35` | `ProtectedLayout` → `NavBar isAdmin` | G1 |
| R6 | `app/(protected)/club-profile/[siteSlug]/page.tsx:55` | `ClubProfileSitePage` → `isAdmin` | G11, G12, G13 |
| R7 | `app/(protected)/people/policies/page.tsx:13` | `PoliciesPage` → `PoliciesLibrary isAdmin` | G9 |
| R8 | `app/(protected)/whats-new/page.tsx:30` | `WhatsNewPage` → `WhatsNewFeed isAdmin` | G10 |
| R9 | `lib/rota/canEdit.ts:38` | `resolveCanEdit()` admin short-circuit | G14 |
| R10 | `lib/rota/resolveSiteAccess.ts:44` | `resolveSiteAccess()` admin → all sites | G15 |

### 4b. Permission gates (15) with classification

| # | Gate | Where | What it gates | Backing control | Class |
|---|---|---|---|---|---|
| G1 | Admin nav dropdown | `components/NavBar.tsx:307` (via R5) | Shows the Admin → Users menu | None. Destination pages gate themselves | **UI-only** |
| G2 | `/admin` landing redirect | `app/(protected)/admin/page.tsx:7` | Viewing a page that contains only a link | None, and there is nothing to protect | **UI-only** |
| G3 | `/admin/users` redirect + listing | `app/(protected)/admin/users/page.tsx:9,14-17` | Listing all profiles | `profiles_select_own_or_admin`. A non-admin would get only their own row | **RLS-enforced** |
| G4 | Users table edit / deactivate | `components/UsersTable.tsx:57-79` (browser client `.update()` on profiles) | Changing name, role, job_title, site, active | `profiles_update_admin_only` | **RLS-enforced** |
| G5 | Create user | `app/api/admin/create-user/route.ts:7` (R1) | Creating auth user + profiles row with any role/job_title/site | `requireAdmin()` only. Service-role client bypasses RLS | **Server-enforced only** |
| G6 | Reset password | `app/api/admin/reset-password/route.ts:6` (R1) | Setting any user's password | `requireAdmin()` only. Service role | **Server-enforced only** |
| G7 | Upload/replace policy doc | `app/api/policies/upload/route.ts:28` (R2) | Policies table + storage writes | `requireActiveAdmin()` only. Service role, and the bucket has no storage policies | **Server-enforced only** |
| G8 | Delete policy doc | `app/api/policies/delete/route.ts:13` (R2) | Policies row + object delete | `requireActiveAdmin()` only. Service role | **Server-enforced only** |
| G9 | Policies Library admin buttons | `components/PoliciesLibrary.tsx:255,315,349,368` (R7) | Rendering upload/replace/delete controls | The routes they call (G7/G8) | **Server-enforced only** |
| G10 | What's New create/edit/delete | `components/WhatsNewFeed.tsx:269,289,314,395` (R8) | Browser-client writes to `whats_new` | `whats_new_*_admin_only` | **RLS-enforced** |
| G11 | Club updates create/edit/delete | `components/clubProfile/ClubUpdates.tsx:188,208,233,278` (R6) | Browser-client writes to `club_updates` | `club_updates_*_admin_only` | **RLS-enforced** |
| G12 | Staff roles edit mode | `components/clubProfile/StaffRolesModal.tsx:89` (R6, passed through `ClubQuickLinks.tsx:116`) | Browser-client writes to `club_role_assignments` | `club_role_assignments_*_admin_only` | **RLS-enforced** |
| G13 | Site-accounts fetch for the Staff Roles picker | `app/(protected)/club-profile/[siteSlug]/page.tsx:187-194` (R6) | Reading other profiles at the site | `profiles_select_own_or_admin` | **RLS-enforced** |
| G14 | Rota/meetings `canEdit` | `lib/rota/canEdit.ts:38` (R9). Consumed by rota pages (`rota/[siteSlug]`, `/week/[weekStartDate]`, `/restructure`), `RotaBoard`, `WeeklyRotaBoard`, `RestructureBoard`, `*Empty` generate buttons, `ClubMeetings` / `ManageMeetingsModal` | Rota, restructure and meetings write controls, plus generate-week/restructure RPC buttons | Shape W policies + `can_edit_rota()` inside F3/F4 | **RLS-enforced** |
| G15 | Cross-site access | `lib/rota/resolveSiteAccess.ts:44` (R10) via `getSiteAccess()`. Used by `layout.tsx` (Club Profile nav sites), `/rota`, `/rota/[siteSlug]/*`, `/club-profile`, `/club-profile/[siteSlug]` | Which sites appear in switchers and can be opened | `is_admin()` branch of the Shape S/W/H policies. `rota_sites` names themselves are readable by everyone | **RLS-enforced** |

**Totals: 15 gates. 8 are RLS-enforced (G3, G4, G10–G15), 5 are server-enforced
only (G5–G9), and 2 are UI-only (G1, G2).**

### 4c. Non-gate `role` references (data plumbing that reads or writes the column)

| File:line | What |
|---|---|
| `lib/getCurrentProfile.ts:15` | `select("full_name, job_title, site, role, active")` |
| `lib/admin-guard.ts:23,54,70,82` | Selects `role`. `ActiveProfileResult.role` type and return |
| `lib/profileOptions.ts:4-5` | `ROLES = ["admin","coach"]`, `type Role` |
| `lib/rota/canEdit.ts:22` | `EditProfile = { role; job_title }` |
| `lib/rota/resolveSiteAccess.ts:20` | `AccessProfile = { role; site }` |
| `lib/rota/siteAccess.ts:25` | Passes `profile.role` into `resolveSiteAccess` |
| `app/(protected)/admin/users/page.tsx:16` | Selects `role` for the table |
| `components/UsersTable.tsx:5,19,51,71,84,137,149,200,208,222,257-261,324,328,338,359-363` | Role column, add/edit `<select>` from `ROLES`, default `"coach"`, sent in update/create payloads |
| `app/api/admin/create-user/route.ts:4,13,15,19-21,48` | Requires `role`, validates it against `ROLES`, inserts it |

---

## 5. Routes using `SUPABASE_SECRET_KEY` (service role, bypasses RLS)

`createAdminClient()` (`lib/supabaseAdmin.ts`) is the only reader of
`SUPABASE_SECRET_KEY`. It is imported by exactly **5** route handlers. There are
**no** server actions that use it: `app/login/actions.ts` uses the anon/RLS client.

| Route | Guard | Checks role? | Checks `active` (is_active_coach equivalent)? | Service-role use |
|---|---|---|---|---|
| `POST /api/admin/create-user` | `requireAdmin()` | Yes | **No** | `auth.admin.createUser` + `profiles.insert` (any role) |
| `POST /api/admin/reset-password` | `requireAdmin()` | Yes | **No** | `auth.admin.updateUserById` (any `user_id`) |
| `POST /api/policies/upload` | `requireActiveAdmin()` | Yes | Yes | `policies` select/insert/update + storage upload/remove |
| `POST /api/policies/delete` | `requireActiveAdmin()` | Yes | Yes | `policies` select/delete + storage remove |
| `POST /api/policies/signed-url` | `requireActiveCoach()` | No (any active user) | Yes, and the row read goes through the RLS client, so `policies_select_authenticated` re-checks `is_active_coach()` | `storage.createSignedUrl` only |

**Totals: 5 routes. 3 check `active` and 2 do not (create-user, reset-password).**

---

## 6. Users admin page: how `role` and `job_title` are created and edited

| Action | UI | Path | Who can call it (effective) |
|---|---|---|---|
| View list | `/admin/users` (redirects non-admins to `/`) | Server RLS client `select` on profiles | Anyone whose `is_admin()` is true. RLS returns only their own row to others |
| **Create** (sets `role` + `job_title` + `site`) | "Add user" modal (`UsersTable.tsx` AddUserModal). Role dropdown defaults to `coach` | `POST /api/admin/create-user`. Validated against `ROLES`, `JOB_TITLES`, `SITES`, then service-role insert | Any session whose profile has `role='admin'`, **active or not** |
| **Edit** `full_name`, `role`, `job_title`, `site` | Edit modal → `handleEditSave` (`UsersTable.tsx:71`) | **Browser** Supabase client `.from("profiles").update(...)`. No API route and no app-side validation; the DB check constraints enforce the value lists | Anyone passing `profiles_update_admin_only`, i.e. `is_admin()`, **active or not** |
| **Deactivate / reactivate** (`active`) | Row action → `handleToggleActive` (`UsersTable.tsx:57`) | Browser client `.update({ active })` | Same as Edit |
| **Reset password** | Row action → modal | `POST /api/admin/reset-password` (service role) | Any `role='admin'` session, **active or not**. Any target `user_id`, including other admins |

There is no app-level guard against removing the last admin or demoting oneself.
Once P3/P4 land, editing `job_title` *is* granting permissions, so the "Edit" row
becomes a privilege-assignment path in its own right.

---

## 7. What else breaks if `profiles.role` is dropped

**Database (most severe).** `is_admin()` is `language sql` without `BEGIN ATOMIC`,
so Postgres records no dependency on `profiles.role`. `alter table … drop column
role` will therefore **succeed**, and then every call to `is_admin()` will error at
runtime. That takes down all 66 policies and F2–F4, so every site-scoped read and
write fails with an error rather than failing open. P5 must come after every
`is_admin()` caller has been migrated. The default and the check constraint drop
automatically with the column.

**App files that reference `role` directly (14).** These would fail to
type-check, or would silently treat everyone as a non-admin:
`lib/getCurrentProfile.ts`, `lib/admin-guard.ts`, `lib/profileOptions.ts`,
`lib/rota/canEdit.ts`, `lib/rota/resolveSiteAccess.ts`, `lib/rota/siteAccess.ts`,
`app/(protected)/layout.tsx`, `app/(protected)/admin/page.tsx`,
`app/(protected)/admin/users/page.tsx`, `app/(protected)/club-profile/[siteSlug]/page.tsx`,
`app/(protected)/people/policies/page.tsx`, `app/(protected)/whats-new/page.tsx`,
`app/api/admin/create-user/route.ts`, `components/UsersTable.tsx`.

**Indirect dependents (10)** don't read `role` themselves:
- 4 routes break through `lib/admin-guard.ts`, whose guards all `select role`:
  `api/admin/reset-password`, `api/policies/upload`, `api/policies/delete` and
  `api/policies/signed-url`.
- 6 components take an `isAdmin` prop that needs re-sourcing:
  `components/NavBar.tsx`, `components/PoliciesLibrary.tsx`,
  `components/WhatsNewFeed.tsx`, `components/clubProfile/ClubUpdates.tsx`,
  `components/clubProfile/StaffRolesModal.tsx` and
  `components/clubProfile/ClubQuickLinks.tsx`.

**TypeScript / generated types:** there are **no generated DB types**: no
`database.types.ts`, and supabase-js is used untyped. The hand-written types are
`Role`/`ROLES` (`lib/profileOptions.ts`), `Profile` (`UsersTable.tsx:15`),
`EditProfile` (`canEdit.ts:22`), `AccessProfile` (`resolveSiteAccess.ts:20`) and
`ActiveProfileResult` (`admin-guard.ts:53`).

**Seed files:** `supabase/config.toml` `[db.seed]` points at `./seed.sql`, which
**does not exist**. The only seed is the insert inside `0001_init.sql`. It writes
`role`, but because it is historical it is unaffected by a later drop.

**Tests:** **none exist.** There are no test files and no test script in
`package.json`, although the comments in `canEdit.ts` and `resolveSiteAccess.ts`
say they are written to be testable.

**Docs that describe `role` as the permission field:**
- `CLAUDE.md`: lines 23–24 (Users admin-only), 65 (Admin nav gated on
  `profiles.role === 'admin'`), 188 (`role` column row), 194–196 ("`role` alone
  controls that"), 209–210 (seed SQL with `role`), and 230 (no-demo-toggle rule).
  Line 230 still applies, but it is worded around role.
- `nwg-coaches-hub-v1-build-doc.md`: lines 8, 34, 65, 71, 82, 91–93, 110 and 113.
- Migration comments in 0007, 0009, 0013, 0014, 0023 and 0025 explain gates in
  terms of `is_admin()`/role. These are historical and not breaking.
- `reference/dashboard.html` is a static mockup with a `btnAdmin` preview toggle.
  It is not runtime and not breaking, but it will be stale.

---

## 8. SQL for Jamie to paste (written, NOT executed)

Counts of profiles grouped by role, job_title and active:

```sql
select
  role,
  job_title,
  active,
  count(*) as profiles
from public.profiles
group by role, job_title, active
order by role, job_title, active desc;
```

Optional, read-only: confirm that the live policy set matches §1. This query
should return 66 rows.

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and (coalesce(qual, '') ilike '%is_admin%' or coalesce(with_check, '') ilike '%is_admin%')
order by tablename, cmd, policyname;
```

---

## 9. Proposed capability names (names only, no title assignments)

Derived from what is actually gated today:

| Capability | Replaces today's gate |
|---|---|
| `manage_users` | Users page listing, create user, edit and deactivate profiles (G3–G5). Profiles select/update `is_admin()` |
| `reset_passwords` | `/api/admin/reset-password` (G6) |
| `assign_permissions` | Editing another user's `job_title`. Once titles drive capabilities, this becomes privilege assignment and may warrant separating from `manage_users` |
| `view_all_sites` | `is_admin()` branch of the 14 Shape S + 2 Shape H read paths, and `resolveSiteAccess` (G15) |
| `edit_all_sites` | `is_admin()` site branch of Shape W/H writes and of F3/F4's site check |
| `edit_rota` | `can_edit_rota()` on rota and restructure tables, plus F3/F4 (G14) |
| `manage_club_meetings` | Currently also `can_edit_rota()` (club_meetings, attendees, cycle weeks) |
| `manage_club_updates` | `club_updates_*_admin_only` (G11) |
| `manage_club_roles` | `club_role_assignments_*_admin_only` (G12, G13) |
| `publish_whats_new` | `whats_new_*_admin_only` (G10) |
| `manage_policies` | `/api/policies/upload` + `/delete`, and `policies_*_admin_only` (G7–G9) |

`is_active_coach()` stays as the base "is a live Hub user" gate and is not a capability.

**Note for P2:** admins sit at `Head Office`, which has no `rota_sites` row. Their
entire cross-site reach comes from `is_admin()`. If `view_all_sites` /
`edit_all_sites` are not granted to the right titles, Head Office users will
lose all rota and Club Profile access.

---

## 10. GAPS

### GAP-1: deactivated admins are not locked out of `profiles` (RLS) [high]
`profiles_select_own_or_admin` and `profiles_update_admin_only` call `is_admin()`
without `is_active_coach()`, and `is_admin()` ignores `active`. A deactivated
admin whose password still works can sign in, PATCH their own row back to
`active = true`, change any user's role/job_title/site, and read every profile.
This is the one place 0014's "deactivation bites on admins too" rule was not applied.

### GAP-2: secret-key routes without an active check [high]
`POST /api/admin/create-user` and `POST /api/admin/reset-password` use
`requireAdmin()`, which checks `role` but **not** `active`. `lib/admin-guard.ts:38-46`
records this as known and unfixed. A deactivated admin with a valid session can
create new admin accounts and reset any user's password, so they can fully
re-enter the system. Both run with the service role, so no database control
stands behind them.

### GAP-3: reset-password has no target restriction [medium, design]
Any admin can reset any `user_id`, including other admins. The route also does not
check that the target is a Hub profile. Under a capability model, `reset_passwords`
would let its holder take over accounts with more capabilities than their own.
P2 should decide whether it is scoped.

### GAP-4: UI-only gates [low, cosmetic]
- G1: the Admin nav dropdown (`components/NavBar.tsx:307`).
- G2: the `/admin` landing redirect (`app/(protected)/admin/page.tsx:7`).

Neither protects any data. Both destinations either contain nothing or are backed
by RLS/server gates. They are listed because the brief asks for every UI-only gate.

**Checked and not a gap:** every role-based UI control that fronts a write
(G9–G12, G14) is backed by RLS or by a server route. No case was found where
hiding the control is the only protection.

**Gap total: 4.** That is 2 high (GAP-1, GAP-2), 1 medium (GAP-3) and 1 low
(GAP-4). GAP-4 covers both UI-only gates.
