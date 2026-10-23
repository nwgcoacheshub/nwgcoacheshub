# Rota Retcon — Phase 1 investigation

Replacing `rota_coaches` with `profiles`. Read-only investigation: no migrations, no
code changes, nothing run against the database. Everything below comes from reading
`supabase/migrations/0001–0028`, `app/(protected)/rota/**`, `components/rota/**`,
`lib/rota/**`, the club-profile pages that share `rota_coaches`, and the Users admin.

Counts are from the migration files as the current end state (0026 policy rewrite, 0028
grants). They have **not** been checked against the live database — the diagnostic SQL
in section 6 includes a check for that.

## Headline findings (read these first)

1. **`profiles.site` is not free text.** `0001_init.sql` gives it a `CHECK (site in
   (Burnley, Coventry, Leeds, Mansfield, Rotherham, Wirral, Wolverhampton, Head Office))`.
   Nothing in 0002–0028 drops or changes it. The Users admin uses a dropdown, and
   create-user also validates server-side. The comments in `resolveSiteAccess.ts` and
   0002 ("free text, not a foreign key") are stale — it is a constrained text column,
   just not an FK. The only value that can never match `rota_sites.name` is
   **`Head Office`** (no `rota_sites` row).
2. **`club_meeting_attendees.coach_id` also references `rota_coaches.id`** (0022). It is
   not `rota_`-prefixed, so it is easy to miss. Dropping `rota_coaches` fails until it is
   re-pointed, and its rows (meeting attendee lists) would need wiping too — this is
   beyond "rota data" as briefed. **Decision needed.**
3. **A coach cannot read other people's `profiles` rows.** `profiles_select_own_or_manage_users`
   (0026) lets non-`manage_users` users read only their own row. Lead Coaches / Club Head
   Coaches (who hold `edit_rota`) need to see their site's coaches, so a plain
   `from("profiles")` on the rota pages would return nothing for them. The replacement
   needs either a new SECURITY DEFINER RPC (like `resolve_profile_names`, 0008/0014) or a
   new site-scoped select policy on `profiles`. This is new work, not a re-point.
4. **Head Office and all-sites staff won't appear on any rota** if the roster is driven by
   `profiles.site`. Regional GM / Head of Gymnastics / Head of Operations can be filed
   under any site or Head Office; Head Office has no `rota_sites` row.
5. **`rota_coaches.profile_id` is unused by the app.** Added in 0007, never read or
   written by any app code (checked: zero references outside migrations). So no linkage
   data exists to migrate, which fits the "wipe everything" plan.
6. **Both RPCs never name `rota_coaches`.** `upsert_weekly_rota` and `upsert_restructure`
   only copy `coach_id` values from `rota_standard_*` into the weekly/restructure tables,
   so they keep working after the FK is re-pointed. They only need editing if we want
   them to validate coaches.

---

## 1. `rota_` tables

12 tables. 3 reference, 9 data (`rota_coaches` is the directory; 8 hold rota data).
Total RLS policies: **39** (3 reference × 1 + 9 × 4).
All tables: `revoke all ... from public, anon` (0028). RLS enabled on all.

Common policy shape after 0026: `is_active_coach()` AND (`has_capability('view_all_sites')`
OR the caller's `profiles.site = rota_sites.name` for the row's site) for SELECT;
`is_active_coach()` AND `has_site_capability('edit_rota', site_id)` for INSERT / UPDATE /
DELETE. Child tables reach `site_id` through their parent.

### Reference data (keep)

| Table | Columns | PK | FKs | Unique | Policies |
|---|---|---|---|---|---|
| `rota_sites` | id uuid, name text, slug text, sort_order smallint, active bool, created_at | `id` | — | `slug` (0002), `name` (`rota_sites_name_key`, 0014) | **1** — `rota_sites_select_authenticated` (select; any authenticated user with a profiles row) |
| `rota_categories` | key text, label, color_hex, sort_order, active | `key` | — | — | **1** — `rota_categories_select_authenticated` |
| `rota_class_catalogue` | id, title, category_key, default_meta, default_duration_mins, active, sort_order, created_at | `id` | `category_key → rota_categories.key` | — | **1** — `rota_class_catalogue_select_authenticated` |

(0014 explicitly left these three out of the `is_active_coach()` change.)

### Coach directory (to be dropped)

| Table | Columns | PK | FKs | Unique / indexes | Policies |
|---|---|---|---|---|---|
| `rota_coaches` | id uuid, site_id uuid, name text, active bool, created_at, **profile_id uuid** (0007) | `id` | `site_id → rota_sites.id` (cascade); `profile_id → profiles.id` (set null) | index on `site_id`; partial unique `one_rota_coach_per_profile_per_site (site_id, profile_id) where profile_id is not null` | **4** — `rota_coaches_select_own_site_or_view_all`, `_insert_edit_rota_site`, `_update_edit_rota_site`, `_delete_edit_rota_site` |

### Rota data (to be wiped)

| Table | Columns | PK | FKs | Unique / indexes | Policies |
|---|---|---|---|---|---|
| `rota_standard_roster` | id, site_id, day_of_week (0–6), coach_id, sort_order, shift_start_mins, shift_end_mins, is_key_holder, is_lead, is_cashing_up, status (0003) | `id` | `site_id → rota_sites` (cascade); `coach_id → rota_coaches` (cascade) | `(site_id, day_of_week, coach_id)`; partial unique `one_cashup_per_standard_day`, `one_lead_per_standard_day` | **4** (`_select_own_site_or_view_all`, `_insert/_update/_delete_edit_rota_site`) |
| `rota_standard_classes` | id, site_id, day_of_week, coach_id, set_coach_id, class_catalogue_id, title, category_key, meta, start_mins, duration_mins, created_at, updated_at | `id` | `site_id → rota_sites` (cascade); `coach_id → rota_coaches` (cascade); `set_coach_id → rota_coaches` (set null); `class_catalogue_id → rota_class_catalogue` (set null); `category_key → rota_categories` | index `(site_id, day_of_week)` | **4** |
| `rota_weekly_rotas` | id, site_id, week_start_date, generated_at, generated_by | `id` | `site_id → rota_sites` (cascade); `generated_by → auth.users` | `(site_id, week_start_date)` | **4** |
| `rota_weekly_roster` | same shape as standard roster but `weekly_rota_id` instead of `site_id`; `status` check | `id` | `weekly_rota_id → rota_weekly_rotas` (cascade); `coach_id → rota_coaches` (cascade) | `(weekly_rota_id, day_of_week, coach_id)`; partial unique `one_cashup_per_week_day`, `one_lead_per_week_day` | **4** (via parent `site_id`) |
| `rota_weekly_classes` | as standard classes with `weekly_rota_id` | `id` | `weekly_rota_id → rota_weekly_rotas` (cascade); `coach_id → rota_coaches` (cascade); `set_coach_id → rota_coaches` (set null); catalogue / category as above | index `(weekly_rota_id, day_of_week)` | **4** |
| `rota_restructures` | id, site_id, generated_at, generated_by | `id` | `site_id → rota_sites` (cascade); `generated_by → auth.users` | `(site_id)` — one per site | **4** |
| `rota_restructure_roster` | as weekly roster with `restructure_id` | `id` | `restructure_id → rota_restructures` (cascade); `coach_id → rota_coaches` (cascade) | `(restructure_id, day_of_week, coach_id)`; partial unique `one_cashup_per_restructure_day`, `one_lead_per_restructure_day` | **4** |
| `rota_restructure_classes` | as weekly classes with `restructure_id` | `id` | `restructure_id → rota_restructures` (cascade); `coach_id`, `set_coach_id → rota_coaches`; catalogue / category | index `(restructure_id, day_of_week)` | **4** |

Unique constraints on `(…, coach_id)` and the partial lead/cash-up indexes survive a
re-point unchanged — they only care about the value, not what it references.

---

## 2. References to `rota_coaches.id`

### Columns — 10 FK columns (9 on `rota_` tables, 1 elsewhere)

| # | Column | On delete |
|---|---|---|
| 1 | `rota_standard_roster.coach_id` | cascade |
| 2 | `rota_standard_classes.coach_id` | cascade |
| 3 | `rota_standard_classes.set_coach_id` | set null |
| 4 | `rota_weekly_roster.coach_id` | cascade |
| 5 | `rota_weekly_classes.coach_id` | cascade |
| 6 | `rota_weekly_classes.set_coach_id` | set null |
| 7 | `rota_restructure_roster.coach_id` | cascade |
| 8 | `rota_restructure_classes.coach_id` | cascade |
| 9 | `rota_restructure_classes.set_coach_id` | set null |
| 10 | **`club_meeting_attendees.coach_id`** (0022) — not `rota_`-prefixed | cascade |

`club_meeting_cycle_attendees` (0020) also referenced it but was dropped in 0022.
`club_role_assignments.coach_id` and `hero_hours.logged_by_coach_id` already point at
`profiles.id` (0007) — they are not affected.

### Functions / RPCs

| Function | Reads/writes `rota_coaches`? | Notes |
|---|---|---|
| `upsert_weekly_rota(uuid, date)` (current: 0026 §4b) | **No, not by name.** Copies `coach_id` / `set_coach_id` from `rota_standard_roster` / `rota_standard_classes` into the weekly tables | Works unchanged after a re-point. |
| `upsert_restructure(uuid)` (current: 0026 §4b) | **No, not by name.** Same copy pattern | As above. |
| `has_site_capability`, `has_capability`, `is_active_coach`, `resolve_profile_names` | No | Only touch `profiles` / `rota_sites`. |

No function in the migrations reads or writes `rota_coaches` directly. Its only
database-side users are its own 4 policies, the 9+1 FKs above, and the 0028
`revoke all` on it.

---

## 3. Repo-wide search for `rota_coaches`

Excluding `node_modules`, `.next`, `.git`: **101** line matches across **22** files.

| Area | Files | Notes |
|---|---|---|
| Application code (`app/`, `components/`, `lib/`) | **9** | detail below |
| Migrations | 9 | 0002, 0007, 0013, 0014, 0016, 0020, 0022, 0026, 0028 |
| `docs/investigations/` | 4 | `permissions-p3-phase-a.md`, `permissions-p3-verification.sql`, `permissions-p5-verification.sql`, `permissions-role-inventory.md` |

**Application code: 9 files, 17 matching lines — 8 executable query call sites, 9
comment-only.**

Executable call sites (`.from("rota_coaches")`) — **8 call sites in 5 files**:

| File | Line | Operation |
|---|---|---|
| `app/(protected)/rota/[siteSlug]/page.tsx` | 57 | select `id, name, active` where `site_id`, order name |
| `app/(protected)/rota/[siteSlug]/week/[weekStartDate]/page.tsx` | 131 | same select |
| `app/(protected)/rota/[siteSlug]/restructure/page.tsx` | 97 | same select |
| `app/(protected)/club-profile/[siteSlug]/page.tsx` | 93 | select `id, name` where `site_id` (no active filter) |
| `components/rota/RotaBoard.tsx` | 590 | insert (create coach from the day picker) |
| `components/rota/RotaBoard.tsx` | 626 | insert (`addCoach`, Manage coaches modal) |
| `components/rota/RotaBoard.tsx` | 650 | update name (`renameCoach`) |
| `components/rota/RotaBoard.tsx` | 669 | update `active=false` (`deactivateCoach`) |

Comment-only mentions (4 files, no query): `components/clubProfile/ManageMeetingsModal.tsx:222`,
`components/clubProfile/StaffRolesModal.tsx:25`, `lib/rota/rotaDataSource.ts:9`,
`lib/clubProfile/names.ts:13`, plus comments inside the 5 files above.

Files that **read coach fields** (`id`, `name`, `active`) without naming the table —
they consume the `Coach` / `RosterCoach` shape the pages produce, so they are affected by
any change to that shape: `components/rota/RotaBoard.tsx` (defines `Coach`),
`StandardRotaView.tsx`, `WeeklyRotaBoard.tsx`, `RestructureBoard.tsx`,
`ManageCoachesModal.tsx`, `RotaExportButton.tsx`, `RotaExportLayout.tsx`,
`lib/rota/exportLayout.ts`, `lib/clubProfile/attendance.ts`, `lib/clubProfile/meetings.ts`,
`components/clubProfile/ClubMeetings.tsx`, `AttendanceGrid.tsx`, `StaffHoursModal.tsx`,
`ManageMeetingsModal.tsx`. If the new coach object keeps `{ id, name, active }` these
need no edits.

---

## 4. How a coach's site is determined today, and how `profiles.site` is set

**On the rota.** A coach's site is `rota_coaches.site_id`, chosen by whoever adds them
(the board's `siteId` is inserted with the row, `RotaBoard.tsx:590,626`). It is
independent of `profiles.site`. Every rota page filters with `.eq("site_id", site.id)`.
Roster / class rows then point at that coach row. The database does **not** check that a
roster row's coach belongs to the roster's site — there is no composite FK, so that
consistency is application-only.

**Which sites a user sees** (`lib/rota/resolveSiteAccess.ts`, `siteAccess.ts`):
- `view_all_sites` holder → every active `rota_sites` row, with a site switcher.
- everyone else → only the `rota_sites` row whose `name === profiles.site`. A Head
  Office profile (or any unmatched value) gets `RotaUnavailable` (`profile-site-unmatched`).
- Edit rights at a site: `hasSiteCapability(caps, "edit_rota", site.id)`; the database
  mirrors it in `has_site_capability()` (name join on `profiles.site = rota_sites.name`).

**How `profiles.site` is set / validated in the Users admin:**
- **Dropdown, not free text.** `components/UsersTable.tsx` renders `<select>`s over
  `SITES` from `lib/profileOptions.ts` (the 7 sites + "Head Office") in both the Add
  modal (default "Head Office", line 240) and the Edit modal (lines 345–400).
- **Create** goes through `app/api/admin/create-user/route.ts`: `requireCapability("manage_users")`,
  then `SITES.includes(site)` → 400 "Invalid site." otherwise, then inserts the profile.
- **Edit** updates `profiles` directly from the browser client (`UsersTable.tsx:93`); it
  is limited by RLS plus the `profiles_guard_privileged_columns` trigger (no self-edits;
  only active `manage_users` may change `site`) and by the DB `CHECK` from 0001. There is
  no server-side `SITES` check on this path — the DB constraint is the backstop.
- `lib/profileOptions.ts` header says the list "must stay in sync" with the `site`
  check constraint in `0001_init.sql`.
- Deactivation sets `profiles.active = false` only. It does **not** touch any
  `rota_coaches` row today.

---

## 5. How the coach list is rendered and filtered

**Data load (all three views).** The Standard, Weekly (`week/[weekStartDate]`) and
Restructure pages each run the same query: `rota_coaches` for the site, **all rows
(active and inactive), ordered by name**, passed to the board as `initialCoaches`. The
roster and class queries are separate (`rota_standard_*` by `site_id`,
`rota_weekly_*` by `weekly_rota_id`, `rota_restructure_*` by `restructure_id`).

**Board (`RotaBoard.tsx`, shared by all three views).**
- **Columns are driven by roster rows, not the coach list.** For each day,
  `rosterByDay` takes that day's roster rows sorted by coach name; each row becomes a
  column (widened for overlapping classes). The coach list is just a lookup
  (`coachById`), including deactivated coaches, so historical rows still show a name;
  missing → `"Unknown coach"`.
- **"+ coach" picker (per day):** `activeCoaches` (active only, alphabetical) minus
  coaches already on that day (`coachPickerAvailable`). Also has a free-text "New coach
  name" box that creates a `rota_coaches` row inline.
- **Class modal:** "Coach column" = coaches rostered that day; **"Set coach" lists all
  coaches including inactive** (`coaches.map`, not `activeCoaches`) — a small
  inconsistency with the picker.
- **Manage coaches modal** (add / rename / deactivate): Standard view only
  (`canManageCoaches` is set by `StandardRotaView` only) and only when `canEdit`. Lists
  `activeCoaches`; the deactivate confirmation reads which days the coach is on.
- Weekly and Restructure boards pass no `canManageCoaches`, but can still create a coach
  from the day picker; that coach is inserted at the site and appears in all views.

**PDF exports (Standard, Weekly, Restructure — same `RotaExportButton`).**
`RotaExportButton` receives the board's live `coaches`, `roster`, `classes`.
`planExport()` (`lib/rota/exportLayout.ts`) builds each day's columns from roster rows
sorted by coach name (same as the board); names resolve from the full coach list
(inactive included, "Unknown coach" fallback). `coachNameById` is also used to label a
card's set coach (cover). Nothing in the export filters by site or active — whatever is
on the board is exported. The three views differ only in header text (Weekly passes a
`week`, Standard/Restructure pass `undated` labels).

**Club Profile (shares the table).** `club-profile/[siteSlug]/page.tsx` loads
`rota_coaches` for the site (no active filter) to name the attendance grid
(`buildAttendanceRows`), staff hours, and meeting attendees. `ManageMeetingsModal`'s
attendee picker lists every coach row for the site with no active filter, and writes
`club_meeting_attendees.coach_id`.

---

## 6. Diagnostic SQL (not run — paste into the SQL Editor)

```sql
-- 6a. profiles.site values that do not exactly match a rota_sites.name (with counts).
--     Expect only 'Head Office' if the 0001 CHECK is still in place.
select p.site,
       count(*)                                  as profiles,
       count(*) filter (where p.active)          as active,
       count(*) filter (where not p.active)      as inactive
from public.profiles p
where not exists (select 1 from public.rota_sites s where s.name = p.site)
group by p.site
order by profiles desc, p.site;

-- 6a-ii. Near-misses: matches only after trim/case-fold (should return 0 rows).
select p.id, p.email, p.site
from public.profiles p
where not exists (select 1 from public.rota_sites s where s.name = p.site)
  and exists (select 1 from public.rota_sites s
              where lower(btrim(s.name)) = lower(btrim(p.site)));

-- 6a-iii. Matches a rota_sites row that is inactive (would be hidden from the rota).
select p.site, count(*) as profiles
from public.profiles p
join public.rota_sites s on s.name = p.site
where not s.active
group by p.site;

-- 6b. profiles grouped by job_title and site (active / inactive split).
select p.job_title,
       p.site,
       count(*)                             as total,
       count(*) filter (where p.active)     as active,
       count(*) filter (where not p.active) as inactive
from public.profiles p
group by p.job_title, p.site
order by p.site, p.job_title;

-- 6c. active vs inactive profile counts.
select p.active, count(*) as profiles
from public.profiles p
group by p.active
order by p.active desc;

-- 6d. (extra) Is the site CHECK constraint still on profiles, as the migrations imply?
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.profiles'::regclass and contype = 'c';

-- 6e. (extra) What will be wiped — row counts for every table in scope.
select 'rota_coaches' t, count(*) from public.rota_coaches
union all select 'rota_coaches (with profile_id)', count(*) from public.rota_coaches where profile_id is not null
union all select 'rota_standard_roster', count(*) from public.rota_standard_roster
union all select 'rota_standard_classes', count(*) from public.rota_standard_classes
union all select 'rota_weekly_rotas', count(*) from public.rota_weekly_rotas
union all select 'rota_weekly_roster', count(*) from public.rota_weekly_roster
union all select 'rota_weekly_classes', count(*) from public.rota_weekly_classes
union all select 'rota_restructures', count(*) from public.rota_restructures
union all select 'rota_restructure_roster', count(*) from public.rota_restructure_roster
union all select 'rota_restructure_classes', count(*) from public.rota_restructure_classes
union all select 'club_meeting_attendees', count(*) from public.club_meeting_attendees;

-- 6f. (extra) Who would appear on each site's rota: active profiles per rota site,
--     plus those with no rota site (Head Office / unmatched).
select coalesce(s.name, '(no rota site: ' || p.site || ')') as rota_site,
       count(*) as active_profiles
from public.profiles p
left join public.rota_sites s on s.name = p.site
where p.active
group by 1
order by 1;
```

---

## 7. Migration outline (do not write)

Ordering matters: wipe, then drop FKs, then drop the table, then re-add FKs to `profiles`.
All steps in one transaction.

1. **Truncate data (9 tables).** The 8 rota data tables — `rota_standard_roster`,
   `rota_standard_classes`, `rota_weekly_rotas`, `rota_weekly_roster`,
   `rota_weekly_classes`, `rota_restructures`, `rota_restructure_roster`,
   `rota_restructure_classes` — **plus `club_meeting_attendees`** (needs approval, see
   open decisions). Leave `rota_sites`, `rota_categories`, `rota_class_catalogue`.
2. **Drop and re-add FKs: 10.** Drop the 10 FKs in section 2 and re-add them as
   `→ profiles (id)`, keeping each one's on-delete behaviour (`cascade` for the 7
   `coach_id` columns, `set null` for the 3 `set_coach_id` columns). Constraint names
   are auto-generated, so the migration must look them up or use
   `alter table … drop constraint` against names confirmed in the live DB.
3. **Drop `rota_coaches`** (1 table). This also removes its 4 policies, its
   `site_id` index, `one_rota_coach_per_profile_per_site`, and its `profile_id` FK. The
   0028 `revoke` on it needs no counterpart.
4. **Policies: 4 dropped (with the table); 0 rewritten.** None of the other 35 policies
   reference `rota_coaches`; they scope by `site_id` and stay valid. (Optional extra
   decision: whether to add a check that a roster row's coach is at that site — that
   would be new constraints/policies, not a re-point.)
5. **Functions: 2 existing (both optional), 1 new.**
   - `upsert_weekly_rota`, `upsert_restructure`: work unchanged; touch only if we want
     them to enforce that copied coaches are still active / at the site.
   - **New:** a SECURITY DEFINER RPC (or a new `profiles` select policy) so a
     `edit_rota`/coach-level user can list their site's active coaches. Must follow the
     0012/0028 rule: `revoke … from public`, `from anon`, grant to `authenticated`.
6. **Optional:** clean up stale `profile_id` references in docs.

**Exact counts**

| Item | Count |
|---|---|
| Tables touched | **10** (9 truncated, 1 dropped) — 8 rota data + `club_meeting_attendees` truncated; `rota_coaches` dropped. 3 reference tables + `profiles` untouched |
| FKs re-pointed | **10** (7 `coach_id`, 3 `set_coach_id`) |
| RLS policies | **4** dropped with `rota_coaches`; **0** rewritten |
| Functions | **2** existing (no change required), **1** new (coach list for a site) |
| App files touched | **10** — 5 with executable queries (3 rota pages, club-profile page, `RotaBoard.tsx`); 2 likely behaviour changes (`ManageCoachesModal.tsx` removed/repurposed, `ManageMeetingsModal.tsx` picker/source); 3 comment-only (`rotaDataSource.ts`, `lib/clubProfile/names.ts`, `StaffRolesModal.tsx`). Plus a new shared helper for the coach query if added (not counted). The ~14 files that only consume `{id, name, active}` need no edits if that shape is kept. |

What the app would lose, since coaches can no longer be added on the rota: the 4 write
call sites in `RotaBoard.tsx` (create from picker, add / rename / deactivate in Manage
coaches) and the Manage coaches modal entry point — coach management moves entirely to
the Users page.

---

## 8. Anything that assumes a coach can be on more than one site

- **`one_rota_coach_per_profile_per_site (site_id, profile_id)`** (0007) is the
  strongest sign: it deliberately allows one profile to have a coach row at several
  sites, and uniqueness is only per site. `profiles.site` is single-valued, so a
  profile-driven roster makes this impossible.
- **Cover / loan between sites:** because a `rota_coaches` row is just a name + site, a
  coach from another gym can be typed in for a day. With roster driven by `profiles.site`
  that stops, unless we allow roster rows for profiles outside the site (the roster FK
  would allow it; the picker wouldn't).
- **All-sites holders** (Regional GM, Head of Gymnastics, Head of Operations): switch
  between all sites and can edit any. Their own `profiles.site` is arbitrary (or Head
  Office), so they will never appear as a coach on a site unless the rule is relaxed.
- **No DB check that a roster row's coach belongs to the roster's site** (no composite
  FK), so cross-site rows are already representable, and `(…, coach_id)` uniqueness is
  scoped per site/week, not globally — the same coach can be on two sites the same day.
- **When a profile's site changes** (Users admin edit), old roster / class rows keep
  pointing at the profile and would keep showing on the previous site's rota, since
  columns are driven by roster rows, not by the coach list. Likewise a deactivated
  profile stays on historical rows (names resolve for inactive coaches today by design).
  Both need a rule: filter, or clean up on site change / deactivate.
- **Club meetings** attendee lists and the attendance grid use the same single-site coach
  list, so they inherit whatever the rule becomes.

---

## Open decisions for approval

1. **`club_meeting_attendees`**: wipe with the rota data and re-point to `profiles`, or
   leave out of scope (the drop of `rota_coaches` is blocked while it points there)?
2. **Roster eligibility rule**: exactly `profiles.site = rota_sites.name AND active`, or
   should all-sites titles / Head Office staff be assignable to any site? (Section 8.)
3. **Reading profiles on the rota pages**: new site-scoped RPC vs. a new `profiles`
   select policy (RPC matches the existing `resolve_profile_names` pattern and avoids
   widening `profiles` reads).
4. **On site change or deactivation**: keep historical roster rows, or filter them out of
   the board and exports?
5. **Inline "create a coach"** goes away; confirm that adding someone to the rota now
   means adding them on the Users page first.
