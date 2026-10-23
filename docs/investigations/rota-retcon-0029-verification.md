# 0029 rota retcon — verification

Run after applying `0029_rota_retcon.sql`. Nothing here has been run.

## 0. Pre-flight (run BEFORE applying): live FK names

Expect exactly 10 rows, with the names the migration drops. If any name differs, fix the migration first.

```sql
select conrelid::regclass as tbl, conname, confrelid::regclass as references_tbl, pg_get_constraintdef(oid) as def
from pg_constraint
where contype = 'f' and confrelid = 'public.rota_coaches'::regclass
order by 1, 2;
```

### 0b. Column types

Expect exactly 10 rows, all `data_type = uuid`.

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and column_name in ('coach_id', 'set_coach_id')
order by table_name, column_name;
```

### 0c. Capability name

Expect `true`.

```sql
select pg_get_functiondef('public.has_capability(text)'::regprocedure) ilike '%view_all_sites%';
```

## 1. The 10 FKs now reference profiles.id with ON DELETE RESTRICT

Expect 10 rows; `references_tbl` = profiles, `def` ends `ON DELETE RESTRICT`.

```sql
select conrelid::regclass as tbl, conname, confrelid::regclass as references_tbl, pg_get_constraintdef(oid) as def
from pg_constraint
where contype = 'f'
  and conname in (
    'rota_standard_roster_coach_id_fkey','rota_standard_classes_coach_id_fkey','rota_standard_classes_set_coach_id_fkey',
    'rota_weekly_roster_coach_id_fkey','rota_weekly_classes_coach_id_fkey','rota_weekly_classes_set_coach_id_fkey',
    'rota_restructure_roster_coach_id_fkey','rota_restructure_classes_coach_id_fkey','rota_restructure_classes_set_coach_id_fkey',
    'club_meeting_attendees_coach_id_fkey')
order by 1, 2;
```

## 2. rota_coaches is gone

Expect `null` and 0 rows.

```sql
select to_regclass('public.rota_coaches');
select count(*) from pg_policies where tablename = 'rota_coaches';
```

## 3. Function grants (no PUBLIC, no anon)

Expect `authenticated` (and service_role/postgres) only. No `anon`, and no row with grantee `PUBLIC`.

```sql
select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public' and routine_name = 'site_rota_roster'
order by grantee;

select proacl, prosecdef, proconfig
from pg_proc where oid = 'public.site_rota_roster(uuid)'::regprocedure;
```

`proacl` should have no `=X/` (PUBLIC) entry and no `anon=`; `prosecdef` true; `proconfig` = `{search_path=""}`.

### 3a. site_rota_people grants (no PUBLIC, no anon)

Same expectations as section 3.

```sql
select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public' and routine_name = 'site_rota_people'
order by grantee;

select proacl, prosecdef, proconfig
from pg_proc where oid = 'public.site_rota_people(uuid)'::regprocedure;
```

`proacl` should have no `=X/` (PUBLIC) entry and no `anon=`; `prosecdef` true; `proconfig` = `{search_path=""}`.

## 3b. coach_id nullable on the 3 class tables

Expect 3 rows, all `is_nullable = YES`.

```sql
select table_name, column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and column_name = 'coach_id'
  and table_name in ('rota_standard_classes', 'rota_weekly_classes', 'rota_restructure_classes')
order by table_name;
```

## 4. Data wiped, reference tables intact

```sql
select 'rota_standard_roster' t, count(*) from public.rota_standard_roster
union all select 'rota_standard_classes', count(*) from public.rota_standard_classes
union all select 'rota_weekly_rotas', count(*) from public.rota_weekly_rotas
union all select 'rota_weekly_roster', count(*) from public.rota_weekly_roster
union all select 'rota_weekly_classes', count(*) from public.rota_weekly_classes
union all select 'rota_restructures', count(*) from public.rota_restructures
union all select 'rota_restructure_roster', count(*) from public.rota_restructure_roster
union all select 'rota_restructure_classes', count(*) from public.rota_restructure_classes
union all select 'club_meeting_attendees', count(*) from public.club_meeting_attendees;
-- expect all 0
select (select count(*) from public.rota_sites) sites, (select count(*) from public.rota_categories) cats,
       (select count(*) from public.rota_class_catalogue) catalogue;
-- expect 7 sites, categories and catalogue unchanged from before
```

## 5. anon curl checks

Each should return an empty `[]`, a 401/403 permission error, or (for `rota_coaches`) a 404 "relation does not exist". Never rows.

```sh
# Export the anon key first: export NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
curl -s -i "https://wwizreekicrjqwwptdmx.supabase.co/rest/v1/rota_standard_roster?select=*&limit=1" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
curl -s -i "https://wwizreekicrjqwwptdmx.supabase.co/rest/v1/rota_standard_classes?select=*&limit=1" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
curl -s -i "https://wwizreekicrjqwwptdmx.supabase.co/rest/v1/rota_weekly_rotas?select=*&limit=1" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
curl -s -i "https://wwizreekicrjqwwptdmx.supabase.co/rest/v1/rota_weekly_roster?select=*&limit=1" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
curl -s -i "https://wwizreekicrjqwwptdmx.supabase.co/rest/v1/rota_weekly_classes?select=*&limit=1" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
curl -s -i "https://wwizreekicrjqwwptdmx.supabase.co/rest/v1/rota_restructures?select=*&limit=1" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
curl -s -i "https://wwizreekicrjqwwptdmx.supabase.co/rest/v1/rota_restructure_roster?select=*&limit=1" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
curl -s -i "https://wwizreekicrjqwwptdmx.supabase.co/rest/v1/rota_restructure_classes?select=*&limit=1" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
curl -s -i "https://wwizreekicrjqwwptdmx.supabase.co/rest/v1/club_meeting_attendees?select=*&limit=1" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
curl -s -i "https://wwizreekicrjqwwptdmx.supabase.co/rest/v1/rota_coaches?select=*&limit=1" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"

curl -s -i -X POST "https://wwizreekicrjqwwptdmx.supabase.co/rest/v1/rpc/site_rota_roster" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"p_site_id": "00000000-0000-0000-0000-000000000000"}'

curl -s -i -X POST "https://wwizreekicrjqwwptdmx.supabase.co/rest/v1/rpc/site_rota_people" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"p_site_id": "00000000-0000-0000-0000-000000000000"}'
```
