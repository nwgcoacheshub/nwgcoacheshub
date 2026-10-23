# Rota Retcon — Phase 2c, Phase B report

Amends the unapplied `0029_rota_retcon.sql` so that a class can be unassigned: `coach_id` is now nullable on the 3 class
tables. Nothing was applied, no SQL was run and nothing was committed to git.

## Changes

**`supabase/migrations/0029_rota_retcon.sql`**
- New **step 5**: `alter column coach_id drop not null` on `rota_standard_classes`, `rota_weekly_classes` and
  `rota_restructure_classes`. It sits inside the existing `begin;`/`commit;` transaction, right after step 4 (the new FKs).
- `site_rota_roster` is renumbered from step 5 to **step 6**, in both the header and the section banner.
- Header: lists the new step, adds "coach_id IS NULL on a class row means an unassigned class.", and notes that the
  upsert RPCs copy a NULL coach_id as-is.
- ON DELETE RESTRICT stays on all 10 FKs. Roster `coach_id` stays NOT NULL.

**`docs/investigations/rota-retcon-0029-verification.md`**
- New post-apply check **3b**: `information_schema.columns` should show `is_nullable = YES` for `coach_id` on all 3 class
  tables (3 rows).

## Phase A findings (for the record)

- The key-holder, lead and cashing-up flags are stored on the `rota_*_roster` tables (`is_key_holder`, `is_lead`,
  `is_cashing_up`), not on `rota_coaches`. 0029 loses none of them.
- NO COACH has no app constant and no seed or migration insert, so it is almost certainly a live `rota_coaches` row. This
  is unconfirmed, because confirming it needs a DB query, and none was run. The 0029 truncate and drop remove it.
- Making `coach_id` nullable on the class tables affects: 12 RLS policies (0 reference `coach_id`), 0 unique constraints
  or indexes with `coach_id`, 3 check constraints (0 involve `coach_id`), 0 triggers, and the 2 upsert RPCs (no join or
  filter on `coach_id`; they copy NULLs through as-is).
- App follow-ups belong to a later phase: the `coach_id: string` types, `deleteClassesForCoachDay` using `.eq`
  (which never matches NULL), board/export column planning for the Unassigned column, `removeCoachFromDay` nulling
  instead of deleting, and an open decision on whether to keep the old coach in `set_coach_id`.

## Full diff

```diff
diff --git a/private/tmp/claude-502/-Users-nwg-dev-nwgcoacheshub/41404376-4239-4ba9-a3ed-bbb581a60165/scratchpad/orig/0029_rota_retcon.sql b/supabase/migrations/0029_rota_retcon.sql
index 578a0a1..435ed03 100644
--- a/private/tmp/claude-502/-Users-nwg-dev-nwgcoacheshub/41404376-4239-4ba9-a3ed-bbb581a60165/scratchpad/orig/0029_rota_retcon.sql
+++ b/supabase/migrations/0029_rota_retcon.sql
@@ -14,10 +14,14 @@
 --   4. Re-add the 10 FKs to profiles (id), ON DELETE RESTRICT. Profiles are
 --      deactivated, not deleted. Deleting an auth user (which cascades to
 --      profiles) now fails while they appear on a rota or meeting.
---   5. Add site_rota_roster(uuid) and its grants.
+--   5. Make coach_id nullable on the 3 class tables (standard, weekly,
+--      restructure). Roster coach_id stays NOT NULL.
+--   6. Add site_rota_roster(uuid) and its grants.
+--
+-- coach_id IS NULL on a class row means an unassigned class.
 --
 -- upsert_weekly_rota and upsert_restructure are unchanged: they only copy
--- coach_id values between tables.
+-- coach_id values between tables, and copy a NULL coach_id as-is.
 --
 -- One transaction: all-or-nothing, with no window where the FKs are missing.
 -- No down migration, matching 0001-0028.
@@ -106,7 +110,19 @@ alter table public.club_meeting_attendees
   foreign key (coach_id) references public.profiles (id) on delete restrict;
 
 -- ---------------------------------------------------------------------------
--- 5. site_rota_roster(uuid)
+-- 5. coach_id nullable on the 3 class tables
+-- ---------------------------------------------------------------------------
+--
+-- coach_id IS NULL means an unassigned class (the board's Unassigned column).
+-- Roster coach_id stays NOT NULL. All three change together because the
+-- upsert RPCs copy standard classes into the weekly and restructure tables.
+
+alter table public.rota_standard_classes alter column coach_id drop not null;
+alter table public.rota_weekly_classes alter column coach_id drop not null;
+alter table public.rota_restructure_classes alter column coach_id drop not null;
+
+-- ---------------------------------------------------------------------------
+-- 6. site_rota_roster(uuid)
 -- ---------------------------------------------------------------------------
 --
 -- The assignable roster for a site: active profiles whose site name-matches
diff --git a/private/tmp/claude-502/-Users-nwg-dev-nwgcoacheshub/41404376-4239-4ba9-a3ed-bbb581a60165/scratchpad/orig/0029_rota_retcon_checks.md b/supabase/verification/0029_rota_retcon_checks.md
index d96afcf..5038841 100644
--- a/private/tmp/claude-502/-Users-nwg-dev-nwgcoacheshub/41404376-4239-4ba9-a3ed-bbb581a60165/scratchpad/orig/0029_rota_retcon_checks.md
+++ b/supabase/verification/0029_rota_retcon_checks.md
@@ -74,6 +74,19 @@ from pg_proc where oid = 'public.site_rota_roster(uuid)'::regprocedure;
 
 `proacl` should have no `=X/` (PUBLIC) entry and no `anon=`; `prosecdef` true; `proconfig` = `{search_path=""}`.
 
+## 3b. coach_id nullable on the 3 class tables
+
+Expect 3 rows, all `is_nullable = YES`.
+
+```sql
+select table_name, column_name, is_nullable
+from information_schema.columns
+where table_schema = 'public'
+  and column_name = 'coach_id'
+  and table_name in ('rota_standard_classes', 'rota_weekly_classes', 'rota_restructure_classes')
+order by table_name;
+```
+
 ## 4. Data wiped, reference tables intact
 
 ```sql
```
