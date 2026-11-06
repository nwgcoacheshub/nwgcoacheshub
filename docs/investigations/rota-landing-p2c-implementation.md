# Rota landing redesign — Phase 2c implementation report (all-sites grid, first-run view)

Date: 2026-11-06. Builds on 2a (`07fa63a`) and 2b (`c3aca4c`). Not committed or pushed. Nothing under `supabase/` was
touched, no SQL was run, nothing connected to a database outside the app, and the secret key was not read. No new npm
dependencies. No git commands other than `git status` / `git diff`.

---

## 1. Files

**Created 2, modified 7, deleted 0: 9 code files.** This report is 1 more created file (10 in all).

### Created (2)

| # | Path | What |
|---|---|---|
| C1 | `components/rota/RotaFirstRun.tsx` | Server. The first-run view: title, intro (or the read-only line), 3 steps. |
| C2 | `components/rota/RotaAllSitesLink.tsx` | Server. "‹ All sites" → `/rota`. |

Plus `docs/investigations/rota-landing-p2c-implementation.md` (this report).

### Modified (7)

| # | Path | Why |
|---|---|---|
| M1 | `app/(protected)/rota/page.tsx` | Was a redirect only. Now: view_all_sites → the all-sites grid; everyone else → `redirect('/rota/{own site}')` as before. |
| M2 | `app/(protected)/rota/[siteSlug]/page.tsx` | `?add=` handling and `preselect`; first-run swap; "‹ All sites" for view_all_sites; `WEEK_SELECT` / `WeekRow` now imported. Still 8 queries. |
| M3 | `lib/rota/landing.ts` | + `WEEK_SELECT` and `WeekRow` (moved from M2, shared with M1), `weekStatus()`, `isNotSetUp()`, `GRID_WEEKS`, `GridWeek`, `gridWeeks()`. |
| M4 | `components/rota/AddWeek.tsx` | `preselect` prop: dialog opens on load with that week chosen; Cancel / ✕ drop `?add=` from the URL. |
| M5 | `components/rota/RotaStatusChip.tsx` | + `"notCreated"` ("Not created", same grey as "No classes"); `ChipStatus` type. |
| M6 | `components/rota/SiteSwitcher.tsx` | "All sites" option (only rendered with `canSwitch`, i.e. view_all_sites) → `/rota`. |
| M7 | `components/rota/DeleteWeek.tsx` | 0-rows message → "This week couldn't be deleted. It may already have been removed." |

Not touched: `supabase/`, `lib/rota/columns.ts`, the board's write paths (`rotaDataSource.ts`, `RotaBoard.tsx`), the
restructure flow, `components/Modal.tsx`, `components/formStyles.ts`, any design token, the repo root.

---

## 2. What was built

### 2.1 `/rota`

- `getSiteAccess()` as before (no sites → `RotaUnavailable`). Then `getCapabilities()`: without `view_all_sites`,
  `redirect('/rota/{homeSlug}')`, which for anyone else is their own site, exactly as before 2c.
- With `view_all_sites`: the grid.

### 2.2 The grid

- **Rows:** `access.sites`, i.e. active `rota_sites` by `sort_order`.
- **Columns:** `gridWeeks(currentMonday())`: this London Monday + 0…3 weeks, labelled "This week" / "Next week" /
  "In 2 weeks" / "In 3 weeks" with the short range ("9–15 Nov"). The current week's header is orange-dark (the
  mockup's `th.now`).
- **Site cell:** name, then "N coaches" (`site_rota_roster` length) or "Not set up".
- **Status cell:**

| Site / week | Chip | Link |
|---|---|---|
| Site not set up | grey "Not created" | `/rota/{site}` (first-run view) |
| Week created | `weekStatus(row)` → Ready / Classes without a coach / No classes | `/rota/{site}?week={monday}` |
| Week not created, site set up | grey "Not created" | `/rota/{site}?add={monday}` |
| Weeks or set-up query failed | "—" | `/rota/{site}` |

- **Same logic, not a second one:** `weekStatus()` in `lib/rota/landing.ts` calls `summariseWeek()` (the landing
  page's function, including the leave/sick rule) and returns its `.status`. The directory is empty because status
  doesn't depend on names.
- **"Not set up"** is `isNotSetUp(hasStandardClasses, hasWeeks)` in `landing.ts`, used by both the grid and the site
  page.
- **Errors:** any failed query adds a line to a red banner above the grid ("Couldn't load weeks: …", "Couldn't load
  which sites are set up: …", "Couldn't load coach counts: …"). A failed weeks or set-up query turns every cell into
  "—", never "Not created". A failed roster call shows "—" under that site's name.
- **Legend:** Ready, Classes without a coach, No classes, Not created, then "Select any status to open that site and
  week." No "Export all", no view switcher.

### 2.3 `?add=`

On `/rota/{site}`, only when the user holds `edit_rota` at that site and the weeks loaded:

| `?add=` value | Result |
|---|---|
| A Monday (or any day of a week) that Add week offers | Dialog opens on load with that week chosen |
| A week already created (e.g. made in another tab since the grid loaded) | `redirect('?week={monday}')` |
| Past, beyond +16, or not a date | `redirect` to the URL without `?add` (keeping `?week` if present) |

Without `edit_rota`, `?add=` is ignored completely: no dialog, no redirect. Closing the dialog with Cancel / ✕
replaces the URL without `?add`, so a reload or Back doesn't reopen it. A successful add still goes to
`?week={monday}` (2b), which drops `?add` too.

### 2.4 First-run view

Shown instead of the site landing page's strip, detail panel and sidebar when the weeks query and the standard class
count both succeeded **and** the site has 0 Standard Rota classes **and** 0 created weeks. The header (Rota, site
switcher, "‹ All sites", breadcrumb) stays.

- **Title** "Set up {site}'s rota".
- **Under it:** edit_rota holders get the mockup's intro ("Three steps. Once the standard rota is in place, each new
  week starts as a copy of it and you only change what's different."); everyone else gets "{site}'s rota hasn't been
  set up yet."
- **Steps** (the mockup's bordered rows; the first incomplete step has an orange border and orange number; a done step
  shows a green ✓; a locked step is faded):

| # | Title | Text | Done when | Action (edit_rota holders only) |
|---|---|---|---|---|
| 1 | Coaches on the roster | "{n} coaches have {site} as their site." | n ≥ 1 | n = 0: "Admin › Users" link for manage_users, else "Ask an admin to add coaches in Admin › Users". n ≥ 1: none. No "Add coaches" button. |
| 2 | Build the standard rota | "Your normal week: which classes run, when, and whose group each one is." | ≥ 1 standard class | "Build" → `/rota/{site}/standard` (primary when it's the current step) |
| 3 | Add your first week | "Copy the standard rota into a week and adjust it for absences or cover." | — | Locked until step 2 is done; a disabled "Add week" button |

- Read-only roles see the title, the "hasn't been set up yet" line and the step status only: no links, no buttons,
  no "Ask an admin" line.
- As soon as one standard class exists the site isn't "Not set up", so the normal landing page with its "No weeks have
  been created for {site} yet." / "Add a week" state takes over. Step 3 is therefore only ever seen locked.

### 2.5 All sites links

- "‹ All sites" beside the site switcher on every site landing page (normal and first-run), view_all_sites only.
- "All sites" as the first option of `SiteSwitcher` → `/rota`. `SiteSwitcher` only renders a select for
  view_all_sites holders, so nobody else sees it. Because it's the shared switcher, the option is also on the
  Standard, Restructure and week pages.

### 2.6 Delete message

`DeleteWeek` 0-rows case now reads "This week couldn't be deleted. It may already have been removed." Behaviour
otherwise unchanged (still `router.refresh()`).

---

## 3. Query counts

**Grid (`/rota`, view_all_sites):** 10 page queries, fixed regardless of how many weeks exist:

| # | Query |
|---|---|
| 1 | `rota_sites` (active, sort_order) — `getSiteAccess()`, as on every rota page |
| 2 | `rota_weekly_rotas` for all sites, `week_start_date` between this Monday and +21 days, roster and classes embedded (`site_id, ` + the landing page's `WEEK_SELECT`). At most 4 rows per site. |
| 3 | `rota_sites` with `rota_standard_classes(id)` and `rota_weekly_rotas(id)` embedded, each `limit(1)` per site: has any standard class / has any week, ever |
| 4–10 | `site_rota_roster(p_site_id)` once per active site, in parallel (7 today; grows only with the number of sites) |

Plus `auth.getUser`, `profiles` and `my_capabilities()`, which are React-`cache()`d and shared with the protected
layout. 2–10 run in one `Promise.all`. Coach / Lead Coach: only query 1, then the redirect.

**First-run view:** no new queries. It's the site landing page's existing **8** (+ `rota_sites` from `getSiteAccess`),
reading the weeks queries, the standard class count and `site_rota_roster` it already makes.

---

## 4. Deviations from the brief, and notes

1. **2b was already committed.** The brief says 2b is uncommitted; `git log` shows `c3aca4c Rota landing Phase 2b: Add
   week and Delete week` and the tree was clean at the start of this session. No effect on the work.
2. **Set-up query is existence, not counts.** The brief asked for "one query for standard class counts across sites".
   "Not set up" also needs "0 created weeks **ever**", which the 4-week query can't answer (a site could have only
   past weeks or weeks beyond +3). Query 3 answers both in one request with an embedded `limit(1)` per site. Counts
   aren't displayed anywhere on the grid, so existence is all it needs. Still one query.
3. **Not-set-up site cells read "Not created"** (grey, linking to the first-run view); the site cell says "Not set
   up". The brief didn't say what those cells show.
4. **`?add=` extras:** a week created since the grid loaded redirects to `?week=`; an un-addable value drops the param;
   Cancel removes `?add` from the URL. The brief only specified preselect / ignore.
5. **`?add=` links for every set-up, uncreated cell**, as the brief says. Every view_all_sites holder currently also
   holds edit_rota with all_sites_scope, so the dialog opens for all of them. If that ever changes, `?add` is simply
   ignored for them.
6. **Read-only first-run wording.** I read "the title, '{site}'s rota hasn't been set up yet' and the step status" as:
   keep "Set up {site}'s rota" as the heading and use the line in place of the intro. If you'd rather Coaches see
   "{site}'s rota hasn't been set up yet" *as* the heading, it's a one-line change in `RotaFirstRun.tsx`.
7. **"Ask an admin…" can't currently appear.** Only edit_rota holders see actions. Those without manage_users are Lead
   Coach / Club Head Coach, whose edit_rota applies at their own site only, and they are themselves on that site's
   `site_rota_roster`, so n ≥ 1 there. The branch is built as specified but has no test.
8. **2b's "both sources disabled" Add week state is now unreachable.** It needed 0 standard classes and 0 weeks, which
   is now the first-run view (no Add week). 2b check #12 is replaced by a site with weeks but 0 standard classes
   (check 27 below).
9. **`WEEK_SELECT` / `WeekRow` moved** from the landing page into `lib/rota/landing.ts` so the grid uses the identical
   select. Not a behaviour change.
10. **`/rota`'s `RotaUnavailable` heading** is now "Rota" (it used the component's default "Standard rota", left from
    when `/rota` was the Standard board).
11. **Unchanged:** a view_all_sites user on an unknown slug (`/rota/xyz`) is still redirected to the first site, not to
    the grid.
12. **Delete message** also covers a delete RLS silently refuses (2b note 1); the new wording suits both.

---

## 5. Checks

| Check | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | Exit 0, no output |
| Lint | `npm run lint` (`eslint`) | Exit 0, no output after the script header |
| Build | `npm run build` | Exit 0: `✓ Compiled successfully in 2.3s` … `Finished TypeScript in 2.4s ...` … `✓ Generating static pages using 7 workers (23/23) in 103ms` |

No dev server was started.

### Exit criteria

| Criterion | Where |
|---|---|
| `/rota` grid for view_all_sites; others redirected to their own site | 2.1 |
| Grid statuses from `lib/rota/landing.ts` | 2.2 (`weekStatus` → `summariseWeek`) |
| `?add=` preselects for edit_rota, ignored for others | 2.3 |
| First-run only when 0 standard classes AND 0 weeks; read-only for Coaches; no "Add coaches" | 2.4 |
| Delete message updated | 2.6 |
| Type check, lint, build pass | Section 5 |
| Combined 2a + 2b + 2c test plan, zero SQL | Section 6 |
| Nothing under `supabase/`, no SQL, no git add/commit/push | Repo hygiene |

---

## 6. Final combined 2a + 2b + 2c test plan — click only, ZERO SQL

### 6.1 Accounts and site setup (all done in the app)

| Name | Account | Notes |
|---|---|---|
| **F** | Full access: Jamie (Head of Gymnastics, Head Office) | view_all_sites, edit_rota everywhere, manage_users |
| **E** | Lead Coach at **S** | |
| **C** | Coach at **S** | |
| **T** | Test Coach at **S** | Used for the deactivation check |
| **EN** | Lead Coach at **N** | **Create in Part B** (not before) |
| **CN** | Coach at **N** | **Create in Part B** (not before) |

- **S** = the site with a built Standard Rota. Build it in the app first (as E or F on `/rota/{S}/standard`): ≥ 1 class
  on ≥ 2 days, ≥ 2 rostered coaches **including T**, with T taking ≥ 1 class. Then **no weeks at S**: delete any with
  Delete week.
- **N** = a different active site with **0 Standard Rota classes and 0 weeks** (on the grid it reads "Not set up").
  Ideally **no active Coach / Lead Coach / Club Head Coach has N as their site** (check in Admin › Users), so step 1
  can be seen incomplete. If someone does, skip check 15's "0 coaches" part.
- `M` = this week's Monday; `M+n` = n **days** later (`M+7` is next week's Monday).
- Run each row as F, E and C unless it names a role. "2b #" = the check's number in the 2b report.

### 6.2 Part A — no weeks anywhere yet

| # | 2b # | Check | Expected |
|---|---|---|---|
| 1 | 1 (changed) | **Open `/rota`** (also via Operations › Rota) | **F → the all-sites grid** at `/rota`. **E and C → `/rota/{S}`** (their own site's landing page). |
| 2 | — | **Grid layout (F)** | Heading "Rota", "All sites" beside it, "Home / Rota". One row per active site in the usual site order. 4 columns: "This week {range}", "Next week", "In 2 weeks", "In 3 weeks"; "This week" header orange. S's row: "{n} coaches" = S's Roster card count; every cell grey "Not created". N's row: "Not set up", every cell "Not created". Legend: Ready, Classes without a coach, No classes, Not created, "Select any status to open that site and week." No Export all, no view switcher, no red banner. |
| 3 | — | **Grid as E and C** | Typing `/rota` always lands on `/rota/{S}`; the grid never shows. |
| 4 | 2 | Old bookmarks `/rota/{S}` and `/rota/{S}/week` | Both land on the landing page. |
| 5 | 3 | Landing at S | "No weeks have been created for {S} yet." No previous weeks, no detail panel; sidebar shows; Needs attention "Nothing needs attention." **F/E:** "Add a week" button. **C:** no button. |
| 6 | — | **All sites links** | **F** on S's landing: "‹ All sites" beside the site select → `/rota`; the site select's first option is "All sites" → `/rota`. **E, C:** no "‹ All sites", and a plain site label (no select). |
| 7 | 4 | Standard card | F/E "Edit standard rota", C "View standard rota" → `/rota/{S}/standard` (C read-only). Coaches and Classes per week match the board. |
| 8 | 5 | Breadcrumbs | "‹ Rota home" on Standard and Restructure → `/rota/{S}`; no view tabs anywhere. |
| 9 | 6 | `/rota/{unknown}/standard` | Redirects to `/rota/{home}/standard`. |
| 10 | 7 | `/rota/{S}/week/{M+14}` | "This week hasn't been created", "‹ Rota home", no button for any role. `/week/{M+15}` → `/week/{M+14}`; `/week/abc` → `/rota/{S}`. |
| 11 | 8 | Roster card | Count = coaches on the roster; "Admin › Users" is a link for F only. |
| 12 | 9 | Restructure card | F/E "Start a restructure"; C text only. |
| 13 | 10 | Club Profile at S | "This week's rota hasn't been created yet" / "…once the week has been created in the Rota tool."; Staff hours: "…hasn't been created yet, so there are no hours to total."; "Open the rota →" → `/rota/{S}`. |
| 14 | 11 | **Add dialog contents** (E) | "Add a week" → title "Add a week", "{S}" under it. Week commencing lists 17 options, "Mon {d} {Mon} · This week" … "· In 16 weeks". Standard rota selected, "Copy the {n} classes and coaches from the template.". Copy another week disabled, "No weeks have been created yet.". Cancel and ✕ close it; nothing created. |

### 6.3 Part B — first-run view at N

| # | 2b # | Check | Expected |
|---|---|---|---|
| 15 | — | **First-run as F** | On the grid click any N cell → `/rota/{N}`. Header: "Rota", site select on N, "‹ All sites". Below: "Set up {N}'s rota", the three-steps intro, 3 steps. No week strip, detail panel or sidebar. Step 1 "0 coaches have {N} as their site." (current: orange border/number) with an "Admin › Users" link → `/admin/users`. Step 2 "Build" link → `/rota/{N}/standard`. Step 3 faded, disabled "Add week". No "Add coaches" button anywhere. |
| 16 | — | Create EN and CN (F) | Admin › Users: add EN (Lead Coach, site N) and CN (Coach, site N). Back on `/rota/{N}`: step 1 "2 coaches have {N} as their site." with a green ✓ and no link; step 2 is now current, its "Build" orange. Grid: N still "Not set up". |
| 17 | — | **First-run as EN** | `/rota` → `/rota/{N}`, first-run view. Same as #16 (intro, "Build" link, disabled step 3). No "‹ All sites", no site select, no Admin › Users link. |
| 18 | — | **First-run as CN** | `/rota` → `/rota/{N}`. Title "Set up {N}'s rota", then "{N}'s rota hasn't been set up yet." (no intro). The 3 steps with their status (✓ on step 1, step 3 faded) but **no links or buttons** at all. |
| 19 | — | `?add=` on a not-set-up site (F) | `/rota/{N}?add={M+7}`: first-run view, no dialog. |
| 20 | — | **First-run → normal landing** (EN) | Step 2 "Build" → N's Standard board. Add a coach to the standard roster and **one** class. Back to `/rota/{N}` (reload): the normal landing page, "No weeks have been created for {N} yet." with "Add a week"; sidebar shows Standard rota "Classes per week 1". As CN: same page, no Add button. Grid (F): N now "2 coaches", cells "Not created". |

### 6.4 Part C — adding weeks at S and checking them

| # | 2b # | Check | Expected |
|---|---|---|---|
| 21 | 13 | **Add from standard** (E) | Add week, `M+7` ("Next week"), Standard rota, Add week. "Adding…", can't double-click. Dialog closes; URL `/rota/{S}?week={M+7}`; M+7 selected. "Open week": board matches the Standard Rota. |
| 22 | 14 | **Duplicate from another tab** (E) | Tabs A and B, both Add week → `M+21`. Add in A. Add in B → "That week has already been created."; B's strip shows M+21 and it's gone from B's list. Cancel B. |
| 23 | 15 | Add `M+28` from standard (E) | Selected after adding. Strip: M+7, M+21, M+28 in order; tile at the end. |
| 24 | 10 (2a) | Landing, no `?week` | Default = M+7 ("Next week"). |
| 25 | 11 (2a) | WeekNav on M+7 board | ‹ disabled; › → M+21; "This week" disabled with hover "This week hasn't been created". On M+28: › disabled. |
| 26 | 18 (changed) | **Not created cell → Add week preselected (F)** | Grid: S's row reads This week "Not created", Next week a status chip, In 2 weeks "Not created", In 3 weeks a status chip. Click S's **"This week"** cell → `/rota/{S}?add={M}` and the Add a week dialog opens with "Mon {M} · This week" selected. **Cancel** → dialog closes, URL becomes `/rota/{S}` (no `?add`); reload: no dialog. Back on the grid click the same cell again → Add week → URL `/rota/{S}?week={M}`. Reload `/rota/{S}`: default = M ("This week", orange). On M+7's board "This week" is now a link. |
| 27 | 12 (replaced) | **Standard disabled when the template is empty** (EN at N) | At N: Add week → M+7 from standard (N now has a week). Then on N's Standard board delete its only class. `/rota/{N}`: **still the normal landing page** (it has a week), not first-run. Add week: Standard rota disabled, "Build the standard rota first"; Copy another week selected with N's M+7 week; Add week button enabled. Cancel. Grid (F): N shows "2 coaches", not "Not set up". |
| 28 | — | **`?add=` rules** | As E: `/rota/{S}?add={M+16}` (Wednesday of M+14) → dialog opens on "Mon {M+14} · In 2 weeks"; Cancel. `/rota/{S}?add={M+7}` (created) → redirects to `/rota/{S}?week={M+7}`. `/rota/{S}?add=abc` and `?add={M-7}` → `/rota/{S}`, no dialog. As **C**: `/rota/{S}?add={M+14}` → normal landing, no dialog, URL left as typed. |
| 29 | — | **Stale grid cell** (F) | Tab A: grid. Tab B (E): add `M+14` from standard. Tab A: click S's "In 2 weeks" "Not created" → lands on `/rota/{S}?week={M+14}` with that week selected, no dialog. |
| 30 | 13 (2a) | Stats and day rows on M | Coaches working / Classes / Covered / Without a coach match a hand count; day rows show working coaches only, short names. |
| 31 | 14 (2a) | E makes NULL, orphan and cover | On M+7: one class to Unassigned; drag a class into another coach's column. On M+21: make an orphan (P4 stale-tab method A). Reload landing as each role: M+7 and M+21 red; red bars on those days; flags; "(cover)"; Needs attention lists each (week, day) in date order and links to it. |
| 32 | 24 (2a) | **Leave/sick** | On M+7 set coach X to Leave on a day X has classes and isn't covering. Landing: that day red, X's classes counted, X has no chip that day, Needs attention lists it. Repeat with Sick. |
| 33 | 25 (2a) | Board unchanged by leave/sick | M+7 board: X's classes still in X's column, not Unassigned. Landing Export week and board Export as PDF identical. |
| 34 | 26 (2a) | Leave beats cover | X has a cover class that day and is on Leave → without a coach, not covered. X back to Working → covered, "(cover)". Leave X on Leave on one day. |
| 35 | — | **Grid statuses match the landing (F)** | Grid S row: This week, Next week, In 2 weeks, In 3 weeks each show **exactly** the chip the same week's card shows on `/rota/{S}` (M+7 and M+21 "Classes without a coach", including the leave-only day). Click each → `/rota/{S}?week={that Monday}` with the week selected. |
| 36 | 24 | **Copy another week** (E) | Delete M+14 first (Delete week), then Add week → `M+14`, Copy another week → "{M+7 range} · Next week". Same classes as M+7 (Unassigned and cover included); X's Leave row is Working. |
| 37 | 25 | Red colour | Red chip, bars, flags, "Without a coach" stat, Needs attention dots, Delete week button and the grid's red chips use `#a02a1c` on `#fdecea`. |
| 38 | 15 (2a) | "No classes" | As E delete every class on M+21's board → landing chip grey "No classes"; grid S "In 3 weeks" also "No classes". |
| 39 | 16 (2a) | `?week=` | `?week={M+21}` selects it. `?week={M+23}` → `?week={M+21}`. `?week={M+37}` → `/rota/{S}/week/{M+35}` "hasn't been created". `?week=abc`, `?week=2026-02-30`, two `week` params → `/rota/{S}`. |
| 40 | 19 (2a) | Export week (all roles) | `{slug}-week-{monday}.pdf`, identical to the board's export. |
| 41 | 17 (2a) | Regenerate on M (F, E) | Confirm → rebuilt from Standard, same URL. C: disabled. |
| 42 | 22 (2a, changed) | **SiteSwitcher (F)** | From Standard → `/rota/{other}/standard`; from Restructure → `/rota/{other}/restructure`; from a week board, an uncreated-week page and the landing → `/rota/{other}`. **"All sites" from each of those → `/rota`.** |
| 43 | — | **Deactivated coach** (F, then E) | F deactivates T. E: Add week → `M+35` from standard: T has no column; T's classes in Unassigned ("No coach yet"); landing counts them without a coach. Add week → `M+42`, copy M+7: same. On M+7, T's chips read "{T} (inactive)". F reactivates T. |
| 44 | — | **Coach view** (C) | No "+ Add week" tile; detail panel has Export week and Open week but no Delete week; empty states have no Add button. |
| 45 | — | Tile when full (optional, E) | Add every remaining week to "In 16 weeks": tile disabled, "All weeks up to 16 ahead have been created". |

### 6.5 Part D — deletions, back to the start

| # | 2b # | Check | Expected |
|---|---|---|---|
| 46 | 34 | **Delete confirm** (E) | Select M+42 → Delete week → "Delete the week of {range}? This removes every class and coach on it." Cancel: nothing changes. Delete week → "Deleting…", URL `/rota/{S}`, M+42 gone, default week selected; `/rota/{S}/week/{M+42}` "hasn't been created"; Add week offers M+42 again. |
| 47 | 35 (changed) | **Already deleted** (E) | Tabs A and B on `?week={M+35}`. Delete in A. In B: Delete week → Delete → **"This week couldn't be deleted. It may already have been removed."**, then B lands on `/rota/{S}/week/{M+35}` "hasn't been created". Repeat with both tabs on `/rota/{S}` showing M: delete in A; in B the same message, then the panel moves to M+7. |
| 48 | 36 | Regenerate on a deleted week | Tab A: M+28's board. Tab B: delete M+28. Tab A: Regenerate → confirm → "This week hasn't been created"; no raw error. |
| 49 | 37 | Copy source deleted (E) | Tab A: Add week, an uncreated week, Copy → M+21. Tab B: delete M+21. Tab A: Add week → "The week you chose to copy no longer exists."; M+21 has left the copy list. Cancel. |
| 50 | 38 | Delete the rest at S (E) | After the last: "No weeks have been created for {S} yet." with "Add a week" (F/E). **Not** the first-run view (S has standard classes). Grid: S row all "Not created", "{n} coaches". |
| 51 | — | **Back to first-run at N** (EN) | Delete N's M+7 week. `/rota/{N}` is the first-run view again (step 1 ✓, step 2 current). Grid (F): N "Not set up". |
| 52 | — | Clean up (F, optional) | Admin › Users: deactivate EN and CN. N's first-run step 1 returns to "0 coaches…". |

### 6.6 Check later, once weeks pass

Past weeks can't be created (0030 only adds this week to +16), so these wait for real time. Leave some weeks in place
after testing instead of finishing #50; each becomes a past week as Mondays go by.

| 2a # | Check | Expected |
|---|---|---|
| 20 | ≥ 9 past weeks | Previous weeks collapsed, 8 items newest first, the 9th not listed; Needs attention ignores past weeks; selecting one opens the disclosure and shows its detail; "Open week" editable for F/E; WeekNav ‹ from M reaches the latest past week. Past weeks in Add week's copy list but not Week commencing. |
| 21 | Only past weeks | "No upcoming weeks have been created." with "Add a week" for F/E; previous weeks open; default = latest past week. Grid: all 4 cells "Not created", linking to `?add=`. |
| 16 (part) | `?week=` an old week | A created week older than the last 8 → `/rota/{S}/week/{that Monday}`, its board. |
| — | Only past weeks, standard emptied | A site whose only weeks are in the past and whose Standard Rota has 0 classes is **not** "Not set up" on the grid (query 3 sees the past weeks) and shows the normal landing, not first-run. |
| — | Grid rolls over | On a new Monday the grid's columns move on a week; "This week" is the new London Monday. |

---

## Repo hygiene

- No `git add`, commit or push. Nothing staged.
- Nothing written to the repo root. `.next/` from the build is git-ignored.
- Nothing under `supabase/` touched. No SQL run, no database connection outside the app, no secret key read, no
  `npm install`.

`git status --short` after writing this report:

```
 M app/(protected)/rota/[siteSlug]/page.tsx
 M app/(protected)/rota/page.tsx
 M components/rota/AddWeek.tsx
 M components/rota/DeleteWeek.tsx
 M components/rota/RotaStatusChip.tsx
 M components/rota/SiteSwitcher.tsx
 M lib/rota/landing.ts
?? components/rota/RotaAllSitesLink.tsx
?? components/rota/RotaFirstRun.tsx
?? docs/investigations/rota-landing-p2c-implementation.md
```
