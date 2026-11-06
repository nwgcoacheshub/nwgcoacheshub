# Staff Roles: add-coach latency and dropdown width (Phase 1 investigation)

Date: 2026-11-06. Read-only investigation, so no code was changed. Phase 2 needs approval.

## Files involved

| File | Role |
|---|---|
| `components/clubProfile/StaffRolesModal.tsx` | The Staff Roles modal: chips, the "+ Add coach" `<select>`, `handleAdd`, `handleRemove` |
| `components/clubProfile/ClubQuickLinks.tsx` | Opens the modal (`open === "roles"`, lines 113–121) and passes down `roleGroups` / `siteAccounts` |
| `app/(protected)/club-profile/[siteSlug]/page.tsx` | Server component that builds `roleGroups` (lines 223–240) and `siteAccounts` (lines 203–205, 330–333) |
| `app/(protected)/layout.tsx` | Protected layout, which `router.refresh()` also re-renders |
| `lib/rota/siteAccess.ts`, `lib/getCurrentProfile.ts`, `lib/capabilities.ts`, `lib/clubProfile/names.ts` | Data helpers called during the re-render |
| `proxy.ts` | Runs on every request, including the refresh's RSC request |
| `components/formStyles.ts` | `inputClass`, which the select spreads |
| `supabase/migrations/0026_capability_helpers.sql` lines 1268–1313 | RLS on `club_role_assignments` |

The modal has no server action or API route. Writes go straight from the browser Supabase client (`lib/supabaseClient.ts`) to PostgREST under RLS. The codebase has no `revalidatePath` call tied to this flow. The only refresh is `router.refresh()`.

---

## 1. Add-coach flow, traced from the click to the chip

`StaffRolesModal.tsx`, `handleAdd(roleId, coachId)` (lines 63–83), triggered by the select's `onChange` (line 155):

| # | Step | Blocking? | Where |
|---|---|---|---|
| 1 | `onChange` fires. The select is controlled with `value=""` (line 153), so it snaps straight back to "+ Add coach". Nothing visible says a coach was picked | — | line 153–155 |
| 2 | `setBusy(true)` disables every select and chip ✕ in the modal | — | line 65 |
| 3 | **`await supabase.from("club_role_assignments").insert({...})`**, a network round trip to PostgREST. RLS `club_role_assignments_insert_manage_club_roles` evaluates `is_active_coach()` + `has_site_capability()` | **Yes (awaited)** | lines 67–71 |
| 4 | `setBusy(false)` re-enables the selects. **The chip still isn't there**, and the coach just added **is still listed** in that row's dropdown, because `available` is derived from the stale `role.assignments` prop (lines 116–117) | — | line 72 |
| 5 | `router.refresh()`, which is **not awaited, not in a transition, and shows no pending state**. Next.js re-requests the RSC payload for the whole `/club-profile/[siteSlug]` route, layout included | **Yes, the chip waits for this** | line 82 |
| 6 | Server re-render (see the request count below). When the payload arrives, React reconciles the whole page and `ClubQuickLinks` passes new `roleGroups` into the still-mounted modal. **The chip appears only now** | — | page.tsx → ClubQuickLinks.tsx:114–120 |

**No optimistic update exists.** The chip renders only from server-supplied `roleGroups`.

### What the `router.refresh()` in step 5 costs

These are Supabase requests for a user who holds `manage_club_roles` at the site. That user always holds `manage_club_meetings` there too (CLAUDE.md matrix), so `canEditMeetings` is true.

| Phase | Request | Count |
|---|---|---|
| `proxy.ts:31` | `auth.getUser()` | 1 |
| Layout, via `getCurrentProfile()` (React `cache()`, shared with page) | `auth.getUser()`, `profiles` select | 2 |
| Layout, via `getCapabilities()` (React `cache()`, shared with page) | `my_capabilities` RPC | 1 |
| Layout, via `getSiteAccess()` (**not** cached) | `rota_sites` | 1 |
| Page line 47, `getSiteAccess()` again | `rota_sites` (**duplicate**) | 1 |
| Page lines 73–78 | `rota_weekly_rotas` | 1 |
| Page lines 80–138, `Promise.all` | `club_updates`, `site_rota_people`, `site_rota_roster`, `heroes`, `club_role_categories`, `club_roles`, `club_role_assignments`, `rota_weekly_roster` (if week exists), `cycle_weeks`, `club_meetings` | 10 |
| Page lines 155–166 (if ≥1 meeting) | `club_meeting_attendees`, `club_meeting_cycle_weeks` | 2 |
| Page lines 174–179 (if ≥1 hero) | `hero_hours` | 1 |
| Page line 192 | `resolve_profile_names` RPC (once per render, not once per add) | 1 |
| Page lines 203–205 | `site_role_candidates` RPC | 1 |
| **Total per refresh** | | **22** (19 if the site has no meetings and no heroes; `rota_weekly_roster` resolves locally if no week exists, giving 18) |

Add the insert itself and **one add costs 23 Supabase requests**.

**Sequential round trips on the critical path** (each waits for the previous one):

1. `proxy.ts` `auth.getUser()`
2. `getCurrentProfile` `auth.getUser()`
3. `getCurrentProfile` `profiles` select
4. `getCapabilities` `my_capabilities` (awaited after 2–3 inside `getSiteAccess`, though it doesn't depend on them)
5. `rota_sites`
6. `rota_weekly_rotas`
7. the 10-way `Promise.all`
8. meeting attendees and cycle weeks
9. `hero_hours`
10. `resolve_profile_names`
11. `site_role_candidates`

Add the insert and that's **12 sequential round trips** from selecting a coach to the chip appearing. The time to serialise and reconcile the whole page (updates, attendance grid, meetings, quick links) comes on top. Steps 8–11 don't depend on each other (11 depends on nothing on the page), and step 4 doesn't depend on steps 2–3, but they're awaited one after another. I didn't measure wall-clock time, so no milliseconds are given.

Hypothesis check:
- *"awaits a call, then triggers router.refresh, no optimistic update"*: **confirmed.**
- *"extra round trips, e.g. resolve_profile_names re-called per add"*: **partly.** It runs once per refresh, not as an extra per-add call. The real extra cost is that the refresh re-runs the whole page and layout: 22 requests across 11 sequential stages, including 1 duplicate `rota_sites` query.

### Side effect of step 4 (the stale window)

`busy` is cleared *before* the refresh lands. In that window the dropdown is enabled and still lists the coach just added. Picking them again sends a second insert, which hits the `(club_role_id, site_id, coach_id)` unique constraint and shows "That coach already holds this role." (lines 74–78). The user sees an error for something that worked.

---

## 2. Root cause of the delay

The chip waits for a **full route re-render** (`router.refresh()`, line 82) after the awaited insert. That's 22 Supabase requests across 11 sequential stages, plus a whole-page RSC payload and reconcile, all to show one row that the client already knows about: it has the role id, and it has the coach's name in `siteAccounts`. There's no optimistic state and no pending indicator, and because the select snaps back to its placeholder (`value=""`), the UI looks idle for the whole wait.

| Step | Blocking | Work |
|---|---|---|
| Insert (line 67) | Yes | 1 request, local |
| `router.refresh()` (line 82) | Yes (for the chip) | Full layout + page RSC re-render: 22 requests, 11 sequential stages, entire page reconciled |
| Local state update | n/a | **None exists** |

---

## 3. Root cause of the width difference

### The markup (same element in both states)

`StaffRolesModal.tsx:126` (wrapper) and `:152–157` (select):

```tsx
<div className="flex flex-wrap items-center justify-end gap-1.5">
  ...chips...
  <select
    value=""
    ...
    className={`${inputClass} w-auto min-w-[150px] py-1 text-[13px]`}
  >
```

`components/formStyles.ts:6–7`:

```ts
export const inputClass =
  "w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink ...";
```

So the rendered class list is effectively `w-full ... py-1.5 text-sm ... w-auto min-w-[150px] py-1 text-[13px]`.

### Why `w-auto` does nothing

Tailwind (v4.3.3 here) has no class-merging, and the repo has no `tailwind-merge`/`clsx`. When two utilities set the same property, **the one later in the generated stylesheet wins**, whatever order they appear in the `className` string. From the compiled CSS (`.next/static/chunks/0rk0rowl7f04q.css`):

```
1  .w-auto{width:auto}
2  .w-full{width:100%}          ← later, wins
3  .min-w-\[150px\]{min-width:150px}
4  .py-1{padding-block:var(--spacing)}
5  .py-1\.5{...* 1.5}            ← later, wins (so the py-1 override is dead too)
6  .text-sm{...}
7  .text-\[13px\]{font-size:13px} ← later, wins (this override does work)
```

**The select is `width: 100%`.** The `w-auto` override has never worked: `inputClass` was extracted (4b09d13) before the Club Profile page was built (c41dce8). It's the only `${inputClass} w-…` override in the codebase.

### Why that gives different widths

The chips wrapper (line 126) is a flex item of the role row (line 122), so its width is its **max-content** width. When the browser works out that max-content width, it can't resolve the select's percentage width, so it treats it as `auto` (the select's natural width, at least 150px). After that, the select's `100%` resolves against the wrapper's final width:

- **Unassigned row (edit mode):** the "Unassigned" label is hidden when `editing` (line 127), so the wrapper holds only the select. Wrapper width = the select's natural width, so 100% of that = the natural width. **All unassigned rows match**: same `available` list (every site account), same width.
- **Assigned row:** wrapper max-content = chip widths + `gap-1.5` gaps + the select's natural width. The select then becomes 100% of *that*. It no longer fits on the chips' line, so `flex-wrap` drops it onto its own line **beneath the chips** at the full wrapper width. **Select width = the chips' width + gaps + its natural width.**
- **Assigned rows differ from each other** because the chips differ. "Movers" with an "Ashleigh T" chip gets a wider select than "Payments" with an "Olivia W" chip, simply because the chip text is longer. Two or more chips widen it further.

There's a smaller second factor: the select's natural width is `max(150px, its longest option)`, and `available` drops the assigned coaches (lines 116–117). If the site's longest name is assigned in a row, that row's natural width shrinks slightly. Unassigned rows always list everyone, so they always agree.

Hypothesis check:
- *"select has no explicit width and sizes to its longest option"*: **ruled out as the main cause.** It has an explicit width, `100%`, which is the problem. Option length is only the small secondary effect above.
- *"wrapper switches layout when chips are present"*: **ruled out.** The wrapper's classes are identical in both states. Only its contents change.

---

## 4. Remove-coach (chip ✕) flow

`handleRemove(assignmentId)`, lines 48–61. **Same pattern:**

1. `setBusy(true)` (line 49)
2. **`await supabase.from("club_role_assignments").delete().eq("id", assignmentId)`** (lines 51–54), 1 request, RLS `club_role_assignments_delete_manage_club_roles`
3. `setBusy(false)` (line 55). The chip is still visible and its ✕ is enabled again
4. `router.refresh()` (line 60), the same 22-request, 11-stage full re-render. The chip disappears only when that lands

There's no optimistic removal and no pending state. In the stale window a second ✕ click sends a delete for a row that's already gone. That returns no error, so it's harmless, but it's another wasted round trip and refresh.

Something Phase 2 needs to know: PostgREST returns **no error when RLS (or a prior delete) leaves 0 rows to delete**. The current code can't tell a successful delete from a no-op. An optimistic removal would need `.delete().eq("id", …).select("id")` and a check that one row came back. Otherwise a silently refused delete would make the chip vanish and then reappear.

---

## 5. Fix options

### Latency

**A. `useOptimistic` + `startTransition`, keeping `router.refresh()` as the source of truth (recommended)**
Wrap insert/delete + `router.refresh()` in `startTransition(async () => …)` and apply an optimistic add (chip with the name from `siteAccounts`) or removal via React 19's `useOptimistic`. The transition stays pending until the refresh lands, so the optimistic chip holds until the real data replaces it, and it reverts automatically if the write fails.
- Pros: the chip appears or disappears instantly. The dropdown filters out the coach at once, which closes the stale-window duplicate-insert error. It's idiomatic for React 19 / Next 16, with no extra state syncing. The server stays authoritative.
- Cons: the 22-request refresh still runs in the background, so server cost doesn't change. `isPending` needs handling (e.g. keep the controls disabled while pending). Delete needs `.select("id")` to detect a no-op (see §4).

**B. Local state only, no refresh**
Copy `roleGroups` into modal state and patch it from the insert's returned row (`.insert(...).select("id").single()`).
- Pros: instant, and no background refresh cost.
- Cons: `ClubQuickLinks` and the page keep stale `roleGroups`. The modal unmounts on close (ClubQuickLinks.tsx:113), so reopening it shows the old data unless state is lifted into `ClubQuickLinks`. That means more moving parts and two copies of the truth. Not recommended on its own.

**C. `useTransition` pending state only (no optimistic chip)**
- Pros: smallest change. Shows that something is happening, and keeps controls disabled until the refresh lands, which closes the stale window.
- Cons: **the delay itself doesn't change**. It only stops the UI looking idle.

**D. Make the page's refresh cheaper (complements A or C)**
Wrap `getSiteAccess` in `cache()` (removes the duplicate `rota_sites`, 1 request). Run `my_capabilities` alongside `getCurrentProfile`. Fold `site_role_candidates`, `hero_hours`, meeting attendees/cycle weeks and `resolve_profile_names` into fewer parallel stages. Together that cuts the critical path from 11 sequential stages to 6: proxy `getUser`; `getUser`; `profiles` ‖ `my_capabilities` ‖ `rota_sites`; `rota_weekly_rotas`; the `Promise.all`; then attendees ‖ cycle weeks ‖ `hero_hours` ‖ `resolve_profile_names` ‖ `site_role_candidates`. That's a theoretical floor, not measured.
- Pros: speeds up *every* Club Profile load and every refresh on the page (updates, meetings), not just Staff Roles.
- Cons: touches the shared page and the layout helper, a wider blast radius than this bug. It's best done as its own reviewed change.

A server action with `revalidatePath` isn't listed. It re-renders the same route, so it's no faster than the current `router.refresh()`.

### Width

**W1. Stop spreading `inputClass` on this select. Give it its own class string with a fixed width (recommended)**
e.g. `rounded-lg border border-line bg-white px-2.5 py-1 text-[13px] text-ink focus:border-orange focus:outline-none w-[150px]`.
- Pros: identical width in every row, assigned or not. Because the select is always `value=""`, the closed control only ever shows "+ Add coach" / "No one left to add", so a fixed width hides nothing (the open option list sizes itself natively). This also makes the intended `py-1` actually apply.
- Cons: the select no longer gets future density changes made to `inputClass` (that's an inherent trade-off with any override). The exact width value needs Jamie's sign-off.

**W2. Same as W1 but `w-auto` (natural width)**
- Pros: fits its content.
- Cons: widths still vary slightly between rows (the §3 secondary effect), so this doesn't fully meet "consistent".

**W3. Tailwind v4 important modifier (`w-[150px]!`) while keeping `inputClass`**
- Pros: a one-token change.
- Cons: `!important` to win a specificity fight is brittle, and `py-1` would need the same treatment. Not recommended.

**W4. Change the wrapper layout (e.g. put the select on its own line in a separate container)**
- Cons: with `w-full` still in place the select would stretch to that container's width, so it doesn't fix the cause. It's a layout redesign, not a bug fix.

**Decision needed (layout):** once the select stops being 100% wide, it will sit **inline after the chips** on the same line, wrapping only when the row is full. Today it always drops beneath the chips, but only because of this bug. Please confirm inline-after-chips is what you want. If "always beneath the chips" is wanted, that's a deliberate layout choice (e.g. the wrapper switching to `flex-col items-end`) and would be a separate approval.

### RLS and permissions

Every option above keeps writes on the browser Supabase client (publishable key, the user's session). That leaves the `club_role_assignments` insert/delete policies (`has_site_capability('manage_club_roles', site_id)`, 0026 lines 1284–1313) as the **only enforcement**. None of them adds a server action with `createAdminClient()`, a secret-key route, or any new UI-only permission check. The existing `canManageRoles` prop still decides only whether edit mode is *offered*. With option A, a write that RLS refuses reverts the optimistic chip and shows the error. Adding `.select("id")` on insert/delete reads back through the existing `club_role_assignments_select_own_site_or_view_all` policy, which every `manage_club_roles` holder at the site already passes (own site, or `view_all_sites` alongside `all_sites_scope`).

## Recommendation

**A + W1** for Phase 2, scoped to `StaffRolesModal.tsx` only. Consider **D** as a separate follow-up, since it benefits the whole page.

---

## Phase 2 — implementation

Date: 2026-11-06. Option **A + W1** as approved, with the "always beneath the chips" layout. Only `components/clubProfile/StaffRolesModal.tsx` changed (plus this append). Nothing committed or pushed.

### What changed

**Optimistic add/remove (`useOptimistic` + `startTransition`)**
- Chips now render from `useOptimistic(roleGroups, applyRoleEdit)` rather than the `roleGroups` prop. `applyRoleEdit` either adds an assignment (kept sorted by name, as the page sorts them) or filters one out by id.
- `handleAdd` / `handleRemove` apply the optimistic edit, do the write, then call `router.refresh()`, all inside one `startTransition(async …)`. The optimistic edit holds until the transition ends. On success that's when the refresh lands with the real rows. (Next runs `router.refresh()` as a transition, and React 19 entangles it with the pending async action, so the chip doesn't flicker back between the write and the refresh.) On failure the same refresh runs (see the follow-up below), so the edit holds until the refresh lands and is then replaced by what the database actually holds. That's the revert.
- An optimistic chip shows the name from `siteAccounts`. That's the same trimmed `full_name` the page uses for chips, so the name doesn't change when the real row arrives. Its id is a placeholder (`optimistic:<coachId>`), so its ✕ is disabled until the refresh brings the real row.

**Zero-row checks**
- Insert: `.insert(...).select("id")`. Delete: `.delete().eq("id", …).select("id")`.
- If there's an error, **or** no rows come back, it counts as a failure. An error shows and the page refreshes in the background, so the chip converges to the real database state. An error from Supabase shows its own message, and the 23505 duplicate message is unchanged. Zero rows with no error shows "That change didn't save. The list has been refreshed."

**Dropdown options from optimistic state**
- `assignedIds` / `available` are now worked out from the optimistic role. A coach you've just added leaves that row's options straight away, and a coach you've just removed comes back. That closes the stale window that caused the false "That coach already holds this role."

**Double-submit guard**
- The old modal-wide `busy` flag is replaced by `writingRoles`, a set of role ids with a write in flight. While a role's write is pending, that row's select and ✕ buttons are disabled (`disabled:opacity-60`, the same treatment as the other selects and buttons). Other rows stay usable.
- The lock lifts when the write returns, not when the refresh lands. By then the chip and options already reflect the write, so nothing misleading is enabled. A second add on the same row in that window is a fresh, valid write.

**Layout and width**
- The right-hand wrapper is now `flex flex-col items-end gap-1.5`. Its first child is the chip line (`flex flex-wrap justify-end gap-1.5`, unchanged chip markup), shown when there are chips or when not editing ("Unassigned"). Its second child is the select. The select is always on its own line beneath the chips, right-aligned, so every row's picker sits in one right-hand column.
- Unassigned rows in edit mode render only the select, as before.
- The select no longer uses `inputClass`. It has its own string:
  `w-40 rounded-lg border border-line bg-white px-2.5 py-1 text-[13px] text-ink focus:border-orange focus:outline-none disabled:opacity-60`.
  The `py-1` and `text-[13px]` now apply. I dropped `placeholder:text-slate-light` because a select has no placeholder, and `min-w-[150px]` because the fixed width replaces it.
- No permission gating added. `canManageRoles` still only decides whether "Edit roles" is offered. Writes still go through the browser client (`createClient()`), so RLS is the only enforcement.

### Width: measured value and step chosen

- **Measured (from the compiled CSS, `.next/static/chunks/0rk0rowl7f04q.css`):** an unassigned row's select renders at its natural width with a floor of `min-width: 150px` (box-sizing border-box). Its natural width is the longest option (site accounts' **full names**) plus `px-2.5` (20px), the 2px border and the native arrow. For typical names (up to about 15 characters at 13px) that comes in under the floor, so **unassigned rows render at 150px**. At a site whose longest full name is roughly 17 characters or more, they already render a little wider than 150px, and that width varies by site.
- **Step chosen: `w-40` (160px).** `w-36` (144px) is numerically nearer 150, but I didn't pick it. The closed control's longest label is "No one left to add" (18 characters). By the same estimate that needs about 150px, so it would likely clip at 144px. `w-40` also sits closer to sites where long names already push the select past 150px.
- **Net visual change on unassigned rows:** about 10px wider at the 150px floor. At sites with long names they get the same or slightly narrower. I estimated text widths from the font size and didn't measure them in a browser, so please check by eye (test step 1). If 10px is noticeable, `w-[150px]` reproduces the floor exactly.

### Other `inputClass` usages with conflicting width/padding classes

Searched every `inputClass` reference in `app/`, `components/` and `lib/`. **Count: 0.**

The only usages that add classes to `inputClass` don't set width or padding, so they don't conflict:
- `components/UsersTable.tsx:38`: `${inputClass} disabled:cursor-not-allowed disabled:opacity-60` (variant-only)
- `components/rota/AddWeek.tsx:251`: `` `mt-1.5 ${inputClass}` `` (margin only)

Every other usage is plain `className={inputClass}`. The StaffRolesModal select was the only conflicting usage, and it no longer uses `inputClass`.

### Type-check and lint

- `npx tsc --noEmit -p .`: **passed** (exit 0, no output)
- `npm run lint` (`eslint`, whole repo): **passed** (exit 0, no warnings)

### Manual test steps (for Jamie)

Sign in as a user with `manage_club_roles` at the site (e.g. Club Head Coach or Head of Gymnastics). Open Club Profile → Staff roles → **Edit roles**. Keeping DevTools Network open helps.

1. **Layout.** Every row's "+ Add coach" select is the same width and sits right-aligned in one column. On rows with chips it's on the line *beneath* the chips. Unassigned rows look as before: a single select, right-aligned, at about the same width.
2. **Add.** Pick a coach on an unassigned row. The chip appears immediately, before the `club_role_assignments` POST and the RSC refresh finish. The coach drops out of that row's dropdown immediately. The row's select is briefly disabled during the write. Other rows stay usable. When the refresh lands, nothing jumps or flickers.
3. **Remove.** Click ✕ on a chip. It disappears immediately and the coach reappears in that row's dropdown immediately. The DELETE request has `select=id` in its query string.
4. **Rapid double-add.** On one row, pick a coach and straight away open the dropdown again. The first coach is no longer listed, and the select is disabled until the write returns. You never see "That coach already holds this role." Then add a second coach to the same row before the first refresh has landed. Both chips stay and both persist after reload.
5. **Freshly added chip.** Straight after adding, the new chip's ✕ is disabled (dimmed) until the refresh lands, then it works.
6. **A role you can't edit (expect revert + error).** Do this as a user who can open edit mode but can't write. For example, sign in as a Club Head Coach test account and open edit mode. Then, from a **different** `manage_users` account in another browser or profile (the self-edit rule stops you changing your own title), change that test account's job title to Coach or move it to another site. Leave the first tab open in edit mode while you do this. Back in the first tab:
   - Add a coach. A red error shows (the RLS insert violation) straight away. The chip stays until the background refresh lands, then disappears.
   - Click ✕ on an existing chip. The chip disappears and "That change didn't save. The list has been refreshed." shows. When the refresh lands the chip comes back. This is the zero-row delete case. Before this change it would have looked like a success.
   - After that refresh the account can no longer manage roles here, so expect the dropdowns to read "No one left to add" and the "No active accounts…" note to appear. That's the refreshed data, not a bug.
7. **Reload.** Hard-refresh the page and reopen Staff roles. The chips match what you saw after steps 2–5.
8. **Stale tab (remove).** Open the same Club Profile in tabs A and B, with Staff roles in edit mode in both. In tab A, remove a coach from a role. In tab B (still stale, so the chip is still showing), click ✕ on that same chip. Expected: "That change didn't save. The list has been refreshed." shows. The chip disappears and stays gone once the refresh lands.
9. **Stale tab (add), optional.** Same setup. In tab A, add a coach to a role. In tab B, pick the same coach for that role. Expected: "That coach already holds this role." shows, and when the refresh lands the chip is there and the coach is gone from that row's dropdown.

### Follow-up: refresh on failed writes (2026-11-06)

Decision: on **any** failed add or remove (an error, or zero rows returned), show the error **and** run the same background `router.refresh()` used on success. That way the UI converges to the real database state, for example a row already deleted or added from another tab.

- **Change.** In `handleAdd` / `handleRemove`, `router.refresh()` now runs whatever the result. The failure branches set the error and no longer `return` early. The zero-row message is now neutral: `UNSAVED_MESSAGE` = "That change didn't save. The list has been refreshed." Supabase error messages and the 23505 message are unchanged. The width stays `w-40`.
- **Effect on the revert's timing.** The refresh is inside the same transition, so a failed optimistic edit no longer drops off straight away. It holds until the refresh lands, then gives way to the real data. A refused add's chip stays visible until then, alongside the error. A refused remove's chip stays hidden until then and then reappears. In the stale-tab case (step 8) this means no flicker: the chip goes and stays gone. The error shows straight away in every case.
- **Lock.** `writingRoles` still clears when the write returns, so the row isn't locked while the refresh is in flight.
- **Checks.** `npx tsc --noEmit -p .`: passed (exit 0). `npm run lint`: passed (exit 0).
- **Tests.** Step 6 updated for the new timing and copy. Steps 8 (stale-tab remove) and 9 (stale-tab add, optional) added.

