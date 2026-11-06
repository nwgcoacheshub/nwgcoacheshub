# Rota landing redesign — Phase 2a-A plan (read only)

Date: 2026-10-29 (Thu). Repo at `39e2c28` (main, clean at start). `currentMonday()` today = **2026-10-26**.
Migration 0030 is applied. This is a plan only: no code, schema or data was changed, no SQL was run, nothing connected
to a database, and the secret key was not read.

Approved decisions referenced below as H1–H21 (Section H of `rota-landing-phase1-investigation.md`). Scope is 2a only:
route move, removal of the old week-creation UI, and a **read-only** site landing page. No Add week, no Delete week,
no all-sites grid, no first-run view.

## Pre-read

| # | Source | Read |
|---|---|---|
| 1 | `CLAUDE.md` | Yes |
| 2 | `docs/investigations/rota-landing-phase1-investigation.md` | All (A–H) |
| 3 | `docs/investigations/rota-landing-0030-migration.md` | All, incl. section 4 raise conditions |
| 4 | `reference/Rota home – mockup.html` | Site-home view (L220–268) and script data shapes (L326–468) |
| 5 | `app/(protected)/rota/` (5 files), `components/rota/` (15 files), `lib/rota/` (8 files) | All 28 |
| 6 | `lib/capabilities.ts`, `lib/getCurrentProfile.ts`, `lib/supabaseServer.ts` | All 3 |
| 7 | Repo-wide search for `/rota` string literals in `app/`, `components/`, `lib/`, `proxy.ts` | Section 1.2 |

---

## 1. Routing, before and after

### 1.1 Routes

| # | URL now | URL after | File | Change |
|---|---|---|---|---|
| 1 | `/rota` | `/rota` | `app/(protected)/rota/page.tsx` | **Unchanged.** Still `redirect('/rota/{homeSlug}')`, which now lands on the landing page (H2). |
| 2 | `/rota/[siteSlug]` = Standard board | `/rota/[siteSlug]` = **landing page** | `app/(protected)/rota/[siteSlug]/page.tsx` | **Rewritten** as the landing page (H1). |
| 3 | — | `/rota/[siteSlug]/standard` = Standard board | `app/(protected)/rota/[siteSlug]/standard/page.tsx` | **Created**: today's `[siteSlug]/page.tsx` body, with `RotaViewTabs` → `RotaHomeLink` and its unknown-site redirect → `/rota/{homeSlug}/standard`. |
| 4 | `/rota/[siteSlug]/week` → current Monday | `/rota/[siteSlug]/week` → landing | `app/(protected)/rota/[siteSlug]/week/page.tsx` | **Changed**: `redirect('/rota/{siteSlug}')`. Kept only for old bookmarks; the landing applies H19 (Q1). |
| 5 | `/rota/[siteSlug]/week/[weekStartDate]` | same | `…/week/[weekStartDate]/page.tsx` | **Changed**: redirects (1.2), `RotaHomeLink`, uncreated → `WeekNotCreated`, `WeekNav` gets neighbour weeks. |
| 6 | `/rota/[siteSlug]/restructure` | same | `…/restructure/page.tsx` | **Changed**: `RotaViewTabs` → `RotaHomeLink`. Redirect unchanged. |

Route files: **1 created, 4 changed, 1 unchanged, 0 deleted.**

### 1.2 Every `/rota` reference in the app: **16** (grep lines)

Search: `grep -rnE "[\"'\`]/rota" app components lib proxy.ts` → 16 lines. `proxy.ts`: 0.
By kind: **7 `redirect()`**, **1 `router.push`**, **7 link lines** (9 hrefs, because `WeekNav`'s one base string builds
3 links), **1 pathname check**. 0 `router.replace`.

| # | File:line | Kind | Points to now | Should point to |
|---|---|---|---|---|
| 1 | `app/(protected)/rota/page.tsx:16` | redirect | `/rota/{homeSlug}` (Standard) | Unchanged string → landing |
| 2 | `app/(protected)/rota/[siteSlug]/page.tsx:33` | redirect | `/rota/{homeSlug}` | Landing keeps `/rota/{homeSlug}`. The moved copy in `standard/page.tsx` → `/rota/{homeSlug}/standard` |
| 3 | `app/(protected)/rota/[siteSlug]/week/page.tsx:15` | redirect | `/rota/{site}/week/{currentMonday}` | `/rota/{site}` |
| 4 | `…/week/[weekStartDate]/page.tsx:44` (unknown site) | redirect | `/rota/{homeSlug}/week` | `/rota/{homeSlug}` |
| 5 | `…/week/[weekStartDate]/page.tsx:52` (unparseable date) | redirect | `/rota/{site}/week` | `/rota/{site}` |
| 6 | `…/week/[weekStartDate]/page.tsx:56` (non-Monday) | redirect | `/rota/{site}/week/{monday}` | Unchanged |
| 7 | `…/restructure/page.tsx:35` (unknown site) | redirect | `/rota/{homeSlug}/restructure` | Unchanged |
| 8 | `components/rota/SiteSwitcher.tsx:41` | router.push | `/rota/{slug}` (Standard) | Unchanged string → that site's landing (Q3) |
| 9 | `app/(protected)/operations/page.tsx:15` | Link | `/rota` | Unchanged |
| 10 | `components/NavBar.tsx:282` | nav item | `/rota` | Unchanged |
| 11 | `components/NavBar.tsx:269` | `pathname.startsWith("/rota")` | active state | Unchanged (still matches every rota route) |
| 12 | `components/clubProfile/AttendanceGrid.tsx:61` | `<a>` "Open the rota →" | `/rota/{site}/week` | `/rota/{site}` (direct, skips the redirect hop) |
| 13 | `components/rota/RotaViewTabs.tsx:17` | Link "Standard rota" | `/rota/{site}` | Removed (file deleted) |
| 14 | `components/rota/RotaViewTabs.tsx:18` | Link "This week" | `/rota/{site}/week` | Removed |
| 15 | `components/rota/RotaViewTabs.tsx:19` | Link "Restructure" | `/rota/{site}/restructure` | Removed |
| 16 | `components/rota/WeekNav.tsx:22` | base for 3 Links | `/rota/{site}/week/{±7 days, currentMonday}` | Same base; targets become prev/next **created** week and the current week if created (2.3) |

Net: **4 change target** (#3, #4, #5, #12), **1 moves with its file and changes** (#2), **3 removed** (#13–15),
**1 rewritten logic** (#16), **7 unchanged** (#1, #6, #7, #8, #9, #10, #11).

New `/rota` references added in 2a (for the 2a-B review): `RotaHomeLink` (1: `/rota/{site}`); landing page week cards,
previous-week items and Needs-attention items (`/rota/{site}?week={monday}`); detail "Open week"
(`/rota/{site}/week/{monday}`); Standard card (`/rota/{site}/standard`); Restructure card (`/rota/{site}/restructure`).

### 1.3 Selected week on the landing page: `?week=YYYY-MM-DD`

Held as a search param so the URL is shareable. Week cards, previous-week items and Needs-attention items are plain
`<Link>`s to `/rota/{site}?week={monday}` (`scroll={false}` on cards; Needs-attention links add `#week-detail`). Each
click re-renders the server page. This keeps the page a server component with no client selection state, and lets
Export week use the selected week's full rows without a separate fetch (3.6).

Page signature: `searchParams: Promise<{ week?: string | string[] }>` (same pattern as `whats-new/page.tsx`).

| Param | Result |
|---|---|
| Absent | Default selection per H19 (3.4). URL stays clean. |
| Array (`?week=a&week=b`) or fails `parseWeekDate` (`abc`, `2026-02-30`) | `redirect('/rota/{site}')` |
| Real date, not a Monday | `redirect('/rota/{site}?week={mondayOf(date)}')` (same canonicalising as the week route) |
| Monday, but not among the loaded weeks (uncreated, or a created past week older than the last 8) | `redirect('/rota/{site}')` → default selection (Q2) |
| Monday among the loaded weeks | Selected |

---

## 2. Removals and changes on the existing boards

### 2.1 `RotaViewTabs` → `RotaHomeLink`

Usages: **3**, all server pages: `[siteSlug]/page.tsx:98` (`active="standard"`), `week/[weekStartDate]/page.tsx:87`
(`active="week"`), `restructure/page.tsx:65` (`active="restructure"`). All 3 are replaced; the file is deleted.

New `components/rota/RotaHomeLink.tsx`, server component (no `"use client"`):

```tsx
export default function RotaHomeLink({ siteSlug }: { siteSlug: string }) {
  return (
    <Link href={`/rota/${siteSlug}`} className="text-[13px] font-semibold text-orange-dark hover:underline">
      ‹ Rota home
    </Link>
  );
}
```

It sits in the slot the tabs used (after `SiteSwitcher`, in the same flex row), so the full-height board pages lose no
vertical space. The right-hand "Home / **Rota**" crumb text is left as it is. Used on 4 pages: Standard, week board,
uncreated week, Restructure (both its branches).

### 2.2 `WeeklyRotaEmpty`, `useGenerateWeek`, uncreated week page

- **`WeeklyRotaEmpty.tsx`: deleted.** It has 1 importer (`week/[weekStartDate]/page.tsx:18`). Its only action was
  "Generate this week's rota", which raises P0002 since 0030.
- **`useGenerateWeek.ts`: kept**, since `WeeklyRotaBoard` (Regenerate) is now its only caller. Doc comment changes from
  "Generate or regenerate" to Regenerate only, and P0002 gets its own handling (2.4).
- **Uncreated week** (`rota_weekly_rotas` row missing for a valid Monday): the page renders the same head (h1 "Weekly
  rota", `SiteSwitcher`, `RotaHomeLink`, "Week of {range}", `WeekNav`), then new **`WeekNotCreated`** (server
  component), identical for every role:
  - Card (existing `max-w-xl rounded-card border border-line bg-card p-5 shadow-card`), heading "This week hasn't been
    created", body "{siteName} has no rota for the week of {weekRange}.", link "‹ Rota home" (`RotaHomeLink`).
  - Props: `{ siteName: string; siteSlug: string; weekRange: string }`.
  - No button and no `canEdit` branch. Nothing on the page writes.
- `RestructureEmpty.tsx`'s doc comment says "same as WeeklyRotaEmpty". It is reworded so it no longer names a deleted
  file. Comment only.

### 2.3 `WeekNav`: created weeks only

`WeekNav` stays a server component but stops doing date maths. The page passes it the neighbours:

```ts
// in week/[weekStartDate]/page.tsx, in parallel with the existing week lookup
const prevQ = supabase.from("rota_weekly_rotas").select("week_start_date")
  .eq("site_id", site.id).lt("week_start_date", monday)
  .order("week_start_date", { ascending: false }).limit(1).maybeSingle();
const nextQ = supabase.from("rota_weekly_rotas").select("week_start_date")
  .eq("site_id", site.id).gt("week_start_date", monday)
  .order("week_start_date", { ascending: true }).limit(1).maybeSingle();
const currentQ = monday === thisMonday
  ? null  // answered by the page's own week lookup
  : supabase.from("rota_weekly_rotas").select("id")
      .eq("site_id", site.id).eq("week_start_date", thisMonday).maybeSingle();
```

New props: `{ siteSlug; monday; prevMonday: string | null; nextMonday: string | null; currentMonday: string | null }`,
where `currentMonday` is null when the current week isn't created.

- **‹ / ›** link to `/rota/{site}/week/{prevMonday|nextMonday}`. They skip gaps, so 2 Nov → 23 Nov when 9 and 16 Nov
  don't exist. When there's no neighbour they render as the existing disabled span style with `aria-disabled="true"`.
- **"Today" becomes "This week"** (Q10). It links to `/rota/{site}/week/{currentMonday}` when the current week exists
  and isn't the one shown. Otherwise it's the disabled span, with `title="This week hasn't been created"` when that's
  the reason.
- There are 3 small queries (2 when viewing the current week), all `limit 1` / `maybeSingle`, whatever the number of
  weeks. RLS applies, and a Coach can read their own site's weeks.

### 2.4 Regenerate errors (`WeeklyRotaBoard` → `useGenerateWeek`)

Regenerate stays on `WeeklyRotaBoard` for existing weeks. Today any error shows as "Couldn't regenerate: {message}" in
the confirm modal. After 0030 (`upsert_weekly_rota`, section 4 of the 0030 report):

| Code | Message | Reachable from the app? | Shown as |
|---|---|---|---|
| P0001 | `Your account has been deactivated` | Yes (deactivated mid-session) | Unchanged: "Couldn't regenerate: {message}" |
| P0001 | `Your job title does not have rota edit rights` | Only from a stale tab after a re-title (button is disabled otherwise) | Unchanged |
| P0001 | `Not authorized to generate a rota for this site` | Same | Unchanged |
| 22023 | `A week must start on a Monday` | No (the route canonicalises to Monday) | Unchanged (raw message) |
| P0002 | `This week has not been created yet` | Only if the row disappears after the page loaded (no Delete week until 2b) | **New:** `useGenerateWeek` checks `rpcError.code === "P0002"` and calls `router.refresh()` without setting an error. The page then renders `WeekNotCreated`, which explains what happened. The board and its modal unmount with it. |

So 1 code path is added to `useGenerateWeek`. `WeeklyRotaBoard` changes only its doc comment ("unlike first-time
generation" refers to the removed flow).

### 2.5 `SiteSwitcher`

Target stays `router.push('/rota/{slug}')`, which is now that site's landing, from every rota page. No `?week` is
carried across, since weeks belong to a site. **File unchanged.** From a board, switching site lands on the new site's
landing, not on the same board (Q3).

---

## 3. Landing page data

All reads use `createClient()` from `lib/supabaseServer.ts` (user session, RLS applies). Inherited from
`getSiteAccess()` / `getCapabilities()` (cached, shared with the layout): `auth.getUser`, `profiles`,
`my_capabilities`, `rota_sites`. Then **8 queries in one `Promise.all`**, the same 8 whatever the number of weeks:

| # | Query | Exact select / call | Filter / order | Used for |
|---|---|---|---|---|
| Q1 | `rota_weekly_rotas` + embedded children: **current & future** | `id, week_start_date, rota_weekly_roster(id, day_of_week, coach_id, sort_order, shift_start_mins, shift_end_mins, status, is_key_holder, is_lead, is_cashing_up), rota_weekly_classes(id, day_of_week, coach_id, set_coach_id, class_catalogue_id, title, category_key, meta, start_mins, duration_mins)` | `.eq("site_id", site.id).gte("week_start_date", thisMonday).order("week_start_date", { ascending: true }).order("sort_order", { referencedTable: "rota_weekly_roster" }).order("start_mins", { referencedTable: "rota_weekly_classes" })` | Strip, detail, Needs attention, export |
| Q2 | Same select: **last 8 past** | as Q1 | `.eq("site_id", site.id).lt("week_start_date", thisMonday).order("week_start_date", { ascending: false }).limit(8)` + the same 2 `referencedTable` orders | Previous weeks, detail, export |
| Q3 | RPC `site_rota_people` | `{ p_site_id: site.id }` → `id, full_name, active, site` | — | Names and flags (`makeDirectory`) |
| Q4 | RPC `site_rota_roster` | `{ p_site_id: site.id }` → `id, full_name, job_title` | Called for **every** role (its caller check admits own-site Coaches) | Roster card count; `makeDirectory` top-up |
| Q5 | `rota_categories` | `key, label, color_hex` | `.eq("active", true).order("sort_order")` | Export only |
| Q6 | `rota_standard_roster` | `coach_id, status` | `.eq("site_id", site.id)` | Standard card: coaches |
| Q7 | `rota_standard_classes` | `select("id", { count: "exact", head: true })` | `.eq("site_id", site.id)` | Standard card: classes per week |
| Q8 | `rota_restructures` | `id` | `.eq("site_id", site.id).maybeSingle()` | Restructure card |

**Why embedding.** Q1/Q2 embed the 2 child tables through their FK to `rota_weekly_rotas`. That gives 2 queries
instead of a parent query followed by 2 `.in("weekly_rota_id", ids)` queries, and it removes the sequential second
round trip. It also keeps the child rows out of reach of PostgREST's max-rows cap. That cap limits top-level rows. At
about 25 weeks × 30–60 classes, a flat `rota_weekly_classes` query could pass the Supabase default of 1000 and be cut
off silently. Embedding is new to this codebase (0 existing uses), so it's Q11. The fallback is the 2-phase `.in()`
form with `{ count: "exact" }` and an error banner if `count > data.length`.

**Rows read.** Q1 holds at most 17 weeks, because `create_weekly_rota` only allows this week to +16, so no created week
can be more than 16 ahead. Q2 holds at most 8. Total 25 weeks or fewer.

**Errors.** If Q1 or Q2 returns an error, the page shows a `board-error`-style banner "Couldn't load weeks: {message}"
in place of the strip. Otherwise it would wrongly show the "no weeks" empty state. Other queries fall back to empty
as the boards do today.

### 3.1 Which weeks load

- **Strip:** every created week with `week_start_date >= thisMonday` (Q1), ascending. At most 17.
- **Previous weeks:** the 8 most recent created weeks with `week_start_date < thisMonday` (Q2), shown newest first.
  This means 8 *created* weeks, not the last 8 calendar weeks.
- `thisMonday = currentMonday()` (Europe/London), computed once per request on the server.

### 3.2 Aggregation rules (new pure module `lib/rota/landing.ts`)

For one week: `R` = its roster rows, `C` = its class rows, `d` ∈ 0…6 (0 = Mon). Every rule is applied per week from that
week's own rows only.

| Value | Rule |
|---|---|
| `classes[d]` | `count(c ∈ C : c.day_of_week = d)` |
| `unassigned[d]` | `count(c ∈ C : c.day_of_week = d ∧ c.coach_id IS NULL)` |
| `orphans[d]` | `count(c ∈ C : c.day_of_week = d ∧ isOrphan(c, R))`, calling `isOrphan` from `lib/rota/columns.ts` itself: `coach_id ≠ NULL` and no `r ∈ R` with `r.day_of_week = c.day_of_week ∧ r.coach_id = c.coach_id`. Roster `status` is **ignored**, as in `isOrphan`: a class on a leave/sick coach's day is not an orphan (Q4). |
| `withoutCoach[d]` | `unassigned[d] + orphans[d]` |
| `covered[d]` | `count(c ∈ C : c.day_of_week = d ∧ c.coach_id ≠ NULL ∧ c.set_coach_id ≠ NULL ∧ c.set_coach_id ≠ c.coach_id ∧ ¬isOrphan(c, R))`. This is `RotaBoard`'s `isCover`, minus classes drawn in Unassigned, where the board shows no COVER badge (`cover = !unassigned && isCover(ev)`, `RotaBoard.tsx:920`). It counts **classes** (Q5). |
| Week totals | `classes = Σ classes[d]`, `withoutCoach = Σ withoutCoach[d]`, `covered = Σ covered[d]` |
| **Status chip** (H7) | `classes = 0` → **"No classes"** (grey). Else `withoutCoach ≥ 1` → **"Classes without a coach"** (red). Else **"Ready"** (green). Evaluated in that order. No "Changes from standard". "Not created" never appears, because only created weeks load. |
| **Coaches working** (H8) | `count(distinct r.coach_id : r ∈ R ∧ r.status = 'working')` |
| **Day coach chips** | For day `d`: the roster rows `r ∈ R` with `r.day_of_week = d ∧ r.status = 'working'`, in `sort_order` (Q1/Q2 order). Label = `directory.name(r.coach_id)` (short name; full name where 2 would clash) + `flagTag(directory.flag(r.coach_id))` → " (moved)" / " (inactive)" (Q8). Leave/sick rows get no chip. |
| **"(cover)" marker** (H8) | Coach X's chip on day `d` gets " (cover)" iff `∃ c ∈ C : c.day_of_week = d ∧ c.coach_id = X ∧ c.set_coach_id ≠ NULL ∧ c.set_coach_id ≠ X`. X is rostered that day, so such a class is never an orphan. |
| **Day row text** | `classes[d] = 0` → "No classes". `1` → "1 class". Otherwise "{n} classes". |
| **Day row flag** | `withoutCoach[d] > 0` → "{n} without a coach" (red). Else `covered[d] > 0` → "{n} covered" (neutral). Else none. Same precedence as the mockup. |
| **Strip bars** | Per day: height = `round(classes[d] / maxClasses × 100)%`, where `maxClasses = max(1, max classes[d] over every strip week)`. The mockup hardcodes 6. `classes[d] = 0` → flat stub. `withoutCoach[d] > 0` → red bar. |
| **Relative label** | `n = (monday − thisMonday) / 7` (whole weeks, UTC-midnight dates). `n = 0` "This week"; `1` "Next week"; `≥ 2` "In {n} weeks"; `−1` "Last week"; `≤ −2` "{−n} weeks ago". |
| **Date range (no year)** | New `weekRangeShort(monday)` in `lib/rota/week.ts`, built from the same `MONTHS_SHORT`. Same month: "19–25 Oct". Otherwise: "26 Oct – 1 Nov", across a year too: "28 Dec – 3 Jan". `weekRangeLabel` (with year) stays for the boards and PDF. |
| **Day row date** | `weekDayLabels(monday)[d]` → "19 Oct". Day name `DAY_NAMES[d].slice(0, 3)`. Strip initials `DAY_NAMES[d][0]`. |

`summariseWeek(monday, roster, classes, directory, thisMonday)` returns
`{ id, monday, offset, label, range, status, totals: { classes, withoutCoach, covered, coachesWorking }, days: 7 × { classes, withoutCoach, covered, coaches: { id, label, cover }[] } }`.
It is pure: no Supabase or React imports, like `columns.ts` and `people.ts`.

### 3.3 Needs attention

- **Weeks included:** strip weeks only (Q1: this week and later). Previous weeks are excluded (H18).
- **Items:** one per (week, day) with `withoutCoach[d] > 0`, ordered by week ascending, then day ascending.
- **Text:** "{n} class{n = 1 ? '' : 'es'} without a coach, {Mon} {19 Oct}". This is the mockup's format.
- **Link:** `/rota/{site}?week={monday}#week-detail`. It selects that week and scrolls to the detail panel.
- **Empty:** "Nothing needs attention."
- **Visible to:** every role.

### 3.4 Default selected week (H19)

1. If `thisMonday` is in Q1, select it.
2. Otherwise, the earliest Q1 week (that is, the next upcoming created week).
3. Otherwise, the first Q2 row (the latest past week).
4. Otherwise, nothing: empty state (4.3).

### 3.5 Side cards

| Card | Data | Content |
|---|---|---|
| **Standard rota** (H15) | Q6, Q7 | "Coaches" = `count(distinct coach_id : status = 'working')` over Q6 (same rule as H8, Q6). "Classes per week" = Q7 count. Link "Edit standard rota" (`canEdit`) or "View standard rota" (others) → `/rota/{site}/standard`. No "Last edited". |
| **Needs attention** | Q1 | 3.3 |
| **Roster** (H9) | Q4 | "{n} coach{es} on the roster" (`n` = Q4 row count, `1` → "1 coach"). Then "Coaches are added in Admin › Users". "Admin › Users" is a `Link` to `/admin/users` only for `manage_users` holders; for everyone else it's plain text, as on the board (`RotaBoard.tsx:1009–1027`). No "Manage coaches". |
| **Restructure** (H16) | Q8 | Row exists: "Restructure in progress" + "Open" → `/rota/{site}/restructure` (every role; Coaches view it read-only today). No row and `canEdit`: "No restructure in progress." + "Start a restructure" → `/rota/{site}/restructure` (the existing `RestructureEmpty` page does the generate). No row and not `canEdit`: the text only, no link. |

### 3.6 Export week

`RotaExportButton` needs `spec`, a `directory` (`RotaDirectory`, an object of functions), the week's full
`roster`/`classes` (`RosterRow`/`ClassRow` column sets) and `categories`. Two constraints:

- **The data is already loaded.** Q1/Q2 select the full `RosterRow`/`ClassRow` columns, the same ones the week board
  selects, so the selected week's rows are in hand on the server. No extra query, no per-week query, and no client-side
  fetch. Only the **selected** week's rows are sent to the client.
- **A directory can't be passed from a server component** (functions don't serialise). So a small client wrapper
  `RotaWeekExport` (`"use client"`) takes `people`, `rosterCandidates`, `siteName`, `roster`, `classes`, `categories`
  and `spec`. It builds `makeDirectory(...)` in `useMemo` and renders `RotaExportButton` inside
  `<div className={styles.root}>`, because the `.btn` styles are scoped under `.root` in `rota-board.module.css`.
- **Spec:** identical to the week board's: `{ siteName, fileBase: \`${slug}-week-${monday}\`, week: { rangeLabel:
  weekRangeLabel(parsed), dayDates: weekDayLabels(parsed) } }`. So the PDF and its file name match exporting from the
  board.
- **Label:** `RotaExportButton` gets 1 optional prop, `label?: string` (default `"Export as PDF"`). The detail panel
  passes `"Export week"` (H20). Existing callers are unchanged (Q15).

So Export week costs 0 extra queries. The wrapper is the only client code on the landing page apart from
`SiteSwitcher`.

---

## 4. Components

### 4.1 New (10 files)

| File | Server/client | Props |
|---|---|---|
| `app/(protected)/rota/[siteSlug]/standard/page.tsx` | Server (route) | `params: Promise<{ siteSlug }>`. Today's standard page moved (1.1 #3). |
| `lib/rota/landing.ts` | Pure module | Exports `WeekSummary`, `DaySummary`, `WeekStatus` types, `summariseWeek`, `relativeWeekLabel`, `pickDefaultWeek(current, past, thisMonday)`, `needsAttention(weeks)`, `standardCoachCount(rows)` |
| `components/rota/RotaHomeLink.tsx` | Server | `{ siteSlug: string }` |
| `components/rota/WeekNotCreated.tsx` | Server | `{ siteName: string; siteSlug: string; weekRange: string }` |
| `components/rota/RotaStatusChip.tsx` | Server | `{ status: WeekStatus }` → green `bg-[#E6F5EC] text-status-green` "Ready", red `bg-[#FDEAE0] text-[#C25218]` "Classes without a coach" (the dashboard's "Action" pill, Q7), grey `bg-[#EEF0F2] text-status-grey` "No classes". Same pill shape as `HowToStrip`. |
| `components/rota/RotaWeekStrip.tsx` | Server | `{ siteSlug; weeks: WeekSummary[]; selectedMonday: string \| null; maxClasses: number }`. Header "Weeks" + the mockup's hint text, horizontal-scroll row of `Link` cards (`aria-current` on the selected one), relative label (orange for "This week"), short range, 7 bars, M T W T F S S, status chip. **No "+ Add week" tile.** |
| `components/rota/RotaPreviousWeeks.tsx` | Server | `{ siteSlug; weeks: WeekSummary[]; selectedMonday: string \| null }`. Native `<details>` "Previous weeks", collapsed unless the selected week is one of these (H18). Items: `Link` "{relative label} · {range}". Not rendered when Q2 is empty. |
| `components/rota/RotaWeekDetail.tsx` | Server | `{ siteSlug; week: WeekSummary; exportProps: RotaWeekExportProps }`. `id="week-detail"`. Eyebrow (relative label), "Week of {range}", status chip, "Export week" + "Open week" (`/rota/{site}/week/{monday}`). 4 stats (Coaches working, Classes, Covered by another coach, Without a coach — red when > 0). 7 day rows. No note banner (no column). |
| `components/rota/RotaWeekExport.tsx` | **Client** | `{ siteName; people: RotaPerson[]; rosterCandidates: RosterCandidate[]; roster: RosterRow[]; classes: ClassRow[]; categories: Category[]; spec: RotaExportSpec }` |
| `components/rota/RotaHomeSidebar.tsx` | Server | `{ siteSlug; canEdit; canManageUsers; standard: { coaches; classes }; rosterCount; restructureExists; attention: AttentionItem[] }`. The 4 cards in this order: Standard rota, Needs attention, Roster, Restructure (mockup order, with Roster added). |

**Layout:** a boxed page (`mx-auto max-w-[1280px] p-6`, not `fills-viewport`). The head is h1 "Rota" + `SiteSwitcher`
on the left and "Home / **Rota**" on the right (no Manage coaches, no page-level Export, H9/H20). Below that, the strip
+ previous weeks run full width. Then a 2-column grid, detail (flex) and sidebar (~300px), which stacks on narrow
screens. Cards use `rounded-card border border-line bg-card shadow-card`. Buttons and links use the CLAUDE.md density
values (`px-3.5 py-2 text-[13px]`). Colours come from tokens only. The mockup's Inter, palette and view switcher are
not used (H21).

### 4.2 Reused unchanged

`SiteSwitcher`, `RotaUnavailable` (landing passes `title="Rota"`), `RotaExportButton` (+1 optional prop),
`StandardRotaView`, `WeeklyRotaBoard` (comment only), `RestructureBoard`, `RestructureEmpty` (comment only),
`RotaBoard`, `RotaExportLayout`. From `lib/rota/`: `isOrphan` (`columns.ts`), `makeDirectory` / `flagTag` /
`toRotaPeople` / `toRosterCandidates` (`people.ts`), `DAY_NAMES` (`board.ts`), and `currentMonday` / `weekDayLabels` /
`weekRangeLabel` / `parseWeekDate` / `mondayOf` (`week.ts`).

### 4.3 Role behaviour

`canEdit = hasSiteCapability(caps, "edit_rota", site.id)`. `canManageUsers = caps.has("manage_users")`. No job title is
checked anywhere.

| Element | Coach | Lead Coach / Club Head Coach | RGM / HoG / HoO |
|---|---|---|---|
| Sites | Own only, plain label | Own only, plain label | All 7, `SiteSwitcher` select |
| Strip, previous weeks, detail, stats, day rows | Yes | Yes | Yes |
| Export week | Yes (Coaches can export today) | Yes | Yes |
| Open week | Yes → read-only board | Yes → editable board | Yes → editable board |
| Standard card link | "View standard rota" | "Edit standard rota" | "Edit standard rota" |
| Needs attention | Yes (read only) | Yes | Yes |
| Roster card | Count; "Admin › Users" plain text | Count; plain text | Count; **link** to `/admin/users` |
| Restructure, row exists | "Open" | "Open" | "Open" |
| Restructure, no row | Text only, **no button** | "Start a restructure" | "Start a restructure" |
| Add week / Delete week | **Hidden for everyone in 2a** | Hidden | Hidden |
| Week board: Regenerate | Disabled (unchanged) | Enabled | Enabled |
| Uncreated week URL | Read-only message | Same | Same |

### 4.4 Empty states

- **Site with no weeks at all** (Q1 and Q2 both empty): the strip area is one card: "No weeks have been created for
  {siteName} yet." There's no button, because 2a has no way to add one and the page mustn't show a dead "Add week".
  No previous-weeks disclosure and no detail panel. The sidebar still renders (Standard, Needs attention showing
  "Nothing needs attention.", Roster, Restructure). This is also what every site shows right after 2a ships (0 weeks
  exist).
- **No current or future weeks, some past** (Q1 empty, Q2 not): the strip area says "No upcoming weeks have been
  created." Previous weeks are shown **open**. The default selection is the latest past week (H19 step 3), and the
  detail panel shows it. Needs attention: "Nothing needs attention."

---

## 5. Phase 2a-B implementation order and size

| Step | What | Created | Modified | Deleted |
|---|---|---|---|---|
| 1 | Pure helpers | `lib/rota/landing.ts` | `lib/rota/week.ts` (+`weekRangeShort`, +`relativeWeekLabel`) | — |
| 2 | Move Standard + breadcrumb | `app/(protected)/rota/[siteSlug]/standard/page.tsx`, `components/rota/RotaHomeLink.tsx` | `app/(protected)/rota/[siteSlug]/restructure/page.tsx` | — |
| 3 | Week board: created weeks only | `components/rota/WeekNotCreated.tsx` | `app/(protected)/rota/[siteSlug]/week/[weekStartDate]/page.tsx`, `app/(protected)/rota/[siteSlug]/week/page.tsx`, `components/rota/WeekNav.tsx`, `components/rota/useGenerateWeek.ts`, `components/rota/WeeklyRotaBoard.tsx` (comment), `components/rota/RestructureEmpty.tsx` (comment) | `components/rota/WeeklyRotaEmpty.tsx` |
| 4 | Landing page | `components/rota/RotaStatusChip.tsx`, `RotaWeekStrip.tsx`, `RotaPreviousWeeks.tsx`, `RotaWeekDetail.tsx`, `RotaWeekExport.tsx`, `RotaHomeSidebar.tsx` | `app/(protected)/rota/[siteSlug]/page.tsx` (rewritten), `components/rota/RotaExportButton.tsx` (`label` prop) | — |
| 5 | Remove tabs, fix inbound link | — | `components/clubProfile/AttendanceGrid.tsx` (href) | `components/rota/RotaViewTabs.tsx` |
| 6 | Checks | — | — | — |

Step file counts: created 1 + 2 + 1 + 6 + 0 = **10**; modified 1 + 1 + 6 + 2 + 1 = **11**; deleted 0 + 0 + 1 + 0 + 1 =
**2**. **23 files in total.** Not counted: a Phase 2a-B report in `docs/investigations/`, if wanted as in earlier
phases.

Step 6:
- `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- `grep -rn "RotaViewTabs\|WeeklyRotaEmpty" app components lib` → 0.
- `grep -rnE "/rota/\\$\{[a-zA-Z.]+\}/week[\`\"]" app components` → 0 (no remaining links to the bare `/week`
  redirect).

Each step builds on its own in this order: `RotaViewTabs` is deleted only after its 3 usages are gone (steps 2, 3, and
the old `[siteSlug]/page.tsx` in step 4). No migration, no `supabase/` change, no new dependency. Migration 0030 is
already applied, which 2a needs (P0002 handling).

---

## 6. Test plan for Phase 2a-B

### 6.1 Accounts and test site

- **F** = full access (Jamie, Head of Gymnastics).
- **E** = Lead Coach or Club Head Coach at site **S**.
- **C** = Coach at S.
- These are the existing test accounts from the P4 test plan, or ones created and re-titled in Admin › Users.
- **S** = the site that holds the Standard Rota (as in the 0030 tests). Its Standard Rota needs ≥ 1 class on ≥ 2 days
  and ≥ 2 rostered coaches. Build that in the app first.
- Write `M` for this week's Monday and `M+n` / `M−n` for n **days** later / earlier (so `M+7` is next week's Monday), matching the SQL.

### 6.2 Getting test weeks — **needs Jamie's approval**

Weeks can't be created in the app in 2a. Direct inserts are no longer possible: 0030 dropped the insert policy.
`create_weekly_rota` is the only path, and it only accepts **M … M+16**. Proposal: call it in the SQL Editor **as
authenticated with Jamie's claims** (same preamble as the 0030 tests), ending in `commit;`, so the rows persist.
Past weeks can't be created at all, so stage 3 moves future weeks into the past with an `UPDATE` of
`week_start_date`. The `rota_weekly_rotas_update_edit_rota_site` policy permits that, and the Monday constraint still
holds. That is a direct table write, and it is the reason this needs approval. **Nothing below has been run.**

Preamble for every stage:
```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '<JAMIE_PROFILE_ID>', 'role', 'authenticated')::text, true);
```
`S` = `(select site_id from public.rota_standard_roster order by id limit 1)`;
`M` = `date_trunc('week', now() at time zone 'Europe/London')::date`.

| Stage | SQL after the preamble, then `commit;` | Tests it enables |
|---|---|---|
| 0 | none (0 weeks) | No-weeks empty state; uncreated week URL; `/rota/{S}/week` redirect |
| 1 | `select public.create_weekly_rota(S, M + 7);` `select public.create_weekly_rota(S, M + 21);` `select public.create_weekly_rota(S, M + 28);` | Default = next upcoming (M+7); WeekNav gap M+7 → M+21; "In 3 weeks"/"In 4 weeks" |
| 2 | `select public.create_weekly_rota(S, M);` | Default = This week |
| 3 | `select public.create_weekly_rota(S, M + 7*k)` for k = 5 … 13 (9 calls), then `update public.rota_weekly_rotas set week_start_date = week_start_date - 98 where site_id = S and week_start_date between M + 35 and M + 91;` | 9 past weeks M−63 … M−7: only 8 listed; "Last week", "9 weeks ago" not shown; WeekNav into past |
| 4 | `delete from public.rota_weekly_rotas where site_id = S and week_start_date >= M;` | Past-only empty state; default = latest past |
| 5 (cleanup) | `delete from public.rota_weekly_rotas where site_id = S;` | Back to 0 weeks |

Notes:
- Children cascade on delete.
- Every stage's weeks are real rows that S's staff can see while they exist.
- Stage 4 deletes rows, and stage 5 deletes every week at S. Run stage 5 only if S has no real weeks by then.
- "Without a coach" data comes from the app:
  - **NULL:** as E, set a class's coach to Unassigned in the class modal on M+7.
  - **Orphan:** the P4 test plan's stale-tab method A on M+21.
  - **Cover:** drag a class into another coach's column on M+7.

### 6.3 Manual checks

Run by **F**, **E** and **C** unless a row says otherwise. Expected results are given per role where they differ.

| # | Check | Expected |
|---|---|---|
| 1 | Stage 0. Open `/rota` | F → `/rota/{first site}`; E, C → `/rota/{S}`. The landing page loads, not the Standard board. |
| 2 | Old bookmark `/rota/{S}` | Landing page (H1). Same for `/rota/{S}/week` → `/rota/{S}`. |
| 3 | Stage 0 landing | "No weeks have been created for {S} yet."; no Add week anywhere; no previous weeks; no detail panel; sidebar shows. |
| 4 | Standard card → link | F/E "Edit standard rota", C "View standard rota" → `/rota/{S}/standard`; board renders (C read-only banner). Coach and class counts match the board. |
| 5 | Standard board breadcrumb | "‹ Rota home" → `/rota/{S}`; no view tabs on Standard, week, Restructure pages. |
| 6 | `/rota/{unknown}/standard` | Redirect to `/rota/{home}/standard`. |
| 7 | Uncreated week URL `/rota/{S}/week/{M+14}` | "This week hasn't been created", link home, **no button** for any role. `/week/{M+15}` → canonical Monday; `/week/abc` → `/rota/{S}`. |
| 8 | Roster card | Count = `site_rota_roster` size; "Admin › Users" is a link for F only. |
| 9 | Restructure card (no row) | F/E "Start a restructure" → restructure page (Generate there); C text only. After generating: all roles "Restructure in progress — Open". |
| 10 | Stage 1, landing, no `?week` | Default = M+7 ("Next week") selected; strip shows 3 cards in date order. |
| 11 | WeekNav on M+7 | ‹ disabled; › → M+21 (skips M+14); "This week" disabled (M not created). On M+28: › disabled. |
| 12 | Stage 2, landing | Default = M ("This week", orange). WeekNav "This week" link appears on M+7. |
| 13 | Stats and day rows on M | Coaches working / Classes / Covered / Without a coach match the board by hand count; day rows show working coaches only, short names. |
| 14 | E makes NULL, orphan and cover (6.2 notes); reload landing as each role | M+7 and M+21 chips red; bars red on those days; day flags "{n} without a coach"; covering coach shows "(cover)"; Covered count matches; Needs attention lists each (week, day) in order; clicking one selects that week and scrolls to detail. |
| 15 | Status "No classes" | As E, delete every class from M+28 → grey "No classes". |
| 16 | `?week=` handling | `?week={M+21}` selects it; `?week={M+16}` (a Wednesday) → `?week={M+14}`, which is uncreated → `/rota/{S}`; `?week=abc` → `/rota/{S}`. |
| 17 | Regenerate on M (F, E) | Confirm modal → week rebuilt from Standard (edits gone), same URL. C: button disabled. |
| 18 | Regenerate P0002 (F) | Open M+28 board, then run `delete … where week_start_date = M+28` (approved SQL), then Regenerate → page refreshes to "This week hasn't been created"; no raw error. |
| 19 | Export week (all roles) | PDF downloads as `{slug}-week-{monday}.pdf`, identical to exporting from that week's board. |
| 20 | Stage 3 | Previous weeks collapsed, 8 items newest first ("Last week" … "8 weeks ago"); the 9th not listed; Needs attention ignores past weeks; selecting one opens the disclosure and shows its detail; "Open week" opens an editable board for F/E. WeekNav ‹ from M reaches M−7. |
| 21 | Stage 4 | "No upcoming weeks have been created."; previous weeks open; default = M−7. |
| 22 | SiteSwitcher (F) | From Standard / a week / Restructure → `/rota/{other}` landing; other sites show the no-weeks state. |
| 23 | Club Profile "Open the rota →" (when this week isn't created) | Goes to `/rota/{S}`. |

Week creation can't be tested in 2a. It arrives in 2b.

---

## 7. Open questions for Jamie

1. **`/rota/{site}/week` (no date):** the plan has it redirect to the landing page, where H19 picks the week. The
   alternative is to keep sending it to the current Monday, which shows "not created" when the current week is missing.
   Landing OK?
2. **`?week=` for a Monday that isn't loaded** (uncreated, or a created week older than the last 8): the plan
   redirects quietly to the clean landing URL. Alternatively it could send them to `/rota/{site}/week/{date}`, which
   shows the board or "not created". Quiet redirect OK?
3. **SiteSwitcher on a board** goes to the other site's landing page, not the same board. OK, or should Standard →
   Standard and Restructure → Restructure be kept (a small prop on `SiteSwitcher`)?
4. **Leave/sick coaches.** By the `isOrphan` rule (H7 says use it), a class assigned to a coach marked leave or sick
   that day is **not** "without a coach", and leave/sick coaches get no chip on the day row. Confirm, or should a class
   on a leave/sick coach's day count as without a coach? That would differ from the board's Unassigned column.
5. **"Covered by another coach" counts classes**, and so does the day flag "{n} covered". The mockup counted covering
   coaches. Classes OK?
6. **Standard card "Coaches"** = distinct coaches with status `working` on ≥ 1 day (same rule as H8). OK, or count every
   standard roster coach whatever their status?
7. **Red chip colour:** CLAUDE.md has no red token. The plan reuses the dashboard's "Action" pill
   (`#FDEAE0` / `#C25218`) for "Classes without a coach" and red bars. OK?
8. **Flagged coaches on day chips:** append " (moved)" / " (inactive)" as the PDF does (`flagTag`)? The plan says yes.
9. **Roster card for Coaches:** this calls `site_rota_roster` for every role. Today the boards call it for editors
   only, but the RPC already admits own-site Coaches. Only the count is shown. OK?
10. **WeekNav "Today" → "This week"**, disabled when the current week isn't created. OK?
11. **PostgREST embedding** for Q1/Q2 (new to this codebase) to stay at a fixed 8 queries and clear of the 1000-row
    cap. OK? If not, the fallback is 2 parent + 2 `.in()` child queries. In that case please confirm the project's
    "Max rows" (Dashboard → Settings → API), since 25 weeks of classes could pass 1000.
12. **Test data (6.2):** approve committing `create_weekly_rota` calls as Jamie in the SQL Editor, the
    `UPDATE … week_start_date` to make past weeks, and the `DELETE`s? Which site should be S, given real staff there will
    see the test weeks?
13. **Follow-up (not 2a):** the update policy still lets any `edit_rota` holder change `week_start_date` on an existing
    week through the API. Stage 3 relies on this. Lock it down later (column grant or trigger)? Add to the queued
    follow-ups?
14. **Club Profile wording:** `AttendanceGrid` and `StaffHoursModal` still say the week "hasn't been generated". Change
    to "created" in 2a-B (2 more modified files), or leave?
15. **Export label:** "Export week" on the landing via a new optional `label` prop on `RotaExportButton`, while the
    boards keep "Export as PDF". OK?
16. **Uncreated week page** keeps `WeekNav` (prev/next created weeks) as well as the home link. OK?

---

## Repo hygiene

`git status --short` after writing this plan:

```
?? docs/investigations/rota-landing-p2a-plan.md
```

- 1 file created: this plan. 0 existing files modified. Nothing written to the repo root or under `supabase/`.
- No SQL run, no database connection, no secret key read, no `git add`/commit/push, no `npm install`.
