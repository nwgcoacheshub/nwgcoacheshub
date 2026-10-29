# Rota landing page redesign — Phase 1 investigation (read only)

Date: 2026-10-28. Repo at `276fa5e` (main). No code, schema, or database changes were made. No SQL was run.
Today is Wed 28 Oct 2026, so `currentMonday()` = **2026-10-26**.

## Pre-read

| # | Source | Notes |
|---|---|---|
| 1 | `CLAUDE.md` | Rota data model and permissions sections |
| 2 | `nwg-coaches-hub-v1-build-doc.md` (195 lines) | 3 rota mentions (L12, L34, L188), all "Rota is a placeholder nav item". Nothing on the rota's design. |
| 3 | `docs/investigations/rota-retcon-*`: **11 files** | `rota-retcon-0029-verification.md`, `rota-retcon-p1-investigation.md`, `rota-retcon-p2-phase-a.md`, `rota-retcon-p2c-report.md`, `rota-retcon-p2d-report.md`, `rota-retcon-p3-phase-a.md`, `rota-retcon-p3-phase-b.md`, `rota-retcon-p3-test-plan.md`, `rota-retcon-p4-phase-a.md`, `rota-retcon-p4-phase-b.md`, `rota-retcon-p4-test-plan.md` |
| 4 | Mockup | `reference/` holds 5 HTML files. 1 is a Rota landing mockup: **`reference/Rota home – mockup.html`** (480 lines, `<title>Rota home – mockup</title>`, untracked). Used that one. The other rota file, `reference/nwg-weekly-rota.html` (`<title>NWG Weekly Rota`), is the original board mockup, not a landing page. The other 3 (`dashboard.html`, `index_1.html`, `policies-mockup.html`) are not rota files. |
| 5 | Migrations | 20 of 29 files mention `rota_`. The ones that define or change rota weekly/standard/restructure tables, their policies or RPCs: `0002`, `0003`, `0004`, `0011`, `0012`, `0013`, `0014`, `0016`, `0026`, `0028`, `0029` (11 files). Others only reference `rota_sites` / catalogue: `0005`, `0006` (catalogue data), `0007` (`rota_coaches.profile_id`, since dropped), `0009`, `0015`, `0020`, `0022`, `0023`, `0025`, `0027` (FK to `rota_sites`, or own-site lookup). |
| 6 | App files | 5 route files, 15 files in `components/rota/` (14 code + 1 CSS module), 8 files in `lib/rota/`, plus `lib/capabilities.ts`, `lib/getCurrentProfile.ts`, `lib/supabaseServer.ts`, `lib/supabaseClient.ts`. **0 API routes and 0 server actions** serve the rota (the only `"use server"` file in the repo is `app/login/actions.ts`; `app/api/` has 5 routes, none rota). |

---

## A. Current landing page

### A1. Routes (5 files, all server components)

| URL | File | What it does |
|---|---|---|
| `/rota` | `app/(protected)/rota/page.tsx` | `getSiteAccess()`, then `redirect('/rota/{homeSlug}')`. Renders nothing itself except `RotaUnavailable` on failure. |
| `/rota/[siteSlug]` | `app/(protected)/rota/[siteSlug]/page.tsx` | **Is the Standard Rota board.** There is no landing page today: `/rota` lands straight on the standard board. |
| `/rota/[siteSlug]/week` | `…/week/page.tsx` | `redirect('/rota/{site}/week/{currentMonday()}')` |
| `/rota/[siteSlug]/week/[weekStartDate]` | `…/week/[weekStartDate]/page.tsx` | One week's board, or the `WeeklyRotaEmpty` card if no row exists |
| `/rota/[siteSlug]/restructure` | `…/restructure/page.tsx` | The restructure board, or `RestructureEmpty` |

Components: 10 of the 14 code files in `components/rota/` declare `"use client"` (`RestructureBoard`, `RestructureEmpty`,
`RotaBoard`, `RotaExportButton`, `SiteSwitcher`, `StandardRotaView`, `WeeklyRotaBoard`, `WeeklyRotaEmpty`,
`useGenerateWeek`, `useGenerateRestructure`). 4 don't: `RotaUnavailable`, `RotaViewTabs`, `WeekNav` (rendered by the
server pages) and `RotaExportLayout` (imported only by the client `RotaExportButton`, so it is bundled client side).

### A2. Data fetched on `/rota/[siteSlug]` (standard page)

Server client (`createClient()` from `lib/supabaseServer.ts`, the user's session, RLS applies). 1 query for sites
(`getSiteAccess`), 1 RPC for capabilities (`my_capabilities`, cached), then 6 in parallel:

1. `rota_categories` (`key, label, color_hex`, active)
2. `rota_class_catalogue` (active)
3. RPC `site_rota_people(p_site_id)`
4. RPC `site_rota_roster(p_site_id)`, **only if `canEdit`**, else `[]`
5. `rota_standard_roster` for the site
6. `rota_standard_classes` for the site

The week and restructure pages do the same 6 after first resolving the parent row (`rota_weekly_rotas` /
`rota_restructures`, `.maybeSingle()`). All client-side writes use `createClient()` from `lib/supabaseClient.ts`
(browser session, RLS applies).

### A3. Site selection and gating

- `lib/rota/siteAccess.ts` `getSiteAccess()` → `lib/rota/resolveSiteAccess.ts`:
  - `view_all_sites` holder: every active `rota_sites` row (7, seeded in 0002), `canSwitch: true`, home = first by
    `sort_order` (Burnley).
  - anyone else: only the site whose `rota_sites.name` = `profiles.site`; no match (e.g. Head Office without
    `view_all_sites`, or no site) → `RotaUnavailable` "No rota site matches your profile".
- Unknown slug or another site's slug → redirect to own home.
- Write gating: `hasSiteCapability(caps, "edit_rota", site.id)` (`lib/capabilities.ts`) → `canEdit`. `manage_users`
  only turns "Admin › Users" into a link on the board. No `job_title` string is checked anywhere in the rota app code.
- `SiteSwitcher` always navigates to `/rota/{slug}` (the standard page) whatever view you were on.

### A4. What each role sees and can do

| Role | Capabilities (rota-relevant) | Sites | Can do |
|---|---|---|---|
| Coach | none | own only, no switcher (plain label) | View standard, any created week, restructure. Board rendered read-only (`styles.readonly`, controls disabled with "Your job title doesn't have rota edit rights."). Generate buttons disabled. `site_rota_roster` not fetched. **Export PDF is available** (`exportSpec` is always passed; `RotaBoard.tsx` L1032). |
| Lead Coach | `edit_rota` (site-scoped) | own only | Everything on own site: edit standard, generate/regenerate weeks, generate/regenerate restructure, export. |
| Club Head Coach | `edit_rota` (+ `manage_club_roles`, not used by rota) | own only | Same as Lead Coach. |
| RGM / Head of Gymnastics / Head of Operations | `view_all_sites`, `all_sites_scope`, `edit_rota`, `manage_users` | all 7, switcher | Edit everything at every site; "Admin › Users" is a link. |

All of the above also require `active = true` (`my_capabilities()` returns nothing for an inactive profile; RLS
`is_active_coach()` blocks every read).

### A5. Routing between views

- `components/rota/RotaViewTabs.tsx`: 3 `Link` tabs — "Standard rota" → `/rota/{site}`, "This week" →
  `/rota/{site}/week`, "Restructure" → `/rota/{site}/restructure`. Route segments, no query params.
- **A dedicated per-week route already exists**: `/rota/[siteSlug]/week/[weekStartDate]`, canonicalised to a Monday.
  The redesign's "Open week" can link straight to it. The conflict is the landing page itself: `/rota/[siteSlug]`
  is currently the Standard board, so a landing page there means moving the standard board to a new segment (e.g.
  `/rota/[siteSlug]/standard`) and updating `RotaViewTabs`, `SiteSwitcher`, the `/rota` redirect, and 3
  `redirect()` targets. `/rota` (site-less) is free for an all-sites grid. See H1–H2.

---

## B. Week tabs and week selection

- **There are no week tabs.** `RotaViewTabs` renders 3 tabs, exactly 1 of which is a week ("This week"), and it
  always goes to `/rota/{site}/week` → `currentMonday()`. Rule: hardcoded, 1 tab.
- Other weeks are reached by `components/rota/WeekNav.tsx`: 3 controls — ‹ (−7 days), "Today" (disabled on the
  current week), › (+7 days). **Pure date maths, unbounded in both directions**, no DB query: it never knows which
  weeks exist. Paging to any week with no row shows `WeeklyRotaEmpty`.
- No list of weeks is computed anywhere in the app. No query reads more than one `rota_weekly_rotas` row.
- Week start: **Monday** (`lib/rota/week.ts`: `mondayOf`, `isMonday`; `day_of_week` 0 = Mon … 6 = Sun per 0002 L49).
- Timezone: `londonToday()` (`Intl.DateTimeFormat` with `Europe/London`) for "today"; all arithmetic in UTC
  midnight. `weekRangeLabel()` gives "4–10 Aug 2026"; `weekDayLabels()` gives 7 × "4 Aug".
- Selected week: held in the **route segment** `[weekStartDate]` (`YYYY-MM-DD`). Invalid → `/week`; non-Monday →
  redirect to its Monday. No client state.
- The DB has **no check that `week_start_date` is a Monday**; only the app canonicalises.

---

## C. Week creation / generation

### C1. Every INSERT/UPSERT into `rota_weekly_rotas` or its 2 child tables: 3 paths

| # | Table(s) | Code | Trigger |
|---|---|---|---|
| 1 | `rota_weekly_rotas` (INSERT … ON CONFLICT (site_id, week_start_date) DO UPDATE), then DELETE + INSERT into `rota_weekly_roster` and `rota_weekly_classes` | DB function `upsert_weekly_rota(uuid, date)` (current body `0026_capability_helpers.sql` L1462–1518), called by `generate()` in `components/rota/useGenerateWeek.ts` | 2 buttons: (a) `WeeklyRotaEmpty` "Generate this week's rota" — fires on click, no confirm; (b) `WeeklyRotaBoard` toolbar "Regenerate from Standard Rota" → confirm modal → "Regenerate week". Browser client, RPC. |
| 2 | `rota_weekly_roster` INSERT | `insertRoster` in `makeDataSource` (`lib/rota/rotaDataSource.ts`), via `weeklyDataSource(weeklyRotaId)` | `RotaBoard` `addExistingCoachToDay` (coach picker "Add"). Only possible once the week row exists. |
| 3 | `rota_weekly_classes` INSERT | `insertClass` in `makeDataSource`, same data source | `RotaBoard` `saveModal` (Add class modal). Only possible once the week row exists. |

No other code inserts into these 3 tables. `upsert_weekly_rota` is the only path that creates a
`rota_weekly_rotas` row. (Updates/deletes, for completeness: `updateRoster`, `setExclusiveFlag`, `deleteRoster`,
`updateClass`, `deleteClass`, `unassignClassesForCoachDay`.)

### C2. Does viewing or selecting a week create a row? **No.**

Evidence:
- `week/[weekStartDate]/page.tsx` L68–73 only `select("id, generated_at") … .maybeSingle()`; if null it renders
  `WeeklyRotaEmpty` (L104–117).
- `WeeklyRotaEmpty` calls `generate()` only in the button's `onClick`; there is no `useEffect`.
- `week/page.tsx` and `WeekNav` are redirects/links only.
- The only other reader, `app/(protected)/club-profile/[siteSlug]/page.tsx` L73–78, is also select-only.

So there is **no lazy creation to remove**. What does exist is *display* of uncreated weeks (see F4).

### C3. What a new week is populated from

A verbatim copy of the site's **current** Standard Rota: every `rota_standard_roster` row (10 columns incl.
`status`, flags, shifts) and every `rota_standard_classes` row (`coach_id`, `set_coach_id`, catalogue, title,
category, meta, times). **No filter against `site_rota_roster`**, no `active` check, no site check. 0029 L24 confirms
the RPCs were left unchanged ("they only copy coach_id values between tables, and copy a NULL coach_id as-is").
So yes: a coach no longer on the roster (deactivated, moved site, or re-titled) **is copied in** if they are still on
the Standard Rota. If the standard is empty, the week is created with 0 rows.

### C4. Regenerate

Exists, same RPC. `ON CONFLICT` keeps the row id and bumps `generated_at`/`generated_by`; both child tables are
deleted and refilled from the current standard. All week edits are lost. Behind a confirm modal in
`WeeklyRotaBoard`. The board remounts on `key={weeklyRotaId}:{generatedAt}`.

### C5. Copy one weekly rota into another week? **No.**

No RPC, data-source method or UI. `upsert_weekly_rota` only reads `rota_standard_*`.

---

## D. Rota data model

### D1. Columns

**`rota_weekly_rotas`** (0002) — 5 columns

| Column | Type | Null | Default |
|---|---|---|---|
| id | uuid | not null (PK) | `gen_random_uuid()` |
| site_id | uuid | not null | — FK `rota_sites(id)` ON DELETE CASCADE |
| week_start_date | date | not null | — |
| generated_at | timestamptz | not null | `now()` |
| generated_by | uuid | null | — FK `auth.users(id)`, no ON DELETE clause (NO ACTION) |

**`rota_weekly_roster`** (0002; coach FK 0029) — 11 columns

| Column | Type | Null | Default |
|---|---|---|---|
| id | uuid | not null (PK) | `gen_random_uuid()` |
| weekly_rota_id | uuid | not null | FK `rota_weekly_rotas(id)` ON DELETE CASCADE |
| day_of_week | smallint | not null | check 0–6 |
| coach_id | uuid | not null | FK `profiles(id)` ON DELETE RESTRICT (0029) |
| sort_order | smallint | not null | 0 |
| shift_start_mins | smallint | not null | none |
| shift_end_mins | smallint | not null | none |
| status | text | not null | `'working'`, check in (working, leave, sick) |
| is_key_holder | boolean | not null | false |
| is_lead | boolean | not null | false |
| is_cashing_up | boolean | not null | false |

UNIQUE (weekly_rota_id, day_of_week, coach_id); partial unique indexes `one_lead_per_week_day`,
`one_cashup_per_week_day`.

**`rota_weekly_classes`** (0002; coach FKs + nullable 0029) — 13 columns

| Column | Type | Null | Default |
|---|---|---|---|
| id | uuid | not null (PK) | `gen_random_uuid()` |
| weekly_rota_id | uuid | not null | FK `rota_weekly_rotas(id)` ON DELETE CASCADE |
| day_of_week | smallint | not null | check 0–6 |
| coach_id | uuid | **null** (NULL = unassigned) | FK `profiles(id)` ON DELETE RESTRICT |
| set_coach_id | uuid | null | FK `profiles(id)` ON DELETE RESTRICT |
| class_catalogue_id | uuid | null | FK `rota_class_catalogue(id)` ON DELETE SET NULL |
| title | text | not null | — |
| category_key | text | not null | FK `rota_categories(key)` (NO ACTION) |
| meta | text | null | — |
| start_mins | smallint | not null | — |
| duration_mins | smallint | not null | — |
| created_at | timestamptz | not null | `now()` |
| updated_at | timestamptz | not null | `now()` |

Index (weekly_rota_id, day_of_week).

**Standard tables** (site-scoped by `site_id` FK `rota_sites` ON DELETE CASCADE):
- `rota_standard_roster` — 11 columns: same as weekly roster with `site_id` in place of `weekly_rota_id`, but
  `shift_start_mins` default 480 and `shift_end_mins` default 1320; `status` added by 0003. UNIQUE (site_id,
  day_of_week, coach_id); `one_lead_per_standard_day`, `one_cashup_per_standard_day`. **No timestamps at all.**
- `rota_standard_classes` — 13 columns: same as weekly classes with `site_id`. `created_at`, `updated_at`.

**Restructure tables** (0016; coach FKs 0029):
- `rota_restructures` — 4 columns: `id`, `site_id` (UNIQUE, FK cascade), `generated_at`, `generated_by`.
- `rota_restructure_roster` — 11 columns, mirror of weekly roster keyed on `restructure_id`.
- `rota_restructure_classes` — 13 columns, mirror of weekly classes.

### D2. The 6 Yes/No questions

| # | Question | Answer | Evidence |
|---|---|---|---|
| 1 | UNIQUE on (site, week start)? | **Yes** | `0002_rota_schema.sql` L87: `unique (site_id, week_start_date)` on `rota_weekly_rotas`; `upsert_weekly_rota` relies on it (`on conflict (site_id, week_start_date)`). |
| 2 | Weekly class keeps a link to its standard class? | **No** | `rota_weekly_classes` has no source column (13 columns above); the RPC's INSERT…SELECT doesn't carry `rota_standard_classes.id`. Same for roster rows. |
| 3 | Cover concept on weekly class assignments? | **Yes — derivable rule, no column/flag** | `RotaBoard.tsx` L130 `isCover`: `coach_id` not null AND `set_coach_id` not null AND `set_coach_id ≠ coach_id`. `set_coach_id` NULL means "not a cover". |
| 4 | Notes/description column on a weekly rota? | **No** | 5 columns on `rota_weekly_rotas`; `meta` exists per class only. |
| 5 | Standard tables carry updated_at / updated_by? | `rota_standard_roster`: **No / No**. `rota_standard_classes`: **updated_at Yes / updated_by No** | 0002 L46–79. No trigger on any rota table (grep `trigger` in migrations: 0 rota hits). `updated_at` is set **by the app** in `updateClass` and `unassignClassesForCoachDay` only; inserts get the default, deletes leave nothing. |
| 6 | Restructure status / in-progress indicator? | **No** | `rota_restructures` has only `id, site_id, generated_at, generated_by`. The only state is "row exists or not". |

### D3. RLS on the 8 rota data tables: 32 policies (4 per table)

Current names (all created in 0026; 0029 dropped `rota_coaches` and its 4). Pattern for every table `T`:

| Policy | Command | Helpers |
|---|---|---|
| `T_select_own_site_or_view_all` | SELECT | `is_active_coach()` AND (`has_capability('view_all_sites')` OR `profiles.site = rota_sites.name` join) |
| `T_insert_edit_rota_site` | INSERT (with check) | `is_active_coach()` AND `has_site_capability('edit_rota', site_id)` |
| `T_update_edit_rota_site` | UPDATE (using + with check) | same |
| `T_delete_edit_rota_site` | DELETE | same |

`T` ∈ `rota_standard_roster`, `rota_standard_classes`, `rota_weekly_rotas`, `rota_weekly_roster`,
`rota_weekly_classes`, `rota_restructures`, `rota_restructure_roster`, `rota_restructure_classes`. Child tables reach
`site_id` via a subselect on the parent (`rota_weekly_rotas` / `rota_restructures`); a missing parent gives a NULL
site, which `has_site_capability` treats as false.

Reference tables (0002, select-only, no write policies): `rota_sites_select_authenticated`,
`rota_categories_select_authenticated`, `rota_class_catalogue_select_authenticated` — any user with a `profiles` row.

Grants: 0028 revoked all from `public` and `anon` on all 11 `rota_*` tables (plus the since-dropped `rota_coaches`).

**RLS does not check that a coach id is on the site's roster.** Any `edit_rota` holder can insert/update any existing
`profiles.id` into a roster/class row; the FK only checks the profile exists.

### D4. RPCs touching these tables: 4 (plus 2 helpers)

| RPC | Definer? | Grants | Validates |
|---|---|---|---|
| `upsert_weekly_rota(uuid, date)` → uuid | SECURITY DEFINER, `search_path = public` | revoke public, revoke anon, grant authenticated (0026 L1520–1522) | `is_active_coach()`, `has_capability('edit_rota')`, `has_site_capability('edit_rota', p_site_id)`. **No** roster check, **no** Monday check, **no** "already exists" check (it overwrites). |
| `upsert_restructure(uuid)` → uuid | SECURITY DEFINER, `search_path = public` | same (L1582–1584) | Same 3 checks; same verbatim copy. |
| `site_rota_roster(uuid)` → (id, full_name, job_title) | SECURITY DEFINER, `search_path = ''`, stable | revoke public, anon; grant authenticated (0029) | Reads `profiles` + `rota_sites` only. Active, site name-match, title ∈ (Coach, Lead Coach, Club Head Coach). Caller: `is_active_coach()` and (`view_all_sites` or own site); else empty set. |
| `site_rota_people(uuid)` → (id, full_name, active, site) | SECURITY DEFINER, `search_path = ''`, stable | same (0029) | Reads all 8 rota data tables + `club_meeting_attendees`. Same caller check. Returns referenced profiles whatever their state. |

Helpers reading `rota_sites`: `has_site_capability(text, uuid)` (0026) and `my_capabilities()` (0027,
`own_site_id`).

### D5. Expected post-0029 data state (from migrations)

0029 L36–45 truncated all 8 rota data tables (and `club_meeting_attendees`); `rota_sites` (7 rows),
`rota_categories`, `rota_class_catalogue` untouched. Anything present now was created after 0029 by app use. If
nobody has used the rota since: **0 rows** in all 8 tables, every site has no standard rota, no weeks, no
restructure, and every site would qualify for the first-run state.

### D6. Verification SQL (for Jamie to paste into the SQL Editor — read only, not run)

```sql
-- 1. Weeks per site, with min/max week start
select s.sort_order, s.name,
       count(w.id)                as weeks,
       min(w.week_start_date)     as first_week,
       max(w.week_start_date)     as last_week,
       count(*) filter (where extract(isodow from w.week_start_date) <> 1) as non_monday_weeks
from public.rota_sites s
left join public.rota_weekly_rotas w on w.site_id = s.id
group by s.sort_order, s.name
order by s.sort_order;

-- 2. Child-table, standard and restructure row counts per site
select s.sort_order, s.name,
  (select count(*) from public.rota_weekly_roster r
     join public.rota_weekly_rotas w on w.id = r.weekly_rota_id where w.site_id = s.id)      as weekly_roster,
  (select count(*) from public.rota_weekly_classes c
     join public.rota_weekly_rotas w on w.id = c.weekly_rota_id where w.site_id = s.id)      as weekly_classes,
  (select count(*) from public.rota_standard_roster r  where r.site_id = s.id)                as standard_roster,
  (select count(*) from public.rota_standard_classes c where c.site_id = s.id)                as standard_classes,
  (select count(*) from public.rota_restructures x     where x.site_id = s.id)                as restructures,
  (select count(*) from public.rota_restructure_roster r
     join public.rota_restructures x on x.id = r.restructure_id where x.site_id = s.id)      as restructure_roster,
  (select count(*) from public.rota_restructure_classes c
     join public.rota_restructures x on x.id = c.restructure_id where x.site_id = s.id)      as restructure_classes
from public.rota_sites s
order by s.sort_order;

-- 3. Table totals (catches any row whose parent/site join would hide it)
select 'rota_weekly_rotas' t, count(*) from public.rota_weekly_rotas
union all select 'rota_weekly_roster', count(*) from public.rota_weekly_roster
union all select 'rota_weekly_classes', count(*) from public.rota_weekly_classes
union all select 'rota_standard_roster', count(*) from public.rota_standard_roster
union all select 'rota_standard_classes', count(*) from public.rota_standard_classes
union all select 'rota_restructures', count(*) from public.rota_restructures
union all select 'rota_restructure_roster', count(*) from public.rota_restructure_roster
union all select 'rota_restructure_classes', count(*) from public.rota_restructure_classes;
```

---

## E. Mockup inventory

File: `reference/Rota home – mockup.html`. 3 views (switched by a mockup-only toolbar) + 1 dialog. The mockup's
own data shapes (script, L326–347): a week is `{id (Monday ISO), label, range, status ∈ ok|chg|bad|idle, note?,
days[7]: {d, date, classes (count), coaches (names), covers (names), uncovered (count)}}`.

Not counted: the mockup view switcher (L200–205) — **must not be built** (CLAUDE.md: no demo toggles); hub chrome
(top bar, nav) — already in the app layout. The mockup uses its own palette and Inter, not the CLAUDE.md tokens.

Status key: **EXISTS** reusable as is · **PARTIAL** some piece (component, helper, route, RPC) exists ·
**MISSING** nothing built.

### Site home (Burnley) — 36 elements

| # | Element | Data needed | Status | Existing source |
|---|---|---|---|---|
| 1 | Page title "Rota" | — | PARTIAL | Pages have "Standard rota" / "Weekly rota" / "Restructure" h1 |
| 2 | Site selector | sites user may view | EXISTS | `SiteSwitcher` + `getSiteAccess` (target URL would change) |
| 3 | "Manage coaches" button | — | MISSING (conflicts, see E3) | Nearest: Admin › Users (`manage_users` only) |
| 4 | "Export PDF" (page level) | which board? | PARTIAL | `RotaExportButton` per board; needs that board's roster/classes/people loaded |
| 5 | Weeks strip header + hint | — | MISSING | — |
| 6 | Week card, selectable (`aria-pressed`) | list of created weeks | MISSING | No multi-week query exists |
| 7 | Card relative label ("This week", "Next week", "In N weeks") | week_start_date vs today | MISSING | `currentMonday()`, `addDays` exist |
| 8 | Card date range "19–25 Oct" | week_start_date | PARTIAL | `weekRangeLabel` (always appends year) |
| 9 | Card: 7 per-day class-count bars | count `rota_weekly_classes` by day | MISSING | Data exists |
| 10 | Card: red bar where a class has no coach | count coach_id NULL by day | MISSING | Data exists |
| 11 | Card: M T W T F S S initials | — | MISSING | `DAY_NAMES` in `lib/rota/board.ts` |
| 12 | Card status chip | see E2 | MISSING | — |
| 13 | "+ Add week" tile | — | MISSING | — |
| 14 | "Previous weeks" disclosure + list | weeks before this Monday | MISSING | — |
| 15 | Detail eyebrow (relative label) | as 7 | MISSING | — |
| 16 | Detail heading "Week of {range}" | as 8 | PARTIAL | Week page subline "Week of {weekRange}" |
| 17 | Detail status chip | see E2 | MISSING | — |
| 18 | "Export week" button | week roster+classes+people | PARTIAL | `RotaExportButton` on the week board |
| 19 | "Open week" button | link | PARTIAL | Route `/rota/{site}/week/{date}` exists |
| 20 | Not-created state: empty-week panel, "Start from standard rota", "Start blank" | standard class count | PARTIAL | `WeeklyRotaEmpty` + `upsert_weekly_rota`; "Start blank" has no path |
| 21 | Week note banner | note text | MISSING (schema) | No notes column |
| 22 | Stat: Coaches working | distinct roster coach_id (status?) | MISSING | Data exists; rule undefined (H8) |
| 23 | Stat: Classes | count classes | MISSING | Data exists |
| 24 | Stat: Covered by another coach | count `isCover` | MISSING | Rule exists in `RotaBoard.tsx` L130 |
| 25 | Stat: Without a coach | count coach_id NULL (± orphans) | MISSING | `isOrphan` in `lib/rota/columns.ts` |
| 26 | Day row: day name + date | week_start_date | EXISTS | `DAY_NAMES`, `weekDayLabels` |
| 27 | Day row: coach chips with "(cover)" marker | roster names; per-coach cover rule | PARTIAL | Names via `makeDirectory` (short names); per-coach "cover" rule undefined (H8) |
| 28 | Day row: "N classes" / "No classes" | count per day | MISSING | — |
| 29 | Day row flag: "N without a coach" / "N covered" | counts per day | MISSING | — |
| 30 | Standard card: Coaches | distinct `rota_standard_roster.coach_id` | MISSING | Data exists |
| 31 | Standard card: Classes per week | count `rota_standard_classes` | MISSING | Data exists |
| 32 | Standard card: Last edited {date} by {name} | last edit time + editor | MISSING (schema) | See D2 #5 |
| 33 | "Edit standard rota" button | link | PARTIAL | Standard board route exists |
| 34 | Needs attention list (clickable → selects week) | uncovered counts per day across weeks | MISSING | Data exists |
| 35 | Restructure card state text ("No restructure in progress…") | restructure exists? | PARTIAL | `rota_restructures` row existence only |
| 36 | "Start a restructure" button | — | PARTIAL | `upsert_restructure`, `RestructureEmpty` |

### All sites (full-access roles) — 6 elements

| # | Element | Data needed | Status | Existing source |
|---|---|---|---|---|
| 37 | Title "Rota" + "All sites" | — | MISSING | — |
| 38 | "Export all as PDF" | every site × week | MISSING | Export is single-board only |
| 39 | Header: Site + 4 week columns (relative label + range), current highlighted | 4 Mondays from today | MISSING | Date helpers exist. Mockup takes `weeks.slice(0,4)` of Burnley's created weeks; brief says 4 calendar weeks (H6) |
| 40 | Site cell: name + "N coaches" / "Not set up" | coach count per site | MISSING | `site_rota_roster` (full-access can read all) or standard roster count — undefined (H10) |
| 41 | Status chip cell (button: created → opens site+week; Not created → opens Add week; not-set-up site → first run) | status per site × week | MISSING | — |
| 42 | Legend (4 chips) + help text | — | MISSING | — |

### First run (Mansfield) — 6 elements

| # | Element | Data needed | Status | Existing source |
|---|---|---|---|---|
| 43 | Title "Rota" + site select | as 1–2 | PARTIAL | As 1–2 |
| 44 | "Set up {site}'s rota" + intro | — | MISSING | — |
| 45 | Step 1 "Add your coaches" + "Add coaches" | — | MISSING (conflicts, see E3) | — |
| 46 | Step 2 "Build the standard rota" + "Build" | link | PARTIAL | Standard board route |
| 47 | Step 3 "Start this week" ("week of 19 October") + "Start week" | current Monday | PARTIAL | `upsert_weekly_rota` |
| 48 | Step progression (current / locked) | per-step completion | MISSING | — |

### Add week dialog — 5 elements

| # | Element | Data needed | Status | Existing source |
|---|---|---|---|---|
| 49 | Title "Add a week" + site name | — | MISSING | `components/Modal.tsx` exists as a shell |
| 50 | "Week commencing" select: this week … +16, excluding existing | existing week starts | MISSING | Date helpers. Note: mockup loop is `i<=16 && opts.length<10`, i.e. **caps at 10 options**, unlike the brief's "up to 16 weeks ahead" (H5) |
| 51 | Start from "Standard rota" ("Copy the 31 classes and coaches…") | standard class count | PARTIAL | `upsert_weekly_rota` (overwrites if the week exists) |
| 52 | Start from "Copy another week" + week select (created weeks, "(half term)" tag from note) | created weeks, notes | MISSING | No copy path (C5); mockup also writes note "Copied from {range}. {note}" |
| 53 | Cancel / Add week | — | MISSING | — |

**Totals: 53 elements — 2 EXISTS, 15 PARTIAL, 36 MISSING.** (Site home 36, All sites 6, First run 6, Dialog 5.)

### E2. Status chips

| Chip | Rule from current data | Gap |
|---|---|---|
| **Not created** | No `rota_weekly_rotas` row for (site_id, week_start_date). | None. Only meaningful in the all-sites grid if the strip shows created weeks only. |
| **Classes without a coach** | ≥ 1 `rota_weekly_classes` row with `coach_id IS NULL` for that week. Optionally also orphans (coach_id set but no roster row that day — `isOrphan`), which the board already draws in Unassigned as "Not rostered". | None for NULL; whether orphans count is a decision (H7). |
| **Changes from standard** | Not computable reliably today. Options from current data, both flawed: (a) compare the week's roster/class tuples with the **current** standard — reports "changes" whenever the standard itself was edited after generation, and always for copied weeks; (b) timestamps — classes with `created_at`/`updated_at` > `generated_at` catch class adds/edits, but **roster edits** (no timestamps) and **class deletes** leave no trace. | Needs either a schema marker (e.g. a last-edited timestamp on the week maintained on every child write, or a source link per row) or a decision to accept (a)'s meaning (H7). |
| **Ready** | Created AND not "Classes without a coach" AND not "Changes from standard". | Inherits the "Changes" gap. Undefined for a created week with 0 classes (empty standard / "Start blank") (H7). |

**More than one qualifying:** the mockup only ever shows one chip per week. Its data implies precedence
**Classes without a coach > Changes from standard > Ready** (the "Next week" and "In 3 weeks" sample weeks both have
coach changes and uncovered classes, and show the red chip). Not created is exclusive. Not stated anywhere — confirm
(H7).

### E3. Conflicts with the post-retcon roster model

- **"Manage coaches" (#3) and first-run "Add your coaches" (#45)** assume a rota-managed coach list. Since 0029 there
  is none: assignable coaches are `site_rota_roster` = active profiles at that site titled Coach / Lead Coach / Club
  Head Coach. A new coach is an account created in Admin › Users, which needs `manage_users` (full-access titles
  only). A Lead Coach or Club Head Coach **cannot add a coach at all**; they can only put existing roster profiles on
  days (`addExistingCoachToDay`). Step 1's "linked to their hub account where they have one" describes a model that
  no longer exists (every coach is an account).
- What the roster supports today: read the list (`site_rota_roster`), see names/status of anyone referenced
  (`site_rota_people`), flag moved/inactive (`flagFor`). Changing who is on the list = editing profiles (job_title,
  site, active) in Admin › Users.
- So step 1 could at most be a read-only check ("N coaches on Mansfield's roster", link to Admin › Users for
  `manage_users` holders, otherwise "ask an admin") — a decision (H9).

### E4. Implied but unspecified

1. **Default selected week when this week isn't created.** Mockup defaults to `'2026-10-19'` = "This week", which
   exists. Not defined otherwise (next created future week? latest past? none?).
2. **Delete / archive a week.** No UI in the mockup. RLS already allows it (`rota_weekly_rotas_delete_edit_rota_site`,
   children cascade); no app path.
3. **Past weeks.** Mockup has a "Previous weeks" disclosure (3 hardcoded) but no rule for how many, whether they are
   editable (RLS allows editing past weeks today), or whether they count in Needs attention. The Add-week dialog
   excludes past weeks; the current `WeekNav` lets anyone with `edit_rota` generate any past week.
4. **Read-only Coach view.** Not shown. Today Coaches see boards read-only; Add week / Start / Edit buttons would need
   hiding or disabling.
5. **First-run trigger.** Mansfield shows "Not set up" with 0 coaches. Candidates: no standard roster rows and no
   standard classes; or no weeks; or empty `site_rota_roster`. Undefined.
6. **Standard exists but zero weeks.** Strip would contain only "+ Add week"; the detail panel has nothing to show
   (mockup's idle-week panel assumes a placeholder week, which "only created weeks" rules out).
7. **Mockup itself shows an uncreated week.** `wk()` supports `status 'idle'` with dashed bars and a "Start from
   standard rota / Start blank" detail state — contradicts "only weeks actually created are shown". In the all-sites
   grid, clicking "Not created" opens the Add-week dialog instead, which is consistent.
8. **"Start blank"** appears only in the idle detail state, not in the Add-week dialog.
9. **Copied week's note and status.** Mockup copies the source's note (prefixed "Copied from …") and status.

---

## F. Gap summary

### F1. UI only
- New landing page at site level: strip, week cards, Add-week tile, Previous weeks, detail panel, stats, day list,
  3 side cards (#5–#36).
- All-sites grid (#37–#42), first-run view (#43–#48), Add-week dialog (#49–#53).
- Route move: Standard board off `/rota/[siteSlug]`; new view tabs; `SiteSwitcher` target.

### F2. App logic
- Query of created weeks per site (range + previous weeks); per-week aggregates (classes/day, NULL-coach/day, cover
  count, coaches working) — needs roster + classes for N weeks in one or a few queries.
- Status derivation (E2), relative labels, Add-week date options (this week … +16, minus existing).
- "Start blank": a direct INSERT into `rota_weekly_rotas` is already allowed by RLS (`…_insert_edit_rota_site`), no
  migration needed.
- Delete week: allowed by RLS; app path missing.
- All-sites grid: 7 sites × 4 weeks status; full-access roles can SELECT every site under RLS.
- Standard card counts; Needs attention; first-run detection; restructure exists/not.
- Guarding create against an existing week: `upsert_weekly_rota` **overwrites** a week that exists (and its edits).
  The dialog excluding existing weeks is the only guard; a stale dialog or a second tab could regenerate over a week.

### F3. Schema (would need a migration)

| Item | Why existing structures can't serve it |
|---|---|
| Copy another week (#52) | No RPC. Doing it from the browser means: insert parent, select source rows, insert copies — 3+ round trips, not atomic (a failure leaves a half-copied week), and `rota_weekly_rotas` rows would then exist without a definer-side site check beyond RLS. An atomic copy needs a new SECURITY DEFINER function (with the 3 standard checks and revoke/grant). |
| Create-only "Add week from standard" | `upsert_weekly_rota` is create-or-replace by design. A create-only behaviour (fail if the week exists) needs a new function or a changed one. Optional if a client-side pre-check is accepted. |
| Week note (#21) | `rota_weekly_rotas` has no text column. |
| Standard "Last edited at / by" (#32) | `rota_standard_roster` has no timestamps; `rota_standard_classes.updated_at` is app-set on update only (not on insert-after-default, not on delete); no `updated_by` on any rota table; no triggers. |
| "Changes from standard" (E2) | No source link per row and no week-level edit marker; roster edits and deletes leave no trace. Only avoidable if Jamie accepts the compare-with-current-standard meaning. |
| Restructure "in progress" (#35) | Only row existence; if "in progress" should mean more (e.g. started but not applied/finished), there is no column. |
| Roster filtering on copy (G) | Only if copies should drop off-roster coaches; both copy paths run in SQL. |

### F4. Behaviour to remove or change for "only created weeks"
- **No lazy creation exists** (C2), so nothing has to be removed on that front.
- What does display uncreated weeks today: `RotaViewTabs` "This week" → `/week` → current Monday, which renders
  `WeeklyRotaEmpty` if not created; `WeekNav` ‹ / › page to any week (past or future, unbounded) and each uncreated
  one renders `WeeklyRotaEmpty` with a Generate button. That's how a week beyond +16 or in the past can be created.
  Whether `/week/[date]` for an uncreated week should keep the Generate card, redirect to the landing page, or show
  "not created" read-only is a decision (H4).
- Club Profile reads the current week only and shows "not generated" when missing — unaffected.

---

## G. Roster integrity on the new write paths (describe only)

**Add week from standard.** `upsert_weekly_rota` copies `coach_id` (roster + classes) and `set_coach_id` verbatim.
A profile can be on the Standard Rota but off `site_rota_roster` in 3 ways, and each is copied into the new week:

| Case | Copied? | How it surfaces on the week board / PDF |
|---|---|---|
| Deactivated (`active = false`) | Yes | Flagged "inactive" (`flagFor`, via `site_rota_people`) |
| Moved site (`profiles.site` ≠ rota site) | Yes | Flagged "moved" |
| Re-titled out of Coach/Lead Coach/Club Head Coach (e.g. promoted to RGM), still active at the site | Yes | **Not flagged.** `flagFor` checks only `active` and `site`. Shows as a normal coach; once removed from a day they can't be re-added (not in the picker). The class modal keeps them as an extra Set-coach option (`RotaBoard.tsx` L880–887). |

Standard Rota orphans (class coach not rostered that day) are also copied, and show as "Not rostered" in Unassigned
(P4 follow-up, `rota-retcon-p4-phase-b.md`). The mockup's "Copy the 31 classes and coaches" count would include all
of these.

**Copy another week.** Same 3 cases, plus: the source week may be old (a past or half-term week), so it can carry
people who were valid then and aren't now, and it carries the source week's covers, statuses (`leave`/`sick`) and
orphans. Any copy implementation inherits whatever the source week holds unless it filters.

**At the database level**, neither RLS nor any RPC checks roster membership, so a filter (if wanted) has to be in the
copy function or the app.

**Overlap with the queued stale-tab fix (not folded in).** Both are "a coach who isn't valid for this site/day gets
written". The stale-tab fix covers 3 board write calls (`moveClass` → `updateClass`, `saveModal` → `updateClass` /
`insertClass`) against the **day's roster rows**; the copy paths are bulk SQL copies against the **site's assignable
roster**. They share the question "what counts as valid", and a DB-side check, if ever chosen, could serve both — but
they are different checks on different code paths.

---

## H. Open questions for Jamie

1. **Where does the landing page live?** `/rota/[siteSlug]` is the Standard board today. Move Standard to
   `/rota/[siteSlug]/standard` (or similar) and put the landing page at `/rota/[siteSlug]`?
2. **All-sites grid URL and audience.** At `/rota` for `view_all_sites` holders (others keep redirecting to their
   site)? Should full-access users land on the grid or on Burnley by default?
3. **Keep the 3 view tabs** (Standard / This week / Restructure) on the boards, replace them with a "back to Rota
   home" link, or both?
4. **Uncreated week URLs.** What should `/rota/{site}/week/{date}` do for a week with no row — keep "Generate"
   (allows any date), redirect to the landing page, or read-only "not created"? Keep `WeekNav` ‹ / › paging?
5. **Add-week range:** this week to +16 weeks (17 options before exclusions) as the brief says, or the mockup's cap of
   10 options? Can past weeks ever be added?
6. **All-sites columns:** this week + next 3 calendar weeks (brief), confirmed?
7. **Status rules:** (a) does "Classes without a coach" include orphans ("Not rostered") as well as NULL coach?
   (b) "Changes from standard": accept compare-with-current-standard, or add schema to track edits? (c) precedence
   Without a coach > Changes > Ready? (d) a created week with 0 classes — Ready?
8. **Stat definitions:** "Coaches working" — distinct rostered coaches, or only `status = 'working'` (excluding
   leave/sick)? Per-day "(cover)" marker on a coach — means "delivers ≥ 1 class whose set coach is someone else"?
9. **"Manage coaches" and first-run step 1** don't fit the roster model. Drop them, or replace with a read-only roster
   summary linking to Admin › Users (`manage_users` only)?
10. **"N coaches" / "Not set up"** in the all-sites grid and **first-run trigger**: based on the assignable roster,
    the Standard Rota's coaches, or "no standard rota rows"?
11. **"Start blank"**: wanted? If so, in the Add-week dialog as a third option, or not at all?
12. **Copy another week:** which weeks can be the source (past ones too)? Copy the note? Should copies (and Add from
    standard) drop off-roster / flagged coaches, or copy verbatim and flag?
13. **Create vs overwrite:** should "Add week" refuse if the week already exists (new create-only RPC), or rely on the
    dialog's exclusion and reuse `upsert_weekly_rota`?
14. **Week notes:** wanted (needs a column)? Who can edit — `edit_rota` holders?
15. **Standard "Last edited at / by":** wanted (needs columns or triggers on both standard tables)?
16. **Restructure "in progress":** is "a restructure row exists" enough, or is there a finished/applied state?
17. **Delete week:** wanted? Who, and with what confirm?
18. **Previous weeks:** how many shown; editable or read-only; included in Needs attention?
19. **Default selected week** when this week isn't created.
20. **Page-level "Export PDF"** (#4) and **"Export all as PDF"** (#38): which board does #4 export, and is a
    multi-site export in scope?
21. **Design tokens:** the mockup uses its own palette, Inter and extra status colours (blue "Changes", red). Use
    CLAUDE.md tokens and map the 4 statuses onto green / amber / grey plus orange/red?

---

## Repo hygiene

`git status --short` after writing this report:

```
?? docs/investigations/rota-landing-phase1-investigation.md
?? "reference/Rota home \342\200\223 mockup.html"
```

The mockup was already untracked before this session (it was in the starting git status).

- 1 file created: this report. 0 existing files modified. Nothing written to the repo root or under `supabase/`.
- No SQL run, no database connection, no secret key read, no git add/commit/push, no npm install.
