# Rota Retcon — Phase 3 manual test plan

For the Phase 3 app changes (profiles-based rota coaches, after 0029). Run against a deployed or local build
pointed at the live database. 0029 wiped all rota data, so every case starts from an empty board.

## Setup

You need these accounts. Make them in Admin › Users; the site is **Burnley** throughout.

| Account | Job title | Site | Used for |
|---|---|---|---|
| A | Head of Gymnastics | Head Office | `manage_users` + `edit_rota` everywhere |
| B | Club Head Coach | Burnley | `edit_rota` at Burnley, no `manage_users` |
| C | Coach | Burnley | read-only |
| D1, D2 | Coach | Burnley | rostered coaches |
| D3 | Lead Coach | Burnley | rostered coach |
| E1, E2 | Coach | Burnley | same short name, e.g. "Beth Harrison" and "Beth Hughes" |
| F | Coach | Burnley | later moved to Leeds |
| G | Coach | Burnley | later deactivated |
| H | Regional General Manager | Burnley | not a coaching title: must not be assignable |

Views: **S** = Standard (`/rota/burnley`), **W** = This week (`/rota/burnley/week/<monday>`, generate it first),
**R** = Restructure (`/rota/burnley/restructure`, generate it first). Unless a step says otherwise, run every
rota case in **S, W and R**, and export the PDF in each.

Tick each box once for each view it applies to.

---

## 0. Smoke

- [ ] S, W, R and `/club-profile/burnley` all load for A, B and C with no error. (Before this phase, `/rota` and
      the meeting attendee lists failed on the dropped `rota_coaches` table.)
- [ ] W and R empty states (no week / no restructure yet) still load, and generating each works.

## 1. Coach picker

As B.

- [ ] "+ coach" on Monday opens a popover titled **"Add a coach to Monday"**. — S · W · R
- [ ] It has a labelled search input, **"Search Burnley coaches"**, focused on open. — S · W · R
- [ ] The list shows D1, D2, D3, E1, E2, F, G, each with **full name and job title** and an **Add** button. — S · W · R
- [ ] **H (RGM) is not listed**, nor is anyone at another site, an inactive account, or a Head Office account. — S · W · R
- [ ] Typing filters by name (and job title); a search with no match says *No coaches match "…"*. — S · W · R
- [ ] Add D1: D1's column appears on Monday, and D1 drops out of Monday's list. — S · W · R
- [ ] An **"Already on Monday"** chip row shows D1 by short name. It isn't shown on a day with nobody on it. — S · W · R
- [ ] Once everyone is on Monday, the list says *Everyone is already on Monday.* — S
- [ ] Footer reads: *"Someone missing? Coaches appear here once they have an active account at Burnley. An RGM,
      Head of Gymnastics or Head of Operations can add them."* — S · W · R
- [ ] Clicking outside closes it. Near the right edge of the window it stays fully on screen. — S
- [ ] As C (read-only), "+ coach" is disabled with the no-edit-rights tooltip. — S · W · R

## 2. Manage coaches removed; description sentence

- [ ] There is **no "Manage coaches" button** on any view, for A or B. — S · W · R
- [ ] The picker has no "New coach name" field. — S · W · R
- [ ] The description above the board ends: *"Coaches are everyone with an account at Burnley; to add someone new,
      create them in Admin › Users."* — S · W · R
- [ ] As **A**, "Admin › Users" is a **link** to `/admin/users` and opens the Users page. — S · W · R
- [ ] As **B** and **C**, the same sentence appears with "Admin › Users" as **plain text** (not a link). — S · W · R

## 3. Short display names

- [ ] Coach column headers show **first name + last initial**, e.g. "Dan P". — S · W · R
- [ ] Class cards read "Coach: Dan P". The coach popover title reads "Dan P — Monday". — S · W · R
- [ ] Roster E1 and E2. Both show **full names** ("Beth Harrison", "Beth Hughes"), not "Beth H". — S · W · R
- [ ] The class modal's Coach column and Set coach options use the same names. — S · W · R
- [ ] The picker's candidate rows show full names (with job title), by design. — S
- [ ] PDF: headers and card coach lines use the same short names. — S · W · R
- [ ] Club Profile meeting attendees use short names (§8). The attendance grid and the staff hours modal still
      show **full names**: short names on Club Profile itself are out of scope.

## 4. Unassigned column

- [ ] A day with no unassigned class has **no Unassigned column**. — S · W · R
- [ ] "+ Add class" → Coach column has an **"Unassigned"** option. Save one on Tuesday as Unassigned. — S · W · R
- [ ] Tuesday gains an **Unassigned** column at the **end of the day**: dashed left border, muted italic header,
      and a class count. No badges, no ×, no popover on click, no shift markers, no off-shift hatching. — S · W · R
- [ ] The card reads **"No coach yet"** (set coach None) and has no COVER badge. — S · W · R
- [ ] Edit it, set Set coach to D2, save: the card reads **"Unassigned · for Dan P"**, and still no COVER badge. — S · W · R
- [ ] On a board with **nobody rostered**, add an Unassigned class: the modal allows it (no "Nobody is rostered"
      error), the column appears, and the "No rota saved…" note is **gone**. — S
- [ ] Count updates as classes are added or moved out. The column disappears when the last one leaves. — S · W · R
- [ ] Set coach list: **"None"** first, then the assignable coaches. — S · W · R
- [ ] **Drag into Unassigned** (onto a day that already has the column): drag D1's class there. It now reads
      "Unassigned · for D1's name"; reload and it persists. — S · W · R
- [ ] Drag into Unassigned a class that was **covering** (D2 covering D1's group): it reads "Unassigned · for
      D1's name", i.e. the real owner is kept. — S · W · R
- [ ] **Drag out of Unassigned** into D3's column: the coach becomes D3 and set coach is unchanged. A class "for
      D1" now shows COVER (D3 delivering D1's group); a "No coach yet" class shows no COVER. — S · W · R
- [ ] As C, Unassigned cards can't be dragged or opened. — S · W · R
- [ ] **PDF**: the Unassigned column appears at the end of that day, header "Unassigned" in muted italic, no
      shading; cards read "Unassigned · for …" or "No coach yet". — S · W · R

## 5. Flagged coaches

Roster F and G on Monday and Wednesday with a class each, then in Admin › Users move **F to Leeds** and
**deactivate G**. Reload.

- [ ] F's headers are **amber**, with a warning icon, the name, **"Now at Leeds"** and a **"Remove from Monday"**
      / **"Remove from Wednesday"** button. — S · W · R
- [ ] G's headers are **grey**, with the name **struck through**, **"Account deactivated"** and the same button. — S · W · R
- [ ] The whole coach-header row is taller while anyone is flagged. Unflagged headers look the same, just in a
      taller row. Once nobody is flagged it returns to normal height. — S · W · R
- [ ] F's class cards have a **dashed outline** and the line **"Needs a Burnley coach"**. G's read
      **"Needs an active coach"**. — S · W · R
- [ ] A banner above the board reads **"2 coaches on this rota are no longer at Burnley"**, with one line per
      person and their days: "F (now at Leeds) — Mon, Wed", "G (account deactivated) — Mon, Wed". With only one
      flagged person it reads "1 coach on this rota is no longer at Burnley". — S · W · R
- [ ] Move G to Leeds as well, so G is both deactivated **and** moved: G still shows as deactivated (grey,
      "Account deactivated"). Deactivated wins.
- [ ] As **C**, flags, outlines and the banner all show, but there's **no "Remove from…" button and no ×**. — S · W · R
- [ ] F and G **don't appear in the picker**. — S
- [ ] Regenerate W from S while F is on S: F reappears flagged in the new week (expected: the RPC copies the
      Standard roster as is). — W · R
- [ ] **PDF**: headers read "F's name (moved)" / "G's name (inactive)". The tag is never cut off, even if the name
      has to be shortened. — S · W · R

## 6. Removing a coach unassigns, never deletes

- [ ] Click **"Remove from Monday"** on F. The confirm reads *"Remove … from Monday? Their 1 class will move to
      Unassigned."* Confirm. — S · W · R
- [ ] F's Monday column goes. The class is in Monday's **Unassigned** column, reading **"Unassigned · for F"**.
      Reload: same, and **no class was deleted** (count classes before and after). — S · W · R
- [ ] The ordinary **×** on an unflagged coach with classes behaves the same: same confirm, classes go to
      Unassigned. — S · W · R
- [ ] A covering class (D2 delivering D1's group) under a removed D2 becomes "Unassigned · for D1", keeping the
      **original owner**, not D2. — S · W · R
- [ ] Removing a coach with **no classes** that day asks nothing and just removes the column. — S
- [ ] Cancelling the confirm leaves everything as it was. — S
- [ ] When the banner's last flagged person is removed from every day, the banner goes. — S
- [ ] Classes on **other days** and in **other views** are untouched by a removal (e.g. removing from W doesn't
      change S). — W · R
- [ ] Optional (DB check, read-only): after a removal, the affected rows have `coach_id is null` and
      `set_coach_id` equal to the removed coach where it had been NULL.

## 7. Same behaviour in all three views and their PDFs

- [ ] Every box above marked S · W · R has been ticked in all three.
- [ ] PDF file names are unchanged: `burnley-standard-rota.pdf`, `burnley-week-<monday>.pdf`,
      `burnley-restructure.pdf`.
- [ ] A PDF of a board with flagged coaches, an Unassigned column and covers renders on one page with legible
      headers; the "too many coach columns" note still appears only for very wide weeks.

## 8. Club meeting attendees

As B (has `manage_club_meetings` at Burnley).

- [ ] Manage meetings → Add: the attendee list is the site's assignable coaches (D1–D3, E1, E2), by short name,
      with E1/E2 as full names. **H, F and G are not listed.**
- [ ] Save a meeting with D1, F and G attending (do this before moving F and deactivating G). The Weekly and
      Monthly tables list them.
- [ ] Move F and deactivate G. The tables now read e.g. "Dan P, F's name (moved), G's name (inactive)".
- [ ] Edit that meeting: F and G are listed **after** the assignable coaches, **ticked**, tagged (moved) /
      (inactive).
- [ ] Change only the title and save: F and G are **still attendees**. Saving never removes them silently.
- [ ] Untick G and save: G is gone. While editing, G's checkbox doesn't disappear when unticked.
- [ ] A different meeting's edit form doesn't show F/G unless they're its attendees.
- [ ] As C (no `manage_club_meetings`), the attendee names show and there's no Manage meetings button.
- [ ] The attendance grid and staff hours show this week's rostered coaches with **full names**.
- [ ] Staff Roles and Club Updates authors are unchanged (still via `resolve_profile_names`).

## Regression

- [ ] Drag a class between two coaches: still marks cover, COVER badge, set coach kept.
- [ ] Shift markers drag; status (Working / Annual leave / Sickness), Lead, Cashing up and Key holder toggles all
      save. Lead and Cashing up still allow only one per day.
- [ ] Add / edit / delete a class from the catalogue and as a custom class; duration presets and Custom… still work.
- [ ] Site switcher (A) remounts the board with the other site's data, coaches and flags.
