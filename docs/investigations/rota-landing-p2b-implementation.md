# Rota landing redesign — Phase 2b implementation report (Add week, Delete week)

Date: 2026-11-06. Builds on 2a (`07fa63a`, committed locally, not pushed). Not committed or pushed. Nothing under
`supabase/` was touched, no SQL was run, nothing connected to a database outside the app, and the secret key was not
read. No new npm dependencies. No git commands other than `git status` / `git diff --stat`.

---

## 1. Files

**Created 2, modified 4, deleted 0: 6 code files.** This report is 1 more created file.

| # | Path | Change |
|---|---|---|
| C1 | `components/rota/AddWeek.tsx` | **Created.** Client. The "+ Add week" tile / "Add a week" button and the Add a week dialog. Calls `create_weekly_rota`. |
| C2 | `components/rota/DeleteWeek.tsx` | **Created.** Client. "Delete week" button and its confirm modal. Deletes the `rota_weekly_rotas` row with `.select()`. |
| M1 | `lib/rota/landing.ts` | **Modified.** + `ADD_WEEK_MAX_AHEAD` (16), `AddWeekOption`, `addWeekOptions(thisMonday, existing)`. |
| M2 | `app/(protected)/rota/[siteSlug]/page.tsx` | **Modified.** Builds `addWeek` props (edit_rota only); Add button in the no-weeks state; passes `addWeek` to the strip and `canDelete` to the detail panel. Still 8 queries. |
| M3 | `components/rota/RotaWeekStrip.tsx` | **Modified.** `addWeek` prop: the tile at the end of the row, or a button beside "No upcoming weeks have been created." |
| M4 | `components/rota/RotaWeekDetail.tsx` | **Modified.** `canDelete` prop: renders `DeleteWeek` (keyed on the week id) before Export week. |
| — | `docs/investigations/rota-landing-p2b-implementation.md` | This report. |

Not touched: `supabase/`, `lib/rota/columns.ts`, the board's write paths (`rotaDataSource.ts`, `RotaBoard.tsx`), the
restructure flow, `components/Modal.tsx`, `components/formStyles.ts`, any design token.

---

## 2. What was built

### 2.1 Add week

- **Who.** The page builds `addWeek` only when `hasSiteCapability(caps, "edit_rota", site.id)` (and the weeks loaded
  without error). Otherwise it's `null` and neither the tile nor the button is rendered at all.
- **Where.** The last tile in the week strip; a button beside "No upcoming weeks have been created." (only past weeks
  exist); a button under "No weeks have been created for {site} yet." (no weeks at all).
- **Week options (server).** `addWeekOptions(currentMonday(), Q1 Mondays)` returns this London Monday plus 0…16 weeks,
  minus weeks already created: up to 17 options, never a past week. Labels: "Mon 9 Nov · Next week",
  "Mon 2 Nov · This week", "Mon 23 Nov · In 3 weeks". Q1 holds every created week from this Monday on, so it's the
  whole exclusion list. The browser never computes "today".
- **Dialog** (`components/Modal.tsx`, the app's shared modal, at the CLAUDE.md compact density via `formStyles.ts`),
  laid out as the mockup's: title "Add a week", site name under it, "Week commencing" select, "Start from" radio group
  with two bordered options (the selected one tinted orange-pale), Cancel / Add week.
  - **Standard rota:** "Copy the {n} classes and coaches from the template." (n = Q7's count).
  - **Copy another week:** "Useful for repeating a holiday or half-term pattern." (mockup text) plus a select of the
    loaded created weeks: upcoming ascending, then past newest first, labelled "9–15 Nov · Next week". All are from
    this site by construction (Q1/Q2 filter on `site_id`).
- **Disable rules.**

| Condition | Result |
|---|---|
| Standard Rota has 0 classes | "Standard rota" radio disabled, hint "Build the standard rota first"; default source is Copy |
| No created weeks | "Copy another week" radio disabled, hint "No weeks have been created yet.", no select |
| Both of the above | Add week (submit) disabled |
| All 17 weeks exist | Tile disabled, reading "All weeks up to 16 ahead have been created" (also its `title`) |

- **Submit.** `supabase.rpc("create_weekly_rota", { p_site_id, p_week_start, p_source_weekly_rota_id })` from the
  browser client (`lib/supabaseClient.ts`, the user's session), with `null` for Standard. While the call and the
  following navigation run, both buttons are disabled, the submit reads "Adding…", and Cancel / ✕ / the selects do
  nothing, so it can't be double-submitted.
- **Success.** Dialog closes; `router.push('/rota/{site}?week={monday}')` selects the new week.
- **Errors** (shown in a board-error-red box inside the dialog, which stays open):

| Code | Shown | Then |
|---|---|---|
| 23505 | "That week has already been created." | `router.refresh()`: the week appears in the strip and leaves the options |
| 22023 | "Couldn't add the week: {function message}" | — |
| P0002 | "The week you chose to copy no longer exists." | `router.refresh()`: the source leaves the copy list |
| P0001 / other | "Couldn't add the week: {function message}" | — (same as Regenerate's "Couldn't regenerate: {message}") |

  After a refresh, if the chosen week or copy source is no longer offered, the dialog falls back to the first one that
  is, rather than submitting a value the select no longer shows.

### 2.2 Delete week

- **Who.** `RotaWeekDetail` renders it only when `canDelete` (= `canEdit`, edit_rota at this site).
- **Button.** "Delete week", secondary style in the 2a board-error red (`text-[#a02a1c]`, `border-[#f3c9c4]`,
  hover `bg-[#fdecea]`), left of Export week in the detail panel's actions.
- **Confirm** (`Modal`): title "Delete week", body "Delete the week of {9–15 Nov}? This removes every class and coach
  on it.", Cancel / Delete week (solid board-error red). Buttons disable and read "Deleting…" while in flight.
- **Delete.** `supabase.from("rota_weekly_rotas").delete().eq("id", weekId).select("id")` (browser client; RLS
  `rota_weekly_rotas_delete_edit_rota_site`; children cascade).
  - Error → "Couldn't delete the week: {message}", modal stays open.
  - Returned rows ≠ 1 → "This week was already deleted." and `router.refresh()`.
  - 1 row → `router.push('/rota/{site}')` + `router.refresh()` (the refresh covers already being on the clean URL), so
    the default-week rule picks the next selection.

---

## 3. Deviations and notes

1. **0-row delete also covers RLS.** A delete that RLS hides (e.g. edit rights removed mid-session) also returns 0 rows
   with no error, so it shows "This week was already deleted." too. PostgREST can't tell the two apart without another
   query. The brief's mapping was applied as written.
2. **After "already deleted", where the refresh lands depends on the URL.** On the clean URL the page re-renders with
   the next default week, and `DeleteWeek` is keyed on the week id, so the modal (and its message) closes as the
   deleted week leaves the panel. On `?week={deleted week}`, 2a's A1 rule redirects to `/rota/{site}/week/{monday}`,
   which says "This week hasn't been created". Either way the user sees the week has gone.
3. **23505 from the no-weeks button.** If the dialog was opened from the "No weeks have been created" button and
   another tab created a week first, the refresh replaces the empty state with the strip, so that button (and its open
   dialog) unmounts and the message isn't seen. The new week is visible in the strip instead. From the strip's tile
   the dialog stays open and shows the message.
4. **Error prefix.** Mapped messages (23505, P0002) are shown exactly as the brief words them; raw function messages
   (22023, P0001, other) get "Couldn't add the week: ", matching Regenerate's "Couldn't regenerate: ".
5. **"Copy another week" hint** uses the mockup's text. The disabled-state hints are "Build the standard rota first"
   (from the brief) and "No weeks have been created yet." (mine; the brief gave none).
6. **Add week hidden when weeks failed to load.** With the Q1/Q2 error banner up, the exclusion list is unknown, so no
   Add week is offered. Not in the brief.
7. **No change to `WeekNotCreated`.** The uncreated-week page still has no button; Add week lives on the landing page.

---

## 4. Checks

| Check | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | Exit 0, no output |
| Lint | `npm run lint` (`eslint`) | Exit 0, no output after the script header |
| Build | `npm run build` | Exit 0: `✓ Compiled successfully in 2.5s` … `Finished TypeScript in 2.3s` … `✓ Generating static pages using 7 workers (23/23) in 111ms` |

No dev server was started by this session (one was already running on :3000 from earlier).

### Exit criteria

| Criterion | Where |
|---|---|
| Server-computed options, both modes, 3 disable rules, 4 error mappings | 2.1 |
| Delete with confirm modal and 1-row check | 2.2 |
| Add and Delete hidden for non-edit_rota | `addWeek = canEdit ? … : null`; `canDelete={canEdit}` |
| Checks pass | Section 4 |
| Combined test plan, zero SQL | Section 5 |
| Nothing under `supabase/`, no SQL, no git add/commit/push | Repo hygiene |

---

## 5. Combined 2a + 2b test plan — click only, no SQL

### 5.1 Accounts and setup (all in the app)

- **F** = full access (Jamie, Head of Gymnastics). **E** = Lead Coach or Club Head Coach at site **S**. **C** = Coach
  at S. Existing test accounts, or created / re-titled in Admin › Users.
- **T** = a test Coach account at S, used for the deactivation check (create it in Admin › Users if needed).
- **S** = the site with the Standard Rota. Build it in the app first (as E or F on `/rota/{S}/standard`): ≥ 1 class on
  ≥ 2 days, ≥ 2 rostered coaches **including T**, with T taking ≥ 1 class.
- **S2** = any other site whose Standard Rota has **no classes** (for the "Build the standard rota first" rule).
- `M` = this week's Monday; `M+n` = n **days** later (so `M+7` is next week's Monday).
- Start with **no weeks at S**. If any exist, delete them with Delete week first.
- Run each row as F, E and C unless it names a role. "2a #" = the check's number in the 2a report.

### 5.2 Part A — no weeks

| # | 2a # | Check | Expected |
|---|---|---|---|
| 1 | 1 | Open `/rota` | F → `/rota/{first site}`; E, C → `/rota/{S}`. The landing page loads, not the Standard board. |
| 2 | 2 | Old bookmarks `/rota/{S}` and `/rota/{S}/week` | Both land on the landing page. |
| 3 | 3 | Landing at S | "No weeks have been created for {S} yet." No previous weeks, no detail panel; sidebar shows; Needs attention "Nothing needs attention." **F/E:** an "Add a week" button under the text. **C:** no button, no Add week anywhere. |
| 4 | 4 | Standard card | F/E "Edit standard rota", C "View standard rota" → `/rota/{S}/standard` (C read-only). Coaches and Classes per week match the board. |
| 5 | 5 | Breadcrumbs | "‹ Rota home" on Standard and Restructure → `/rota/{S}`; no view tabs anywhere. |
| 6 | 6 | `/rota/{unknown}/standard` | Redirects to `/rota/{home}/standard`. |
| 7 | 7 | `/rota/{S}/week/{M+14}` | "This week hasn't been created", "‹ Rota home", **no button** for any role. `/week/{M+15}` → `/week/{M+14}`; `/week/abc` → `/rota/{S}`. |
| 8 | 8 | Roster card | Count = coaches on the roster; "Admin › Users" is a link for F only. |
| 9 | 9 | Restructure card (no restructure) | F/E "Start a restructure" → restructure page; C text only. (Generating one is optional; if you do, all roles then see "Restructure in progress — Open".) |
| 10 | 23 + A5 | Club Profile at S (this week not created) | "This week's rota hasn't been created yet" / "…once the week has been created in the Rota tool."; Staff hours: "…hasn't been created yet, so there are no hours to total."; "Open the rota →" → `/rota/{S}`. |
| 11 | — | **Add dialog contents** (E) | Click "Add a week". Title "Add a week", "{S}" under it. Week commencing lists **17** options, "Mon {d} {Mon} · This week" … "· In 16 weeks", no earlier week. Standard rota selected, "Copy the {n} classes and coaches from the template." (n = Standard's class count). Copy another week **disabled**, "No weeks have been created yet." Cancel and ✕ close it; nothing created. |
| 12 | — | **Empty Standard** (F, at S2) | Switch to S2 → "Add a week" → Standard rota disabled with "Build the standard rota first"; Copy disabled; **Add week button disabled**. Cancel. |

### 5.3 Part B — adding weeks and checking them

| # | 2a # | Check | Expected |
|---|---|---|---|
| 13 | — | **Add from standard** (E) | Add week, choose `M+7` ("Next week"), Standard rota, Add week. Button shows "Adding…" and can't be clicked twice. Dialog closes; URL `/rota/{S}?week={M+7}`; M+7 card selected and in the detail panel. "Open week": board matches the Standard Rota (same classes, coaches and leave/sick statuses). |
| 14 | — | **Duplicate from another tab** (E) | Open the landing in tabs A and B. In both, open Add week and pick `M+21`. Add in A (succeeds). Add in B → "That week has already been created."; the strip behind now shows M+21 and M+21 is gone from B's Week commencing list. Cancel B. |
| 15 | — | Add `M+28` from standard (E) | Selected after adding. Strip: M+7, M+21, M+28 in date order; tile at the end. |
| 16 | 10 | Landing, no `?week` | Default = M+7 ("Next week"). |
| 17 | 11 | WeekNav on M+7 board | ‹ disabled; › → M+21 (skips M+14); "This week" disabled with hover "This week hasn't been created". On M+28: › disabled. |
| 18 | 12 | Add `M` from standard (E), then reload `/rota/{S}` | Default = M ("This week", orange). On M+7's board "This week" is now a link. |
| 19 | 13 | Stats and day rows on M | Coaches working / Classes / Covered / Without a coach match a hand count of the board; day rows show working coaches only, short names. |
| 20 | 14 | E makes NULL, orphan and cover | On M+7: set a class's coach to Unassigned; drag a class into another coach's column (cover). On M+21: make an orphan (P4 test plan stale-tab method A). Reload landing as each role: M+7 and M+21 chips red; red bars on those days; flags "{n} without a coach"; covering coach "(cover)"; Covered matches; Needs attention lists each (week, day) in date order; clicking one selects the week and scrolls to the detail. |
| 21 | 24 | **Leave/sick** (A3) | On M+7, set coach X to Leave on a day where X has classes and isn't covering. Landing: that day red, flag includes X's classes, X has no chip that day, Without a coach and the chip count them, Needs attention lists it. Repeat with Sick. |
| 22 | 25 | Board unchanged by A3 | M+7 board: X's classes still in X's column, not Unassigned, no "Not rostered". Export week (landing) and Export as PDF (board) PDFs identical. |
| 23 | 26 | Leave beats cover | Give X a cover class on that day, X on Leave → counted without a coach, not covered. Set X back to Working → counted covered, chip "(cover)". Leave X on Leave on one day for #24. |
| 24 | — | **Copy another week** (E) | Add week → `M+14`, Copy another week → "{M+7 range} · Next week". M+14 selected; same classes as M+7 (including the Unassigned and cover classes); X's Leave row is now **Working** (every status reset to working). |
| 25 | 27 | Red colour | Red chip, bars, flags, "Without a coach" stat, Needs attention dots and the Delete week button all use the board-error red (`#a02a1c`, chip/hover background `#fdecea`), not the dashboard's orange-red "Action" pill. |
| 26 | 15 | "No classes" | As E delete every class on M+28's board → landing chip grey "No classes". |
| 27 | 16 | `?week=` | `?week={M+21}` selects it. `?week={M+23}` → `?week={M+21}`. `?week={M+37}` (Wednesday of uncreated M+35) → `/rota/{S}/week/{M+35}` "This week hasn't been created". `?week=abc`, `?week=2026-02-30`, `?week={M+7}&week={M+21}` → `/rota/{S}`. |
| 28 | 19 | Export week (all roles) | `{slug}-week-{monday}.pdf`, identical to the board's export. Label "Export week" on the landing, "Export as PDF" on boards. |
| 29 | 17 | Regenerate on M (F, E) | Confirm → week rebuilt from Standard, same URL. C: disabled. |
| 30 | 22 | SiteSwitcher (F) | From Standard → `/rota/{other}/standard`; from Restructure → `/rota/{other}/restructure`; from a week board, an uncreated-week page and the landing → `/rota/{other}` (no `?week`). |
| 31 | — | **Deactivated coach** (F, then E) | F: Admin › Users → deactivate T. E: Add week → `M+35` from standard. Board: T has no column/roster row on any day; T's classes sit in Unassigned ("Unassigned" / "No coach yet", not "Not rostered: T"). Landing counts them without a coach. Then Add week → `M+42`, copy M+7: same result. On M+7 (created while T was active) T's day chips read "{T} (inactive)". F: reactivate T afterwards. |
| 32 | — | **Coach view** (C) | Strip has no "+ Add week" tile; detail panel has Export week and Open week but **no Delete week**; empty states have no Add button. |
| 33 | — | Tile when full (optional, E) | Add every remaining week up to "In 16 weeks". The tile is disabled and reads "All weeks up to 16 ahead have been created". (Delete them in Part C.) |

### 5.4 Part C — deletions, back to no weeks

| # | 2a # | Check | Expected |
|---|---|---|---|
| 34 | — | **Delete confirm** (E) | Select M+42 → Delete week → "Delete the week of {range}? This removes every class and coach on it." Cancel: nothing changes. Delete week → "Deleting…", then URL `/rota/{S}` with no `?week`, M+42 gone from the strip, default week selected. `/rota/{S}/week/{M+42}` → "This week hasn't been created". Add week options include M+42 again. |
| 35 | — | **Already deleted** (E) | Landing in tabs A and B, both on `?week={M+35}`. Delete in A. In B, Delete week → Delete → "This week was already deleted.", then B lands on `/rota/{S}/week/{M+35}` "This week hasn't been created". Repeat with tabs A and B both on the clean URL `/rota/{S}` (showing M, the default): delete M in A; in B, Delete week → Delete → the message, then the panel moves to the next default week (M+7). |
| 36 | 18 | **Regenerate on a deleted week** (F or E) | Tab A: open M+28's board. Tab B: landing, select M+28, Delete week. Tab A: Regenerate from Standard Rota → confirm → the page refreshes to "This week hasn't been created"; no raw error. |
| 37 | — | **Copy source deleted** (E) | Tab A: Add week, pick an uncreated week, Copy another week → M+21. Tab B: delete M+21. Tab A: Add week → "The week you chose to copy no longer exists."; M+21 has left the copy list. Cancel. |
| 38 | — | Delete the rest (E) | Delete each remaining week. After the last: "No weeks have been created for {S} yet." with "Add a week" (F/E), as in #3. Needs attention "Nothing needs attention." |

### 5.5 Check later, once weeks pass

Past weeks can't be created (0030 only adds this week to +16), so these wait for real time. To get them, leave some
weeks in place after testing instead of finishing #38; each becomes a past week as Mondays go by.

| 2a # | Check | Expected |
|---|---|---|
| 20 | ≥ 9 past weeks | Previous weeks collapsed, 8 items newest first ("Last week" … "8 weeks ago"), the 9th not listed; Needs attention ignores past weeks; selecting one opens the disclosure and shows its detail; "Open week" opens an editable board for F/E; WeekNav ‹ from M reaches the latest past week. Past weeks appear in Add week's copy list but not its Week commencing list. |
| 21 | Only past weeks | "No upcoming weeks have been created." with an "Add a week" button for F/E; previous weeks open; default = latest past week. |
| 16 (part) | `?week=` an old week | `?week={a created week older than the last 8}` → `/rota/{S}/week/{that Monday}`, which shows its **board**. |

---

## Repo hygiene

- No `git add`, commit or push. Nothing staged.
- Nothing written to the repo root. `.next/` from the build is git-ignored.
- Nothing under `supabase/` touched. No SQL run, no database connection outside the app, no secret key read, no
  `npm install`.

`git status --short` after writing this report:

```
 M app/(protected)/rota/[siteSlug]/page.tsx
 M components/rota/RotaWeekDetail.tsx
 M components/rota/RotaWeekStrip.tsx
 M lib/rota/landing.ts
?? components/rota/AddWeek.tsx
?? components/rota/DeleteWeek.tsx
?? docs/investigations/rota-landing-p2b-implementation.md
```
