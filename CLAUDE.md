# NWG Coaches Hub

## What this is
An internal coaching intranet/dashboard for Nile Wilson Gymnastics (NWG), used across
seven UK sites: Burnley, Coventry, Leeds, Mansfield, Rotherham, Wirral, Wolverhampton
— plus Head Office for corporate/regional roles not tied to a single gym.

Purpose: surface weekly focus themes, programme resources, how-to/SOP guides, compliance
tracking, and quick links to external systems (e.g. BARS).

**This is NOT a class registration or gymnast management system** — BARS and other
existing tools already handle that. Do not build gymnast/class CRUD features here.

## v1 scope — DO NOT EXCEED WITHOUT EXPLICIT APPROVAL
- Static shell matching the agreed design mock (Tailwind, exact tokens below)
- Gated by Supabase Auth
- Hardcoded placeholder content for all dashboard sections
- No CMS, no admin panel, no content editing UI — content changes happen directly in
  the Supabase table editor for now

### Functional in v1
- Login (Supabase Auth)
- Users page (add / edit / deactivate / reset password — admin only)

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

**Nav row:** Home (active on dashboard), Users (only rendered if the logged-in user's
real `profiles.role === 'admin'`), Rota (placeholder href). Must always use real
session/profile data — see the rule against demo toggles below.

**Page head:** `Welcome back, {full_name}` (real data), breadcrumb "Home / Dashboard",
the two badges described above (real data), greeting subline with today's date, e.g.
"{day, date} · Here's what's on this week and everything you need to find."

**"This week" hero** — bordered card, two cells side by side (stack on mobile):
- Cell 1: eyebrow "WEEKLY OVERVIEW", heading "Handstand Alignment", body "This week's
  whole-club focus. Flat back, active shoulders, and consistent hollow-body positioning
  through conditioning and wall drills.", three chip tags ("Flat back" solid orange,
  "Active shoulders" and "Wall drills" neutral), link "Open full overview →" (href="#")
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

**Footer:** small text "NWG Coaches Hub · v1 dashboard", log out link.

Everything above except the greeting, the two badges, and Users nav-item visibility is
hardcoded placeholder content — no database tables, no fetching, just static markup.

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

## Supabase
- Project URL: `https://wwizreekicrjqwwptdmx.supabase.co`
- Publishable key: `sb_publishable_m_sRPnqR2n6ScIealVT_Iw_QGLwu6y8`
- Secret key: not yet added — required for the Users page's create-user and
  reset-password functions. This must be entered directly into `.env.local` (never
  committed, never pasted into chat) and must NOT use a `NEXT_PUBLIC_` prefix, since it
  bypasses Row Level Security and must never reach the browser.
- These belong in `.env.local` (git-ignored) — never hardcode or commit them
- Only live table in v1: `profiles`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, FK → `auth.users.id` |
| `email` | text | Synced from auth user |
| `full_name` | text | |
| `role` | text | Website permission: `'admin'` \| `'coach'` — controls Users-page access |
| `job_title` | text | Company job title — **fixed dropdown**, not free text (list below) |
| `site` | text | One of the 7 NWG sites, or `'Head Office'` |
| `active` | boolean | Default `true`. Drives soft-delete/deactivation on the Users page |
| `created_at` | timestamptz | Default `now()` |

`job_title` is independent from `role` — e.g. a "Head of Operations" could still have
website `role = 'coach'` unless explicitly given admin permissions. `job_title` does not
drive permissions or visibility; `role` alone controls that.

**`job_title` dropdown values (fixed list):**
- Coach
- Lead Coach
- Club Head Coach
- Regional General Manager
- Head of Gymnastics
- Head of People
- Head of Operations

### Seed row (include in the initial migration)
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
  admin/coach" switcher) — anything role- or user-dependent must always read from the
  real, logged-in user's `profiles` row. Toggles like this are fine in a static mockup
  for review purposes only, never in the actual app.
- Squad naming convention (relevant to other NWG tools, not this one): gem/mineral
  names — Ruby, Sapphire, Emerald, Diamond, Amethyst, Quartz, Amber, Opal, Topaz, Onyx,
  Turquoise, Bronze, Silver — plus preschool classes (Tiny Tumblers, Little Flippers,
  Preschool Open Play). Not used in this project's UI but useful context if referenced.
