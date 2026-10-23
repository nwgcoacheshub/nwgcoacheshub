# Rota Retcon — Phase 3, Phase B report

Implementation of design points 1–8 from the approved Phase A (`rota-retcon-p3-phase-a.md`, including its 7
validation corrections), with the 8 decisions from approval. App code only: nothing under `supabase/` changed, no
SQL run, nothing committed or pushed, nothing written to the repo root.

## Results

| Check | Before | After |
|---|---|---|
| `npx tsc --noEmit` | 0 errors (exit 0) | **0 errors (exit 0)** |
| `npx eslint` | 0 problems (exit 0) | **0 problems (exit 0)** |
| `npm run build` | — | **exit 0**, compiled, 23/23 pages generated |
| `grep -rn rota_coaches app components lib` | 17 lines in 9 files | **0** |

No fixes were needed: every run after the changes passed first time. Also 0 hits for `ManageCoaches`,
`RosterCoach`, `initialCoaches`, `deleteClassesForCoachDay`, `canManageCoaches` and `type Coach`.

As noted in Phase A §4.12, tsc and lint passed before this phase too, because the Supabase client is untyped. They
don't prove the queries are right; the grep and the manual test plan do. **Not run:** the app against the live
database. Every UI behaviour below is untested in a browser until the test plan is worked through.

The pure helpers were checked directly: `shortName` gives "Beth H", "Mary S" for "Mary Ann Smith", "Cher", and
"Unnamed" for empty or null. Two people who would both be "Beth H" get full names. An account both inactive and
moved flags as inactive. An unknown id gives "Unknown coach".

## Files

| | Files |
|---|---|
| New (1) | `lib/rota/people.ts` |
| Deleted (1) | `components/rota/ManageCoachesModal.tsx` |
| Edited (21) | 3 rota pages, club-profile page, `RotaBoard.tsx`, `StandardRotaView.tsx`, `WeeklyRotaBoard.tsx`, `RestructureBoard.tsx`, `RotaExportButton.tsx`, `RotaExportLayout.tsx`, `rota-board.module.css`, `lib/rota/{board,exportLayout,rotaDataSource}.ts`, `lib/clubProfile/{attendance,meetings,names}.ts`, `ClubMeetings.tsx`, `ManageMeetingsModal.tsx`, `StaffRolesModal.tsx` (comment only), `CLAUDE.md` |
| Docs | this report, `rota-retcon-p3-test-plan.md`, `rota-retcon-p3-phase-a.md` (Validated section, previous step) |

Phase A's "17 edited" row actually lists 18 files (a miscount there). The actual count is 20 code files plus
`CLAUDE.md`. The two beyond Phase A's list: `lib/rota/board.ts` (the flagged header height, which Phase A flagged
as "possibly"), and `StaffRolesModal.tsx` (a comment, planned in Phase A §3 but missing from its table).

## What was built

### Data: one lookup per page (`lib/rota/people.ts`)

Each rota page calls `site_rota_people` once, and calls `site_rota_roster` only when `canEdit`. Both sit in the
page's existing `Promise.all`; on W and R that is the second one, after the week/restructure lookup, so the empty
states don't fetch them. Club Profile does the same, with `site_rota_roster` only when `canEditMeetings`.

`makeDirectory(people, candidates, siteName)` gives the single lookup: `name()` (short, or full on a collision),
`fullName()`, `flag()` and `byId`. Candidates not yet in `site_rota_people` are added as active and at this site,
so a coach added during the session has a name. Collisions are counted over that whole merged map.

### Point 1 — Coach picker
`RotaBoard.tsx`: titled "Add a coach to {Day}", a labelled search input "Search {Site} coaches" (filters by name
or job title), and candidate rows with full name, job title and Add. Coaches already on the day are excluded.
There's an "Already on {Day}" chip row (short names), the agreed footer, and three empty-state messages (nobody at
the site, everyone already on, no match). It is 280px wide with its own on-screen clamp (correction 7).

### Point 2 — Manage coaches removed; description sentence
Removed: the modal file, `createCoachAndAddToDay`, `addCoach`, `renameCoach`, `deactivateCoach`, the button, the
new-coach form, the `newCoachName` / `manageCoachesOpen` / `standardDaysByCoach` / `activeCoaches` state, the
`canManageCoaches` and board `siteId` props, the `Coach` and `RosterCoach` types, the board's Supabase client,
`createClient` import and `NO_EDIT_RIGHTS` (correction 2), and the 13 CSS rules.

The board description now ends "Coaches are everyone with an account at {Site}; to add someone new, create them
in Admin › Users." "Admin › Users" is a `next/link` to `/admin/users` only when the page's real
`getCapabilities()` holds `manage_users` (decision 6). Everyone else sees plain text. Nothing here is a toggle.

### Point 3 — Short names
Used on the board (headers, cards, popover, picker chips, banner, modal options), in the PDF, and for meeting
attendees (read views and the Manage meetings picker). Per decision 3, the rest of Club Profile is out of scope:
the attendance grid and staff hours keep **full** names (now from `site_rota_people`). Picker candidate rows show
full names plus job title, as in Phase A, so people can be told apart.

### Point 4 — Unassigned column
`layout` adds an Unassigned column at the end of any day with a `coach_id` NULL class, packed into lanes like a
coach column. A day holding only unassigned classes is no longer "empty", and the "No rota saved" note now also
requires `classes.length === 0` (correction 3). The header has a dashed left border, a muted italic label and the
count; no roster row, badges, popover, ×, shift markers or hatching.

The modal's Coach column always offers "Unassigned", so the "Nobody is rostered" error is gone. Add defaults to
Unassigned on a day with nobody. Set coach has "None" first, then the candidates, then the class's current set
coach if they aren't a candidate (tagged), so saving never silently changes it.

Cards read "Unassigned · for {short name}" when `set_coach_id` is set, otherwise "No coach yet" (decision 7).
`isCover` now also requires a non-null `coach_id`, so unassigned cards never show COVER.

**Drag (decision 4).** Into Unassigned: `coach_id` NULL, `set_coach_id ??= old coach_id`. Out of Unassigned:
`coach_id` set, `set_coach_id` unchanged. Coach-to-coach moves are unchanged. The column is a drop target
whenever it's showing.

### Point 5 — Flagged coaches
`directory.flag()` gives `moved` when `profiles.site !== rota_sites.name`, and `inactive` when not active
(inactive wins). A moved coach's header is amber, with ⚠, the name, "Now at {site}" and "Remove from {Day}". An
inactive coach's header is grey, with the name struck through, "Account deactivated" and the same button. The
button and × render only with `canEdit`; flags and the banner show to everyone (correction 4).

While anyone is flagged, the coach row is `COACH_HEAD_FLAGGED_H` (86px) instead of 34px (decision 1). Cards in a
flagged column get a dashed outline and "Needs a {Site} coach" / "Needs an active coach".

The banner (decision 2): "N coaches on this rota are no longer at {Site}" ("1 coach … is …" when N = 1), one line
per person: "{name} (now at Leeds) — Mon, Wed" or "{name} (account deactivated) — Tue".

### Point 6 — Removal unassigns
`deleteClassesForCoachDay` is replaced by `unassignClassesForCoachDay`, two updates bounded by
`scope + day + coach_id`. First it sets `set_coach_id = coachId` where `set_coach_id` **`.is`** NULL, then
`coach_id = NULL`. The board's `removeCoachFromDay` (used by × and by "Remove from {Day}") confirms with "Their N
class(es) will move to Unassigned", patches optimistically, unassigns, then deletes the roster row. It rolls back
on error as before. The only `.eq` on a coach column (`.eq("coach_id", coachId)`) always has a non-null value.

### Point 7 — All three views and PDFs
All three views render the one `RotaBoard`, so points 1–6 are written once. All three pages and wrappers pass
`people`, `rosterCandidates`, `siteName` and `canManageUsers`.

PDF: `planExport` takes the directory. `PlannedCoach` gains `key`, `kind`, `flag`, and a nullable `rosterRow` and
`coachId` (correction 5). An Unassigned column follows each day's coaches, with no shading. Headers read "{name}
(moved)" / "{name} (inactive)", with the name fitted around the tag so the tag is never clipped; the Unassigned
header is muted italic. Card text follows the board.

### Point 8 — Club meeting attendees
Names and status come from `site_rota_people`, and the picker list from `site_rota_roster`. Read views show
"{short name}" plus " (moved)" / " (inactive)" where flagged.

When editing, the picker also lists that meeting's **saved** attendees who aren't candidates, ticked and tagged
(decision 5). The list is built from the saved attendees, not the draft, so unticking one doesn't hide its
checkbox. Saving keeps them unless they are unticked. Adding a new meeting shows candidates only.

`resolve_profile_names` is unchanged and still used for Club Updates authors and Staff Roles (1 call site).

## CLAUDE.md

The "Only live table in v1: `profiles`" line is corrected. A new **Rota data model** subsection under Supabase
covers: `rota_coaches` dropped (0029); the 10 FKs to `profiles` ON DELETE RESTRICT; NULL class `coach_id` =
unassigned, roster `coach_id` NOT NULL; `coach_id` vs `set_coach_id`; removal unassigns; `.is` for NULL; the two
RPCs and what each is for; `lib/rota/people.ts`; short-name rule.

## Judgement calls to review

1. **Short names on Club Profile.** Decision 3 reads "rota and meeting screens only; Club Profile is out of scope",
   and the meetings are on Club Profile. I applied short names to meeting attendees and kept full names for the
   attendance grid and staff hours. If "out of scope" meant meetings too, that's a two-line change in the
   club-profile page.
2. **The flagged header keeps the ×** as well as "Remove from {Day}". Both call the same function. It is the
   existing control, so I didn't take it away.
3. **The needs-coach outline** is one colour (the board's muted ink) for both cases. The header colour is what
   tells moved from deactivated.
4. **Picker search** also matches job title ("lead" finds Lead Coaches).
5. **Flags come from roster rows only.** A class whose `set_coach_id` points at a moved person isn't flagged; the
   banner and outlines are about who is rostered.

## Not done / known limits

- Not run in a browser or against the live database; see the test plan.
- No change to the regenerate RPCs: a flagged coach on the Standard Rota reappears, flagged, in every week or
  restructure built from it (Phase A §4.9; it's in the test plan).
- A class whose `coach_id` points at a coach with no roster row that day still doesn't render (existing
  behaviour). Removal now unassigns instead of orphaning, so this phase creates no new ones.
