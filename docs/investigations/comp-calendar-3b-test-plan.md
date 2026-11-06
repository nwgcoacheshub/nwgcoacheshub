# Competitions Phase 3b — Competition Calendar test plan

The page is `/competitions/calendar`. It's read-only: it never inserts, updates or deletes.
The nav item is disabled until Phase 4a, so open the page by typing the URL.

The seed and cleanup below are pastes for the Supabase SQL Editor. The editor runs as
`postgres`, which bypasses RLS, so `created_by` is left null. Every seed row's `notes`
starts with `[TEST SEED]`, and that marker is all the cleanup looks for.

"Today" is assumed to be **Fri 6 Nov 2026**, so the current week is w/c 2 Nov 2026. If you
test on another date, move event 7 into whatever the current week is.

## 0. Before: confirm the starting count

```sql
select count(*) as seed_rows from public.comp_events where notes like '[TEST SEED]%';
-- expect 0
```

## 1. Seed (single paste)

| # | Event | Type | Dates | Clubs | Covers |
|---|---|---|---|---|---|
| 1 | Aspire Mock Grades | Invitational | Sat 17 Jan 2026 | Rotherham | 1 site, past |
| 2 | Yorkshire Regional Preparation Grades | Regional/National | Sat 31 Jan 2026 | Leeds, Rotherham | 2 sites |
| 3 | Garstang Prep/Devel Grades | Invitational | Sat 7–Sun 8 Mar 2026 | Burnley | 2-day |
| 4 | NWG GfA Interclub | NWG All | Sun 29 Mar 2026 | all (from type) | All-clubs bar |
| 5 | Wolves Club Comp | NWG Club | Sun 19 Apr 2026 | Wolverhampton | club type |
| 6 | National Finals | Regional/National | Sat 23 May 2026 | Coventry, Mansfield, Rotherham | 3 sites; link that isn't a URL (shown as text, not a link) |
| 7 | Doncaster Floor and Vault | Invitational | Sat 7 Nov 2026 | Leeds | current week; venue, organiser, link and multi-line notes |
| 8 | Halloween Open | Invitational | Sat 31 Oct–Sun 1 Nov 2026 | Wirral | 2-day across a month end ("Sat 31 Oct–Sun 1 Nov") |
| 9 | NWG Classic Challenge Teams | NWG All | Sat 28–Sun 29 Nov 2026 | all | 2-day All-clubs bar |
| 10 | New Year Invitational | Invitational | Sat 2 Jan 2027 | Burnley, Wirral | in 2026's last grid row (w/c 28 Dec), but only in 2027's list |
| 11 | Yorkshire Opal, Crystal, Diamond | Regional/National | Sat 6 Feb 2027 | Leeds | 2027 |
| 12 | Spring Floor Open | Invitational | Sat 13 Mar 2027 | (none) | "No clubs yet" in the list; absent from the grid |
| 13 | NWG MAG Invitational | NWG All | Sat 8 May 2027 | all | 2027 All-clubs bar |

```sql
begin;

with ev as (
  insert into public.comp_events
    (title, event_type, start_date, end_date, venue, organiser, link, notes, source)
  values
    ('Aspire Mock Grades', 'Invitational Competition', '2026-01-17', '2026-01-17',
     null, null, null, '[TEST SEED]', 'external'),
    ('Yorkshire Regional Preparation Grades', 'Regional/National Competition', '2026-01-31', '2026-01-31',
     null, 'Yorkshire Gymnastics', null, '[TEST SEED]', 'external'),
    ('Garstang Prep/Devel Grades', 'Invitational Competition', '2026-03-07', '2026-03-08',
     'Garstang Leisure Centre', 'Garstang GC', null, '[TEST SEED] Two-day event.', 'external'),
    ('NWG GfA Interclub', 'NWG All Competition', '2026-03-29', '2026-03-29',
     null, null, null, '[TEST SEED]', 'nwg'),
    ('Wolves Club Comp', 'NWG Club Competition', '2026-04-19', '2026-04-19',
     'NWG Wolverhampton', null, null, '[TEST SEED]', 'club'),
    ('National Finals', 'Regional/National Competition', '2026-05-23', '2026-05-23',
     null, 'British Gymnastics', 'not a url', '[TEST SEED] Link is deliberately not a URL.', 'external'),
    ('Doncaster Floor and Vault', 'Invitational Competition', '2026-11-07', '2026-11-07',
     'Doncaster Gymnastics Centre', 'Doncaster GC', 'https://example.com/doncaster-floor-vault',
     E'[TEST SEED] Current-week event.\nSecond line of notes to check wrapping.', 'external'),
    ('Halloween Open', 'Invitational Competition', '2026-10-31', '2026-11-01',
     null, null, null, '[TEST SEED] Crosses a month end.', 'external'),
    ('NWG Classic Challenge Teams', 'NWG All Competition', '2026-11-28', '2026-11-29',
     null, null, null, '[TEST SEED]', 'nwg'),
    ('New Year Invitational', 'Invitational Competition', '2027-01-02', '2027-01-02',
     null, null, null, '[TEST SEED] Falls in the 2026 grid''s last row.', 'external'),
    ('Yorkshire Opal, Crystal, Diamond', 'Regional/National Competition', '2027-02-06', '2027-02-06',
     'Huddersfield Sports Centre', 'Yorkshire Gymnastics', null, '[TEST SEED]', 'external'),
    ('Spring Floor Open', 'Invitational Competition', '2027-03-13', '2027-03-13',
     null, null, null, '[TEST SEED] No clubs attached.', 'external'),
    ('NWG MAG Invitational', 'NWG All Competition', '2027-05-08', '2027-05-08',
     null, null, null, '[TEST SEED]', 'nwg')
  returning id, title
)
insert into public.comp_event_sites (event_id, site_id)
select ev.id, s.id
from ev
join (values
  ('Aspire Mock Grades', 'Rotherham'),
  ('Yorkshire Regional Preparation Grades', 'Leeds'),
  ('Yorkshire Regional Preparation Grades', 'Rotherham'),
  ('Garstang Prep/Devel Grades', 'Burnley'),
  ('Wolves Club Comp', 'Wolverhampton'),
  ('National Finals', 'Coventry'),
  ('National Finals', 'Mansfield'),
  ('National Finals', 'Rotherham'),
  ('Doncaster Floor and Vault', 'Leeds'),
  ('Halloween Open', 'Wirral'),
  ('New Year Invitational', 'Burnley'),
  ('New Year Invitational', 'Wirral'),
  ('Yorkshire Opal, Crystal, Diamond', 'Leeds')
) as m (title, site) on m.title = ev.title
join public.rota_sites s on s.name = m.site;

commit;

-- Check: expect 13 events and 13 site rows.
select
  (select count(*) from public.comp_events where notes like '[TEST SEED]%') as events,
  (select count(*) from public.comp_event_sites cs
     join public.comp_events e on e.id = cs.event_id
    where e.notes like '[TEST SEED]%') as event_sites;
```

## 2. Cleanup (single paste)

Deleting an event deletes its `comp_event_sites` rows too (ON DELETE CASCADE).

```sql
begin;
delete from public.comp_events where notes like '[TEST SEED]%';
commit;

-- Expect 0 and 0.
select
  (select count(*) from public.comp_events where notes like '[TEST SEED]%') as events,
  (select count(*) from public.comp_event_sites cs
     where not exists (select 1 from public.comp_events e where e.id = cs.event_id)) as orphan_sites;
```

## 3. Manual checklist

Run the whole checklist twice: once as a **Coach** account and once as a **Head of
Gymnastics** account. Both should see exactly the same events and all 7 club columns, since
every active user reads every row.

### Nav and route
- [ ] The Competitions dropdown lists **Competition Calendar** first, greyed out and not
      clickable, followed by the 4 existing disabled items.
- [ ] Typing `/competitions/calendar` opens the page. The breadcrumb reads "Home /
      Competitions / Competition Calendar".
- [ ] When logged out, the URL redirects to `/login`.

### Season grid (desktop)
- [ ] The default is the current year (2026) and the Season grid.
- [ ] Rows go from w/c 29 Dec (listed under **January 2026**, the leading-week rule) to
      w/c 28 Dec, with a month header row wherever the Monday's month changes.
- [ ] The columns are the 7 active sites in `sort_order`.
- [ ] On load the grid has scrolled to **w/c 2 Nov**: an orange-tinted row with "This week",
      showing Doncaster Floor and Vault under Leeds. Earlier weeks are dimmed.
- [ ] Scrolling the grid keeps the header row stuck at the top and the Week column stuck on
      the left. Month labels stay visible while scrolling sideways.
- [ ] NWG GfA Interclub (w/c 23 Mar) and NWG Classic Challenge Teams (w/c 23 Nov) each show as
      **one** orange bar across all columns, labelled "· Sun 29 · all clubs" / "· Sat 28–Sun 29 ·
      all clubs".
- [ ] Garstang shows "Sat 7–Sun 8" under Burnley. Halloween Open shows "Sat 31 Oct–Sun 1 Nov"
      under Wirral in w/c 26 Oct.
- [ ] National Finals appears in the Coventry, Mansfield and Rotherham columns.
- [ ] New Year Invitational appears in the last row (w/c 28 Dec) under Burnley and Wirral.
- [ ] A long title is cut off with "…" and doesn't widen its column.
- [ ] The 4 type colours are distinct: orange, magenta, blue and indigo.

### Filters
- [ ] With every club on, clicking **Leeds** shows only the Leeds column. NWG All events then
      appear as a pill in that column instead of a full-width bar.
- [ ] Clicking **Rotherham** after that adds it. Clicking Leeds and Rotherham off again (so
      no club is left) resets to every club.
- [ ] **All** resets to every club.
- [ ] Type chips hide and show their type. Turning the last type off resets to all types.
- [ ] Filters stay as they are when switching between Season grid and List.

### List
- [ ] The **List** link changes the URL to `?year=2026&view=list` without jumping the page.
- [ ] Months January to October 2026 start collapsed. November 2026 starts open. Clicking a
      month header expands or collapses it.
- [ ] Each row shows the date label, title, type pill and club chips (or "All clubs").
- [ ] New Year Invitational is **not** in the 2026 list.
- [ ] With a club filter active, the rows only show chips for the selected clubs.

### Year switch and empty year
- [ ] **›** goes to 2027, keeping the current view. The grid doesn't scroll to a current week
      and no week is dimmed or highlighted.
- [ ] In 2027's list, March shows Spring Floor Open with a grey **"No clubs yet"** chip. That
      chip disappears once a club filter is active, and the event is absent from the grid.
- [ ] `?year=2028` shows "No competitions in 2028 yet."
- [ ] `?year=abc` and `?year=1999` fall back to the current year.

### Event panel
- [ ] Clicking an event opens a drawer from the right showing the type pill, title and full
      dates (e.g. "Saturday 7 March 2026 – Sunday 8 March 2026").
- [ ] Doncaster shows its venue and organiser, a link that opens example.com in a new tab, and
      both lines of notes.
- [ ] National Finals shows "not a url" as plain text, not as a link.
- [ ] Clubs attending lists the event's clubs, "All clubs" for NWG All, or "No clubs yet" for
      Spring Floor Open.
- [ ] **Esc**, clicking the scrim and **✕** each close it, and focus goes back to the event
      that was clicked.
- [ ] Nothing in the panel lets you edit anything.

### Mobile (390px wide, DevTools)
- [ ] The page never scrolls sideways. The header, year switch, view switch and filter chips
      all wrap.
- [ ] The grid scrolls sideways and up/down **inside its card**, with the sticky header and
      Week column still working.
- [ ] List rows stack (date, then title and type, then clubs).
- [ ] The panel fills the screen width and still closes.

### Cleanup
- [ ] Run paste 2. Both counts are 0, and the page shows "No competitions in 2026 yet."
