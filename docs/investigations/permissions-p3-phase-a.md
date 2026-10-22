# P3 Phase A: capability-helper design

I've read everything on the pre-read list, including all 25 migrations. I wrote no files and ran no SQL. `git status` still shows only `?? docs/`. The inventory's count of 66 policies matches what I get by replaying the migrations: 2 + 14 + 36 + 2 + 12.

## 1. Helper design

**Options compared**

| | Generic `has_capability(text)` | One function per capability (`can_manage_users()` …) |
|---|---|---|
| Matrix location | One CASE expression | Spread across 9+ bodies, unless they share one matrix (which is the generic design with wrappers) |
| Grant surface | 3 functions × 3 grant statements | 9+ functions × 3 grant statements, so more places to get a grant wrong |
| Typo in a policy | Returns false silently. This fails closed, but nothing warns you | Error when the migration is applied |
| New capability | One CASE arm | New function, plus grants |
| P4 app layer | One RPC for every UI check | One RPC per capability |

**Recommendation: use the generic shape.** The silent-typo risk is real, so the verification file will include a query that pulls every `has_capability('…')` literal out of `pg_policies` and `pg_proc` and fails if any name is not one of the 9 capabilities.

**Functions**
- **`title_has_capability(p_job_title text, p_cap text)`** holds the matrix and is its only copy.
  - It is a single `CASE p_cap WHEN … THEN p_job_title IN (…) ELSE false END`, wrapped in `coalesce(…, false)`, so unknown or null input returns false.
  - It is IMMUTABLE and reads no tables, so it is SECURITY INVOKER.
  - EXECUTE is revoked from `public`, `anon` and `authenticated`, so it is internal only. **This is a deliberate exception to "all helpers SECURITY DEFINER":** definer rights give nothing to a function that reads no tables. Keeping the matrix pure means it can be tested for all 6 titles without fake users.
- **`has_capability(p_cap text)`** returns true when the caller has an active profile and `title_has_capability(job_title, p_cap)` is true.
- **`has_site_capability(p_cap text, p_site_id uuid)`** returns true when all of these hold:
  - `p_site_id is not null`
  - `has_capability(p_cap)`
  - either `has_capability('all_sites_scope')` or the caller's `profiles.site` matches `rota_sites.name` for that `p_site_id`
- **The second argument is a `uuid`, not `p_site text` as the brief suggested.** Every gated table carries a `site_id`, never a site name, and the name join is the one that already exists inside the function.
- The two client-facing helpers are SECURITY DEFINER and STABLE, with `set search_path = ''` and every reference schema-qualified. That is stricter than the `= public` the earlier functions use.
- Grants on the two helpers:
  - EXECUTE is revoked from `public` **and `anon`**. Migration 0012 settled that both revokes are needed.
  - EXECUTE is granted to `authenticated`.
  - `service_role` keeps its Supabase default grant, as every other function in the project does. I can revoke that too if you want "authenticated only" to be literal.

## 2. Mapping table

**Shorthand used in the table**

- `act` = `is_active_coach()`
- `cap(x)` = `has_capability('x')`
- `scap(x)` = `has_site_capability('x', sid)`
- `own` = today's site-match `exists(…)` subquery, kept byte-identical.
- `sid` is the row's own `site_id` where the table has one. Otherwise it is a scalar subquery through the parent table:
  - `rota_weekly_rotas` for weekly roster/classes
  - `rota_restructures` for restructure roster/classes
  - `club_meetings` for attendees and cycle weeks
- On UPDATE policies, `using` and `with check` carry the same expression.

**Flags**

Expected:
- **E1:** Lead Coach gains manage_club_updates at own site
- **E2:** Head of People removed
- **E3:** inactive users lose every capability
- **E4:** admins whose job_title is not RGM/HoG/HoO lose admin rights

Not on your expected list, called out explicitly:
- **U1:** RGM, HoG and HoO with `role='coach'` **gain admin-equivalent reach**: every site, users, What's New, policies, club updates and club roles. The matrix implies this, but the expected list doesn't include it.
- **U2:** Club Head Coach **also** gains manage_club_updates at own site.
- **U3:** Club Head Coach gains manage_club_roles at own site (Staff Roles). This was admin-only until now.
- **U4:** manage_users holders, Jamie included, can no longer change their own job_title, site or active. This comes from guard rule 1.

**DEF** marks a row as UNMAPPED-DEFAULTED.

E3 is only marked where it actually changes behaviour. Every non-profiles policy and both RPCs already require `act`, which migration 0014 added.

**Policy renames.** I'm proposing renames so no remaining policy name says "admin":
- `*_select_admin_or_own_site` → `*_select_own_site_or_view_all`
- `*_can_edit_own_site` → `*_edit_rota_site` or `*_manage_meetings_site`
- `*_admin_only` → `*_<capability>`

### Profiles: 2

| # | Policy | Cmd | Current | New | Flags |
|---|---|---|---|---|---|
| 1 | profiles_select_own_or_admin | SELECT | `id = auth.uid() or is_admin()` | `id = auth.uid() or cap(manage_users)` | E3 (closes GAP-1), E4, U1 |
| 2 | profiles_update_admin_only | UPDATE | `is_admin()` / `is_admin()` | `cap(manage_users)` / `cap(manage_users)`, plus the trigger (§6) | E3, E4, U1, U4 |

### Site-scoped reads: 14

All 14 rows change the same way. The current condition is `act ∧ (is_admin() ∨ own)`. The new condition is `act ∧ (cap(view_all_sites) ∨ own)`. Flags on every row: E4, U1.

| # | Table | Policy (all SELECT) |
|---|---|---|
| 3 | rota_coaches | rota_coaches_select_admin_or_own_site |
| 4 | rota_standard_roster | rota_standard_roster_select_admin_or_own_site |
| 5 | rota_standard_classes | rota_standard_classes_select_admin_or_own_site |
| 6 | rota_weekly_rotas | rota_weekly_rotas_select_admin_or_own_site |
| 7 | rota_weekly_roster | rota_weekly_roster_select_admin_or_own_site |
| 8 | rota_weekly_classes | rota_weekly_classes_select_admin_or_own_site |
| 9 | rota_restructures | rota_restructures_select_admin_or_own_site |
| 10 | rota_restructure_roster | rota_restructure_roster_select_admin_or_own_site |
| 11 | rota_restructure_classes | rota_restructure_classes_select_admin_or_own_site |
| 12 | club_role_assignments | club_role_assignments_select_admin_or_own_site |
| 13 | club_updates | club_updates_select_admin_or_own_site |
| 14 | club_meetings | club_meetings_select_admin_or_own_site |
| 15 | club_meeting_attendees | club_meeting_attendees_select_admin_or_own_site |
| 16 | club_meeting_cycle_weeks | club_meeting_cycle_weeks_select_admin_or_own_site |

### Rota and meeting writes: 36

The current condition on every row is `act ∧ can_edit_rota() ∧ (is_admin() ∨ own)`. Flags on every row: E2, E4, U1.

- **Rows 17–43 (27 rows)** become `act ∧ scap(edit_rota)`.
- **Rows 44–52 (9 rows)** become `act ∧ scap(manage_club_meetings)`.

| # | Table | Policies (`_insert` / `_update` / `_delete` `_can_edit_own_site`) | sid |
|---|---|---|---|
| 17–19 | rota_coaches | 3 | `site_id` |
| 20–22 | rota_standard_roster | 3 | `site_id` |
| 23–25 | rota_standard_classes | 3 | `site_id` |
| 26–28 | rota_weekly_rotas | 3 | `site_id` |
| 29–31 | rota_weekly_roster | 3 | via `rota_weekly_rotas` |
| 32–34 | rota_weekly_classes | 3 | via `rota_weekly_rotas` |
| 35–37 | rota_restructures | 3 | `site_id` |
| 38–40 | rota_restructure_roster | 3 | via `rota_restructures` |
| 41–43 | rota_restructure_classes | 3 | via `rota_restructures` |
| 44–46 | club_meetings | 3 | `site_id` |
| 47–49 | club_meeting_attendees | 3 | via `club_meetings` |
| 50–52 | club_meeting_cycle_weeks | 3 | via `club_meetings` |

For club meetings, `manage_club_meetings` has the same titles as `edit_rota`, so the only effects are the flagged ones. Splitting it from `edit_rota` is the whole reason `can_edit_rota()` has to come out of these policies.

### Heroes and hero hours: 2

| # | Policy | Cmd | Current | New | Flags |
|---|---|---|---|---|---|
| 53 | heroes_all_admin_or_own_site | ALL | `act ∧ (is_admin() ∨ own)` | `act ∧ (cap(all_sites_scope) ∨ own)` | **DEF**, E4, U1 |
| 54 | hero_hours_all_admin_or_own_site | ALL | the same, through `heroes` | the same | **DEF**, E4, U1 |

These are `for all` policies, so cross-site access covers both reading and writing, and I used `all_sites_scope` for it. `view_all_sites` has the same titles, so the choice makes no difference today. Any active coach still reads and writes heroes at their own site, as today.

### Admin-only writes: 12

The current condition on every row is `act ∧ is_admin()`.

| # | Table | Policies (ins/upd/del) | New | Flags |
|---|---|---|---|---|
| 55–57 | club_role_assignments | `_*_admin_only` | `act ∧ scap(manage_club_roles)`, sid = `site_id` | E4, U1, U3 |
| 58–60 | club_updates | `_*_admin_only` | `act ∧ scap(manage_club_updates)`, sid = `site_id` | **E1**, E4, U1, U2 |
| 61–63 | policies | `policies_*_admin_only` | `act ∧ cap(manage_policies)` | E4, U1 |
| 64–66 | whats_new | `whats_new_*_admin_only` | `act ∧ cap(publish_whats_new)` | E4, U1 |

**Counts: 2 + 14 + 36 + 2 + 12 = 66.**

### RPCs: 2

| # | Function | Current checks, in order | New checks, same order and same error messages | Flags |
|---|---|---|---|---|
| R1 | upsert_weekly_rota | `act` → `can_edit_rota()` → `is_admin() or site match` | `act` → `cap(edit_rota)` → `has_site_capability('edit_rota', p_site_id)` | E2, E4, U1 |
| R2 | upsert_restructure | the same | the same | E2, E4, U1 |

Both function bodies are otherwise kept verbatim, and their three grant statements are restated.

### Interim gaps until P4

These aren't database rows, but they matter because the app still reads `role` until P4:

- **The service-role routes still trust `role`.** These are create-user, reset-password, and policies upload and delete. A demoted admin keeps them, a non-admin RGM can't use them, and **GAP-2 (an inactive admin can still create users or reset passwords) stays open.** P3 closes GAP-1 only.
- **The UI and the database will disagree.** Controls may be shown that the database refuses, or hidden when the database would allow them.
- **Run the inventory's §8 role/job_title query before applying.** If every `role='admin'` user is RGM, HoG or HoO and vice versa, the interim mismatch is empty.

## 3. Head Office

- After P3, Head Office users reach site data through two helpers:
  - **`has_capability('view_all_sites')`** for the 14 reads.
  - **`has_capability('all_sites_scope')`** for everything else, either inside `has_site_capability` (the 36 writes, 6 club-role and club-update writes, and both RPCs) or directly (heroes and hero_hours).
- **A full-access title (RGM, HoG or HoO) is required.** A Head Office user with any other title gets no site data, the same as a non-admin at Head Office today.
- **No Head Office path depends on a site row.** The own-site branch (`profiles.site = rota_sites.name`) is never true for Head Office, and the all-sites branch never reads `profiles.site`.
- Until P4, `resolveSiteAccess.ts` still decides from `role`, so a Head Office RGM with `role='coach'` gets database access before the site switcher shows anything.

## 4. `can_edit_rota()`

**Recommendation:** point all 36 policies and both RPCs directly at the capability helpers. Then redefine `can_edit_rota()`'s body as `select public.has_capability('edit_rota')`, a shim with no callers, to be dropped in P5.

- A wrapper can't serve the 12 meetings policies. They need `manage_club_meetings`, and the wrapper would give them `edit_rota`.
- With the direct approach, the "zero references" check comes out completely clean.
- Keeping the shim means any live-drift caller gets the new rules rather than the old `is_admin()` and Head of People list. Migrations 0005 and 0012 record changes made directly on the live database.
- No app code calls it over RPC; I checked with grep. `lib/rota/canEdit.ts` is untouched (that's P4).

## 5. Check constraint

**Yes, `job_title` already has a check constraint.** Migration 0001 declares it inline with all 7 titles, so its auto-generated name is probably `profiles_job_title_check`. `site` has one too.

The inventory's "1 check constraint" is the **`role`** one. Its search only counted objects that reference `role`.

**Proposal:**
1. A `DO` block finds every CHECK constraint on `public.profiles` whose `conkey` is exactly the `job_title` column and drops it. This doesn't rely on guessing the name.
2. Then add `constraint profiles_job_title_check check (job_title in ('Coach','Lead Coach','Club Head Coach','Regional General Manager','Head of Gymnastics','Head of Operations'))`. This is the last statement in the file.

The role constraint and default are not touched.

## 6. Self-edit guard and profiles policies

**Trigger:** `profiles_guard_privileged_columns`, BEFORE UPDATE, FOR EACH ROW.

- It only fires when `(job_title, site, active, role)` actually changes.
- **It covers `role` as well as the brief's three columns.** Until P4, `role` still unlocks the service-role routes, so letting someone set their own `role` would be an interim escalation path.
- Logic:
  1. If `current_user` is `postgres`, `service_role` or `supabase_admin`, allow the change. That covers you in the SQL or table editor and the server routes.
  2. If the row is the caller's own (`old.id = auth.uid()`), raise 42501.
  3. If the caller does not hold `has_capability('manage_users')`, raise 42501. This enforces rule 2 again, behind RLS.
- **The trigger function is SECURITY INVOKER.** A definer function would always see `current_user` as `postgres`, so the bypass would apply to everyone. It isn't a helper, and EXECUTE is revoked from `public` and `anon`.

**Policies** (shown in §2 rows 1–2):
- **SELECT:** a user reads their own row whether active or not, as 0014 deliberately left it, because `getCurrentProfile` has to read `active`. Reading other rows requires `manage_users`.
- **UPDATE:** `manage_users` only. Coaches still can't update their own row, which matches the build doc.
- **INSERT and DELETE:** there is still no INSERT or DELETE policy, so both stay denied. Users are only created server-side, through the service-role create-user route.

**Open question:** U3 gives Club Head Coaches Staff Roles write access, but the site-accounts picker (G13) reads `profiles`. They would only see themselves in it. I'd rather not widen profiles SELECT for this. My suggestion is a narrow security-definer RPC in P4, like `resolve_profile_names`.

## 7. Verification plan

These go into `docs/investigations/permissions-p3-verification.sql`.

**Helper matrix test**
- A single `DO` block runs against your own profile and always ends by raising an exception, so it rolls back by design.
- Inside it, it fakes your session's identity (`request.jwt.claims`) and works through each combination of:
  - all 6 job titles
  - active and inactive
  - site Burnley
- For each combination it checks every capability, and every site capability at Burnley (own site) and Coventry (another site), against an expected table.
- It also tries a self-edit as the `authenticated` role and expects the trigger to refuse it.
- **Pass looks like:** `ERROR: P3 check complete: 0 mismatches`.

**Read-only SQL checks**
- **No old references:**
  - 0 `pg_policies` rows referencing `is_admin` or `can_edit_rota`.
  - In `pg_proc` for `public`, only `is_admin` itself mentions `is_admin`, and only the shim mentions `can_edit_rota`.
- **No typo'd capabilities:** every capability literal used in policies or functions is one of the 9.
- **Policy counts per table:**

  | Tables | Policies |
  |---|---|
  | profiles | 2 |
  | 9 rota tables | 4 each = 36 |
  | 3 club-meeting tables | 4 each = 12 |
  | heroes, hero_hours | 1 each = 2 |
  | club_updates, club_role_assignments, policies, whats_new | 4 each = 16 |
  | **Total across these 20 tables** | **68** |

  The 68 is the 66 affected policies plus the two existing `*_select_authenticated` policies on `policies` and `whats_new`.
- **Function security settings** on the 4 new or changed functions and both RPCs:
  - `prosecdef`
  - `proconfig` includes the search path
  - `has_function_privilege` is false for `anon` and true for `authenticated`, except `title_has_capability`, which is false for both
- **Trigger** is present and enabled.
- **Constraints and defaults:**
  - The new `job_title` constraint definition is in place.
  - The `role` constraint and default are unchanged.
- The inventory's §8 count query, run again.

**Anon-key curl checks**

| Request | Expected result |
|---|---|
| GET and PATCH `profiles`; GET `club_updates` and `club_role_assignments` | `200 []`. RLS returns no rows. Anon's table grants on these were never revoked |
| POST `club_updates` and `club_role_assignments` | `401` with `42501`, a row-level security violation |
| Any request to `policies` or `whats_new` | `401` with `42501`, permission denied. Anon's grants were revoked in 0023 and 0025 |
| RPC calls to `has_capability`, `has_site_capability`, `upsert_weekly_rota`, `upsert_restructure` | `401` with `42501` |
| Optional, with a user's JWT | A coach's PATCH of their own `job_title` changes 0 rows. A full-access user's PATCH of their own `active` is refused by the trigger |

## 8. Hard stop: decisions for you

Please approve, or change, these before I write the migration:

1. **Helper shape.** Use the generic helpers. `has_site_capability` takes a site `uuid`, not site text. The matrix lives in an internal pure function.
2. **The unexpected changes U1–U4.** Confirm all four. U2 and U3 in particular aren't on your expected list.
3. **Heroes.** Rows 53–54 are UNMAPPED-DEFAULTED to cross-site for RGM, HoG and HoO only.
4. **The self-edit guard also covers `role`.**
5. **Policy rewrite method.** Drop and recreate each policy with a new capability-based name, inside the file's single transaction. The alternative is `ALTER POLICY` in place with the old names kept, which is what 0014 did.
6. **`can_edit_rota()`** stays as a shim with no callers until P5.
7. **Staff Roles picker for Club Head Coaches** (G13). I'd defer it to P4 rather than widen profiles SELECT now.

Nothing has been written. I'll wait for your approval before starting Phase B.
