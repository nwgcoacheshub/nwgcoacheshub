# Rota Retcon — Phase 4, Phase B report (orphaned classes)

Implements `rota-retcon-p4-phase-a.md` as approved, with decision 1 revised (below). Nothing under `supabase/` changed,
no SQL run, nothing committed or pushed.

## Files: 1 new, 3 changed

| File | Change |
|---|---|
| `lib/rota/columns.ts` (new, 62 lines) | `groupDay`, `isOrphan`, `unassignedCoachLines`. The one place that decides which column a class sits in, and the Unassigned card text. |
| `components/rota/RotaBoard.tsx` (+40 / −18) | Layout uses `groupDay`, drag rule, card text, COVER suppression, modal Coach option. |
| `lib/rota/exportLayout.ts` (+10 / −9) | `planExport` uses `groupDay`. |
| `components/rota/RotaExportLayout.tsx` (+16 / −11) | PDF card text from `unassignedCoachLines`, cover outline suppressed in Unassigned. |

## What changed

**Shared helper (`lib/rota/columns.ts`).**
- `groupDay` (L21) returns each rostered coach's classes plus an Unassigned list: `coach_id` NULL classes first, then
  orphans.
- `unassignedCoachLines` (L52) returns the Unassigned card text, longest first:
  - Orphan: "Not rostered: X · for Y" (only when the set coach differs), then "Not rostered: X", then "Not rostered".
  - NULL coach: "Unassigned · for Y", then "Unassigned", or "No coach yet". Unchanged from P3.

The board and the PDF both group through `groupDay` (`RotaBoard.tsx:330`, `exportLayout.ts:439`). The board's coach
zones now read the same grouping (`RotaBoard.tsx:1255`) instead of filtering again.

**Board.**
- Orphans join the Unassigned column. That alone makes them count in the header, makes the column appear, and stops
  the day reading as empty.
- Cards in Unassigned take `unassignedCoachLines(...)[0]` and never show COVER (`renderCard`, L919–924).

**Drag (decision 1, revised).** In `moveClass` (L410–415), an orphan dropped on **its own day's** Unassigned column is
a no-op, whatever the time. Every other drop goes through the existing rule unchanged:
- An orphan dropped on **another day's** Unassigned moves to that day with `coach_id` NULL and `set_coach_id` filled
  from its old coach if it was NULL. It becomes a clean unassigned class.
- An orphan dropped on a coach column gets that `coach_id`, with the real owner kept in `set_coach_id`.
- Normal classes behave exactly as before.

**Modal (decision 2).** When the Coach column value isn't rostered that day, i.e. editing an orphan, it is listed as
"{name} (not rostered)" (L873–879, L1611–1615), so the select shows the stored value and saving keeps it.

**PDF (decision 3).**
- `ClassCard` gets `unassigned` from `DayGrid`. In that column it uses the longest `unassignedCoachLines` entry that
  fits the lane, with names fitted by `fitCoachName`, falling back to the shortest.
- No cover outline in that column.
- Orphan categories now reach the legend.

**No automatic data changes.** Nothing writes on load or render. The only writes are the existing drag, modal and
delete actions, made by a user.

## Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, 0 errors |
| `npm run lint` (eslint) | exit 0, 0 errors, 0 warnings (`eslint components/rota lib/rota --max-warnings=0` also exit 0) |
| `npm run build` | exit 0, 26 routes listed, 0 warnings |

Not yet tested in the browser. Test steps are in `rota-retcon-p4-test-plan.md`.

## Repo hygiene

- `git status`: 3 modified (`RotaBoard.tsx`, `RotaExportLayout.tsx`, `exportLayout.ts`), 4 untracked (`columns.ts` and
  the 3 `rota-retcon-p4-*` docs).
- Nothing under `supabase/` changed, and no new files in the repo root.

## Follow-ups

- **Stale-tab writes still create orphans** (Phase A §2). This phase only displays orphans; it doesn't stop them being
  made. A tab that still shows coach X on a day after another session removed them can write X onto that day in 3
  ways:
  1. Drag a class into X's column → `updateClass` in `moveClass`.
  2. Edit a class with Coach column = X → `updateClass` in `saveModal`.
  3. Add a class with Coach column = X → `insertClass` in `saveModal`.

  Separate future fix: refetch or validate the roster for that day before writing, and refuse (or refresh the board)
  if the coach is no longer rostered.
- **Generation copies orphans.** Regenerating a week or the restructure copies Standard Rota orphans verbatim. They
  now show in Unassigned in every copy. Fixing the Standard Rota and regenerating clears them.
