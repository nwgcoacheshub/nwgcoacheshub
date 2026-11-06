# Rota landing redesign — Phase 2a-B implementation report

Date: 2026-11-06. Repo at `39e2c28` (main). Implements `docs/investigations/rota-landing-p2a-plan.md` (the spec) with
approved amendments A1–A6. Not committed or pushed. Nothing under `supabase/` was touched, no SQL was run, nothing
connected to a database, and the secret key was not read. No new npm dependencies.

---

## 1. Files

**Created 10, modified 13, deleted 2: 25 code files.** This report is 1 more created file (26 in all), which the
plan's count also leaves out.

### Created (10)

| # | Path | Plan step |
|---|---|---|
| 1 | `lib/rota/landing.ts` | 1 |
| 2 | `app/(protected)/rota/[siteSlug]/standard/page.tsx` | 2 |
| 3 | `components/rota/RotaHomeLink.tsx` | 2 |
| 4 | `components/rota/WeekNotCreated.tsx` | 3 |
| 5 | `components/rota/RotaStatusChip.tsx` | 4 |
| 6 | `components/rota/RotaWeekStrip.tsx` | 4 |
| 7 | `components/rota/RotaPreviousWeeks.tsx` | 4 |
| 8 | `components/rota/RotaWeekDetail.tsx` | 4 |
| 9 | `components/rota/RotaWeekExport.tsx` | 4 |
| 10 | `components/rota/RotaHomeSidebar.tsx` | 4 |

Plus `docs/investigations/rota-landing-p2a-implementation.md` (this report).

### Modified (13)

| # | Path | Why |
|---|---|---|
| 1 | `lib/rota/week.ts` | Step 1: `weekRangeShort`, `relativeWeekLabel`, `weekOffset` |
| 2 | `app/(protected)/rota/[siteSlug]/restructure/page.tsx` | Step 2: `RotaHomeLink`; `view="restructure"` on `SiteSwitcher` (A2) |
| 3 | `app/(protected)/rota/[siteSlug]/week/[weekStartDate]/page.tsx` | Step 3: redirects, `RotaHomeLink`, `WeekNotCreated`, neighbour queries |
| 4 | `app/(protected)/rota/[siteSlug]/week/page.tsx` | Step 3: redirects to `/rota/{site}` |
| 5 | `components/rota/WeekNav.tsx` | Step 3: created weeks only, "This week" |
| 6 | `components/rota/useGenerateWeek.ts` | Step 3: P0002 → `router.refresh()`; doc comment |
| 7 | `components/rota/WeeklyRotaBoard.tsx` | Step 3: doc comment only |
| 8 | `components/rota/RestructureEmpty.tsx` | Step 3: doc comment only |
| 9 | `app/(protected)/rota/[siteSlug]/page.tsx` | Step 4: rewritten as the landing page |
| 10 | `components/rota/RotaExportButton.tsx` | Step 4: optional `label` prop |
| 11 | `components/clubProfile/AttendanceGrid.tsx` | Step 5: href `/rota/{site}`; plus A5 wording |
| 12 | `components/rota/SiteSwitcher.tsx` | **A2** (not in the plan's 11) |
| 13 | `components/clubProfile/StaffHoursModal.tsx` | **A5** (not in the plan's 11) |

### Deleted (2)

| # | Path |
|---|---|
| 1 | `components/rota/WeeklyRotaEmpty.tsx` |
| 2 | `components/rota/RotaViewTabs.tsx` |

### Against the plan's 23 (10 / 11 / 2)

- Created: 10 = 10. Same files.
- Modified: 13 = 11 + 2. `SiteSwitcher.tsx` is new because of A2: the plan had it unchanged. `StaffHoursModal.tsx` is
  new because of A5. A5's other file, `AttendanceGrid.tsx`, was already in the plan for its href, so it adds nothing.
- Deleted: 2 = 2.
- A4 added **no** file. The board-error red already exists (`.board-error` in `rota-board.module.css`: text `#a02a1c`,
  background `#fdecea`, border `#f3c9c4`), so no `--danger` token was added and `app/globals.css` is unchanged.
- A1, A3 and A6 changed the code inside files already counted (the landing page and `lib/rota/landing.ts`).

---

## 2. Amendments

### A1 — `?week=` on the landing page

`app/(protected)/rota/[siteSlug]/page.tsx`, in 2 parts:

1. **Before the queries (by shape).** An array, or a value `parseWeekDate` rejects (`abc`, `2026-02-30`), goes to
   `redirect('/rota/{site}')`. Any real date becomes `requested = formatWeekDate(mondayOf(date))`.
2. **After Q1/Q2 (by content).**
   - `requested` isn't among the loaded weeks (Q1 ∪ Q2): `redirect('/rota/{site}/week/{requested}')`. That page shows
     the board for a created week older than the last 8, or "This week hasn't been created".
   - It is loaded but the param wasn't its Monday: `redirect('/rota/{site}?week={requested}')`.
   - Otherwise it's selected.

A non-Monday is canonicalised and checked in the same request. An uncreated week's Wednesday goes straight to
`/rota/{site}/week/{monday}` in one redirect, with no `?week={monday}` hop between. If Q1 or Q2 errors, part 2 is
skipped (the page can't tell what's loaded), and the default selection applies under the error banner.

### A2 — SiteSwitcher keeps the view

`components/rota/SiteSwitcher.tsx` gets 1 optional prop, `view?: "standard" | "restructure"`. The target is
`/rota/{slug}/{view}` when it's set, otherwise `/rota/{slug}`. Passed as `view="standard"` by
`standard/page.tsx` and `view="restructure"` by `restructure/page.tsx` (one `head`, so both branches: board and
`RestructureEmpty`). The week page (board and not-created) and the landing page pass nothing, so they go to the other
site's landing page. The URL is not parsed.

### A3 — Leave/sick counts as without a coach (landing page only)

`lib/rota/landing.ts`, `classifyClass(c, roster)`, returns exactly one of:

1. `"withoutCoach"`: `c.coach_id === null`, or `isOrphan(c, roster)`, or some roster row with the same
   `day_of_week` and `coach_id` has `status` `'leave'` or `'sick'`.
2. `"covered"`: not 1, and `set_coach_id !== null && set_coach_id !== coach_id`.
3. `null`.

Checked in that order, so without-a-coach wins. `summariseWeek` counts each day's classes with it. Those counts feed the
per-day bars (red when `withoutCoach > 0`), day flags, status chip, week totals (the stats), and `needsAttention`.
`isOrphan` is imported from `lib/rota/columns.ts` and called as is. `columns.ts`, `RotaBoard.tsx` and the board's
Unassigned column are unchanged (`git status` shows neither file).

### A4 — Red

The existing board-error red, written as Tailwind arbitrary values (the same way the dashboard pills write theirs):

| Where | Classes |
|---|---|
| Status chip "Classes without a coach" | `bg-[#fdecea] text-[#a02a1c]` |
| Strip bar for a day with a class without a coach | `bg-[#a02a1c]` |
| Day row flag "{n} without a coach" | `text-[#a02a1c]` |
| Stat "Without a coach" when > 0 | `text-[#a02a1c]` |
| Needs attention dot | `bg-[#a02a1c]` |
| "Couldn't load weeks" banner | `border-[#f3c9c4] bg-[#fdecea] text-[#a02a1c]` (all 3 board-error colours) |

The dashboard "Action" pill colours (`#FDEAE0` / `#C25218`) are not used. No design token was added or changed.

### A5 — Club Profile wording

Text only, no logic changed:

- `AttendanceGrid.tsx`: "This week's rota hasn't been generated yet" → "hasn't been created yet"; "Attendance appears
  here once the week has been generated in the Rota tool." → "…has been created…".
- `StaffHoursModal.tsx`: "This week's rota hasn't been generated yet, so there are no hours to total." →
  "…hasn't been created yet…".

The `weekGenerated` prop name in both files is code, not wording, so it's unchanged.

### A6 — Embedding

Q1 and Q2 use one `WEEK_SELECT` string that embeds `rota_weekly_roster(…)` and `rota_weekly_classes(…)` with the
board's full `RosterRow`/`ClassRow` column sets. The child orders are `.order("sort_order", { referencedTable:
"rota_weekly_roster" })` and `.order("start_mins", { referencedTable: "rota_weekly_classes" })`. Q2's `.limit(8)` has
no `referencedTable`, so it limits the weeks, not the children.

---

## 3. Deviations from the plan

1. **`relativeWeekLabel` lives in `lib/rota/week.ts`**, as Section 5 step 1 says. Section 4.1 lists it among
   `landing.ts`'s exports instead, so the plan is inconsistent. `week.ts` also gets `weekOffset(monday, thisMonday)`
   (whole weeks between two Mondays) for the same reason.
2. **`landing.ts` exports a little more than 4.1 lists:** `classifyClass` (A3), and the `DayCoach` and
   `AttentionItem` types. `DaySummary` carries each day's `date` ("19 Oct") so the detail rows and Needs attention
   text don't recompute it.
3. **Covered** is now A3's rule: a cover class whose delivering coach is on leave or sick that day counts as without a
   coach, not covered. The plan's 3.2 rule didn't consider status.
4. **`RotaWeekStrip` takes `children`**, and the page passes `RotaPreviousWeeks` into it, so the disclosure sits inside
   the strip card as in the mockup (L231–240). The plan didn't say which card it sits in.
5. **`RotaPreviousWeeks` has a `forceOpen` prop** for 4.4 ("previous weeks are shown open" when Q1 is empty). 4.1's
   props didn't include one.
6. **Week board queries:** the 3 neighbour queries run in one `Promise.all` with the week lookup (4 queries; 3 when
   viewing this week), rather than "in parallel with" a separate await. Same queries as 2.3.
7. **WeekNav's disabled ‹ / › spans** keep their `aria-label`s as well as `aria-disabled`.
8. **Step 6's last grep** (`/rota/${…}/week` followed by a quote or backtick) returns 1 line, not 0:
   `components/rota/WeekNav.tsx:29: const base = \`/rota/${siteSlug}/week\`;`. That is the base string that the 3
   links append `/{date}` to (the plan's own 1.2 #16, "same base"), not a link to the bare `/week` redirect. No link to
   the bare `/week` remains.
9. **Strip bar colour:** non-red bars use `bg-status-green` (the mockup uses its own green; this is the nearest
   CLAUDE.md token). Empty days are a 3px `bg-line` stub, as in the mockup.
10. **Day coach chips** have no cover-specific colour. The mockup draws a blue border, but no blue token exists and
    CLAUDE.md rules out unrequested embellishments. The " (cover)" text marker is shown as the plan says.
11. **Process note:** I removed `WeeklyRotaEmpty.tsx` with `git rm`, which staged the deletion. I unstaged it
    straight away with `git reset -- components/rota/WeeklyRotaEmpty.tsx`. The file is still deleted in the working
    tree, and nothing is staged now (see `git status` below).

Not changed, as instructed: `lib/rota/columns.ts`, `RotaBoard.tsx`, `upsert_restructure` callers
(`useGenerateRestructure.ts`, `RestructureEmpty`'s logic), the board write paths (`rotaDataSource.ts`), and every
other Club Profile file.

---

## 4. Checks

`package.json` has no type-check script, so the type check is `npx tsc --noEmit`, as the plan's step 6 gives.

| Check | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | Exit 0, no diagnostics (no output) |
| Lint | `npm run lint` (`eslint`) | Exit 0, no output (no errors, no warnings) |
| Build | `npm run build` | Exit 0: `✓ Compiled successfully in 2.4s` … `Finished TypeScript in 2.4s` … `✓ Generating static pages using 7 workers (23/23) in 107ms`. The route table includes the new `ƒ /rota/[siteSlug]/standard`. |
| Removed components | `grep -rn "RotaViewTabs\|WeeklyRotaEmpty" app components lib` | 0 lines |
| Bare `/week` links | `grep -rnE "/rota/\$\{[a-zA-Z.]+\}/week[\`\"]" app components` | 1 line, WeekNav's base string (deviation 8) |

No dev server was started.

### Exit criteria

| Criterion | Where |
|---|---|
| Section 5 in order, A1–A6 applied | Steps 1 → 6 in order; section 2 above |
| `RotaViewTabs` and `WeeklyRotaEmpty` deleted, no references | grep above: 0 |
| No way to create a week anywhere in the UI | The only `upsert_weekly_rota` caller is `useGenerateWeek`, used only by `WeeklyRotaBoard` (Regenerate, existing weeks). `create_weekly_rota` has no caller. `WeekNotCreated` has no button. No "Add week" anywhere. |
| Regenerate works; P0002 refreshes to "This week hasn't been created" | `useGenerateWeek`: `rpcError?.code === "P0002"` → `router.refresh()`, no error set |
| Landing page uses a fixed 8 queries | One `Promise.all` of Q1–Q8 in `[siteSlug]/page.tsx`. None depends on the week count. |
| A3 exact; `isOrphan` and board unchanged | `classifyClass`; `columns.ts` and `RotaBoard.tsx` not modified |

---

## 5. Test plan (plan section 6, updated for A1–A6)

### 6.1 Accounts and test site

Unchanged from the plan:

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


> Carried over unchanged from the plan. **Still not run, and still needs Jamie's approval.**

### 6.3 Manual checks

Run by **F**, **E** and **C** unless a row says otherwise. Expected results are given per role where they differ.
Rows changed from the plan are marked **(changed)**. New rows are marked **(new)**.

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
| 11 | WeekNav on M+7 | ‹ disabled; › → M+21 (skips M+14); "This week" disabled (M not created; hover shows "This week hasn't been created"). On M+28: › disabled. |
| 12 | Stage 2, landing | Default = M ("This week", orange). WeekNav "This week" link appears on M+7. |
| 13 | Stats and day rows on M | Coaches working / Classes / Covered / Without a coach match the board by hand count; day rows show working coaches only, short names. |
| 14 | E makes NULL, orphan and cover (6.2 notes); reload landing as each role | M+7 and M+21 chips red; bars red on those days; day flags "{n} without a coach"; covering coach shows "(cover)"; Covered count matches; Needs attention lists each (week, day) in order; clicking one selects that week and scrolls to detail. |
| 15 | Status "No classes" | As E, delete every class from M+28 → grey "No classes". |
| 16 | `?week=` handling **(changed, A1)** | Stage 1: `?week={M+21}` selects it (URL unchanged). `?week={M+23}` (a Wednesday of a created week) → `?week={M+21}`, selected. `?week={M+16}` (a Wednesday of uncreated M+14) → `/rota/{S}/week/{M+14}`, "This week hasn't been created", in one redirect. `?week={M+14}` → the same. `?week=abc`, `?week=2026-02-30` and `?week={M+7}&week={M+21}` → `/rota/{S}`. Stage 3: `?week={M−63}` (created, but the 9th past week, so not loaded) → `/rota/{S}/week/{M−63}`, which shows that week's **board**. |
| 17 | Regenerate on M (F, E) | Confirm modal → week rebuilt from Standard (edits gone), same URL. C: button disabled. |
| 18 | Regenerate P0002 (F) | Open M+28 board, then run `delete … where week_start_date = M+28` (approved SQL), then Regenerate → page refreshes to "This week hasn't been created"; no raw error. |
| 19 | Export week (all roles) | PDF downloads as `{slug}-week-{monday}.pdf`, identical to exporting from that week's board. Button reads "Export week" on the landing page, "Export as PDF" on the boards. |
| 20 | Stage 3 | Previous weeks collapsed, 8 items newest first ("Last week" … "8 weeks ago"); the 9th not listed; Needs attention ignores past weeks; selecting one opens the disclosure and shows its detail; "Open week" opens an editable board for F/E. WeekNav ‹ from M reaches M−7. |
| 21 | Stage 4 | "No upcoming weeks have been created."; previous weeks open; default = M−7. |
| 22 | SiteSwitcher (F) **(changed, A2)** | From the Standard board → `/rota/{other}/standard`. From Restructure (board, or the "No restructure built yet" card) → `/rota/{other}/restructure`. From a week board, an uncreated-week page, or the landing page → `/rota/{other}` landing (no `?week` carried); other sites show the no-weeks state. |
| 23 | Club Profile "Open the rota →" (when this week isn't created) | Goes to `/rota/{S}`. |
| 24 | Leave/sick on the landing page **(new, A3)** | As E on M+7's board, set coach X's roster status to Leave on a day where X has ≥ 1 class and isn't covering. Reload the landing page (each role): that day's bar on M+7 is red; the day row flag reads "{n} without a coach", n including X's classes; X has no chip on that day; the "Without a coach" stat and the M+7 chip (red "Classes without a coach") include them; Needs attention lists that (M+7, day). Repeat with Sick: same. |
| 25 | Board unchanged by A3 **(new)** | With 24 in place, open M+7's board: X's classes are still drawn in X's column on that day, **not** in the Unassigned column, and have no "Not rostered" label (the board's rule is unchanged). The PDF from Export week (landing) and Export as PDF (board) are identical, and also show them in X's column. |
| 26 | Leave beats cover **(new, A3)** | On M+7, give X a class whose set coach is someone else (drag it into X's column), then set X to Leave that day. The landing page counts that class as without a coach, not covered: "Covered by another coach" drops by 1 and "Without a coach" rises by 1. Set X back to Working: it's counted as covered again and X's chip shows " (cover)". |
| 27 | Red colour **(new, A4)** | The red chip, red bars, red day flags, the red "Without a coach" stat and the Needs attention dots all use the board's error-banner red (`#a02a1c`, chip background `#fdecea`), the same red as "Couldn't regenerate" in the Regenerate modal, not the dashboard's orange-red "Action" pill. |
| 28 | Club Profile wording **(new, A5)** | At a site where this week isn't created: Club Profile's This week card reads "This week's rota hasn't been created yet" / "…once the week has been created in the Rota tool."; Staff hours modal reads "This week's rota hasn't been created yet, so there are no hours to total." No "generated" in either. |

Week creation can't be tested in 2a. It arrives in 2b.

---

## Repo hygiene

- No `git add`, commit or push. Nothing staged (the `git rm` in deviation 11 was unstaged).
- Nothing written to the repo root. `.next/` from the build is git-ignored.
- Nothing under `supabase/` touched. No SQL run, no database connection, no secret key read, no `npm install`.

`git status --short` after writing this report:

```
 M app/(protected)/rota/[siteSlug]/page.tsx
 M app/(protected)/rota/[siteSlug]/restructure/page.tsx
 M app/(protected)/rota/[siteSlug]/week/[weekStartDate]/page.tsx
 M app/(protected)/rota/[siteSlug]/week/page.tsx
 M components/clubProfile/AttendanceGrid.tsx
 M components/clubProfile/StaffHoursModal.tsx
 M components/rota/RestructureEmpty.tsx
 M components/rota/RotaExportButton.tsx
 D components/rota/RotaViewTabs.tsx
 M components/rota/SiteSwitcher.tsx
 M components/rota/WeekNav.tsx
 M components/rota/WeeklyRotaBoard.tsx
 D components/rota/WeeklyRotaEmpty.tsx
 M components/rota/useGenerateWeek.ts
 M lib/rota/week.ts
?? app/(protected)/rota/[siteSlug]/standard/
?? components/rota/RotaHomeLink.tsx
?? components/rota/RotaHomeSidebar.tsx
?? components/rota/RotaPreviousWeeks.tsx
?? components/rota/RotaStatusChip.tsx
?? components/rota/RotaWeekDetail.tsx
?? components/rota/RotaWeekExport.tsx
?? components/rota/RotaWeekStrip.tsx
?? components/rota/WeekNotCreated.tsx
?? docs/investigations/rota-landing-p2a-implementation.md
?? docs/investigations/rota-landing-p2a-plan.md
?? lib/rota/landing.ts
```
