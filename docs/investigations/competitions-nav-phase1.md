# Competitions section — Phase 1: nav + route investigation

Read-only investigation, 2026-11-06. No code, schema or config changed. The only file
written is this report.

Files read in full: `CLAUDE.md`, `nwg-coaches-hub-v1-build-doc.md`, `components/NavBar.tsx`,
`app/(protected)/layout.tsx`, `app/layout.tsx`, `proxy.ts`, `next.config.ts`,
`lib/capabilities.ts`, `lib/getCurrentProfile.ts`, `lib/admin-guard.ts`,
`lib/supabaseServer.ts`, `app/robots.ts`, and every page under
`app/(protected)/{gymnastics,operations,people,club-profile,admin,settings}/`.

Repo-wide search for `Weekly Overview` / `Site SOPs` / `HR Links` / `My Compliance` (app,
components, lib, docs at root) matched 6 files:

- `components/NavBar.tsx`: the only nav definition
- `app/(protected)/gymnastics/weekly-overview/page.tsx`, `app/(protected)/operations/page.tsx`,
  `app/(protected)/operations/site-sops/page.tsx`: page headings, breadcrumbs, landing cards
- `CLAUDE.md`, `nwg-coaches-hub-v1-build-doc.md`: docs

A search for `competition` (case-insensitive) across `app`, `components`, `lib`,
`supabase`, `reference` and both docs matched only 2 lines of seed data in
`supabase/migrations/0007_club_profile_schema.sql`: the club role `'Club competition'`
(Admin category) and `'Competition Co-ordinator'` (Co-ordinators category). No route,
component or nav item uses the word yet.

---

## 1. How the nav is defined

**There's one hard-coded JSX component, not a config.** Everything lives in
`components/NavBar.tsx` (a `"use client"` component), which `app/(protected)/layout.tsx`
renders once for every protected page.

- **Building blocks** (both are local to `NavBar.tsx` and not exported):
  - `NavLink` is a flat `<a>` tab. Home and Settings use it.
  - `NavDropdown` is a `<button>` trigger with a chevron, and when open it shows an absolutely
    positioned panel of items. Club Profile, Gymnastics, Operations, People and Admin use it.
  - `type DropdownItem = { label; href } | { label; disabled: true }` is the item union.
- **Order is JSX order:** Home → Club Profile → Gymnastics → Operations → People → Admin
  (conditional) → Settings. Each dropdown is its own `<NavDropdown … />` block with an
  inline SVG icon and an inline `items={[…]}` array. There's no shared array of sections to
  edit.
- **Dropdown behaviour:** `openMenu` state holds one id string, so only one menu is open at a
  time. `containerRefs`/`triggerRefs` are keyed by that same id. A `mousedown` outside the open
  container closes it, and Escape closes it and returns focus to the trigger. Clicking an item
  also toggles the menu closed. Each new dropdown needs a unique `id` that's used in 4 places
  in its block: `id`, `open={openMenu === id}`, `containerRefs.current[id]` and
  `triggerRefs.current[id]`.
- **Active state** comes from `usePathname()` with a per-item prefix test:
  - Home: `pathname === "/"`
  - Club Profile: `startsWith("/club-profile")`
  - Gymnastics: `startsWith("/gymnastics")`
  - Operations: `startsWith("/operations") || startsWith("/rota")` (the only multi-prefix
    case)
  - People: `startsWith("/people")`, Admin: `startsWith("/admin")`, Settings:
    `startsWith("/settings")`
  - Active styling is an orange 3px bottom border plus orange text, on the trigger only.
    Dropdown items have no active state.
- **Links are plain `<a href>`, not `next/link`.** Every nav click is a full document
  navigation, so the protected layout's server checks run again on every click.
- **Desktop vs mobile:** there's **no mobile variant**. There's no hamburger, no drawer and no
  responsive breakpoint in `NavBar.tsx`. The nav row is a single `flex` row with no wrap and no
  `overflow-x`. This fits CLAUDE.md's "desktop-first; usable but not optimised for mobile".

## 2. Disabled placeholders and "coming soon"

- **Disabled items** are the `{ label, disabled: true }` branch of `DropdownItem`. They
  render as a `<span aria-disabled="true">` in `text-slate-light` with `cursor-default`, with
  no href, no route and no click handler.
- There are **5 disabled items today**: Programme Resources and Coaching Guides
  (Gymnastics), HR Links and My Compliance (People), and Club Profile's empty-state
  "No sites available" fallback.
- **There's no shared "coming soon" page or component.** The text "coming soon" appears nowhere
  in `app`/`components`/`lib`. The nearest thing is the **bare stub page**, which 4 files use:
  `gymnastics/page.tsx`, `operations/site-sops/page.tsx`, `people/page.tsx` and
  `settings/page.tsx`. Each one copies the same ~10 lines: `<main className="mx-auto
  max-w-[1280px] p-6">`, an `<h1>` and a plain-text breadcrumb, with **an empty body and no
  "coming soon" message**.
- **Can the existing pattern render an enabled link to a coming-soon page? Yes, and the nav
  needs nothing new for it.** An enabled item is just `{ label, href }`, the same shape as
  `Site SOPs → /operations/site-sops`, which already links to an empty stub. The
  `disabled` branch isn't involved at all.
- **What's missing is a body for the pages.** Phase 2 has two options:
  - **(a)** Follow the Site SOPs stub exactly: heading + breadcrumb, an empty body, 4
    copy-pasted files. This is consistent with what exists, but nothing on the page actually
    says "coming soon".
  - **(b)** Add the heading/breadcrumb stub plus one line of "coming soon" body text. That's
    either inline in each of the 4 pages, or in a small shared component (for example
    `components/ComingSoon.tsx`) that takes `title` and `breadcrumb` props.

  The brief asks for a "coming soon" shell, so **(b)** is the closer match. Whether it's a
  shared component or inline text is Jamie's call. CLAUDE.md's no-embellishment rule
  suggests keeping it to plain text styled with existing tokens: no illustration, icon or
  card.

## 3. Role-gating and route protection

**Nav gating.** There's exactly 1 gated nav item: Admin, which is wrapped in
`{canManageUsers && (…)}`. `app/(protected)/layout.tsx` computes `canManageUsers` as
`caps.has("manage_users")` from `getCapabilities()` (the `my_capabilities()` RPC, behind
React `cache()`, failing closed to an empty set). Club Profile's item *list* is also scoped,
because it uses `getSiteAccess()` sites, but its trigger always shows. Gymnastics, Operations
and People have no gating. **If a Competitions dropdown is written without a conditional, it
renders for every user who reaches the layout.**

**Route protection** is layered:

1. **`proxy.ts`** (Next 16's renamed middleware): its matcher covers every path except
   static assets. It **only refreshes the Supabase session cookie** (`auth.getUser()`). It
   doesn't redirect or block anything, and its comment says so.
2. **`app/(protected)/layout.tsx`** is the real gate. It calls `getCurrentProfile()` →
   no user → `redirect("/login")`. Then no profile or `active = false` →
   `redirect("/auth/signout")`. This applies to every route nested under the `(protected)`
   route group.
3. **Per-page checks** are only used where a capability is needed. `admin/page.tsx` and
   `admin/users/page.tsx` redirect non-`manage_users` users to `/`. Other pages, like
   policies, read capabilities only to decide which actions to show.
4. **RLS** enforces every data read and write. That doesn't matter for Competitions until it
   has data.

**Is a new `/competitions/*` route automatically protected? Yes, but only if its folder
goes at `app/(protected)/competitions/`.** A folder at `app/competitions/` (outside the
route group) would get only the proxy's cookie refresh, and anyone could reach it
unauthenticated. This is the one placement mistake that would break the "auth-gated" rule.

**Will an ungated item show for every active coach? Yes.** Signed-out and inactive users never
reach the nav, because the layout redirects them first. Every active profile of any job title,
including `Coach`, which holds no capabilities, sees every ungated item. No new capability is
needed, and none should be added to `lib/capabilities.ts` / `title_has_capability()` /
`my_capabilities()`.

## 4. Everywhere that changes for a new dropdown with 4 sub-pages

**Required:**

| # | File | Change |
|---|---|---|
| 1 | `components/NavBar.tsx` | New `<NavDropdown id="competitions" …>` block between the Gymnastics and Operations blocks: icon SVG, `label="Competitions"`, `active={pathname.startsWith("/competitions")}`, 4 `{label, href}` items |
| 2 | `app/(protected)/competitions/page.tsx` | New landing stub (see §5) |
| 3 | `app/(protected)/competitions/external-entries/page.tsx` | New coming-soon stub |
| 4 | `app/(protected)/competitions/club/page.tsx` | New coming-soon stub |
| 5 | `app/(protected)/competitions/nwg/page.tsx` | New coming-soon stub |
| 6 | `app/(protected)/competitions/judging/page.tsx` | New coming-soon stub |
| 7 | `CLAUDE.md` | Nav row section: add Competitions to the dropdown list and the bullet list; add `/competitions` to the "parent landing page" sentence |
| 8 | *(optional)* `components/ComingSoon.tsx` | Only if option (b)-shared from §2 is chosen |

**Checked, and no change needed:**

- **Mobile nav:** none exists (§1).
- **Breadcrumbs:** there's no breadcrumb component. Each page hard-codes its own
  `Home / Section / <b>Page</b>` text, matched in 17 files under `app/` plus 2 `*Unavailable`
  components. So breadcrumbs live inside items 2–6 and there's nothing central to update.
- **Page titles/metadata:** only `app/layout.tsx` exports `metadata` (title "NWG Coaches
  Hub", noindex). No page sets `metadata` or `generateMetadata`, so every tab is titled "NWG
  Coaches Hub". New pages follow suit unless per-page titles are wanted, which would be new
  scope across the app.
- **Search:** the top-bar `<input>` in `NavBar.tsx` is non-functional, with no handler and no
  index, so there's nothing to register.
- **Dashboard links:** the only internal links from dashboard components are
  `WeeklyFocusHero` → `/gymnastics/weekly-overview` and `WhatsNewCard` → `/whats-new`.
  Programme tiles and the How-to strip are all `href="#"`. Nothing on the dashboard
  enumerates nav sections.
- **`robots.ts` / `next.config.ts`:** these are disallow-all and global headers on `/:path*`,
  so new routes are covered automatically.
- **No `loading.tsx` / `error.tsx` / `not-found.tsx`** exists anywhere under `app/`, so
  there's no per-segment boilerplate to copy.
- **`nwg-coaches-hub-v1-build-doc.md`:** this is historical and already stale (see §6). It
  doesn't need updating unless Jamie wants it kept current.

## 5. Route slugs

Proposed (the brief's starting point, which I'd keep):

| Nav label | Route |
|---|---|
| External Competition Entries | `/competitions/external-entries` |
| Club Competitions | `/competitions/club` |
| NWG Competitions | `/competitions/nwg` |
| Judging Platform | `/competitions/judging` |

- **No conflicts.** `app/` has no `competitions` folder in or out of `(protected)`, there's no
  `/api/competitions`, and `proxy.ts`/`next.config.ts` have no rewrites or redirects. There are
  no dynamic segments at `app/(protected)/[x]` that could shadow it.
- `club` / `nwg` are short but unambiguous under the `/competitions/` prefix. If Club
  Competitions ever becomes per-site, `/competitions/club/[siteSlug]` nests cleanly beneath
  it, matching `/club-profile/[siteSlug]`. The more explicit alternative,
  `/competitions/club-competitions`, repeats the parent and isn't needed.
- **`/competitions` index: a stub landing page, not a redirect.** CLAUDE.md says every
  dropdown parent (`/club-profile`, `/gymnastics`, `/operations`, `/people`, `/admin`,
  `/settings`) "still exists as a stub route for direct navigation". The 2 parents that
  redirect (`/club-profile` → own site, `/rota` → own site) do it because they're per-site
  with no content of their own, and Competitions is group-wide. There are 2 landing styles to
  choose between:
  - **bare** (`/gymnastics`, `/people`): heading + breadcrumb only.
  - **link cards** (`/operations`, `/admin`): one card per sub-item, using the standard card
    classes.

  The bare style is the minimal match. Cards would be a small addition Jamie should approve
  explicitly.

## 6. CLAUDE.md nav section vs the live nav

The order (Home, Club Profile, Gymnastics, Operations, People, Admin, Settings), the set of 5
dropdowns, Gymnastics (3 items, 1 live + 2 disabled), Operations (2 items, both live), Admin
(1 item, `manage_users`-gated) and Settings all **match**. There are **4 discrepancies**:

1. **People has 3 items live vs 2 in CLAUDE.md.** CLAUDE.md lists HR Links and My Compliance
   (both disabled). Live has HR Links (disabled), My Compliance (disabled) and **Policies**
   (enabled, `/people/policies`), so Policies is missing from CLAUDE.md. Note that the brief's
   own context line already lists Policies correctly.
2. **Club Profile items are different in kind.** CLAUDE.md lists 8 fixed, inert entries (7
   sites + Head Office) with "no per-site route". Live builds the list from `rota_sites` via
   `getSiteAccess()`, every entry is an **enabled** link to `/club-profile/{slug}`,
   `view_all_sites` holders see every site and other users see only their own (1). **Head
   Office never appears** (there's no `rota_sites` row), and an empty list shows 1 disabled
   "No sites available". `app/(protected)/club-profile/[siteSlug]/page.tsx` exists.
3. **`/club-profile` landing.** CLAUDE.md lists it among parents that "still exist as a stub
   route". Live, it redirects to `/club-profile/{homeSlug}`, or renders
   `ClubProfileUnavailable`.
4. **Dashboard hero link** (in the dashboard section, next to the nav section). CLAUDE.md
   says "Open full overview →" is `href="#"`. Live, `WeeklyFocusHero` links to
   `/gymnastics/weekly-overview`.

Also worth knowing: `nwg-coaches-hub-v1-build-doc.md` §2/§3/§10 are well out of date. They
describe a `/users` route (now `/admin/users`) and a nav of "Home, Users, Rota". This doesn't
affect Phase 2.

Discrepancies 1–3 fall inside the CLAUDE.md block that Phase 2 edits anyway, so they could be
corrected in the same edit if Jamie wants. That would be a scope addition to approve, not an
assumption.

## 7. Risks and assumptions worth challenging

1. **Mixed placeholder conventions.** The decision makes Competitions' 4 not-yet-built pages
   *enabled* links to stubs. Meanwhile 4 equally unbuilt items (Programme Resources, Coaching
   Guides, HR Links, My Compliance) stay *disabled*. Site SOPs already sets a precedent for
   enabled-to-stub, so this isn't new, but the nav will now carry both conventions side by
   side. It's worth deciding which one is the rule going forward.
2. **Folder placement is the only security-relevant decision.** Pages must go under
   `app/(protected)/`. A misplaced `app/competitions/` would be publicly reachable (§3).
   Phase 2 verification should load a Competitions URL while signed out and confirm the
   redirect to `/login`.
3. **Nav width.** The row has no wrap or overflow handling. A rough estimate from
   classes (px-4 per tab, 16px icon, 12px chevron, 14px semibold labels) puts the current row
   at ~1,000px and an 8-tab row with "Competitions" at ~1,160px for a `manage_users` holder,
   inside the 1,280px max width. The row starts clipping or forcing a horizontal page scroll
   below roughly a 1,180px viewport (today it's ~1,020px). That's acceptable under
   "desktop-first", but it's the 8th tab, so the next one will hurt. This is an estimate, not
   measured, and Phase 2 should check it in a browser at 1280 and ~1100px.
4. **Icon choice is design work.** Every dropdown has a bespoke inline SVG. A trophy or medal
   glyph in the same stroke style (24 viewBox, `strokeWidth="2"`) is the obvious fit, but
   it's a visual choice Jamie should confirm rather than have invented.
5. **"Club Competitions" vs Club Profile.** The name may read as per-site because of Club
   Profile's per-site pattern, and 0007 seeds a per-site `'Club competition'` club role and a
   `'Competition Co-ordinator'` role. The decision says group-wide. If a later phase links
   those club roles to Competitions, that's a per-site data relationship to design then.
   Nothing about the Phase 2 slug blocks it.
6. **"Judging Platform" as internal.** The name suggests it may end up as, or link to, an
   external system (like BARS in Quick Links). The decision says internal route for now. If
   it later goes external, the nav item becomes `{label, href: "https://…"}`, which
   `NavDropdown` renders as a same-tab `<a>` with no external-link affordance or
   `target`. That's a small nav change to plan for then.
7. **"Coming soon" text is new copy.** No existing stub shows any. The exact wording should be
   given in the Phase 2 brief so it isn't invented.
8. **Breadcrumb inconsistency, FYI and out of scope.** Rota pages use `Home / Rota` although
   Rota sits under Operations. The Competitions stubs should use
   `Home / Competitions / <b>{Page}</b>`, the same as `Home / Operations / Site SOPs`.
9. **Pre-existing uncommitted changes.** The working tree already has 3 modified files
   (`club-profile/[siteSlug]/page.tsx`, `ClubQuickLinks.tsx`, `StaffRolesModal.tsx`) and 2
   untracked investigation docs from other work. A Phase 2 commit should stage only its own
   files.
