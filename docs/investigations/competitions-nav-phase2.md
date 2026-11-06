# Competitions section — Phase 2: nav + landing page

Implemented 2026-11-06, following `competitions-nav-phase1.md`. No schema, migrations,
packages or shared components. Not committed.

## Files

- **Created** `app/(protected)/competitions/page.tsx`: heading + breadcrumb only
  (`Home / Competitions`), a copy of `gymnastics/page.tsx`. It sits inside the `(protected)`
  route group, so the layout's login check covers it. Nothing exists at `app/competitions/`.
- **Changed** `components/NavBar.tsx`: a new `<NavDropdown id="competitions">` between
  Gymnastics and Operations, active on `startsWith("/competitions")`, with no capability
  condition. It has 4 items, all `{ label, disabled: true }` (the same branch as HR Links / My
  Compliance): External Competition Entries, Club Competitions, NWG Competitions, Judging
  Platform. No sub-routes were created.
- **Changed** `CLAUDE.md` (nav row section only):
  - Added Competitions to the dropdown list and the item bullets, and `/competitions` to the
    landing-page sentence.
  - Fixed Phase 1 §6 discrepancies 1–3. People now lists Policies. Club Profile is
    described as the live `rota_sites`/`getSiteAccess()` list with no Head Office and a
    "No sites available" fallback. `/club-profile` is noted as a redirect, not a stub.
- **Created** this file.

## Notes

- **Icon:** NavBar.tsx uses no icon library. Every icon is an inline Lucide-style SVG. The
  trophy is Lucide's `trophy` paths, inlined in the same 16px / `strokeWidth="2"` style.
- **Discrepancy 4 not fixed:** the Phase 1 report's discrepancy 4 (dashboard hero
  "Open full overview →" is `href="#"` in CLAUDE.md but links to
  `/gymnastics/weekly-overview` live) is in the dashboard section, outside the nav section
  that the brief limited edits to.

## Verification

- `npm run build`: passes, 0 errors, 0 warnings. `/competitions` is listed as a dynamic route.
- `npm run lint`: passes with no output.
- `curl -I http://localhost:3000/competitions` while logged out: `307 Temporary Redirect`,
  `location: /login`.
- Still to do: Jamie checks the nav width at 1280px and 1366px.
