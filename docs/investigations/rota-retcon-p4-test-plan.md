# Rota Retcon — Phase 4 test plan (orphaned classes)

Views: **S** = Standard, **W** = This week (a generated week), **R** = Restructure. A step tagged with several views is
run once on each.

People: **D1**, **D2**, **D3** = coaches at the test site. **E** = an editor (Lead Coach or above at the site). **C** = a
Coach (read only).

An **orphan** is a class whose `coach_id` is set but which has no roster row for that coach on that day.

## Making an orphan

Use either method. Both are data changes you make by hand. The app itself never creates or fixes one on load.

**A. Stale tab (in the app).**
1. As E, open the board in two tabs. In both, D1 is on Monday with no classes.
2. In tab 1, remove D1 from Monday (×).
3. In tab 2, without reloading, drag any class into D1's Monday column, or add one with Coach column = D1.
4. Reload: that class is now an orphan.

**B. Table editor.**
- In `rota_standard_classes` (or `rota_weekly_classes` / `rota_restructure_classes`), set a class's `day_of_week` to a
  day where its coach has no roster row. Or delete the coach's roster row for that day in the matching `*_roster`
  table, leaving their classes in place.

For "· for" cases, also set `set_coach_id` to a different coach (e.g. class coach D1, set coach D2).

Run the read-only query in `rota-retcon-p4-phase-a.md` §2 before and after testing to see the orphan counts.

## Board

- [ ] An orphan of D1 (set coach empty or D1) appears in that day's **Unassigned** column, reading **"Not rostered:
      D1's name"**. — S · W · R
- [ ] An orphan of D1 with set coach D2 reads **"Not rostered: D1's name · for D2's name"**. — S · W · R
- [ ] Neither card shows a **COVER** badge. — S · W · R
- [ ] On a day with **no** `coach_id` NULL classes, one orphan makes the Unassigned column appear, with count **1**.
      — S · W · R
- [ ] On a day with 2 unassigned classes and 1 orphan, the count reads **3**. — S · W · R
- [ ] A day with nobody rostered and only an orphan shows the Unassigned column, not the empty placeholder. — S
- [ ] Loading the board changes nothing: rerun the count query, and the orphan's row is untouched (`coach_id`,
      `set_coach_id`, `updated_at`). — S · W · R
- [ ] Existing unassigned cards still read "No coach yet" / "Unassigned · for …". — S · W · R

## Dragging (as E)

- [ ] Drag an orphan **within its own day's Unassigned column**, including to a different time: nothing changes, and
      after a reload it's at its original time, still "Not rostered". — S · W · R
- [ ] Drag an orphan of D1 (no set coach) into **D3's column**: `coach_id` = D3, `set_coach_id` = D1. The card shows
      COVER and reads D3, for D1. Reload: it persists. — S · W · R
- [ ] Drag an orphan of D1 into D1's column on another day where D1 **is** rostered: `coach_id` stays D1, set coach
      unchanged, no COVER. — S
- [ ] Drag an orphan of D1 (no set coach) onto **another day's Unassigned** column: it moves to that day,
      `coach_id` = NULL, `set_coach_id` = D1, and reads "Unassigned · for D1's name". Reload: it persists. — S · W · R
- [ ] Same, with an orphan whose set coach is already D2: `set_coach_id` stays D2 ("Unassigned · for D2's name").
      — S
- [ ] **Regression:** a normal unassigned class dragged to a new time within Unassigned still moves. A normal class
      dragged from a coach into Unassigned still gets `coach_id` NULL and `set_coach_id` filled if it was NULL.
      — S · W · R
- [ ] As C, orphan cards can't be dragged or opened. — S

## Edit modal (as E)

- [ ] Open an orphan of D1: Coach column shows **"D1's name (not rostered)"**, selected. — S · W · R
- [ ] Change only the title and save: `coach_id` is still D1 and it's still an orphan. — S
- [ ] Pick a rostered coach in Coach column and save: the class moves to that coach's column. — S
- [ ] Change the Day: Coach column resets to that day's first rostered coach (or Unassigned), as before. — S
- [ ] A normal class's modal has no "(not rostered)" option. — S

## Generation

- [ ] With an orphan on the Standard Rota, generate a week and regenerate the restructure: the orphan appears in each,
      in Unassigned, with the same label (expected, as the RPCs copy rows verbatim). — W · R

## PDF export

- [ ] Export a board with both kinds of orphan: each is in that day's Unassigned column with the same text as the
      board. No dashed cover outline. — S · W · R
- [ ] The orphan's category is in the legend (give it a category used nowhere else on the board). — S
- [ ] On a crowded week (narrow lanes), a long "Not rostered: X · for Y" falls back to "Not rostered: X", then to "Not
      rostered", rather than clipping. "Unassigned · for X" still falls back to "Unassigned". — S
- [ ] The PDF Unassigned header reads "Unassigned" (no count, as before). — S
