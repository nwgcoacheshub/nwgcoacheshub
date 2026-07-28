# NWG Coaches Hub — v1 Technical Build Doc

## 1. Scope Recap

**Functional in v1** (real auth, real data, actually works):
- Login (no public sign-up)
- Dashboard/Home — auth-gated shell, greeting + role/site badges pulled from real data
- Users page (admin only) — full add/edit/deactivate/reset-password, backed by Supabase

**Visual placeholder only in v1** (built and styled, but static — no real links, no database, no functionality):
- Everything else on the Dashboard: search bar, "Report a concern" button, notifications bell, avatar, the "This week" hero (Weekly Focus + Pre-school theme), Programme content tiles, the "How do I…?" strip, What's New, My Compliance, Quick Links
- Rota nav item (will eventually point to the separate Rota Management Tool once that's live)

**This distinction matters for the build:** the dashboard looks like a fully-featured portal, but almost none of it is wired up yet. It's hardcoded markup for now — nothing to query, nothing to click through to. Only Login and Users are real, working features in this version.

**Explicitly out of scope for v1:**
- Any backend/data model for compliance tracking, programme resources, how-to guide content, or a news feed — these are real product questions (who enters the data, how it's kept current) for a future phase, not this build
- Self-service "forgot password"
- Coach self-editing their own profile
- Any CMS/admin content editor beyond the Users page

---

## 2. Pages & Routes

| Route | Page | Access |
|---|---|---|
| `/login` | Login | Public (only unauthenticated route) |
| `/` | Dashboard/Home | Any authenticated user |
| `/users` | Users | Admin only (redirect coaches away) |

## 3. Navigation

Top bar: **Home, Users** (admin only), **Rota** (placeholder link).

Two separate badges sit under the "Welcome back" heading:
- Role badge (orange) — company job title, e.g. "Head of Gymnastics"
- Site badge (neutral grey) — e.g. "Burnley"

---

## 4. Dashboard Layout (all placeholder content below "Users")

For reference when building the static markup — none of this queries real data in v1:

- **Top bar:** wordmark ("NWG Coaches Hub", text only — no logo icon), search input, "Report a concern" button, notification bell, avatar circle with initials
- **"This week" hero:** two-cell card — Weekly Focus (theme name, short description, focus-area chips) and Pre-school theme (theme name, description, 9-week cycle progress bar)
- **Programme content:** 6 tiles — Progression framework, Awards scheme, Skill progressions, Session resources, Pre-school cycle, Coaching masterclasses
- **"How do I…?" strip:** 3 columns — BARS how-tos, Other systems, Off-system processes — each a list of guide names with a status pill (Published / Draft / Not written)
- **Sidebar (in this order):** What's New → Quick Links → My Compliance
  - Quick Links: BARS, ProActive, British Gymnastics (icon, title, subtitle, external-link arrow) — placeholder `#` URLs until you send the real ones
  - My Compliance: rows for Safeguarding, First Aid, DBS, CPD hours, each with a status pill

---

## 5. Data Model

### `profiles` table

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, FK → `auth.users.id` |
| `email` | text | Synced from auth user |
| `full_name` | text | |
| `role` | text | Website permission: `'admin'` \| `'coach'` |
| `job_title` | text | Company job title (fixed dropdown, see below) |
| `site` | text | One of the 7 NWG sites, or `'Head Office'` for corporate/regional roles |
| `active` | boolean | Default `true`. Drives soft-delete/deactivation |
| `created_at` | timestamptz | Default `now()` |

Your row will be pre-seeded in the migration as `role = 'admin'`.

**`job_title` dropdown values:**
- Coach
- Lead Coach
- Club Head Coach
- Regional General Manager
- Head of Gymnastics
- Head of People
- Head of Operations

`job_title` is independent from `role` — e.g. a "Head of Operations" could still have website `role = 'coach'` (no Users-page access) unless explicitly given admin permissions.

### Everything else on the Dashboard
No tables needed for v1 — Weekly Focus, Programme tiles, How-do-I strip, What's New, and My Compliance are all hardcoded in the component code as static placeholder content. Quick Links is the one section with a known real destination eventually (external links) — everything else has no committed data source yet.

---

## 6. RLS Policies (`profiles`)

- **SELECT:** a user can read their own row; admins can read all rows.
- **UPDATE:** admins can update any row (`role`, `site`, `full_name`, `active`). Coaches cannot update any row, including their own.
- **INSERT / DELETE:** blocked entirely at the client level — only ever done via the server-side function below, using the service-role key.

---

## 7. Auth Flow & Account Provisioning

- Public sign-up disabled — the only way into the system is an admin-created account.
- Login page: email + password only, no "forgot password" link.
- **Deactivation approach:** an app-level gate — every protected page checks `profiles.active` on load and signs out/blocks access if `false`, rather than banning the underlying auth user directly.

---

## 8. Server-Side Function (service-role key required)

One small server-side endpoint (Vercel API route, service-role key as a server-only environment variable, never exposed to the browser).

**Two actions:**
1. **`createUser`** — takes name, email, role, job_title, site → creates the `auth.users` entry + inserts the matching `profiles` row.
2. **`resetPassword`** — takes a user id → generates a new temporary password, returned once to the admin's screen to pass along manually.

Editing role/site/name and deactivating a user are normal RLS-protected updates to `profiles` — no service-role function needed for those.

---

## 9. Design System

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
| Font | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` |
| Card style | White, 14px radius, layered shadow (`0 1px 3px rgba(40,48,56,.06), 0 6px 20px rgba(40,48,56,.05)`) |
| Wordmark | Text only ("NWG Coaches Hub"), ~20px, no icon mark |

Desktop-first; usable but not optimised on mobile.

---

## 10. File/Folder Structure (Next.js, App Router)

```
nwgcoacheshub/
├─ app/
│  ├─ login/
│  │  └─ page.tsx
│  ├─ (protected)/
│  │  ├─ layout.tsx              # auth check + nav
│  │  ├─ page.tsx                # Dashboard/Home
│  │  └─ users/
│  │     └─ page.tsx             # admin-only, redirects coaches
│  └─ api/
│     └─ admin/
│        ├─ create-user/route.ts
│        └─ reset-password/route.ts
├─ components/
│  ├─ NavBar.tsx
│  ├─ RoleBadge.tsx               # renders both role + site bubbles
│  ├─ dashboard/
│  │  ├─ WeeklyFocusHero.tsx      # placeholder content
│  │  ├─ ProgrammeTiles.tsx       # placeholder content
│  │  ├─ HowToStrip.tsx           # placeholder content
│  │  ├─ WhatsNewCard.tsx         # placeholder content
│  │  ├─ QuickLinksCard.tsx       # placeholder URLs, real ones to follow
│  │  └─ ComplianceCard.tsx       # placeholder content
│  └─ UsersTable.tsx              # real, functional
├─ lib/
│  ├─ supabaseClient.ts           # browser client, anon key
│  └─ supabaseAdmin.ts            # server-only client, service-role key
├─ supabase/
│  └─ migrations/
│     └─ 0001_init.sql            # profiles table, RLS policies, seed row
└─ tailwind.config.ts              # design tokens above as theme values
```

---

## 11. Future Phases (explicitly not this build)

Documented now so it's not forgotten, not because it's being worked on yet:
- Real compliance tracking: where the expiry data comes from, who updates it, whether it needs its own table per coach
- A real content/resource system behind Programme content and the How-do-I strip (likely the CMS-lite conversation from earlier — deferred until v1's shell is solid)
- A real news/updates feed behind What's New
- Wiring the Rota nav item through to the actual Rota Management Tool once it's live

---

## 12. Open Items

1. **Real Quick Link URLs** for BARS, ProActive, British Gymnastics — low priority since it's placeholder-only for now, but send whenever you have them.
2. Anything else you want adjusted before starting in Claude Code.
