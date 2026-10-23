# Rota Retcon — Phase 3, Phase A findings

Read-only pass over `0029_rota_retcon.sql` (applied), the 3 rota pages, `components/rota/**`, `lib/rota/**`, the
Club Profile page and its meetings/attendance code, and `/admin/users`. No code changed, no SQL run, nothing committed.

The approved mockup is not in the repo (`reference/` has `nwg-weekly-rota.html`, `policies-mockup.html`,
`dashboard.html`, `index_1.html`; none show the picker or flagged coaches). This plan is built from the brief's
description of it.

---

## 1. RPC signatures (from 0029) and how the app calls them

| RPC | Signature | Returns | Rows |
|---|---|---|---|
| `site_rota_roster` | `(p_site_id uuid)` | `id uuid, full_name text, job_title text` | Active profiles whose `site` = that `rota_sites.name` and `job_title in (Coach, Lead Coach, Club Head Coach)`, ordered by `full_name` |
| `site_rota_people` | `(p_site_id uuid)` | `id uuid, full_name text, active boolean, site text` | Every distinct non-NULL id in 10 ref columns (3 roster `coach_id`, 3 class `coach_id`, 3 class `set_coach_id`, `club_meeting_attendees.coach_id`) for that site, whatever its `active`/`site`, ordered by `full_name` |

Both are `security definer`, `stable`, `search_path = ''`, granted to `authenticated` only. Both have the same gate:
`is_active_coach()` and (`view_all_sites` or the caller's `profiles.site` name-matches `p_site_id`). Anyone else gets
an empty set, not an error. Called as `supabase.rpc("site_rota_people", { p_site_id: site.id })`.

**Plan: one call of each per page load, server-side, in the page's existing `Promise.all`.**

- `site_rota_people` → `RotaPerson = { id, fullName, active, site }`. The page passes the array down. The board turns
  it into one `Map<id, RotaPerson>` (`peopleById`). Everything reads from it: display names, set-coach labels, the flag
  state (`moved` when `site !== siteName`, `inactive` when `!active`) and attendee names.
- `site_rota_roster` → `RosterCandidate = { id, fullName, jobTitle }`. This list feeds the picker (and the attendee
  picker) and nothing else.
- **Gap and fix:** `site_rota_people` only knows ids that rows **already** reference when the page loads. A coach
  added from the picker during the session isn't in it. The board seeds `peopleById` from the people array, then adds
  every roster candidate not already in it as `{ active: true, site: siteName }`. That is true of them by definition.
  This is client-side only, and the map stays the single lookup.
- `site_rota_roster` is fetched only when it can be used: when `canEdit` is true on the rota pages, and when
  `canEditMeetings` is true on Club Profile. Read-only users never open a picker.
- On the weekly and restructure pages, both calls go in the second `Promise.all`, after the `rota_weekly_rotas` /
  `rota_restructures` lookup. The empty-state branch doesn't fetch them.

New shared module **`lib/rota/people.ts`**: the two types, `shortName(fullName)` (design point 3), and
`flagFor(person, siteName)` → `"moved" | "inactive" | null`. Inactive takes precedence when a person is both.

---

## 2. Files and call sites per design point

Lines are current line numbers.

### Point 1 — Coach picker: 8 files

| File | Change |
|---|---|
| `components/rota/RotaBoard.tsx` | Rewrite the picker popover (L1379–1431): title "Add a coach to {Day}", a labelled search input "Search {Site} coaches", a list of candidates (full name + job title + Add), an "Already on {Day}" chip row and the footer text. `coachPickerAvailable` (L924–928) now comes from `rosterCandidates` minus that day's roster, filtered by the search. Add `pickerQuery` state. `openCoachPicker` (L513) resets the query, not `newCoachName`. `addExistingCoachToDay` (L545) is kept as the Add action. |
| `components/rota/rota-board.module.css` | New rules for the search input, candidate row with job title, chips and footer. The popover is 210px wide (L398); it widens for this picker only. |
| `app/(protected)/rota/[siteSlug]/page.tsx` | Add the `site_rota_roster` call. |
| `app/(protected)/rota/[siteSlug]/week/[weekStartDate]/page.tsx` | Same. |
| `app/(protected)/rota/[siteSlug]/restructure/page.tsx` | Same. |
| `components/rota/StandardRotaView.tsx` | Pass `rosterCandidates` and `siteName` through to the board. |
| `components/rota/WeeklyRotaBoard.tsx` | Same. |
| `components/rota/RestructureBoard.tsx` | Same. |

`RotaBoard` gains a `siteName` prop (the picker label, the footer, the flags and the banner all need it). Today it only
has `scopeLabel`.

### Point 2 — Remove Manage coaches and all rota_coaches CRUD; new description sentence: 9 files

| File | Change |
|---|---|
| `components/rota/ManageCoachesModal.tsx` | **Delete** (218 lines). |
| `components/rota/RotaBoard.tsx` | Remove the import (L32), the `canManageCoaches` prop and its doc (L141, L163–169, and the mention at L173), `newCoachName` and `manageCoachesOpen` state (L206–207), `standardDaysByCoach` (L258–269), `createCoachAndAddToDay` (L568–602), `addCoach`/`renameCoach`/`deactivateCoach` (L604–677), the Manage coaches button (L962–970), the new-coach form (L1404–1429) and the modal render (L1433–1442). Remove the `siteId` prop (L133, L147, doc L127–128): its only uses are the 2 `rota_coaches` inserts. The board's own `supabase` client (L188) and the `createClient` import (L4) are used only by those 4 functions, so both go; so does `NO_EDIT_RIGHTS` as a separate constant (only the directory writes return it; `NO_EDIT_TITLE` keeps the text). Append the sentence to the toolbar description (L946–950). |
| `components/rota/StandardRotaView.tsx` | Drop `canManageCoaches` (L56) and `siteId` on `<RotaBoard>`. It keeps `siteId` for `standardDataSource`. |
| `components/rota/WeeklyRotaBoard.tsx` | Drop `siteId` on `<RotaBoard>` (L83). It keeps it for `useGenerateWeek`. |
| `components/rota/RestructureBoard.tsx` | Drop `siteId` on `<RotaBoard>` (L87). It keeps it for `useGenerateRestructure`. |
| `components/rota/rota-board.module.css` | Delete the 4 `.picker-form` rules (L467–490) and the 9 `.coach-manage-*` rules (L491–553). Reword the `.toolbar-btn` comment (L716), which names "Manage coaches". |
| 3 rota `page.tsx` files | Pass `canManageUsers` (`caps.has("manage_users")`), so "Admin › Users" is a link only for people who can open it (see §4.6). |

### Point 3 — Short display names ("Beth H"): 1 new helper + 5 consumers

`shortName()` in `lib/rota/people.ts` takes the first token, a space and the first letter of the last token: "Beth
Harrison" → "Beth H", "Mary Ann Smith" → "Mary S". A single word is returned as is. Empty or NULL returns "Unnamed".

| File | Call sites |
|---|---|
| `components/rota/RotaBoard.tsx` | `coachName()` (L277) and its **6** callers (L548, 692, 1067, 1207, 1325, 1554), plus the `rosterByDay` name sort (L289). The Set coach `<select>` (L1571–1575). |
| `lib/rota/exportLayout.ts` | `nameById` in `planExport` (L411) and the name sort (L420). |
| `components/rota/RotaExportButton.tsx` | `coachNameById` (L79–82). |
| `app/(protected)/club-profile/[siteSlug]/page.tsx` | `coachNameById` for attendees (L236), `buildAttendanceRows` / `sumWorkedMinutes` input (L288, L309). **Needs approval, see §4.3.** |
| `components/clubProfile/ManageMeetingsModal.tsx` | Attendee picker labels (L178). |

### Point 4 — Unassigned column: 3 files

| File | Change |
|---|---|
| `components/rota/RotaBoard.tsx` | `ClassRow.coach_id` becomes `string \| null` (L62). The `layout` memo (L304–344) appends an Unassigned column per day when that day has ≥1 `coach_id === null` class (lanes from `laneAssign`, as for a coach). A day whose only content is unassigned classes is no longer `isEmpty`. Render: an Unassigned head cell (no roster row, no badges, no popover, no ×, header "Unassigned" plus the count) and its zone(s) and cards. No shift markers and no off-shift hatching. Modal: an "Unassigned" option in Coach column (L1543–1558). It is enabled even when nobody is rostered, so `saveModal`'s "Nobody is rostered" error (L742–747) goes. The empty-board note (L1310) tests `roster.length === 0`; it becomes `roster.length === 0 && classes.length === 0`, so a board holding only unassigned classes doesn't say "No rota saved". `openAddModal` (L801) defaults to Unassigned when the day has nobody. `openEditModal` (L827) maps `null` to the sentinel. `withCoachId` (L847) keeps working with the sentinel. `moveClass` (L370) and `onZoneDrop` (L879) accept a `null` target (see §4.4). |
| `lib/rota/rotaDataSource.ts` | `ClassInsert.coach_id: string \| null` (L41). |
| `components/rota/rota-board.module.css` | `.coach-head.unassigned` (dashed left border, muted italic) and a dashed left border on the column's zone. |

### Point 5 — Flagged coaches + status banner: 5 files

| File | Change |
|---|---|
| `components/rota/RotaBoard.tsx` | Roster head (L1030–1091): when `flagFor()` gives `moved` → amber header with ⚠, the name, "Now at {site}" and a "Remove from {Day}" button. `inactive` → grey header, struck-through name, "Account deactivated" and the same button. Class cards in a flagged column (L1152–1209) get the `needs-coach` class (dashed outline) and the line "Needs a {Site} coach" / "Needs an active coach". The banner goes above the board, beside the read-only banner (L985). Flags and the banner show for everyone; the "Remove from {Day}" button, like the existing ×, renders only when `canEdit`. |
| `components/rota/rota-board.module.css` | Rules for `.coach-head.flag-moved`, `.flag-inactive`, `.card.needs-coach`, `.flag-banner`, plus the coach-head row height change (§4.1). |
| 3 rota `page.tsx` files | Replace the `rota_coaches` select with `site_rota_people` (this is the same call site as Point 2's removal; counted once in §3). |

### Point 6 — Removing a coach unassigns instead of deleting: 2 files

| File | Change |
|---|---|
| `lib/rota/rotaDataSource.ts` | Replace `deleteClassesForCoachDay` (interface L73–74, impl L144–152) with `unassignClassesForCoachDay(day, coachId)`, which runs two updates in order, both bounded by `.match(scope).eq("day_of_week", day).eq("coach_id", coachId)`. (a) `update({ set_coach_id: coachId }).is("set_coach_id", null)`: this fills in the real owner first. `.is`, because `.eq(..., null)` never matches. (b) `update({ coach_id: null, updated_at })`. Order matters: (b) first would leave nothing for (a) to match. `deleteClassesForCoachDay` then has 0 callers and is removed. |
| `components/rota/RotaBoard.tsx` | `removeCoachFromDay` (L679–720): new confirm text ("…Their N class(es) will move to Unassigned."), an optimistic patch that maps those classes to `coach_id: null, set_coach_id: set_coach_id ?? coachId` instead of filtering them out, then `unassignClassesForCoachDay`, then `deleteRoster`. The × button and the new "Remove from {Day}" button both call it. |

Not atomic: supabase-js has no transaction. If (b) fails after (a), the rows have `set_coach_id = coach_id`, which
reads as "not cover" (`isCover` already requires them to differ), so the failure is harmless. The board rolls back and
shows the error, as every other write does.

### Point 7 — The same across all 3 views and their PDFs: 3 export files

All three views render the one `RotaBoard`, so Points 1–6 are written once. What's per-view is the 3 pages (data) and
the 3 wrappers (props), already listed. For the PDF:

| File | Change |
|---|---|
| `lib/rota/exportLayout.ts` | `planExport(peopleById, siteName, roster, classes, order)` replaces `coaches: Coach[]` (L405). `PlannedCoach` gains `kind: "coach" \| "unassigned"` and `flag`; `rosterRow` becomes `RosterRow \| null` (null for Unassigned, which also gets no off-shift shading). Each day gets an Unassigned planned column after its coaches when it has NULL-coach classes. Lane counting (L461) includes it. `coachId` becomes `string \| null`. |
| `components/rota/RotaExportLayout.tsx` | `CoachHeadRow` (L362): the label "Unassigned" (muted italic) for that column, and `"{name} (moved)"` / `"{name} (inactive)"` for flagged ones through `fitCoachName`. `DayGrid` keys (L383, L499) can't use `coachId` any more, because it can be null. `ClassCard` (L565–583): the `deliveredBy` and owner names come from the people map. An unassigned card's coach line is "Unassigned", or "for {owner}" when `set_coach_id` is set. `isCover` requires a non-null `coach_id`. |
| `components/rota/RotaExportButton.tsx` | Takes `people` and `siteName` instead of `coaches` (L56–82). |

### Point 8 — Club meeting attendees: 6 files

| File | Change |
|---|---|
| `app/(protected)/club-profile/[siteSlug]/page.tsx` | Replace the `rota_coaches` select (L92–96) with `site_rota_people` (in the `Promise.all`), plus `site_rota_roster` when `canEditMeetings`. Build one `peopleById`. It drives `buildMeetingViews` (L236–243), `buildAttendanceRows` (L288) and `sumWorkedMinutes` (L309): the weekly roster ids are in `site_rota_people` too. Rewrite the stale comment at L233–235. |
| `lib/clubProfile/meetings.ts` | `buildMeetingViews` takes `peopleById` + `siteName` and returns `attendeeNames` with a flag tag (§4.5). |
| `lib/clubProfile/attendance.ts` | `RosterCoach` → a name lookup (`Map<string, string>`). `buildAttendanceRows` / `sumWorkedMinutes` signatures change. |
| `components/clubProfile/ClubMeetings.tsx` | The `coaches: RosterCoach[]` prop (L11, L30, L38, L146) becomes roster candidates + flagged existing attendees. |
| `components/clubProfile/ManageMeetingsModal.tsx` | The picker (L157–181) lists `site_rota_roster` candidates **plus any current attendee of that meeting who isn't a candidate**, tagged, so they can be unticked (§4.5). Rewrite the stale doc comment (L222–223). |
| `lib/clubProfile/names.ts` | Comment only (L10–14): roster and attendee ids now point at `profiles` and come from `site_rota_people`, not `rota_coaches`. |

### Totals

| | Files |
|---|---|
| Edited | 17: 3 rota pages, Club Profile page, `RotaBoard.tsx`, `StandardRotaView.tsx`, `WeeklyRotaBoard.tsx`, `RestructureBoard.tsx`, `RotaExportButton.tsx`, `RotaExportLayout.tsx`, `rota-board.module.css`, `lib/rota/rotaDataSource.ts`, `lib/rota/exportLayout.ts`, `lib/clubProfile/{meetings,attendance,names}.ts`, `ClubMeetings.tsx`, `ManageMeetingsModal.tsx` |
| New | 1: `lib/rota/people.ts` |
| Deleted | 1: `ManageCoachesModal.tsx` |
| Docs | `CLAUDE.md`, plus the new `docs/investigations/rota-retcon-p3-test-plan.md` |

Not touched: `lib/rota/board.ts` (except possibly a second coach-head height, §4.1), `siteAccess.ts`,
`resolveSiteAccess.ts`, `week.ts`, the two generate hooks, the empty-state components, `RotaViewTabs`,
`SiteSwitcher`, `WeekNav`, `RotaUnavailable`, and anything under `supabase/`.

---

## 3. rota_coaches code to delete, and resolve_profile_names call sites

`grep -rn rota_coaches app components lib` gives **17 lines in 9 files**:

| Kind | Count | Where |
|---|---|---|
| Executable `.from("rota_coaches")` | **8** in 5 files | rota `page.tsx` L57, `week/…/page.tsx` L131, `restructure/page.tsx` L97, club-profile `page.tsx` L93, `RotaBoard.tsx` L590 (picker create), L626 (`addCoach`), L650 (`renameCoach`), L669 (`deactivateCoach`) |
| Comment-only lines | **9** | `RotaBoard.tsx` L127, L587, L606, L607; club-profile `page.tsx` L233; `ManageMeetingsModal.tsx` L222; `StaffRolesModal.tsx` L25; `rotaDataSource.ts` L9; `names.ts` L13 |

Code to delete:

| Kind | Count | Items |
|---|---|---|
| Files | 1 | `components/rota/ManageCoachesModal.tsx` (exports `ManageCoachesModal`, `ManageCoach`) |
| Components | 1 | `ManageCoachesModal` (and its render site) |
| Functions in `RotaBoard` | 4 | `createCoachAndAddToDay`, `addCoach`, `renameCoach`, `deactivateCoach` |
| Data-source method | 1 | `deleteClassesForCoachDay` (interface + impl), replaced per Point 6 |
| State / memos | 4 | `newCoachName`, `manageCoachesOpen`, `standardDaysByCoach`, `activeCoaches` (replaced by `rosterCandidates`) |
| Props | 2 | `canManageCoaches` (RotaBoard, set in StandardRotaView), `siteId` on RotaBoard only |
| Types | 2 | `Coach` (RotaBoard L36; **8** importers: 3 pages, 3 wrappers, `RotaExportButton`, `exportLayout.ts`), `RosterCoach` (`attendance.ts`, imported by `ClubMeetings`, `ManageMeetingsModal` and the club-profile page). Both are replaced by `RotaPerson` / `RosterCandidate` |
| CSS rules | 13 | 4 `.picker-form*` + 9 `.coach-manage-*` |
| Routes | 0 | There was never a route for coach management; it was a modal |

`StaffRolesModal.tsx` L25 compares assignments with "rota_coaches board entries". I'll reword it to "rota roster
rows" so the repo-wide count reaches 0. `ClubUpdates.tsx` L21 mentions `resolve_profile_names()` in a comment, which
stays true.

**`resolve_profile_names` call sites: 1** (`lib/clubProfile/names.ts` L32, via `resolveProfileNames()`, called once
at club-profile `page.tsx` L183). It resolves `club_updates.created_by` and `club_role_assignments.coach_id`. **Neither
is replaced by `site_rota_people`**, because neither column is among its 10 ref columns. So: **0 replaced, 1 kept.** No
rota or attendee name goes through it today (they came from `rota_coaches`) and none will after.

---

## 4. Conflicts with existing behaviour, and proposed handling

1. **Flagged header won't fit the coach-head row.** `COACH_HEAD_H` is a fixed 34px grid row (`board.ts` L24), and
   every coach header on the board shares it. Name + "Now at Leeds" + a "Remove from Monday" button in a 128px column
   needs about 3 lines.
   *Proposal:* the coach-head row grows to about 62px **only while the board has at least one flagged row**. All
   headers in that row grow with it, because it is one grid row. Otherwise the board looks exactly as it does now.
   The alternative is to keep 34px and move "Remove from {Day}" into the coach popover. That departs from the mockup.

2. **The banner text says "no longer at {Site}" but counts deactivated people too.** A deactivated coach can still
   be at the site.
   *Proposal:* one banner. N = distinct flagged profiles (moved or deactivated). Wording: "N coaches on this rota are
   no longer at {Site}", each listed as "Beth H (now at Leeds) — Mon, Wed" or "Sam P (account deactivated) — Tue".
   This keeps the agreed headline, and the detail says which case each person is.

3. **Short names elsewhere.** Point 3 doesn't say which screens. Club Profile's attendance grid, staff hours and
   meeting attendees currently show the full `rota_coaches.name`.
   *Proposal:* short names on the rota board, the PDFs, the attendance grid, staff hours and meeting attendees, since
   all of these come from `site_rota_people`. **Full names stay** in the picker rows (with job title, to tell people
   apart), in Staff Roles and in Club Updates authors, which come from `resolve_profile_names`.
   *Collisions:* two people at one site can both be "Beth H". Proposal: when two ids on the same board or page
   produce the same short name, both show their full name instead. This is one rule inside the helper's map builder,
   not new UI.

4. **Dragging into and out of Unassigned.** The brief doesn't say.
   *Proposal:* the Unassigned column is a drop zone like any column, whenever it is showing. Dropping a class there
   unassigns it (`set_coach_id ??= coach_id`, as Point 6 does). Dragging out of it assigns it. Normalisation: if the
   resulting `set_coach_id` equals the new `coach_id`, store `null`, so it doesn't read as cover. The current
   `moveClass` doesn't do this. Without it, an unassigned class dragged back to its own coach would store
   `set_coach_id = coach_id`. The column only exists while it has a class, so you can't drop into Unassigned on a day
   that has none. The modal's Unassigned option covers that case.

5. **Attendees who have moved or been deactivated would be dropped silently.** `ManageMeetingsModal` saves the
   attendee list wholesale (delete, then insert the ticked ids). If the picker lists only `site_rota_roster`, an
   existing attendee who has left has no checkbox. Saving any edit to that meeting would delete them without anyone
   unticking them.
   *Proposal:* for the meeting being edited, the picker also lists its current attendees who aren't candidates,
   ticked, with the label "Beth H (moved)" / "(inactive)", so removing them is a deliberate untick. The read views
   show the same tag after the name. No other status UI on Club Profile.

6. **The "Admin › Users" link goes nowhere for most viewers.** `/admin/users` redirects anyone without `manage_users`
   to `/`, and most people with `edit_rota` (Lead Coach, Club Head Coach) don't hold it. The picker footer already
   says only an RGM, HoG or HoO can add people.
   *Proposal:* the sentence appears for everyone. "Admin › Users" is a link only when the real session holds
   `manage_users` (`caps.has`, passed from the page). For everyone else it is plain text. This is not a toggle: it
   reads the logged-in user's real capabilities.
   *Which line:* the board's own toolbar description (`RotaBoard.tsx` L946–950), which all 3 views share, rather than
   the 3 different page sub-lines.

7. **Unassigned cards: what the coach line says.** It reads "Coach: {coach_id name}" today, which would show "Coach:"
   with nothing after it. `isCover` (`!!set_coach_id && set_coach_id !== coach_id`) would also put a COVER badge on
   every unassigned class that kept its set coach.
   *Proposal:* `isCover` also requires a non-null `coach_id`. The coach line on an unassigned card reads "Unassigned"
   or "Unassigned · for Beth H" when `set_coach_id` is set. The PDF uses the same text.

8. **Set coach dropdown source.** It lists every `rota_coaches` row today (L1571), inactive included. That list no
   longer exists.
   *Proposal:* the options are the roster candidates, plus the class's current set coach if they aren't a candidate
   (shown with their flag tag, so the stored value doesn't silently change), plus a "None" option. "None" is needed
   now that the coach column can be Unassigned and Set coach follows it.

9. **Regenerating a week or restructure copies flagged rows.** `upsert_weekly_rota` / `upsert_restructure` copy
   standard roster rows as they are, so a moved coach on the Standard Rota reappears flagged on every week built from
   it.
   *Proposal:* no change; the flags make it visible. This is a note for the test plan, not a code change. Filtering
   in the RPCs would mean SQL, which is out of scope.

10. **`.eq` and NULL.** `deleteClassesForCoachDay` itself is fine: it always filters on a non-null `coachId`. The NULL
    trap is in the new code, the `set_coach_id is null` fill in Point 6(a), which uses `.is`. No other query in
    `app/`, `components/` or `lib/` filters a nullable coach column against `null`. I checked every `.eq(` on
    `coach_id` / `set_coach_id`: there is **1**, `rotaDataSource.ts` L150 (`.eq("coach_id", coachId)` in
    `deleteClassesForCoachDay`), and its value is never null. *(Corrected on validation: this said 2.)*

11. **CLAUDE.md has no data-model or rota section to update.** Its Supabase section says "Only live table in v1:
    `profiles`" and has no rota tables at all.
    *Proposal (step 6):* add a short "Rota data model" subsection under Supabase: the coach source is `profiles` via
    `site_rota_roster` (assignable) and `site_rota_people` (names and status); `rota_coaches` is removed (0029); NULL
    class `coach_id` means unassigned; roster `coach_id` is NOT NULL; FKs are ON DELETE RESTRICT, so deactivate
    rather than delete. I'd also correct "Only live table in v1" to point at it, since it hasn't been true since 0002.

12. **No `typecheck` script.** `package.json` has `build` and `lint` only. Typecheck will be `npx tsc --noEmit`.
    Baseline on the current tree (2026-10-23): `tsc --noEmit` **0 errors**, `eslint` **0 problems**. Both pass even
    though `rota_coaches` no longer exists, because the Supabase client is untyped (`.from(string)`), so neither
    catches a stale table name. The repo-wide `grep rota_coaches` is the check for that.

13. **Picker position.** `openCoachPicker` clamps `left` to `window.innerWidth - 232` (L521), which assumes the
    210px popover. The wider picker gets its own clamp to match its new width.

---

## Decisions needed before Phase B

1. §4.1: grow the coach-head row while anything is flagged (proposed), or move "Remove from {Day}" into the popover?
2. §4.2: one banner counting moved and deactivated together, with per-person detail?
3. §4.3: short names on the Club Profile screens too, and the full-name fallback for collisions?
4. §4.4: Unassigned column as a drop target both ways?
5. §4.5: keep flagged existing attendees in the meeting picker, tagged?
6. §4.6: link "Admin › Users" only for `manage_users` holders, in the board's toolbar description?
7. §4.7 / §4.8: unassigned card text, and the Set coach options including "None"?
8. §4.11: CLAUDE.md gets a new "Rota data model" subsection, and the "Only live table" line is corrected?

---

## Validated

Re-checked on 2026-10-23 against the current tree (HEAD `4ccb9a9`, 0029 applied) and `0029_rota_retcon.sql`. Every line
number cited above still matches.

**Confirmed unchanged**

- §1: both RPC signatures, return columns, access gate and grants match 0029 exactly. The plan of one
  `site_rota_people` call per page load, turned into a single `peopleById` map, stands.
- §3: `rota_coaches` is **17 lines in 9 files** (8 executable `.from("rota_coaches")` in 5 files, 9 comment lines).
  Delete list unchanged: 1 file, 4 board functions, 1 data-source method, 4 state/memos, 2 props, 2 types (`Coach`
  with 8 importers, `RosterCoach` with 3), 13 CSS rules (4 `.picker-form*`, 9 `.coach-manage-*`).
- §3: `resolve_profile_names` has **1** call site (`names.ts` L32 via `resolveProfileNames`, called once at
  club-profile `page.tsx` L183). It is kept. `site_rota_people` replaces **0** of its uses, because
  `club_updates.created_by` and `club_role_assignments.coach_id` aren't in its 10 ref columns.
- §4: no new conflicts with existing behaviour beyond those listed. No check constraint on `set_coach_id` in any
  migration, so the Point 6 two-step update can't hit one.
- The approved mockup is still not in the repo (`reference/` unchanged).

**Corrected or added**

1. §4.10: one `.eq` on a coach column, not two (`rotaDataSource.ts` L150).
2. Point 2: the board's `supabase` client, the `createClient` import and `NO_EDIT_RIGHTS` also go, since only the
   removed coach-directory writes use them.
3. Point 4: the empty-board note must also check `classes.length`, or a board holding only unassigned classes reads
   "No rota saved".
4. Point 5: the "Remove from {Day}" button is `canEdit`-only, like ×. Flags and the banner show to everyone.
5. Point 7: `PlannedCoach.rosterRow` becomes nullable for the Unassigned column.
6. §4.12: baseline typecheck 0 errors, lint 0 problems, and why neither catches stale table names.
7. §4.13 (new): the wider picker needs its own `left` clamp.

The decisions listed under "Decisions needed before Phase B" are unchanged and still open.
