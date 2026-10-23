# Rota Retcon — Phase 2d, Phase B report

Adds `site_rota_people(uuid)` to the unapplied `0029_rota_retcon.sql`. The app needs it to flag coaches who have moved
site or been deactivated. Nothing was applied, no SQL was run and nothing was committed to git.

## Changes

**`supabase/migrations/0029_rota_retcon.sql`**
- New **step 7**: `public.site_rota_people(p_site_id uuid) returns table (id uuid, full_name text, active boolean, site text)`,
  `language sql`, `security definer`, `stable`, `set search_path = ''`. It sits inside the existing `begin;` (line 30) /
  `commit;` (line 261) transaction, after the `site_rota_roster` grants.
- Rows: each distinct, non-NULL profile id referenced by the site's rows, whatever that profile's current `active` or
  `site`. The ids are combined with `UNION` and joined to `profiles` once.
- Access: identical to `site_rota_roster`, i.e. `is_active_coach()` and (`has_capability('view_all_sites')` or the
  caller's `profiles.site` name-matching the `rota_sites` row). Anyone else gets an empty set.
- Grants: `revoke execute ... from public`, `revoke execute ... from anon`, `grant execute ... to authenticated`.
- A comment block covers purpose, access, why the function takes a site rather than an id array, and the
  alias-qualification and cast convention.
- The header step list gains "7. Add site_rota_people(uuid) and its grants."

**`docs/investigations/rota-retcon-0029-verification.md`**
- New post-apply check **3a**: `routine_privileges` and `pg_proc` for `site_rota_people`. `proacl` should have no PUBLIC
  or anon entry, `prosecdef` should be true and `proconfig` should be `{search_path=""}`.
- An anon `curl` POST to `/rest/v1/rpc/site_rota_people` is added after the `site_rota_roster` one in section 5, using the
  same `$NEXT_PUBLIC_SUPABASE_ANON_KEY` placeholder.

## Approved choices (Phase A)

1. NULLs: an explicit `refs.coach_id is not null` filter, even though the inner join already drops NULL.
2. The access check is copied verbatim from `site_rota_roster`.
3. Attendees of inactive meetings (`club_meetings.active = false`) are included. There is no filter on meeting status.
4. Results are ordered by `p.full_name`, as `site_rota_roster` is.

## Join columns (confirmed in Phase A)

| Source | Columns | Site link | Citation |
|---|---|---|---|
| rota_standard_roster | coach_id | site_id | 0002 L48, L50 |
| rota_standard_classes | coach_id, set_coach_id | site_id | 0002 L66, L68–69 |
| rota_weekly_roster | coach_id | weekly_rota_id → rota_weekly_rotas.site_id | 0002 L92, L94; L83 |
| rota_weekly_classes | coach_id, set_coach_id | weekly_rota_id → rota_weekly_rotas.site_id | 0002 L111, L113–114; L83 |
| rota_restructure_roster | coach_id | restructure_id → rota_restructures.site_id | 0016 L33, L35; L25 |
| rota_restructure_classes | coach_id, set_coach_id | restructure_id → rota_restructures.site_id | 0016 L52, L54–55; L25 |
| club_meeting_attendees | coach_id | meeting_id → club_meetings.site_id | 0022 L58–59; 0020 L49 |

## Confirmations

- **Select line**: line 241 of `0029_rota_retcon.sql` reads exactly
  `  select p.id, p.full_name::text, p.active, p.site::text`
  (checked with `grep -x`).
- **refs union branches**: exactly **10** `select` branches joined by 9 `union`s (counted with awk inside the `with refs`
  block):
  1. rota_standard_roster.coach_id
  2. rota_standard_classes.coach_id
  3. rota_standard_classes.set_coach_id
  4. rota_weekly_roster.coach_id
  5. rota_weekly_classes.coach_id
  6. rota_weekly_classes.set_coach_id
  7. rota_restructure_roster.coach_id
  8. rota_restructure_classes.coach_id
  9. rota_restructure_classes.set_coach_id
  10. club_meeting_attendees.coach_id
- Only the two 0029 files were edited; this report is new. No SQL was run, no `supabase db push`, no git writes.

## Full diff

```diff
diff --git a/private/tmp/claude-502/-Users-nwg-dev-nwgcoacheshub/724dfb50-f36b-4b68-ae44-4c5c6aa0b667/scratchpad/orig/0029_rota_retcon.sql b/supabase/migrations/0029_rota_retcon.sql
index 435ed03..8dd51bc 100644
--- a/private/tmp/claude-502/-Users-nwg-dev-nwgcoacheshub/724dfb50-f36b-4b68-ae44-4c5c6aa0b667/scratchpad/orig/0029_rota_retcon.sql
+++ b/supabase/migrations/0029_rota_retcon.sql
@@ -17,6 +17,7 @@
 --   5. Make coach_id nullable on the 3 class tables (standard, weekly,
 --      restructure). Roster coach_id stays NOT NULL.
 --   6. Add site_rota_roster(uuid) and its grants.
+--   7. Add site_rota_people(uuid) and its grants.
 --
 -- coach_id IS NULL on a class row means an unassigned class.
 --
@@ -169,4 +170,92 @@ revoke execute on function public.site_rota_roster(uuid) from public;
 revoke execute on function public.site_rota_roster(uuid) from anon;
 grant execute on function public.site_rota_roster(uuid) to authenticated;
 
+-- ---------------------------------------------------------------------------
+-- 7. site_rota_people(uuid)
+-- ---------------------------------------------------------------------------
+--
+-- Everyone a site's rota and meeting rows point at: each distinct, non-NULL
+-- profile id in coach_id or set_coach_id across the standard, weekly and
+-- restructure roster and class tables, and in club_meeting_attendees.coach_id,
+-- for the rota_sites row p_site_id. Returns id, full_name, active and site
+-- whatever the profile's current active or site, so the app can flag coaches
+-- who have moved site or been deactivated. Coaches can otherwise read only
+-- their own profiles row.
+--
+-- Access is identical to site_rota_roster: is_active_coach() and either
+-- view_all_sites or the caller's profiles.site name-matching p_site_id.
+-- Anyone else gets an empty set, not an error.
+--
+-- It takes a site, not an array of ids, so it can only reveal profiles that
+-- the site's rows already reference, and only to callers who can read that
+-- site's rota. An id-array argument would let any caller look up the active
+-- and site of any profile id they held.
+--
+-- Output columns are alias-qualified and cast to text, as in site_rota_roster.
+
+create function public.site_rota_people(p_site_id uuid)
+returns table (id uuid, full_name text, active boolean, site text)
+language sql
+security definer
+stable
+set search_path = ''
+as $$
+  with refs (coach_id) as (
+    select r.coach_id from public.rota_standard_roster r
+      where r.site_id = p_site_id
+    union
+    select c.coach_id from public.rota_standard_classes c
+      where c.site_id = p_site_id
+    union
+    select c.set_coach_id from public.rota_standard_classes c
+      where c.site_id = p_site_id
+    union
+    select r.coach_id from public.rota_weekly_roster r
+      join public.rota_weekly_rotas w on w.id = r.weekly_rota_id
+      where w.site_id = p_site_id
+    union
+    select c.coach_id from public.rota_weekly_classes c
+      join public.rota_weekly_rotas w on w.id = c.weekly_rota_id
+      where w.site_id = p_site_id
+    union
+    select c.set_coach_id from public.rota_weekly_classes c
+      join public.rota_weekly_rotas w on w.id = c.weekly_rota_id
+      where w.site_id = p_site_id
+    union
+    select r.coach_id from public.rota_restructure_roster r
+      join public.rota_restructures rs on rs.id = r.restructure_id
+      where rs.site_id = p_site_id
+    union
+    select c.coach_id from public.rota_restructure_classes c
+      join public.rota_restructures rs on rs.id = c.restructure_id
+      where rs.site_id = p_site_id
+    union
+    select c.set_coach_id from public.rota_restructure_classes c
+      join public.rota_restructures rs on rs.id = c.restructure_id
+      where rs.site_id = p_site_id
+    union
+    select a.coach_id from public.club_meeting_attendees a
+      join public.club_meetings m on m.id = a.meeting_id
+      where m.site_id = p_site_id
+  )
+  select p.id, p.full_name::text, p.active, p.site::text
+  from refs
+  join public.profiles p on p.id = refs.coach_id
+  where refs.coach_id is not null
+    and public.is_active_coach()
+    and (
+      public.has_capability('view_all_sites')
+      or exists (
+        select 1 from public.rota_sites cs
+        join public.profiles caller on caller.site = cs.name
+        where cs.id = p_site_id and caller.id = auth.uid()
+      )
+    )
+  order by p.full_name;
+$$;
+
+revoke execute on function public.site_rota_people(uuid) from public;
+revoke execute on function public.site_rota_people(uuid) from anon;
+grant execute on function public.site_rota_people(uuid) to authenticated;
+
 commit;
diff --git a/private/tmp/claude-502/-Users-nwg-dev-nwgcoacheshub/724dfb50-f36b-4b68-ae44-4c5c6aa0b667/scratchpad/orig/0029_rota_retcon_checks.md b/supabase/verification/0029_rota_retcon_checks.md
index 5038841..a7b4ef0 100644
--- a/private/tmp/claude-502/-Users-nwg-dev-nwgcoacheshub/724dfb50-f36b-4b68-ae44-4c5c6aa0b667/scratchpad/orig/0029_rota_retcon_checks.md
+++ b/supabase/verification/0029_rota_retcon_checks.md
@@ -74,6 +74,22 @@ from pg_proc where oid = 'public.site_rota_roster(uuid)'::regprocedure;
 
 `proacl` should have no `=X/` (PUBLIC) entry and no `anon=`; `prosecdef` true; `proconfig` = `{search_path=""}`.
 
+### 3a. site_rota_people grants (no PUBLIC, no anon)
+
+Same expectations as section 3.
+
+```sql
+select grantee, privilege_type
+from information_schema.routine_privileges
+where routine_schema = 'public' and routine_name = 'site_rota_people'
+order by grantee;
+
+select proacl, prosecdef, proconfig
+from pg_proc where oid = 'public.site_rota_people(uuid)'::regprocedure;
+```
+
+`proacl` should have no `=X/` (PUBLIC) entry and no `anon=`; `prosecdef` true; `proconfig` = `{search_path=""}`.
+
 ## 3b. coach_id nullable on the 3 class tables
 
 Expect 3 rows, all `is_nullable = YES`.
@@ -125,4 +141,8 @@ curl -s -i "https://wwizreekicrjqwwptdmx.supabase.co/rest/v1/rota_coaches?select
 curl -s -i -X POST "https://wwizreekicrjqwwptdmx.supabase.co/rest/v1/rpc/site_rota_roster" \
   -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
   -d '{"p_site_id": "00000000-0000-0000-0000-000000000000"}'
+
+curl -s -i -X POST "https://wwizreekicrjqwwptdmx.supabase.co/rest/v1/rpc/site_rota_people" \
+  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
+  -d '{"p_site_id": "00000000-0000-0000-0000-000000000000"}'
 ```
```
