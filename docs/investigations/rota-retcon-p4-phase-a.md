# Rota Retcon — Phase 4, Phase A findings (orphaned classes)

Read-only pass over `components/rota/**`, `lib/rota/**`, `app/(protected)/rota/**`, the PDF export
(`lib/rota/exportLayout.ts`, `components/rota/RotaExportLayout.tsx`, `components/rota/RotaExportButton.tsx`), the
upsert RPCs in `supabase/migrations/` (read only), and the P3 reports. No code changed, no SQL run, nothing committed.

**Orphan** = a class row with `coach_id` set, but no roster row for that `coach_id` on that `day_of_week` in the same
scope (site / week / restructure).

---

## 1. Where classes are grouped into columns

All three views (Standard, This week, Restructure) render the same `RotaBoard`, and all three PDFs go through the same
`planExport` → `RotaExportLayout`. So there are exactly **2 grouping sites**, one on screen and one in the PDF.

### Board — `components/rota/RotaBoard.tsx`

| What | Where |
|---|---|
| Roster grouped by day, sorted by display name | `rosterByDay`, L275–288 |
| Column plan (the `layout` memo) | L314–366 |
| Coach column's classes: `c.day_of_week === d && c.coach_id === row.coach_id` | L330–332 |
| **Unassigned column's classes: `c.coach_id === null`** | **L341** |
| **Unassigned column appears when that list is non-empty** | **L342–347** |
| Day counts as empty (one placeholder column) | L351 |
| Unassigned header and **count** (`unassigned.classes.length`) | L1201–1211, count at L1209 |
| Coach column zones re-filter their classes (same predicate as L330) | L1228–1241, filter at L1238 |
| Unassigned zones render `unassigned.classes` | L1243–1254 |
| Card coach line ("No coach yet" / "Unassigned · for X" / "Coach: X") | `renderCard`, L902–907 |
| COVER badge (`isCover`: coach_id and set_coach_id both set and different) | L129–131, used L900, L949 |
| Drop handling → `moveClass(id, day, coachId, start)`; Unassigned zone passes `null` | `onZoneDrop` L804–830, `zoneDropProps` L882–896 |
| `moveClass` (cover / set coach rule, early-out if nothing changed) | L392–450 |

Because the coach column filter (L331) only matches coaches who have a roster row, and the Unassigned filter (L341)
only matches `null`, an orphan matches neither and is never drawn.

### PDF — `lib/rota/exportLayout.ts` + `components/rota/RotaExportLayout.tsx`

| What | Where |
|---|---|
| Called with the board's live roster/classes | `RotaExportButton.tsx` L86–89 |
| Roster grouped by day, same sort as the board | `planExport`, `exportLayout.ts` L418–428 |
| Coach column's classes (same predicate as the board) | L436–438 |
| **Unassigned column's classes: `c.coach_id === null`** | **L465–467** |
| **Unassigned column appears when non-empty** | **L471–473** (emitted L505–521) |
| Legend categories collected per class | L439–441, L468–470 |
| Unassigned header (shows `name: "Unassigned"`; **no count in the PDF today**) | `RotaExportLayout.tsx` L402–421 |
| Card coach line, incl. "Unassigned · for X" → "Unassigned" width fallback | `ClassCard`, L593–612 |
| Cover detection (dashed outline) | L581, L637 |

Side effect today: an orphan's category is also left out of the PDF legend (L439–441 and L468–470 only see grouped
classes).

---

## 2. Code paths that can create an orphan

0029 truncated all 8 rota data tables (`0029_rota_retcon.sql` L36–45), so **every orphan in the database was created
after 0029**. I can't count live rows (no SQL run); the query at the end of this section gives the exact number.

### Within one up-to-date browser tab: 0 paths

| Path | Why it can't orphan |
|---|---|
| Remove coach from day (`removeCoachFromDay`, L601–647) | Unassigns that coach's classes first (`unassignClassesForCoachDay`, `rotaDataSource.ts` L156–174), then deletes the roster row. If the delete fails the classes are already unassigned, which is not an orphan. |
| Drag a class (`moveClass`, L392–450) | Drop zones exist only for rostered coaches on that day (L1228–1241) or Unassigned (`null`). |
| Add class modal (`saveModal`, L658–720) | Coach column offers that day's rostered coaches + Unassigned only (L1589–1594). Changing day re-picks the first rostered coach or Unassigned (L1571). |
| Edit class modal | Same options. |
| Add coach to day | Adds a roster row; can only *fix* an orphan. |

### Stale tab (another session removed the coach meanwhile): 3 write calls

If tab A removes coach X from Monday while tab B still shows X on Monday, tab B can still write X onto Monday:

1. Drag a class into X's column → `dataSource.updateClass` (L443).
2. Edit a class with Coach column = X → `dataSource.updateClass` (L713).
3. Add a class with Coach column = X → `dataSource.insertClass` (L718).

Nothing checks the roster at write time (no FK or trigger links class rows to roster rows).

### Copies, not creations: 2 RPCs

`upsert_weekly_rota` and `upsert_restructure` (latest definitions `0026_capability_helpers.sql` L1462 and L1524;
unchanged by 0029, see its L24) copy every Standard roster and class row verbatim. Each Standard orphan becomes one
orphan in every week or restructure generated from it.

### Outside the app: 1

The Supabase table editor: deleting a roster row, or editing a class's `coach_id` / `day_of_week`.

**Total: 3 app write calls (stale tab only) + 2 copying RPCs + the table editor.**

Exact count of current orphans, for Jamie to run in the SQL editor (read only):

```sql
select 'standard' scope, count(*) from public.rota_standard_classes c
 where c.coach_id is not null and not exists (
   select 1 from public.rota_standard_roster r
    where r.site_id = c.site_id and r.day_of_week = c.day_of_week and r.coach_id = c.coach_id)
union all
select 'weekly', count(*) from public.rota_weekly_classes c
 where c.coach_id is not null and not exists (
   select 1 from public.rota_weekly_roster r
    where r.weekly_rota_id = c.weekly_rota_id and r.day_of_week = c.day_of_week and r.coach_id = c.coach_id)
union all
select 'restructure', count(*) from public.rota_restructure_classes c
 where c.coach_id is not null and not exists (
   select 1 from public.rota_restructure_roster r
    where r.restructure_id = c.restructure_id and r.day_of_week = c.day_of_week and r.coach_id = c.coach_id);
```

---

## 3. Proposed change

### 3.1 One shared helper: new `lib/rota/columns.ts`

Pure (no React or Supabase), like `people.ts`, so the board and `planExport` both import it. `ClassRow` / `RosterRow`
are type-imported from `RotaBoard.tsx`, as `exportLayout.ts` already does (L50).

```ts
/** Where a class sits on one day. */
export type DayColumns = {
  /** coach_id -> that coach's classes, for every coach rostered that day. */
  byCoach: Map<string, ClassRow[]>;
  /** coach_id NULL classes, then orphans: everything for the Unassigned column. */
  unassigned: ClassRow[];
};

/** Groups one day's classes against that day's roster. */
export function groupDay(day: number, dayRoster: RosterRow[], classes: ClassRow[]): DayColumns;

/** coach_id set, but that coach has no roster row on the class's day. */
export function isOrphan(ev: ClassRow, rosteredOnDay: Set<string>): boolean;

/**
 * Coach line for a card in the Unassigned column, longest first. The board
 * uses [0]; the PDF uses the first one that fits the lane.
 *   orphan, set coach differs: ["Not rostered: X · for Y", "Not rostered: X", "Not rostered"]
 *   orphan, otherwise:         ["Not rostered: X", "Not rostered"]
 *   NULL, set coach:           ["Unassigned · for Y", "Unassigned"]   (unchanged)
 *   NULL, no set coach:        ["No coach yet"]                       (unchanged)
 */
export function unassignedCoachLines(ev: ClassRow, name: (id: string) => string): string[];
```

`name` is `directory.name` (short name, or full name where two people share one, as everywhere else). "Set coach
differs" means `set_coach_id` is non-null and `!== coach_id`.

### 3.2 Board — `components/rota/RotaBoard.tsx`

- `layout` memo (L329–347): call `groupDay` once per day. Coach columns read `byCoach.get(row.coach_id)`; the
  Unassigned column reads `unassigned`. Orphans then count toward L1209, make the column appear (L342) and stop the day
  reading as empty (L351) with no further changes.
- Coach zones (L1238): read the same `byCoach` list instead of re-filtering, so the board has one grouping, not two.
- `renderCard` (L899): in the Unassigned column, coach line = `unassignedCoachLines(...)[0]`. COVER badge is suppressed
  for orphans there (today `isCover` would be true for "X · for Y", which contradicts the card's own text). No other
  styling change.
- `moveClass` (L392): if the class is an orphan and the target `coachId` is `null`, return. This makes every drop of an
  orphan onto an Unassigned zone a no-op (see decision 1). Drops onto a coach column are unchanged, so the existing
  rule applies: `coach_id` becomes the target, and `set_coach_id` keeps the real owner (`set_coach_id ?? old coach_id`).
  An orphan of X with no set coach dragged to Y therefore becomes "Y, COVER for X".

### 3.3 PDF — `lib/rota/exportLayout.ts` + `components/rota/RotaExportLayout.tsx`

- `planExport` (L434–479): call `groupDay` per day, in place of the filters at L436–438 and L465–467. Legend
  collection runs over both lists, so orphan categories reach the legend.
- `ClassCard` (L593–601): for `coach_id === null` or an orphan in the Unassigned column, take the first entry of
  `unassignedCoachLines` (names passed through `fitCoachName`) that fits `inner`; fall back to the last. Cover outline
  (L581/L637) suppressed for orphans, matching the board. `ClassCard` needs to know it's in the Unassigned column: pass
  `coach.kind === "unassigned"` down from `DayGrid` (L540).
- The PDF Unassigned header stays "Unassigned" with no count, as now. The board's count is the one the brief specifies.

### 3.4 Files: 4 changed + 1 new

`lib/rota/columns.ts` (new), `components/rota/RotaBoard.tsx`, `lib/rota/exportLayout.ts`,
`components/rota/RotaExportLayout.tsx`. No page, data-source, CSS or SQL changes. Nothing writes on load or render.

---

## 4. Decisions for Jamie

1. **Orphan dropped on another day's Unassigned column.** The brief says dragging within Unassigned is a no-op.
   Recommended: treat *any* Unassigned drop of an orphan as a no-op (same day or not, and including a time change), so
   an orphan only changes when someone drags it to a coach or edits it. Alternative: a different day's Unassigned sets
   `coach_id` NULL and moves it, like a normal class.
2. **Editing an orphan in the class modal.** Today its Coach column value (X) isn't among the options (L1589–1594), so
   the select shows the first rostered coach while saving still writes X. Recommended: add X as an extra option,
   "{name} (not rostered)", exactly as the Set coach list already does for a non-candidate (L866–871, L1614–1618), so
   the modal shows the truth and saving never changes it silently. This is one small addition beyond the brief's list;
   say no and I'll leave the modal alone.
3. **PDF width fallback.** Recommended as in 3.3: "Not rostered: X · for Y" → "Not rostered: X" → "Not rostered" when
   the lane is too narrow, the same way "Unassigned · for X" already falls back to "Unassigned". Alternative: always
   the full text, wrapping to the 2 lines `planCard` allows (L320–322) and clipping beyond that.

Stopping here for approval.
