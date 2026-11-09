# NWG Coaches Hub

## What this is
An internal coaching intranet/dashboard for Nile Wilson Gymnastics (NWG), used across
seven UK sites: Burnley, Coventry, Leeds, Mansfield, Rotherham, Wirral, Wolverhampton
— plus Head Office for corporate/regional roles not tied to a single gym.

Purpose: surface weekly focus themes, programme resources, how-to/SOP guides, compliance
tracking, and quick links to external systems (e.g. BARS).

**This is NOT a class registration or gymnast management system** — BARS and other
existing tools already handle that. Do not build gymnast/class CRUD features here.

**Exception — competition entry lists (approved 2026-11, migration 0032).** External
Competition Entries may store, per entry, a gymnast's name and date of birth (no parent or
contact data) with that gymnast's fee level, extras, notes and payment checklist. This data
lives only in `comp_entry_gymnasts` and is removed manually 12 months after the competition.
It is not a gymnast record: no gymnast profiles, no reuse across entries, no registration or
class features. The rule above still applies to everything else.

## v1 scope — DO NOT EXCEED WITHOUT EXPLICIT APPROVAL
- Static shell matching the agreed design mock (Tailwind, exact tokens below)
- Gated by Supabase Auth
- Hardcoded placeholder content for all dashboard sections
- No CMS, no admin panel, no content editing UI — content changes happen directly in
  the Supabase table editor for now

### Functional in v1
- Login (Supabase Auth)
- Users page (add / edit / deactivate / reset password — `manage_users` holders only),
  under Admin (`/admin/users`)

### Static placeholder only (NOT wired to real data or links yet)
- Weekly Focus + Pre-school theme ("This week" hero)
- Programme tiles
- How-to strip
- What's New
- My Compliance
- Search bar
- Report-a-concern
- Notifications

Quick Links is the one placeholder section with a committed real destination (external
links) — see below.

## Dashboard header
Two separate badges sit under the "Welcome back" heading — not a single combined label:
- **Role badge** (orange) — `job_title`, e.g. "Head of Gymnastics"
- **Site badge** (neutral grey) — `site`, e.g. "Burnley"

## Dashboard structure (v1 placeholder content)

**Top bar:** wordmark only ("NWG Coaches Hub", text, no logo icon), search input
(placeholder text, non-functional), "Report a concern" button (orange, non-functional),
notification bell icon (non-functional), avatar circle with initials (non-functional).

**Nav row:** Home (flat link, active on dashboard) and Settings (flat link, personal
account management) have no dropdown. Club Profile, Gymnastics, Competitions, Operations,
People, and Admin are dropdown menus — click the trigger to reveal sub-items; only one
dropdown open at a time; closes on outside click or Escape:
- **Club Profile** — one live link per site the user can see, built from `rota_sites` via
  `getSiteAccess()` (not a hardcoded list), each to `/club-profile/{slug}`.
  `view_all_sites` holders see every site; everyone else sees only their own. Head Office
  never appears (it has no `rota_sites` row and no Club Profile page). An empty list shows
  a single disabled "No sites available" item.
- **Gymnastics** — Weekly Overview (live route `/gymnastics/weekly-overview`), Programme
  Resources, Coaching Guides (the latter two currently inert/disabled placeholders — no
  sub-route exists yet)
- **Competitions** — Competition Calendar, External Competition Entries, Club Competitions,
  NWG Competitions, Judging Platform (all five currently inert/disabled placeholders;
  Competition Calendar's page exists at `/competitions/calendar` and is switched on in
  Phase 4a, the other four have no sub-route yet). No capability gate: shown to every
  active user.
- **Operations** — Rota (existing `/rota` route, fully functional) and Site SOPs (stub
  route `/operations/site-sops`)
- **People** — HR Links, My Compliance (currently inert/disabled placeholders — no
  sub-route exists yet) and Policies (live route `/people/policies`)
- **Admin** — only rendered (trigger + contents) if the logged-in user holds the
  `manage_users` capability (see Permissions below); contains Users (`/admin/users` —
  add / edit / deactivate / reset password)

Each dropdown's parent landing page (`/gymnastics`, `/competitions`, `/operations`,
`/people`, `/admin`, `/settings`) still exists as a stub route for direct navigation —
the dropdown is just a faster path to sub-items, it doesn't replace the landing page.
The exception is `/club-profile`, which has no page of its own: it redirects to the
user's home site (`/club-profile/{slug}`), or shows `ClubProfileUnavailable` if the user
has no site access.
Must always use real session/profile data for the Admin gate — see the rule against demo
toggles below.

**Page head:** `Welcome back, {full_name}` (real data), breadcrumb "Home / Dashboard",
the two badges described above (real data), greeting subline with today's date, e.g.
"{day, date} · Here's what's on this week and everything you need to find."

**"This week" hero** — bordered card, two cells side by side (stack on mobile):
- Cell 1: eyebrow "WEEKLY OVERVIEW", heading "Handstand Alignment", body "This week's
  whole-club focus. Flat back, active shoulders, and consistent hollow-body positioning
  through conditioning and wall drills.", three chip tags ("Flat back" solid orange,
  "Active shoulders" and "Wall drills" neutral), link "Open full overview →" (href="/gymnastics/weekly-overview")
- Cell 2: eyebrow "PRE-SCHOOL THEME", heading "Under the Sea 🐠", body "Current theme in
  the 9-week Tiny Tumblers & Little Flippers cycle. Songs, station ideas and apparatus
  set-ups included.", a 9-segment progress bar (3 filled solid, 1 filled as "current", 5
  empty), meta "Week 4 of 9 · Next: Jungle Adventure (w/c 10 Aug)", link "Open theme
  pack →" (href="#")

**"Programme content"** — section label with a horizontal rule, then 6 tiles in a grid,
each with an icon, heading, one-line description, href="#":
- Progression framework — "Levels, stages and what 'good' looks like at each step."
- Awards scheme — "Badge criteria and how to assess & award."
- Skill progressions — "Step-by-step drills & coaching points by skill."
- Session resources — "Plan templates, station ideas and lesson structures."
- Pre-school cycle — "All 9 themes, in order, with full packs."
- Coaching masterclasses — "Technical video & CPD from the coaching team."

**"How do I…?"** — section label, then 3 columns, each a card with a header (icon +
title + subtitle) and rows (name + status pill, href="#"):
- BARS how-tos ("Doing it in the system"): Take a register (Published), Record an award
  (Published), Move a gymnast / group change (Draft), Check a waiting list (Not written)
- Other systems ("Rota, comms, incident tool"): View your rota (Published), Log an
  incident / injury (Published), Request time off (Draft), Book onto a CPD course (Not
  written)
- Off-system processes ("No software — how we do it"): Open & close the gym (Published),
  Equipment safety checks (Published), Handle a parent at the desk (Draft), What to do
  if a gymnast is hurt (Published)
- Status pill colours: Published = green, Draft = amber, Not written = grey

**Sidebar, in this exact order — What's New, then Quick Links, then My Compliance:**
- What's New: 3 items, coloured dot + title + meta — "New theme starts w/c 10 Aug:
  Jungle Adventure" (Programme · 2 days ago), "Updated trampoline safety SOP — please
  read" (Policy · 4 days ago), "Mentor Programme — round 3 sign-ups open" (Development ·
  1 week ago)
- Quick Links: 3 rows, icon + title + subtitle + external-link arrow, `#` hrefs for now
  but structured as a simple array/list so real URLs can drop in later without a
  rebuild — BARS ("Booking & registration"), ProActive ("Membership platform"), British
  Gymnastics ("Governing body")
- My Compliance: 4 rows, label + sub-label + status pill — Safeguarding / "Expires 12
  Mar 2027" / Valid (green), First Aid / "Expires 28 Aug 2026" / "32 days" (amber), DBS /
  "Renewal overdue" / Action (red/orange), CPD hours / "6 of 12 this year" / On track
  (green)

**Footer:** small text "© 2026 The Gymnastics Blueprint. All rights reserved." (matches
the login page's copyright line), log out link.

Everything above except the greeting, the two badges, and Admin nav-item visibility
(`manage_users`) is hardcoded placeholder content — no database tables, no fetching,
just static markup.

## Design tokens (exact values — use these, don't approximate)

| Token | Value |
|---|---|
| Orange (primary) | `#F58220` |
| Orange dark (hover) | `#DD6F14` |
| Orange light | `#FBB976` |
| Orange pale (badge/tint bg) | `#FEF1E5` |
| Slate | `#5A6470` |
| Slate dark | `#404852` |
| Slate light | `#7A828C` |
| Ink (body text) | `#2B3138` |
| Line (borders) | `#E6E8EB` |
| Background | `#F4F5F6` |
| Card | `#FFFFFF` |
| Status green | `#2E9E5B` |
| Status amber | `#E0A11B` |
| Status grey | `#9AA2AB` |

- Font: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
- Card style: white background, 14px border radius, layered shadow
  (`0 1px 3px rgba(40,48,56,.06), 0 6px 20px rgba(40,48,56,.05)`)
- Wordmark: text only ("NWG Coaches Hub"), ~20px, no logo icon
- Desktop-first; usable but not optimised for mobile

### Sizing tokens — buttons & inputs (density pass, 2026-07-29)
Applies to all `<button>`/`<input>`/`<select>` elements — login form, nav bar, and
UsersTable (table + modals). Not applied to nav tabs, pills/badges, or banner/message
text, which aren't form controls.

| Element | Padding | Font size |
|---|---|---|
| Standard button (primary/secondary, e.g. Report a concern, Add user, Save changes) | `px-3.5 py-2` | `text-[13px]` |
| Login submit button | `py-2.5` (full width) | `text-sm` |
| Table row action button (Edit / Reset password / Deactivate) | `px-2 py-1` | `text-xs` |
| Text input / select (modals) | `px-2.5 py-1.5` | `text-sm` |
| Login email/password inputs | `px-3 py-2.5` | `text-sm` |
| Nav bar search input | `py-2 pl-9 pr-3.5` | `text-sm` |

These are one notch down from the original v1 mock sizing (e.g. standard buttons were
`px-4 py-2.5 text-[13.5px]`; modal inputs were `px-3 py-2`). Use these values for any
new button or input rather than the larger originals.

## Supabase
- Project URL: `https://wwizreekicrjqwwptdmx.supabase.co`
- Publishable key: `sb_publishable_m_sRPnqR2n6ScIealVT_Iw_QGLwu6y8`
- Secret key: not yet added — required for the Users page's create-user and
  reset-password functions. This must be entered directly into `.env.local` (never
  committed, never pasted into chat) and must NOT use a `NEXT_PUBLIC_` prefix, since it
  bypasses Row Level Security and must never reach the browser.
- These belong in `.env.local` (git-ignored) — never hardcode or commit them
- `profiles` (below) is the account table. It is no longer the only live table: the rota
  (0002 onward, see "Rota data model"), Club Profile, programme, policies and What's New
  tables, among others, are defined in `supabase/migrations/`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, FK → `auth.users.id` |
| `email` | text | Synced from auth user |
| `full_name` | text | |
| `job_title` | text | Company job title — **fixed dropdown**, not free text (list below) |
| `site` | text | One of the 7 NWG sites, or `'Head Office'` |
| `active` | boolean | Default `true`. Drives soft-delete/deactivation on the Users page |
| `created_at` | timestamptz | Default `now()` |

`job_title` drives every permission, through the capability matrix described under
Permissions below. Changing someone's job title is changing what they can do.

**`job_title` dropdown values (fixed list):**
- Coach
- Lead Coach
- Club Head Coach
- Regional General Manager
- Head of Gymnastics
- Head of Operations

### Permissions (job-title capabilities)
Since migrations 0026 (database) and 0027 + P4 (app), permissions come from
`profiles.job_title`. `profiles.role`, `is_admin()` and `can_edit_rota()` were dropped in
0028 (P5).

| Capability | Held by |
|---|---|
| `view_all_sites`, `all_sites_scope`, `publish_whats_new`, `manage_policies`, `manage_users`, `manage_comp_events` | Regional General Manager, Head of Gymnastics, Head of Operations |
| `edit_rota`, `manage_club_meetings`, `manage_club_updates` (site-scoped) | Lead Coach, Club Head Coach + the three above |
| `manage_club_roles` (site-scoped) | Club Head Coach + the three above |
| `edit_comp_entries` (site-scoped) | All six titles, Coach included |
| `sign_off_competitions` | Head of Gymnastics |
| `approve_judges` | Regional General Manager, Head of Gymnastics |
| `confirm_comp_pricing` (site-scoped) | Club Head Coach, Head of Gymnastics (RGM and HOO hold `all_sites_scope` but not this) |
| `remove_comp_gymnast_data` | Regional General Manager, Head of Gymnastics |

Coach holds only `edit_comp_entries`. Every capability requires `active = true`. A site-scoped capability
applies at the holder's own `profiles.site`, or at every site with `all_sites_scope`.

- **The matrix lives only in the database**, in `title_has_capability()` (0026). Never
  copy a job-title list into the app. Capability *names* appear in `lib/capabilities.ts`,
  `title_has_capability()` and `my_capabilities()` (0027); a new capability goes in all three.
- **UI** reads the caller's capabilities once per request through `getCapabilities()`
  (`lib/capabilities.ts`, the `my_capabilities()` RPC) and uses `hasSiteCapability()` for
  site-scoped ones. This only decides what is shown; RLS enforces every write.
- **Secret-key routes** (`createAdminClient()`) bypass RLS, so each must start with
  `requireCapability(cap)` from `lib/admin-guard.ts`, which asks the database's
  `has_capability()` and requires an active account.
- **Self-edit rule.** Nobody may change their own `job_title`, `site` or `active`; only an
  active `manage_users` holder may change anyone else's. The
  `profiles_guard_privileged_columns` trigger (0026) enforces this for client sessions,
  and the Users page disables those controls on your own row.
- **Any future SECURITY DEFINER function that updates `profiles` bypasses that trigger**
  (it runs as its owner, which the trigger trusts, as it trusts `service_role`). Such a
  function must enforce both self-edit rules itself.
- **Password resets.** `/api/admin/reset-password` refuses the caller's own account and
  any account whose job title holds `manage_users` (active or not). There is no
  forgot-password flow: full-access accounts have their password reset in the Supabase
  dashboard.
- Migration 0027 must be applied before the P4 app code is deployed.
- **anon holds no grant** on any public table or function (0023, 0025, 0028). Since 0028,
  objects created in `public` by `postgres` no longer default to anon either. A new
  function still needs `revoke execute ... from public` and `from anon`, then an explicit
  grant to `authenticated`.

### Rota data model
Since migration 0029 (applied), rota coaches **are profiles**. `rota_coaches` was dropped,
and there is no rota-specific coach list or coach-management UI. A new coach is an account,
created in Admin › Users.

- **Coach columns.** The 10 coach FKs (`coach_id` on the 3 roster and 3 class tables
  (standard, weekly, restructure), `set_coach_id` on the 3 class tables, and
  `club_meeting_attendees.coach_id`) reference `profiles(id)` ON DELETE RESTRICT. Deactivate
  people; don't delete them.
- **Unassigned.** Class `coach_id` is nullable: **NULL means unassigned**, and the board shows
  those classes in an "Unassigned" column at the end of the day. Roster `coach_id` stays NOT
  NULL. `coach_id` is the column a class sits in; `set_coach_id` is whose group it really is
  (NULL = the same coach, i.e. not a cover). Removing a coach from a day unassigns their classes
  rather than deleting them. Filter NULL with `.is(col, null)`, never `.eq(col, null)`.
- **Where coaches come from.** Coaches can read only their own `profiles` row, so the app uses
  two definer RPCs, each called once per page load:
  - `site_rota_roster(p_site_id)` → `id, full_name, job_title`: the **assignable** list, i.e.
    active profiles at that site titled Coach, Lead Coach or Club Head Coach. It feeds the
    add-coach picker, the class modal's Set coach list and the meeting attendee picker.
  - `site_rota_people(p_site_id)` → `id, full_name, active, site`: **names and status** for
    every profile that site's roster, class and meeting attendee rows reference, whatever their
    current `active` or `site`. A rota coach whose profile is inactive, or whose `site` isn't
    the rota's site, is flagged on the board and in the PDF.
  - Both return an empty set to anyone who can't read that site's rota.
- **App side.** `lib/rota/people.ts` turns both into one lookup (`makeDirectory`). Display names
  are first name + last initial ("Beth H"), or the full name where two people would share one.
  `resolve_profile_names()` is not used for rota or attendee names.

### Competition calendar data model
Since migration 0031. One shared events table that every Competitions page writes to and
the Competition Calendar reads.

- **`comp_events`** — one row per competition: `title` (1–200 chars), `event_type` (exactly
  one of `'NWG All Competition'`, `'NWG Club Competition'`, `'Invitational Competition'`,
  `'Regional/National Competition'`), `start_date` / `end_date` (`date`, end ≥ start),
  optional `venue`, `organiser`, `link`, `notes`, `source` (`'external'` | `'club'` |
  `'nwg'`, default `'external'`: which Competitions page created it), `created_by` →
  `profiles(id)` ON DELETE SET NULL (default `auth.uid()`), `created_at`, `updated_at`
  (client-set on edit, no trigger). `'NWG All Competition'` means every site attends; the
  app derives that from `event_type` (there is no all-sites flag). Duplicates (same title +
  start date) are warned about in the app, not blocked; a non-unique
  `(lower(title), start_date)` index supports the check.
- **`comp_event_sites`** — `(event_id, site_id)` PK; `event_id` → `comp_events` ON DELETE
  CASCADE, `site_id` → `rota_sites(id)` ON DELETE RESTRICT. Insert/delete only (no update
  policy). Head Office has no `rota_sites` row, so it can't be attached.
- **Access.** Every active user reads every event and event site. Any active user may create
  external events only, as themselves (`created_by = auth.uid()`, `source = 'external'`,
  `event_type` `'Invitational Competition'` or `'Regional/National Competition'`), and may
  attach or detach their own site on external events only. `manage_comp_events` holders may
  create (still as themselves), edit and delete any event, and attach or detach any site on
  any event.
- **Page.** `/competitions/calendar` (Season grid + List) reads these tables; it is
  read-only in Phase 3b (no inserts, updates or deletes from the page).

### Competition entries data model
Since migration 0032. External Competition Entries: one club entry per (external event,
site). Status RPCs and the guard trigger are 0033 (plus the gymnast delete lock, 0034);
the activity log and data removal are 0035. **No app code uses these tables until 0035 is
applied**, and until 0033 the gated
columns below are directly writable by `edit_comp_entries` holders.

- **`comp_external_details`** — `event_id` PK → `comp_events` ON DELETE CASCADE;
  `entry_deadline`, `organiser_payment_deadline` (`date`), shared by every club.
- **`comp_entries`** — `event_id` → `comp_events` and `site_id` → `rota_sites`, both
  RESTRICT; unique `(event_id, site_id)`, and `(event_id, site_id)` → `comp_event_sites`
  RESTRICT (the site must be attached to the event; an event or site attachment with
  entries can't be deleted). `status` (`draft`, `awaiting_signoff`, `collecting`,
  `po_request_sent`, `po_received`, `entered`, `completed`, `declined`, `withdrawn`;
  default `draft`), `uplift_pct` (0–100, default 20), `judges_required`, `notes`,
  `po_number`, `late_notice_acknowledged`, `decline_note` (required once `declined_at` is
  set), and who/when pairs (`*_by` → `profiles` SET NULL, `*_at`): `signoff_requested`,
  `signed_off`, `declined`, `pricing_confirmed`, `po_requested`, `po_received`, `entered`,
  `organiser_paid`, `completed`, `data_removed`. "Ready for PO" is not stored: the app
  derives it (status `collecting` and every non-withdrawn gymnast has `debt_added`, `paid`
  and `marked_paid_bars`). Parent price = `organiser_fee × (1 + uplift_pct/100)`, computed
  in the app; extras are not uplifted.
- **`comp_entry_fee_levels`**, **`comp_entry_extras`** — per entry (`label`, unique per
  entry ignoring case; `organiser_fee` / `price`); cascade with the entry.
- **`comp_entry_gymnasts`** — the only child data: `full_name`, `dob`, `notes`,
  `withdrawn_note`. `fee_level_id` (nullable in draft) must be on the same entry (composite
  FK, ON DELETE SET NULL (fee_level_id)). `debt_added`, `paid`, `amount_paid`,
  `credit_used`, `paid_date`, `marked_paid_bars`, `withdrawn` (+ `withdrawn_note`,
  required). Name and DOB are both set or both blank; data removal (0035) blanks name,
  DOB, `notes` and `withdrawn_note`, keeps the payment columns, sets
  `comp_entries.data_removed_at`, and none of the four is ever written to the activity log.
- **`comp_entry_gymnast_extras`** — `(entry_id, gymnast_id, extra_id)`; both FKs share
  `entry_id`, so the extra is on the gymnast's own entry. Insert/delete only.
- **`comp_entry_staff`** — `profile_id` → `profiles` RESTRICT, unique per entry;
  `staff_role` `coach` | `judge`; `transport` (`own_car`, `carpool`, `public_transport`,
  `taxi`, info only); `judge_approved_by/_at` (judges only; null = pending; an unapproved
  judge is removed, there is no rejected state).
- **Access.** Read an entry and all its rows (gymnasts included): own site or
  `view_all_sites`. Write: `edit_comp_entries` at the entry's site. Entries are inserted as
  yourself, in `draft`, with every gated column empty, for an external event; deleted only
  in `draft`; ordinary updates allowed at any status. A fee level or extra in use can't be
  deleted. Gymnast insert/update needs name and DOB and an entry whose data hasn't been
  removed. Staff are added with no judge approval. `comp_external_details`: every active
  user reads; `edit_comp_entries` holders insert/update (external events only);
  `manage_comp_events` deletes.
- **Gated columns (0033).** On `comp_entries`: `status`, `late_notice_acknowledged`,
  `decline_note`, `po_number`, every who/when pair, and `event_id` / `site_id` /
  `created_by`. On `comp_entry_staff`: `judge_approved_by/_at`.
- **Staff picker.** `comp_staff_candidates()` (definer) → `id, full_name, site` for every
  active profile company-wide, Head Office included; no email, job title or active flag.

### Competition entry actions
Since migration 0033. Every stage change goes through one definer RPC (`p_entry_id uuid`
unless shown); the gated columns can't be written directly (guard triggers raise `42501`).
Errors: `42501` not allowed, `P0002` not found, `55000` wrong stage / precondition,
`22023` missing input.

| RPC | Who | From → to |
|---|---|---|
| `comp_entry_request_signoff` | `edit_comp_entries` at site | draft or declined → awaiting_signoff (needs a gymnast, every gymnast's fee level, an entry deadline) |
| `comp_entry_sign_off(id, p_acknowledge_late)` | `sign_off_competitions` | awaiting_signoff → collecting (late = deadline − 28 days before today; must be acknowledged) |
| `comp_entry_decline(id, p_note)` | `sign_off_competitions` | awaiting_signoff → declined |
| `comp_entry_confirm_pricing` | `confirm_comp_pricing` at site | any open stage; no status change |
| `comp_entry_po_request_sent` | `edit_comp_entries` at site | collecting → po_request_sent (Ready for PO + prices confirmed) |
| `comp_entry_record_po_number(id, p_po_number)` | `edit_comp_entries` at site | po_request_sent → po_received; corrects it at po_received / entered |
| `comp_entry_mark_entered` | `edit_comp_entries` at site | po_received → entered |
| `comp_entry_mark_organiser_paid` | `edit_comp_entries` at site | at po_received / entered; no status change |
| `comp_entry_complete` | `edit_comp_entries` at site | entered → completed (on/after the event's end date) |
| `comp_entry_withdraw(id, p_reason)` | `edit_comp_entries` at site | awaiting_signoff … entered → withdrawn (final) |
| `comp_entry_approve_judge(p_staff_id)` | `approve_judges` | sets `judge_approved_by/_at` on a judge staff row |
| `comp_entry_undo_po_request` | `edit_comp_entries` at site | po_request_sent → collecting |
| `comp_entry_undo_entered` | `edit_comp_entries` at site | entered → po_received |
| `comp_entry_undo_organiser_paid` | `edit_comp_entries` at site | clears organiser paid at po_received / entered |

- **Price confirmation clears itself** when a fee level or extra is added, removed or
  repriced, or `uplift_pct` changes.
- **Lock.** From po_request_sent onward (and at completed / withdrawn), gymnasts can't be
  added, deleted (0034 — withdraw instead) or un-withdrawn, a non-withdrawn gymnast's fee
  level and extras can't change, and fee levels / extras can't be added, removed or
  repriced (`55000`). Withdrawing and payment fields stay editable. Deleting a draft entry
  still cascades to its gymnasts. 15 guard/lock/pricing triggers in all on the comp entry
  tables (14 from 0033, 1 from 0034).
- **Judge approval resets** when a staff row's person, role or entry changes.

### Competition activity log and data removal
Since migration 0035.

- **`comp_activity_log`** — one row per row change on `comp_events`, `comp_event_sites`,
  `comp_external_details`, `comp_entries`, `comp_entry_fee_levels`, `comp_entry_extras`,
  `comp_entry_gymnasts`, `comp_entry_gymnast_extras` and `comp_entry_staff`: `actor_id`
  (`auth.uid()`; null = system / SQL Editor), `created_at`, `tx_id` (one request), `table_name`,
  `op`, `row_id` / `row_key`, `entry_id`, `event_id`, `site_id`, `action`, `changes`
  (`{"col": {"old", "new"}}`, changed columns only), `redacted` (column names), `detail`. No
  FKs to the rows it describes, so it outlives deletes. Written only by the definer trigger
  `comp_activity_log_write()`; clients (and `service_role`) have select only.
- **Read.** Entry rows: own site or `view_all_sites` (on the copied `site_id`, so still after
  a draft entry is deleted). Event-level rows (`entry_id` null): every active user.
- **PII never enters the log as a value.** `comp_entry_gymnasts` is an allowlist (only `id`,
  `entry_id`, `fee_level_id`, the payment columns and `withdrawn` are logged; everything else,
  including `full_name`, `dob`, `notes`, `withdrawn_note`, is redacted). On `comp_entries`,
  `notes`, `decline_note` and `withdrawal_note` are redacted. Only their names appear, in
  `redacted`. A new PII column on any other comp table must be added to the logger's list.
- **Plain-English lines.** `action` is a fixed key the logger derives from the change
  (`request_signoff`, `sign_off`, `decline`, `confirm_pricing`, `pricing_cleared`,
  `po_request_sent`, `record_po_number`, `correct_po_number`, `mark_entered`,
  `mark_organiser_paid`, `undo_organiser_paid`, `complete`, `withdraw`, `undo_po_request`,
  `undo_entered`, `status_changed`, `approve_judge`, `judge_approval_reset`,
  `withdraw_gymnast`, `reinstate_gymnast`, `remove_gymnast_data`); null means an ordinary edit,
  described from `table_name`, `op` and the `changes` keys. Names (people, gymnasts) are looked
  up live from ids, never stored; group same-`tx_id` rows ("Added 9 gymnasts"). "Ready for PO"
  is derived in the app, not logged. A decline reason is not kept after resubmission.
- **Not logged:** no-op updates (only `updated_at` or identical values); child rows removed by
  a cascade (the parent's delete row stands for them); the removal's per-gymnast blanking.
- **Data removal.** `comp_entry_remove_gymnast_data(p_entry_id)`, `remove_comp_gymnast_data`
  (RGM, HOG). Only on a completed, declined or withdrawn entry, once the event's `end_date` is
  12 months or more before today (Europe/London), and once. Blanks `full_name`, `dob`, `notes`,
  `withdrawn_note` on every gymnast; sets `comp_entries.notes` to null and `decline_note` /
  `withdrawal_note` to `'[removed]'` where set; sets `data_removed_by/_at`; keeps fee levels,
  extras and payment columns. Logs one `remove_gymnast_data` line with
  `detail = {"gymnasts": N}`. Errors as 0033 (`42501`, `P0002`, `55000`). The app shows
  "Gymnast 1, 2…" afterwards (`created_at` order) and computes "due for removal"
  (`end_date` + 12 months); neither is stored.

### Seed row (include in the initial migration)
Historical: this is what 0001 inserted. `role` was dropped in 0028, so it no longer runs as
written.
```sql
insert into profiles (email, full_name, role, job_title, site, active) values
('jamie@nilewilsongymnastics.com', 'Jamie Harrison', 'admin', 'Head of Gymnastics', 'Head Office', true);
```

## Quick Links (v1)
Three links, all placeholder URLs (`#`) until real ones are provided:
- BARS
- ProActive
- British Gymnastics

Leave the structure as an array/list so more can be added without a rebuild.

## Working style — read this before building anything
- Confirm structural assumptions before writing code, especially anything involving
  data layout or navigation — get it wrong once already on this project (see rota tool
  history) and it cost a rebuild.
- Do not add unsolicited UI embellishments (colours, extra polish, "nice to have"
  touches) beyond what's been explicitly asked for.
- Present a plan and wait for explicit approval before scaffolding new features or
  expanding scope beyond what's listed above.
- Never build demo/preview toggles or switches into production code (e.g. a "view as
  admin/coach" switcher) — anything permission- or user-dependent must always read from
  the real, logged-in user's `profiles` row and capabilities. Toggles like this are fine in a static mockup
  for review purposes only, never in the actual app.
- Squad naming convention (relevant to other NWG tools, not this one): gem/mineral
  names — Ruby, Sapphire, Emerald, Diamond, Amethyst, Quartz, Amber, Opal, Topaz, Onyx,
  Turquoise, Bronze, Silver — plus preschool classes (Tiny Tumblers, Little Flippers,
  Preschool Open Play). Not used in this project's UI but useful context if referenced.
