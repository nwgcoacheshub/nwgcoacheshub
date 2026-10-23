# Rota Retcon — Phase 2, Phase A findings

Read-only re-verification from `supabase/migrations/0001–0028`. Not checked against the live DB.

## 1. Tables, FKs, ON DELETE (10 FKs, 9 data tables)

Data tables truncated: rota_standard_roster, rota_standard_classes, rota_weekly_rotas, rota_weekly_roster,
rota_weekly_classes, rota_restructures, rota_restructure_roster, rota_restructure_classes, club_meeting_attendees.
Reference tables untouched: rota_sites, rota_categories, rota_class_catalogue.

All FKs are inline `references` (0002, 0016, 0022), never renamed, so names are the Postgres default `<table>_<column>_fkey`
(inferred; the verification file's pre-flight query confirms them live).

| # | Constraint | Old ON DELETE |
|---|---|---|
| 1 | rota_standard_roster_coach_id_fkey | cascade |
| 2 | rota_standard_classes_coach_id_fkey | cascade |
| 3 | rota_standard_classes_set_coach_id_fkey | set null |
| 4 | rota_weekly_roster_coach_id_fkey | cascade |
| 5 | rota_weekly_classes_coach_id_fkey | cascade |
| 6 | rota_weekly_classes_set_coach_id_fkey | set null |
| 7 | rota_restructure_roster_coach_id_fkey | cascade |
| 8 | rota_restructure_classes_coach_id_fkey | cascade |
| 9 | rota_restructure_classes_set_coach_id_fkey | set null |
| 10 | club_meeting_attendees_coach_id_fkey | cascade |

## 2. Other dependents on rota_coaches / club_meeting_attendees: zero

Only the 10 FKs, the tables' own policies/indexes, and the 0028 revokes. No views, triggers, sequences or functions.
upsert_weekly_rota and upsert_restructure only copy coach_id values (verified, unmodified).

## 3. Truncate cascade

club_meeting_attendees has no inbound FKs; club_meetings and club_meeting_cycle_weeks are unaffected. The 8 rota data
tables are referenced only by each other, so one TRUNCATE listing all 9 needs no CASCADE.

## 4. ON DELETE for new FKs: RESTRICT on all 10 (approved)

Consequence: `profiles.id` references `auth.users(id) ON DELETE CASCADE` (0001 line 6). Deleting an auth user who is on any
rota or meeting will now fail on the cascade to profiles. Deactivate instead.

## 5. New function

`public.site_rota_roster(p_site_id uuid) returns table (id uuid, full_name text, job_title text)`,
security definer, stable, search_path = ''. Rows: active profiles whose site = rota_sites.name for p_site_id and job_title in
(Coach, Lead Coach, Club Head Coach). Access mirrors `rota_standard_roster_select_own_site_or_view_all` (0026):
is_active_coach() AND (has_capability('view_all_sites') OR caller's profiles.site = that site's name). Otherwise empty set.
REVOKE from public and anon; GRANT to authenticated.
Note: resolve_profile_names uses search_path = public (0014); the new function uses '' as instructed.

## 6. Next migration number: 0029

## Policy audit (follow-up)

### club_meeting_attendees — 4 policies (current text, 0026), none reference rota_coaches

```sql
create policy "club_meeting_attendees_select_own_site_or_view_all"
on public.club_meeting_attendees for select to authenticated
using (
  public.is_active_coach()
  and (
    public.has_capability('view_all_sites')
    or exists (
      select 1 from public.club_meetings m
      join public.rota_sites s on s.id = m.site_id
      join public.profiles p on p.site = s.name
      where m.id = club_meeting_attendees.meeting_id and p.id = auth.uid()
    )
  )
);

create policy "club_meeting_attendees_insert_manage_meetings_site"
on public.club_meeting_attendees for insert to authenticated
with check (
  public.is_active_coach()
  and public.has_site_capability('manage_club_meetings',
    (select m.site_id from public.club_meetings m where m.id = club_meeting_attendees.meeting_id))
);

create policy "club_meeting_attendees_update_manage_meetings_site"
on public.club_meeting_attendees for update to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability('manage_club_meetings',
    (select m.site_id from public.club_meetings m where m.id = club_meeting_attendees.meeting_id))
)
with check (
  public.is_active_coach()
  and public.has_site_capability('manage_club_meetings',
    (select m.site_id from public.club_meetings m where m.id = club_meeting_attendees.meeting_id))
);

create policy "club_meeting_attendees_delete_manage_meetings_site"
on public.club_meeting_attendees for delete to authenticated
using (
  public.is_active_coach()
  and public.has_site_capability('manage_club_meetings',
    (select m.site_id from public.club_meetings m where m.id = club_meeting_attendees.meeting_id))
);
```
(Whitespace condensed; source: `0026_capability_helpers.sql` lines 1042–1115.)

### rota_ policies referencing rota_coaches in USING / WITH CHECK

Total: **4**, all on `rota_coaches` itself (0026 lines 400–447: `_select_own_site_or_view_all`, `_insert_edit_rota_site`,
`_update_edit_rota_site`, `_delete_edit_rota_site`). They are dropped with the table. **No policy on any other rota_ table
references rota_coaches** (grep of 0001–0028). Rewrites needed: **0**.
