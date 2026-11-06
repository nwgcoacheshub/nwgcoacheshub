# Competitions — Phase 1: Competition Calendar + External Competition Entries

Read-only investigation, 2026-11-06. No code, schema, config or packages were changed, and
no Supabase CLI or write-side git commands were run. The only file written is this report.
`docs/investigations/` already existed (it holds 26 earlier reports), so nothing was created
apart from this file.

**Pre-read in full:** `CLAUDE.md`, `nwg-coaches-hub-v1-build-doc.md`,
`docs/investigations/competitions-nav-phase1.md` and `-phase2.md`, and `components/NavBar.tsx`.
**Migrations:** the directory is `supabase/migrations/`, with 30 files (0001–0030, no gaps).
0001, 0004, 0008, 0014 (the function parts), 0026 (§1–4 and §4b–5), 0027, 0028, 0029 and 0030
were read in full. The rest were read at the level of functions, policies, tables, grants and
triggers. Live-object counts below come from replaying every `create`/`drop`
(policy, function, table) statement across the 30 files in order. This is a static replay of
the repo, **not a query against the live database**. The two can differ if anything was
changed live and never committed (0005 and 0012 record that this has happened before).

---

## 1. Nav

**Where it's defined:** only in `components/NavBar.tsx` (`"use client"`), which
`app/(protected)/layout.tsx` renders. There's no config array: each dropdown is its own
`<NavDropdown …>` JSX block with an inline `items={[…]}` literal.

The Competitions block was added in commit `6cadd0a` and sits between Gymnastics and Operations:

```tsx
<NavDropdown
  id="competitions"
  active={pathname.startsWith("/competitions")}
  …
  label="Competitions"
  items={[
    { label: "External Competition Entries", disabled: true },
    { label: "Club Competitions", disabled: true },
    { label: "NWG Competitions", disabled: true },
    { label: "Judging Platform", disabled: true },
  ]}
/>
```

It has no capability condition, so every active user sees it. The landing page
`app/(protected)/competitions/page.tsx` shows only a heading and breadcrumb.

**How "greyed out" works:** `type DropdownItem = { label: string; href: string } | { label:
string; disabled: true }`. `NavDropdown` branches on `"href" in item`:
- An enabled item renders as `<a href className="… text-slate hover:bg-background hover:text-ink">`.
- A disabled item renders as `<span aria-disabled="true" className="block cursor-default px-3 py-2
  text-sm text-slate-light">`, with no href and no handler.

The trigger itself is never disabled. 7 disabled items exist today: the 4 Competitions items,
Programme Resources, Coaching Guides, HR Links and My Compliance. That's 8 counting Club
Profile's conditional "No sites available".

**Adding Competition Calendar first, and ungreying External Competition Entries.** This is
one edit to the `items` array:

```tsx
{ label: "Competition Calendar", href: "/competitions/calendar" },
{ label: "External Competition Entries", href: "/competitions/external-entries" },
{ label: "Club Competitions", disabled: true }, …
```

New pages must go under `app/(protected)/competitions/…`. The `(protected)` layout is the
only auth gate (`proxy.ts` only refreshes the cookie), so a folder at `app/competitions/` would
be publicly reachable. `competitions-nav-phase1.md` §5 proposed the `/competitions/external-entries`
slug. `/competitions/calendar` is new, and nothing conflicts with it: there's no other
`competitions` folder, no rewrites and no `/api/competitions`.

Also needed:
- update CLAUDE.md's Competitions nav bullet
- breadcrumbs are hard-coded on each page (`Home / Competitions / <b>…</b>`)
- the dropdown's `min-w-[190px]` already fits "External Competition Entries"

Dropdown items have no active state, so nothing is needed for that.

## 2. Permissions, app layer

**Capability names:** `lib/capabilities.ts`, `export type Capability`. There are **9** of them.
Which titles hold which capability is set **only** in the database, in
`title_has_capability()` (0026). The app never sees title lists.
`lib/profileOptions.ts` `JOB_TITLES` only feeds the dropdown and the create-user validation.

| # | Capability | Kind | Held by |
|---|---|---|---|
| 1 | `view_all_sites` | global | Regional General Manager (RGM), Head of Gymnastics (HOG), Head of Operations (HOO) |
| 2 | `all_sites_scope` | global | RGM, HOG, HOO |
| 3 | `publish_whats_new` | global | RGM, HOG, HOO |
| 4 | `manage_policies` | global | RGM, HOG, HOO |
| 5 | `manage_users` | global | RGM, HOG, HOO |
| 6 | `edit_rota` | site-scoped | Lead Coach, Club Head Coach (CHC), RGM, HOG, HOO |
| 7 | `manage_club_meetings` | site-scoped | Lead Coach, CHC, RGM, HOG, HOO |
| 8 | `manage_club_updates` | site-scoped | Lead Coach, CHC, RGM, HOG, HOO |
| 9 | `manage_club_roles` | site-scoped | CHC, RGM, HOG, HOO |

`Coach` holds none of them. Every capability requires `active = true`.

**How the app reads them:**
- `getCapabilities()` (React `cache()`, the `my_capabilities()` RPC) returns `{ caps:
  ReadonlySet<Capability>, ownSiteId }`. It fails closed to an empty set.
- `ownSiteId` is the `rota_sites.id` whose `name` equals `profiles.site`, and it's null for
  Head Office.

**How full access and own-site scoping work:**
- "Full access" isn't a flag. It's simply holding `view_all_sites` / `all_sites_scope` (in
  practice, the 3 titles).
- Own-site scoping is `hasSiteCapability(c, cap, siteId)`:
  `c.caps.has(cap) && (c.caps.has("all_sites_scope") || c.ownSiteId === siteId)`.
- The site list comes from `getSiteAccess()` → `resolveSiteAccess()` (`lib/rota/`). A
  `view_all_sites` holder gets all sites. Everyone else gets the site whose `rota_sites.name ===
  profiles.site`. A Head Office profile without `view_all_sites` gets
  `profile-site-unmatched`.
- **Nothing in the app or the DB checks `profiles.site = 'Head Office'` for permissions.** The
  one `.eq("site", "Head Office")` (`club-profile/[siteSlug]/page.tsx`, Staff Roles picker)
  only lists people.

**Adding new capabilities** (the documented rule, CLAUDE.md + `lib/capabilities.ts` header). A
new name goes in 3 places, all in the same change:
1. a `when '<cap>' then p_job_title in (…)` branch in `title_has_capability()` (re-created
   with `create or replace` in the new migration)
2. the name array in `my_capabilities()` (also `create or replace`)
3. the `Capability` union in `lib/capabilities.ts`

For example:

```sql
when 'sign_off_competitions' then p_job_title in ('Head of Gymnastics')
when 'approve_judges'        then p_job_title in ('Regional General Manager', 'Head of Gymnastics')
when 'confirm_comp_pricing'  then p_job_title in ('Club Head Coach', 'Head of Gymnastics')  -- site-scoped
```

Two things to note:
- `has_site_capability()` checks `has_capability(cap)` *before* `all_sites_scope`. So a
  site-scoped `confirm_comp_pricing` would give CHC their own site and HOG every site. RGM
  and HOO wouldn't get it, even though they hold `all_sites_scope`. That's the brief's rule,
  with no new helper.
- Use snake_case names (`sign_off_competitions`), not the brief's `canSignOffCompetition`,
  to match the existing 9.

## 3. Permissions, DB layer

**Helper functions: 4**, all live:

| Function | Defined | Security | search_path | Volatility | Grants |
|---|---|---|---|---|---|
| `is_active_coach() → boolean` | 0014 | DEFINER | `public` | stable | revoke public, anon; grant authenticated |
| `title_has_capability(p_job_title text, p_cap text) → boolean` | 0026 | **INVOKER** | `''` | immutable | revoke public, anon, **authenticated**; explicit grant service_role (0027) |
| `has_capability(p_cap text) → boolean` | 0026 | DEFINER | `''` | stable | revoke public, anon; grant authenticated |
| `has_site_capability(p_cap text, p_site_id uuid) → boolean` | 0026 | DEFINER | `''` | stable | revoke public, anon; grant authenticated |

`is_active_coach()` body: `select exists (select 1 from public.profiles where id = auth.uid() and active)`.
Despite the name it means "any active Hub user", whatever their title.
`has_site_capability()` returns false for a null site, and its own-site branch is the
`p.site = s.name` join. Head Office has no `rota_sites` row, so a Head Office profile only
ever gets a site through `all_sites_scope`.

**All live public functions: 14.** The 4 helpers above, plus:
- `profiles_guard_privileged_columns` (trigger function)
- 9 RPCs: `my_capabilities`, `site_role_candidates`, `resolve_profile_names`,
  `site_rota_roster`, `site_rota_people`, `upsert_weekly_rota`, `upsert_restructure`,
  `create_weekly_rota`, `copy_into_weekly_rota`

`is_admin()` and `can_edit_rota()` were dropped in 0028.

**RLS policy counts (static replay):**
- **72** live policies in `public`, across 27 tables. There are 0 `storage.objects` policies,
  by design (0023).
- **34 on the 11 `rota_*` tables:**
  - 1 select each on `rota_sites`, `rota_categories` and `rota_class_catalogue`
  - 4 each (select/insert/update/delete) on `rota_standard_roster`, `rota_standard_classes`,
    `rota_weekly_roster`, `rota_weekly_classes`, `rota_restructures`, `rota_restructure_roster`
    and `rota_restructure_classes`
  - 3 on `rota_weekly_rotas` (0030 dropped its insert policy, so weeks are created only through
    `create_weekly_rota`)

**The reference pattern** (0026, e.g. `rota_standard_roster`):

```sql
-- read: own site, or view_all_sites
using ( public.is_active_coach() and (
  public.has_capability('view_all_sites')
  or exists (select 1 from public.rota_sites s
             join public.profiles p on p.site = s.name
             where s.id = rota_standard_roster.site_id and p.id = auth.uid()) ) )

-- write: site-scoped capability
with check ( public.is_active_coach()
  and public.has_site_capability('edit_rota', rota_standard_roster.site_id) )
```

Child tables without their own `site_id` pass `(select parent.site_id from parent where
parent.id = child.parent_id)` as a scalar subquery. Writes use `insert` = `with check` only,
`delete` = `using` only, and `update` = both, so a row can't be moved to another site.

**The precedent closest to "any active coach edits their own site":** `heroes` and
`hero_hours` (`*_all_own_site_or_all_sites`, 0026). These are `for all` policies gated on
`is_active_coach() and (has_capability('all_sites_scope') or <own-site join>)`. They're the
**only 2** write policies a `Coach` passes today. Every other write policy needs a capability
Coach doesn't hold.

**The "everyone reads everything" precedent** (what the calendar needs):
`policies_select_authenticated` (0023) and `whats_new_select_authenticated` (0025) both use
`using (public.is_active_coach())`.

**Head Office string:** exactly `'Head Office'`, enforced by the `profiles.site` CHECK
constraint in 0001: `check (site in ('Burnley', …, 'Wolverhampton', 'Head Office'))`. The app
lists it in `lib/profileOptions.ts` (`SITES`, 8 entries including `"Head Office"`). The 7 real
sites also exist as `rota_sites` rows (`name` unique since 0014, plus `slug`, `sort_order` and
`active`). That table is what every site FK points to.

## 4. resolve_profile_names()

The current definition (0014, replacing 0008):

```sql
create or replace function public.resolve_profile_names(profile_ids uuid[])
returns table (id uuid, full_name text)
language sql security definer set search_path = public stable
as $$
  select p.id, p.full_name from public.profiles p
  where p.id = any(profile_ids) and public.is_active_coach();
$$;
revoke execute … from public; revoke execute … from anon;
grant execute … to authenticated;
```

**Callers:** 1 wrapper, `lib/clubProfile/names.ts` `resolveProfileNames()`, which is used only by
`app/(protected)/club-profile/[siteSlug]/page.tsx` for update authors and role assignees.
Rota names use `site_rota_people()` instead.

**Can it back a judge picker? No.** It needs ids as input, so it can name people but can't
*list* them. Note that it resolves **any** profile id, from any site, active or not, for any
active caller. Its only privacy protection is that ids are hard to obtain. It doesn't return `site`.

No existing function lists profiles company-wide to a non-`manage_users` caller:
- `site_role_candidates` and `site_rota_roster` are single-site and exclude Head Office.
- `profiles` RLS returns only your own row unless you hold `manage_users`.

**What's needed:** a new definer RPC in 0032, in the 0029 style:

```sql
create function public.comp_judge_candidates()
returns table (id uuid, full_name text, site text)
language sql security definer stable set search_path = ''
as $$
  select p.id, p.full_name::text, p.site::text from public.profiles p
  where p.active and public.is_active_coach()   -- plus any extra caller gate Jamie wants
  order by p.full_name;
$$;
-- revoke public, anon; grant authenticated
```

It should return no email, job title or active flag. This would be the **first company-wide
staff directory any Coach can read**, which is a decision for Jamie (see Open questions).
Two things to decide:
- whether "any active coach" includes Head Office and full-access titles; the brief says
  "any active coach company-wide"
- whether to filter by job title

For displaying judges already assigned to an entry, `resolve_profile_names()` already works.

## 5. RPC patterns

| | `create_weekly_rota(uuid, date, uuid default null)` | `upsert_weekly_rota(uuid, date)` | `upsert_restructure(uuid)` |
|---|---|---|---|
| File | 0030 | 0030 (5th version) | 0026 (2nd version) |
| Security | DEFINER, plpgsql | DEFINER, plpgsql | DEFINER, plpgsql |
| search_path | `''` | `''` (moved from `public` in 0030) | `public` (older style) |
| Grants | `revoke all … from public`, `from anon`; `grant execute … to authenticated` | same | `revoke execute` public/anon; grant authenticated |

**The checks inside, in this order, with fixed messages** (the app shows them as written):

```sql
if not public.is_active_coach() then raise exception 'Your account has been deactivated'; end if;
if not public.has_capability('edit_rota') then raise exception 'Your job title does not have rota edit rights'; end if;
if not public.has_site_capability('edit_rota', p_site_id) then raise exception 'Not authorized to generate a rota for this site'; end if;
```

These are plain `raise exception`, so they come back as SQLSTATE `P0001`. Validation errors use
explicit codes:
- `using errcode = '22023'` (not a Monday, out of range)
- `'P0002'` (not found)
- a natural `23505` (a duplicate, from a missing `on conflict`)

`upsert_weekly_rota` locks its row with `select … for update` before deleting and refilling the
week. `copy_into_weekly_rota` is internal: it does no authorisation itself, it has
`revoke all` from public/anon/**authenticated**, and only the definer RPCs call it.

**How the app calls them:** directly from client components with the browser client
(`lib/supabaseClient.ts`), then it refreshes. In `components/rota/AddWeek.tsx`:

```ts
const { error: rpcError } = await supabase.rpc("create_weekly_rota", { p_site_id, p_week_start, p_source_weekly_rota_id });
if (rpcError.code === "23505") … else if (rpcError.code === "P0002") … else setError(`Couldn't add the week: ${rpcError.message}`);
startTransition(() => router.refresh());
```

`useGenerateWeek.ts` and `useGenerateRestructure.ts` follow the same shape. No API route or
server action wraps them.

## 6. Audit / logging

- **There are no audit or activity tables and no logging triggers.** A search of all 30 migrations
  for `trigger|audit|activity|_log` finds 1 trigger in the whole schema:
  `profiles_guard_privileged_columns` (BEFORE UPDATE on `profiles`, 0026, recreated in 0028).
  It's a **guard**, not a logger. It's SECURITY INVOKER on purpose, because its bypass reads
  `current_user` (`postgres`, `supabase_admin` and `service_role` are trusted), and it raises
  `42501`.
- **No `updated_at` trigger convention**, and this is stated explicitly. 0009: *"There is no
  updated_at trigger convention in this project to follow."* 0023 and 0025 repeat it.
  `updated_at` defaults to `now()`, and the client sets it on edit (`rotaDataSource.ts`,
  `WhatsNewFeed.tsx`, `ClubUpdates.tsx`, `api/policies/upload/route.ts`).
- **Who/when columns in use:**
  - `created_by uuid references public.profiles (id) on delete set null`: `club_updates` and
    `whats_new`. Also `uploaded_by` (policies) and `logged_by_coach_id` (hero_hours), in the
    same style.
  - `generated_by uuid references auth.users (id)` + `generated_at`: rota weekly and restructure
    parents. This is the one place that points at `auth.users`, not `profiles`.
  - `created_at timestamptz not null default now()`: almost every table.
  - Coach FKs since 0029: `references profiles(id) on delete restrict` ("deactivate, don't delete").
- **There's no `updated_by` anywhere.**

So the activity log + triggers in 0032 would be a new convention. 3 design points follow from
what exists:
1. **A logging trigger function must be SECURITY DEFINER**, so it can insert into a log table
   clients can't write. Inside a definer, `current_user` is the owner. Take the actor from
   `auth.uid()`, which is unchanged under definer. That makes it null for `service_role` and
   SQL Editor writes, and the log should allow it.
2. CLAUDE.md's warning about definer functions bypassing the `profiles` guard only matters if the
   log trigger writes to `profiles`. It shouldn't.
3. **Redaction:** build `old`/`new` with `to_jsonb(old) - '{gymnast_name,dob,…}'::text[]`, or keep
   child PII in one table whose trigger logs only ids and non-PII columns. The 12-month blanking
   update itself fires the trigger, so it must not log old values either.

## 7. Migrations

- **Latest:** `0030_rota_create_weekly_rota.sql`. Filename convention: `NNNN_snake_case_summary.sql`,
  4-digit, contiguous. **0031 and 0032 are free**: there's no file, and no doc reserves either
  number.
- **Conventions** (0026 onward, and consistent since):
  - A header comment block: what the file does in numbered order, what it deliberately does
    NOT do, links to the approving investigation doc, and "No down migration, matching
    0001–00NN".
  - `begin; … commit;` wrapping the whole file. 0030 says: "Applied manually by Jamie as a single
    paste in the Supabase SQL Editor."
  - Guard `do $$ … raise exception '… Nothing has been applied.' $$` blocks before risky steps.
  - Every function: `revoke execute … from public`, `from anon`, then `grant execute … to
    authenticated` (the 0012 rule). Since 0028, new tables created by `postgres` no longer default
    to anon, but 0023 and 0025 still restate `revoke all on table … from public/anon; grant select,
    insert, update, delete … to authenticated`.
  - `set search_path = ''` with schema-qualified references is current practice (0026+). RETURNS
    TABLE columns are alias-qualified and cast `::text`.
  - Drops are `restrict` with no `if exists`, so drift fails loudly.
  - Verification SQL lives beside the reports (`docs/investigations/permissions-p3-verification.sql`,
    `permissions-p5-verification.sql`), with "Paste A before / Paste B after". 0029 and 0030
    have their own reports (`rota-retcon-0029-verification.md`, `rota-landing-0030-migration.md`).

## 8. Dates and calendar building blocks

**`lib/rota/week.ts`** (UTC-midnight `Date`s, "YYYY-MM-DD" strings):
- `londonToday()` uses `Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London" })` and returns
  UTC midnight.
- Also: `parseWeekDate` (strict), `formatWeekDate`, `addDays`, `isMonday`, `mondayOf`,
  `currentMonday`, `weekDayLabels`, `weekRangeLabel` ("4–10 Aug 2026"), `weekRangeShort`,
  `weekOffset` and `relativeWeekLabel`.
- Month names are spelled out (`MONTHS_SHORT`) instead of coming from Intl, to keep labels stable
  across ICU versions.

The DB side matches: `(now() at time zone 'Europe/London')::date` in `create_weekly_rota`.

Other helpers:
- `lib/rota/landing.ts`: `gridWeeks(thisMonday)` gives N week columns `{monday, label, range}`.
- `lib/clubProfile/meetings.ts`: `cycleWeeksInMonth(cycleWeeks, ref)` assigns a week to the month
  its Monday falls in ("Rule A").
- `lib/clubProfile/format.ts`: `relativeDay`, `ageFromDob`.
- `lib/whatsNew/format.ts`: `formatPublished`.

**How existing pages compute weeks and months:**
- **Weekly Overview** (`app/(protected)/gymnastics/weekly-overview/page.tsx`) reads
  `programme_gymnastics_weeks` and `programme_preschool_weeks` by `week_commencing`.
  It groups them into months by the Monday's month (its own copies of `MONTHS_SHORT` and
  `MONTHS_FULL`, so that's the 2nd copy). It renders `components/gymnastics/WeeklyOverviewAccordion.tsx`
  (client, `MonthGroup[]`, opens the current month by default).
- **Rota** works on Mondays from `currentMonday()`.

**Reusable components:**
- **Season grid (weeks × sites):** `app/(protected)/rota/page.tsx`, the all-sites grid (commit
  `b759896`), is the closest precedent but transposed (sites × 4 weeks). It's a plain `<table>`
  in `overflow-x-auto rounded-card border border-line bg-card shadow-card` with
  `min-w-[760px]`, a `bg-background` header row with the current week in `text-orange-dark`,
  and `RotaStatusChip` cells. It's page-inline markup, not a component. A season grid would copy
  the pattern. Note that 7 site columns × ~40+ week rows is a different scale from 8 × 4.
- **Month view:** nothing exists. There's no month calendar (7-column day grid) anywhere.
  `WeeklyOverviewAccordion` (month accordion of week rows) is the closest fit for a **list
  view grouped by month**.
- `AttendanceGrid.tsx` (Mon–Sun × coaches table) is a small read-only table precedent.

## 9. Dashboard

`app/(protected)/page.tsx` is a server component with a 2-column grid
(`lg:grid-cols-[1fr_340px]`):
- main column: `WeeklyFocusHero`, `ProgrammeTiles`, `HowToStrip`
- `<aside>`: `WhatsNewCard`, `QuickLinksCard`, `ComplianceCard`, in the CLAUDE.md order

**`components/dashboard/WhatsNewCard.tsx`** is a self-fetching async server component with no
props:

```ts
supabase.from("whats_new").select("id, title, body, link_url, link_label, published_at")
  .order("published_at", { ascending: false }).limit(3)
```

It relies on RLS for gating (`is_active_coach()`). The card is
`mb-5 overflow-hidden rounded-card border border-line bg-card shadow-card` with an `<h4>` header
holding an "All" link, rows with `border-b border-line px-[18px] py-3`, and an empty state of
"Nothing new right now.".

**Where a "Competitions needing action" panel would go:** as a sibling self-fetching server
component (e.g. `components/dashboard/CompetitionsActionCard.tsx`) in the `<aside>`, using the
same card shell. CLAUDE.md fixes the sidebar order as exactly What's New → Quick Links → My
Compliance, so **where it goes is Jamie's call**. Adding it changes a documented layout.
`RotaHomeSidebar.tsx` "Needs attention" (driven by `needsAttention()` in `lib/rota/landing.ts`)
is the precedent for computed "action" lists.

Also, unrelated but visible: the dashboard's date line is still hard-coded,
`Monday 27 July 2026 · Here's what's on…`.

## 10. Exports

**PDF:** only `components/rota/RotaExportButton.tsx` (client). It lazy-imports
`html2canvas-pro` ^2.3.3 and `jspdf` ^4.2.1. Its `run()` does this:
1. `planExport()` (`lib/rota/exportLayout.ts`)
2. renders `RotaExportLayout` off-screen
3. waits 2 rAFs
4. `html2canvas(node, …)` → `new jsPDF({ orientation: "landscape", unit: "px", format: [pageW, PAGE_H] })`
   → `addImage(PNG)` → `pdf.save(\`${spec.fileBase}.pdf\`)`

**Reusability:** the capture-and-save mechanism (about 30 lines) is generic. Everything else
(`planExport`, page geometry and hex colour constants, `RotaExportLayout`) is rota-specific. It
produces **one bitmap page**, so the text isn't selectable and it can't paginate. That's fine for
a single-page season grid snapshot, but poor for a multi-page entry list.

**CSV:** there's none. No `text/csv`, `Blob`, or `download=` anywhere in `app/`, `components/`
or `lib/`.

## 11. Data access conventions

- **Reads:** async **server components** using `createClient()` from `lib/supabaseServer.ts`
  (`@supabase/ssr` `createServerClient`, cookie session). Pages fetch in parallel with
  `Promise.all`. `getCurrentProfile()` and `getCapabilities()` are `cache()`-wrapped.
- **Writes:** **client components** calling the browser client (`lib/supabaseClient.ts`,
  `createBrowserClient`) directly, against RLS or definer RPCs, then `router.refresh()`.
  12 files import it, including `UsersTable`, `PoliciesLibrary`, `WhatsNewFeed`,
  `AddWeek`/`DeleteWeek`, `ClubUpdates`, `StaffRolesModal` and `lib/rota/rotaDataSource.ts`.
- **API routes:** only where the secret key is needed. 5 routes:
  - `api/admin/create-user`, `api/admin/reset-password` (`requireCapability("manage_users")`)
  - `api/policies/upload`, `api/policies/delete` (`requireCapability("manage_policies")`)
  - `api/policies/signed-url` (`requireActiveCoach()`)
- **Server actions:** 1 file, `app/login/actions.ts`. Not used for data writes.
- **Keys:**
  - `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the publishable key): both
    server and browser clients.
  - `SUPABASE_SECRET_KEY`: only `lib/supabaseAdmin.ts` `createAdminClient()`, used only by
    those 5 routes.

Competitions needs no secret key. Everything can be RLS plus definer RPCs.

## 12. UI primitives

- **Modal:** `components/Modal.tsx` (`title`, `onClose`, `wide` = `max-w-3xl` with scroll). The
  rota board has its own CSS-module modal, which doesn't work outside the board.
- **Form styles:** `components/formStyles.ts` exports `inputClass`, `labelClass`,
  `primaryButtonClass`, `secondaryButtonClass` and `rowActionClass`, already at the CLAUDE.md
  density tokens. There are no shared `<Input>`/`<Select>` components, only class strings.
- **Pills/badges:** there's no shared component. Each one has a local status → class map:
  - `RotaStatusChip.tsx`: `rounded-full px-[9px] py-[3px] text-[10.5px] font-bold`. It's the
    only exported chip, and its type is rota-specific.
  - `HowToStrip.tsx`, `ComplianceCard.tsx`: `px-[10px] py-1 text-[11px]`
  - `AttendanceGrid.tsx` `StatusBadge`
  - `RoleBadge.tsx`
  - Status dots: `WhatsNewCard` (`h-[7px] w-[7px] rounded-full bg-orange`)
- **Tables:** no component. Inline `<table>` in `UsersTable.tsx`, `rota/page.tsx` and
  `AttendanceGrid.tsx`.
- **`@theme` tokens** (`app/globals.css`):
  - `--color-status-green #2E9E5B`, `--color-status-amber #E0A11B`, `--color-status-grey #9AA2AB`
  - orange ×4, slate ×3, ink, line, background, card
  - `--radius-card 14px`, `--shadow-card`
- **There's no red token.** Red and amber tints are inline hexes, and they're inconsistent:

  | Status | Where | Classes |
  |---|---|---|
  | Green | everywhere | `bg-[#E6F5EC] text-status-green` (consistent) |
  | Amber | `ComplianceCard`, `HowToStrip` | `bg-[#FCF3DD] text-[#B07C0C]` (darker text than the token) |
  | Amber | `AttendanceGrid` | `bg-[#FDF2DC] text-status-amber` |
  | Red/orange | `ComplianceCard` "Action", `AttendanceGrid` sick | `bg-[#FDEAE0] text-[#C25218]` |
  | Red | `RotaStatusChip`, error banners | `bg-[#fdecea] text-[#a02a1c]` |
  | Grey | everywhere | `bg-[#EEF0F2] text-status-grey` |

  Health indicators (overdue / due soon / missing / waiting) need a decided red and amber.
  Reusing `ComplianceCard`'s set (whose "Valid / 32 days / Action" is semantically the same
  thing) would be the no-new-colour option.
- **Density:** CLAUDE.md's 2026-07-29 sizing table (buttons `px-3.5 py-2 text-[13px]`, row actions
  `px-2 py-1 text-xs`, inputs `px-2.5 py-1.5 text-sm`) is encoded in `formStyles.ts`.

## 13. Email, mailto, clipboard

There's **none of any of these**. No `navigator.clipboard`, `mailto:`, or email library
(nodemailer/resend/sendgrid) in `app/`, `components/`, `lib/` or the migrations. The only
email-related text is commented-out SMTP defaults in `supabase/config.toml`.

A "copy summary" button would be the first clipboard use. `navigator.clipboard.writeText` needs a
secure context, so it's fine on HTTPS and localhost.

## 14. Tooling

- `package.json` scripts: `dev`, `build` (`next build`, which also typechecks), `start`, `lint`
  (`eslint`, flat config `eslint.config.mjs` = `eslint-config-next` core-web-vitals +
  typescript).
- There's no `typecheck` script. Use `npx tsc --noEmit` (`tsconfig.json` has `"strict": true`)
  or `npm run build`.
- **There are no tests**: no `*.test.*`/`*.spec.*` files, and no jest/vitest/playwright config or
  dependency. `lib/rota/resolveSiteAccess.ts` says it's kept pure "so it can be exercised directly
  in tests", but none exist. Verification so far has been manual test plans and SQL paste files
  (`rota-retcon-p3-test-plan.md`, `permissions-p3-curl-checks.md`).
- Stack: Next 16.2.12, React 19.2.4, Tailwind v4, `@supabase/ssr` ^0.12.4, supabase-js ^2.111.0.

## 15. Risks and conflicts

1. **CLAUDE.md says "NOT a … gymnast management system … Do not build gymnast/class CRUD
   features here."** A per-gymnast payment checklist with child names and DOBs is gymnast data
   CRUD, so this directly conflicts with that line. It needs Jamie's explicit approval and a
   CLAUDE.md change before 0032. The only child-adjacent data stored today is `heroes` (`name`,
   `dob`, `email`, 0007).
2. **CLAUDE.md's v1 scope lists Notifications as "static placeholder only"** (the bell in
   `NavBar.tsx` is a non-functional `<div>`). In-Hub notifications would be the first real
   notification system: it needs a table, an unread state and a bell badge. That's a scope
   expansion to approve explicitly, and it may be worth deferring.
3. **The brief's "Head Office = all sites" rule doesn't match the permission model.**
   - All-site access today comes from **job title** (`view_all_sites`/`all_sites_scope` → RGM,
     HOG, HOO), never from `profiles.site`.
   - `job_title` and `site` are independent columns. A Coach could sit at Head Office, and an RGM
     could sit at a club.
   - Writing `site = 'Head Office'` into RLS would add a second, site-based permission source.
     That goes against "the matrix lives only in the database" and the reason P3–P5 happened.
   - Recommendation: express it as capabilities (§2). The brief is also silent on **HOO**:
     under the title model HOO gets all sites, and under "Head Office" HOO gets them only if
     their site is Head Office.
4. **"Coach holds nothing" stops being true in spirit.** An entry table writable by any active
   coach at their own site follows the `heroes`/`hero_hours` policy shape (`is_active_coach()`
   + own-site, no capability). That's an existing precedent, but those are the only 2 Coach-writable
   policies today, and CLAUDE.md doesn't mention them. Choose one:
   - **(a)** no capability: the heroes pattern, which keeps the matrix unchanged
   - **(b)** a new site-scoped capability that includes `Coach`, the first one. This is more
     explicit and revocable per title later.
5. **Gated transitions can't be done with RLS alone.** RLS can't compare old and new
   `status`, so "only HOG may move `awaiting_signoff → signed_off_collecting`" needs one of:
   - status changes only through definer RPCs (the `create_weekly_rota` pattern), with the
     status column guarded from direct update
   - a BEFORE UPDATE guard trigger (the `profiles_guard_privileged_columns` pattern)

   If a guard trigger is used, it must be SECURITY INVOKER for the reason 0026 gives, and must
   trust `service_role`/`postgres`.
6. **Triggers are a new convention** (§6). Only 1 trigger exists. An activity-log trigger on
   every entry table is new territory: definer, actor from `auth.uid()`, redaction. The
   "no updated_at trigger" convention means updated_at stays client-set unless 0032 changes that
   on purpose.
7. **A company-wide judge picker exposes a staff directory** (§4). There's no current path for a
   Coach to list people outside their site. It's a new definer RPC and a privacy decision.
8. **Site FK target is `rota_sites`.** The name is rota-prefixed but it's the de facto sites table
   (Club Profile and meetings use it too). `comp_event_sites.site_id` / `comp_entries.site_id`
   should reference `rota_sites(id)`. Head Office has no row, so it can never be an entry's site.
   That's correct.
9. **Naming:** no `comp_` objects, and the only "competition" strings in the schema are 2 seeded
   club roles in 0007: `'Club competition'` (Admin) and `'Competition Co-ordinator'`. The brief's
   "coordinator" may mean that club role, and nothing links them today. `comp_` is unambiguous,
   but `competition_` would read better next to `club_`/`rota_`/`whats_new`. It's a style call.
10. **Mixed FK target for "who did it":** `generated_by → auth.users` (rota) vs `created_by →
    profiles on delete set null`. New tables should use `profiles(id)`. Use `on delete restrict`
    for people who are *assigned* (staff/judges, the 0029 rule) and `set null` for authorship
    columns.
11. **Nav width:** Phase 1 nav estimated the 8-tab row at ~1,160px for a `manage_users` holder.
    Adding a dropdown *item* doesn't widen the row, so there's no new risk.
12. **No tests or test runner** (§14). RLS and transition rules would be verified the 0026–0030
    way: SQL paste files and a manual test plan per job title.
13. **The Club Competitions / NWG Competitions placeholders overlap the calendar's event types**
    ("NWG All Competition", "NWG Club Competition"). Decide whether those nav items stay as
    separate future pages or become calendar filters.

---

## Recommendations for 0031/0032

**0031: `comp_events`, `comp_event_sites`.** Calendar only, low risk.
- `comp_events`: `id`, `title`, `event_type text check (in the 4 types)`, `start_date date`,
  `end_date date` (`check end_date >= start_date`), venue/location, organiser, entry deadline
  (needed for the health indicators), notes, `created_by → profiles on delete set null`,
  `created_at`, `updated_at`. Keep dates as `date`, not `timestamptz`, to match `week_start_date`
  and the "YYYY-MM-DD" helpers.
- `comp_event_sites`: `(event_id → comp_events on delete cascade, site_id → rota_sites)`, PK on
  both, with an index on `site_id`.
- RLS:
  - **select** `using (public.is_active_coach())` on both tables (the 0023/0025 read-all pattern)
  - **writes** gated by a capability. That's either an existing global one or a new
    `manage_comp_calendar`, which needs Jamie to decide who maintains the calendar.
- Header, `begin/commit`, revokes/grants and a verification paste, all per §7.

**0032: entries, RPCs, activity log.**
- Tables: `comp_entries` (one per `(event_id, site_id)`, unique), `status text check (10 values)`,
  `po_number`, timestamps per milestone. Also `comp_entry_gymnasts` (all child PII lives
  **only** here, plus the payment checklist columns and `withdrawn` + note), `comp_entry_staff`
  (`profile_id → profiles on delete restrict`, `role` coach/judge, `judge_status`), and
  `comp_activity_log` (append-only: `entity`, `entity_id`, `entry_id`, `action`, `actor
  default auth.uid()`, `at`, `old jsonb`, `new jsonb`).
- **Capabilities** (title_has_capability + my_capabilities + `lib/capabilities.ts`, all 3 in
  this file):
  - `sign_off_competitions`: HOG, global
  - `approve_judges`: RGM, HOG, global
  - `confirm_comp_pricing`: CHC, HOG, site-scoped
  - optionally `edit_comp_entries` (site-scoped, all 6 titles) if option 4(b) is chosen
- **RLS:** entries and child rows readable/writable at own site or `all_sites_scope` (the
  heroes shape). The log has **select only** (scoped through its entry) and no
  insert/update/delete policy, so only the definer trigger writes it.
- **Status transitions only through a definer RPC** (`comp_entry_transition(entry_id, to_status,
  po_number default null)`). It does the `create_weekly_rota`-style checks with fixed messages
  and explicit errcodes, plus the gated-transition checks. Block direct `status` updates with
  an invoker guard trigger or column-level privileges.
- **Judge picker RPC** `comp_judge_candidates()` → `id, full_name, site`, in the §4 shape.
- **Logging trigger** (one definer function attached AFTER INSERT/UPDATE/DELETE to each entry
  table) with redaction of the gymnast PII keys. The 12-month blanking should run as a definer
  function that sets a flag the trigger recognises, so blanked values never reach the log.
- Consider splitting 0032. RPCs, guard triggers and the logger are a lot for one paste, and
  0026 is the only precedent for a file that large.

## Open questions for Jamie

1. **Gymnast data:** do you approve storing child names/DOBs in the Hub, given CLAUDE.md's "not a
   gymnast management system" rule? Should CLAUDE.md be amended? Is DOB actually needed (is age
   group enough?), and who runs the 12-month removal?
2. **All-sites access:** should it be by **job title** (the existing model: RGM/HOG/HOO) or by
   **`site = 'Head Office'`** (the brief)? Should HOO have all-site access to entries?
3. **Coach write access:** heroes-style own-site policy with no capability (a), or a new
   site-scoped capability that includes Coach (b)?
4. **Calendar maintenance:** who can create and edit `comp_events`? Every active coach,
   full-access titles only, or HOG only?
5. **Judge picker scope:** every active profile company-wide, including Head Office and
   full-access titles, or only Coach / Lead Coach / CHC? Is exposing names + site to every coach
   acceptable?
6. **Notifications:** build in-Hub notifications now (lifting the bell out of placeholder scope),
   or defer and rely on the dashboard panel plus health indicators?
7. **Dashboard panel:** where in the sidebar does "Competitions needing action" go, given the fixed
   What's New → Quick Links → My Compliance order? Who sees it (everyone, or only people with
   actions)?
8. **Season definition** for the grid: Sep–Aug, Jan–Dec, or another range? What's the week
   anchor (Monday, as elsewhere)?
9. **Routes:** `/competitions/calendar` and `/competitions/external-entries`, OK?
10. **Status colours:** reuse ComplianceCard's green/amber/red-orange set for the health
    indicators, or define a red token?
11. **Exports:** is a PDF or CSV of the season grid or an entry list wanted? Only the rota PDF
    exists, and it's a single bitmap page.
12. **Table prefix:** `comp_` (as briefed) or `competition_`?
13. **Club Competitions / NWG Competitions nav items:** do they stay as separate future pages, or
    become filters of the calendar?
14. **"Coordinator":** does this mean the existing `'Competition Co-ordinator'` club role
    (0007), which could drive who's expected to run an entry, or just whoever edits it?
