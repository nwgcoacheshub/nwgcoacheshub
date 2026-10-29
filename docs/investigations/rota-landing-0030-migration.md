# Rota landing redesign: migration 0030 report

Date: 2026-10-28. Repo at `276fa5e` (main). Follows `rota-landing-phase1-investigation.md` and the approved
decisions. **The migration has not been applied.** No SQL was run, nothing connected to a database, and the secret key
was not read. Nothing was added, committed or pushed in git.

**Amended before apply (review fix):** `upsert_weekly_rota` is now Regenerate-only. It no longer inserts into
`rota_weekly_rotas`, raises P0002 if the week doesn't exist, and locks the week row `for update` before refilling it.
Sections 1, 2, 3 and 5 of the migration are unchanged. The counts below are unchanged by the amendment. The test plan
(section 7) was rewritten: every block uses `begin; … rollback;` and runs as `authenticated`, and 2 Regenerate blocks
were added.

File: `supabase/migrations/0030_rota_create_weekly_rota.sql`. It is one `begin; … commit;` transaction and should be
applied as a single paste in the Supabase SQL Editor.

## 1. Summary

| # | Item | Object |
|---|---|---|
| 1 | Monday constraint | `rota_weekly_rotas_week_start_is_monday`: `check (extract(isodow from week_start_date) = 1)` |
| 2 | Internal copy helper | `public.copy_into_weekly_rota(uuid, uuid, uuid) returns void` |
| 3 | Add week (create-only) | `public.create_weekly_rota(p_site_id uuid, p_week_start date, p_source_weekly_rota_id uuid default null) returns uuid` |
| 4 | Regenerate-only | `public.upsert_weekly_rota(uuid, date) returns uuid`, replaced. No longer creates weeks; locks the week row. |
| 5 | Policy | `drop policy "rota_weekly_rotas_insert_edit_rota_site"` |
| – | Header comment | Summarises items 1–5 and says the file is applied manually by Jamie in the SQL Editor |

**Counts**

| What | Count |
|---|---|
| Functions created (callable by `authenticated`) | **1** (`create_weekly_rota`) |
| Functions replaced | **1** (`upsert_weekly_rota`) |
| Helpers created | **1** (`copy_into_weekly_rota`) |
| Constraints added | **1** |
| Policies dropped | **1** |
| Policies created or altered | 0 |
| Tables or columns changed | 0 (apart from the constraint) |

All 3 functions are `security definer`, `set search_path = ''`, with every reference schema-qualified. Grants:

| Function | public | anon | authenticated |
|---|---|---|---|
| `create_weekly_rota(uuid, date, uuid)` | `revoke all` | `revoke all` | `grant execute` |
| `upsert_weekly_rota(uuid, date)` | `revoke all` | `revoke all` | `grant execute` (re-issued) |
| `copy_into_weekly_rota(uuid, uuid, uuid)` | `revoke all` | `revoke all` | `revoke all` |

`service_role` keeps its Supabase default grant on all three, as `title_has_capability()` does (0026).

Kept as they are: the `rota_weekly_rotas` select, update and delete policies; all 8 child-table policies on
`rota_weekly_roster` and `rota_weekly_classes`; `upsert_restructure`, `site_rota_roster`, `site_rota_people`; every
standard and restructure table and policy; all app code.

### Behaviour

**Roster rows.** A row is copied only if its `coach_id` is in `site_rota_roster(p_site_id)`. All other rows are dropped.
Columns are copied as they are, except `status`:

| Source | `status` |
|---|---|
| Standard Rota | copied as is |
| Another weekly rota | set to `'working'` |

**Class rows.** Every row is copied. `coach_id` becomes NULL (Unassigned) if the coach isn't assignable, and
`set_coach_id` becomes NULL on the same rule. Orphans are copied unchanged. (An orphan is an assignable coach with a
class on a day they aren't rostered.)

**`create_weekly_rota`** runs these steps in order:
1. The 3 caller checks.
2. Monday check.
3. Range check: from this London Monday to +16 weeks.
4. Source check: the source week must exist and belong to the same site.
5. INSERT with no `on conflict`, setting `generated_at = now()` and `generated_by = auth.uid()`.
6. Filtered copy.
7. Returns the new id.

**`upsert_weekly_rota`** is now Regenerate-only. It runs these steps in order:
1. The 3 caller checks (same order, same messages, same default errcode).
2. Monday check.
3. `select … for update` on the week row for `(site_id, week_start_date)`. If there is no row, it raises P0002
   `This week has not been created yet`.
4. Bumps `generated_at` / `generated_by` on that row. The row id is kept.
5. Deletes both child tables, then refills them from the Standard Rota through the same filtered copy.
6. Returns the row id.

There is no range check. It contains **no INSERT into `rota_weekly_rotas`**, so `create_weekly_rota` is the only way to
create a week. The row lock means two Regenerates of the same week, or a Regenerate racing a Delete week, run one after
the other. If the week is deleted first, the waiting Regenerate finds no row and raises P0002.

**Unique constraint.** The copies keep `unique (weekly_rota_id, day_of_week, coach_id)` and the one-lead and
one-cash-up indexes intact. Each source already satisfies them, and a subset of the source cannot break them.

### Changes besides the 5 items

- **`upsert_weekly_rota`'s `search_path`** changes from `public` to `''`. The brief asks for `''` on every new or
  replaced function. Every reference in the body was already schema-qualified, so nothing else changes.
- **"Start blank" no longer works as a direct insert.** The investigation (F2) said a blank week could be a direct
  insert because the insert policy allowed it. Dropping that policy removes that route. If Start blank is ever wanted,
  it needs a function, for example `create_weekly_rota` with a "blank" source option.
- **The current app's Generate button will error after apply.** `WeeklyRotaEmpty`'s "Generate this week's rota" calls
  `upsert_weekly_rota` on a week that doesn't exist. After 0030 that call raises P0002 `This week has not been created
  yet`, which `useGenerateWeek` shows as the error text. Between applying 0030 and Phase 2a there is no way to create a
  week in the app. Phase 2a removes the button. Regenerate on an existing week keeps working. There are 0 weeks today,
  so nothing existing is affected.

## 2. `site_rota_roster` caller check: confirmed

The brief requires that every caller who passes the `edit_rota` site check also passes `site_rota_roster`'s caller
check. It does.

**The `edit_rota` site check.** `create_weekly_rota` and `upsert_weekly_rota` both require:
1. `is_active_coach()`
2. `has_capability('edit_rota')`
3. `has_site_capability('edit_rota', p_site_id)`. Its body (0026) is: `p_site_id is not null and
   has_capability('edit_rota') and (has_capability('all_sites_scope') or exists (rota_sites s join profiles p on
   p.site = s.name where s.id = p_site_id and p.id = auth.uid()))`.

**`site_rota_roster`'s caller check (0029):** `is_active_coach() and (has_capability('view_all_sites') or exists
(rota_sites cs join profiles caller on caller.site = cs.name where cs.id = p_site_id and caller.id = auth.uid()))`.

**Why the first implies the second:**
- `is_active_coach()` is the same call in both.
- **`all_sites_scope` branch.** In `title_has_capability()` (0026), `all_sites_scope` and `view_all_sites` have the
  same 3 titles: Regional General Manager, Head of Gymnastics and Head of Operations. `has_capability()` adds the same
  `active` requirement to both. So `has_capability('all_sites_scope')` true implies `has_capability('view_all_sites')`
  true.
- **Own-site branch.** It is the same join in both functions: `rota_sites.name = profiles.site`, matching `id =
  p_site_id` and `profiles.id = auth.uid()`. Only the aliases differ.
- **`auth.uid()` inside a definer function.** It reads the request's JWT claims, not the current role, so
  `site_rota_roster` sees the same caller when called from a definer function. Both functions are owned by the
  migration's role, which can execute `site_rota_roster`.

So for any caller who reaches the copy, `site_rota_roster` returns the real assignable set, not the empty set it gives
unauthorised callers.

**The dependency this creates.** If the matrix ever gives `all_sites_scope` to a title without `view_all_sites`, or one
of the two checks changes, a copy for that caller would silently drop every coach. The migration header records this.

## 3. Filtering design: shared helper

I chose **one internal helper**, `copy_into_weekly_rota(p_weekly_rota_id, p_site_id, p_source_weekly_rota_id)`, used
by both functions. NULL source means the Standard Rota. A week id means that weekly rota.

Why one helper:
- The filtering rule is the thing that must not drift. A single helper means one `site_rota_roster` call, one roster
  filter and one class NULL-ing rule. Duplicating it would put two copies of the Standard Rota branch (roster + classes,
  about 30 lines) in two functions, which then have to be kept in step by hand.
- Both public functions stay short and read as: checks → parent row → copy.
- The helper has no authorisation of its own. That is safe only because EXECUTE is revoked from public, anon **and**
  `authenticated`, the same pattern as `title_has_capability()`. Its callers run as the function owner, so they can
  still call it.
- **Defence in depth.** The weekly-source branch joins the source on `site_id = p_site_id`, so a cross-site source
  copies nothing even if a future caller forgets the check. `create_weekly_rota` raises before the copy anyway.

The cost is one more object, and the Verification SQL below must confirm that authenticated cannot execute it.

## 4. Raise conditions (for Phase 2b UI mapping)

The 3 caller checks use no explicit errcode, so they raise with SQLSTATE **P0001** (`raise_exception`). They keep the
messages `useGenerateWeek` already shows.

### `create_weekly_rota`

The checks run in this order. The first failure wins.

| # | Condition | Message | Code |
|---|---|---|---|
| 1 | Caller has no active profile | `Your account has been deactivated` | P0001 |
| 2 | Caller's title doesn't hold `edit_rota` | `Your job title does not have rota edit rights` | P0001 |
| 3 | Not `edit_rota` at this site (incl. NULL or unknown `p_site_id`) | `Not authorized to generate a rota for this site` | P0001 |
| 4 | `p_week_start` NULL or not a Monday | `A week must start on a Monday` | 22023 |
| 5 | `p_week_start` before this London Monday or after it + 16 weeks | `A week can only be added from this week up to 16 weeks ahead` | 22023 |
| 6 | Source given but missing, or at another site | `The week to copy was not found at this site` | P0002 |
| 7 | Week already exists at this site (incl. a concurrent create) | Postgres: `duplicate key value violates unique constraint "rota_weekly_rotas_site_id_week_start_date_key"` (default name for the 0002 inline `unique`) | **23505** |

Rows 4 and 5 share 22023, so tell them apart by message. Row 6 uses a single message for "doesn't exist" and "another
site's", so a definer function doesn't reveal whether another site's week id exists. A failure in the copy (an FK or
check violation) is not expected, because the rows come from tables with the same constraints. If one happens, it
raises the Postgres error and the whole call rolls back, parent row included.

### `upsert_weekly_rota`

| # | Condition | Message | Code |
|---|---|---|---|
| 1 | Caller has no active profile | `Your account has been deactivated` | P0001 |
| 2 | Caller's title doesn't hold `edit_rota` | `Your job title does not have rota edit rights` | P0001 |
| 3 | Not `edit_rota` at this site | `Not authorized to generate a rota for this site` | P0001 |
| 4 | `p_week_start` NULL or not a Monday | `A week must start on a Monday` | 22023 *(new)* |
| 5 | No week row for this site and Monday (never created, or deleted while this call waited on the lock) | `This week has not been created yet` | P0002 *(new)* |

P0002 is also used by `create_weekly_rota` row 6, with a different message. Tell them apart by function and message.

### `copy_into_weekly_rota`

It raises nothing itself. It can't be called directly by `authenticated`, which gets 42501 `permission denied for
function copy_into_weekly_rota`.

### Constraint

A direct UPDATE of `week_start_date` to a non-Monday date (the update policy still allows the column) raises **23514**
`new row for relation "rota_weekly_rotas" violates check constraint "rota_weekly_rotas_week_start_is_monday"`. No app
code updates that column today.

## 5. Post-apply verification SQL (read only, not run)

Paste after applying 0030. Each query is independent.

```sql
-- V1. Monday constraint exists (expect 1 row)
select conname, pg_get_constraintdef(oid) as def
from pg_catalog.pg_constraint
where conrelid = 'public.rota_weekly_rotas'::regclass
  and conname = 'rota_weekly_rotas_week_start_is_monday';

-- V2. All 3 functions: security definer, search_path '' (expect 3 rows,
--     prosecdef = true, proconfig = {search_path=""})
select p.oid::regprocedure as fn, p.prosecdef, p.proconfig, p.proacl
from pg_catalog.pg_proc p
where p.oid in (
  'public.create_weekly_rota(uuid, date, uuid)'::regprocedure,
  'public.upsert_weekly_rota(uuid, date)'::regprocedure,
  'public.copy_into_weekly_rota(uuid, uuid, uuid)'::regprocedure
)
order by 1;

-- V3. Grantees from proacl (expect: no row with grantee PUBLIC or anon;
--     authenticated only on create_weekly_rota and upsert_weekly_rota;
--     postgres and service_role may appear)
select p.oid::regprocedure as fn,
       case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end as grantee,
       a.privilege_type
from pg_catalog.pg_proc p
cross join lateral aclexplode(p.proacl) a
where p.oid in (
  'public.create_weekly_rota(uuid, date, uuid)'::regprocedure,
  'public.upsert_weekly_rota(uuid, date)'::regprocedure,
  'public.copy_into_weekly_rota(uuid, uuid, uuid)'::regprocedure
)
order by 1, 2;

-- V4. Effective EXECUTE per role (expect anon false on all 3; authenticated
--     true, true, false for create / upsert / copy_into)
select fn,
       has_function_privilege('anon', fn, 'execute')          as anon_exec,
       has_function_privilege('authenticated', fn, 'execute') as authenticated_exec
from (values
  ('public.create_weekly_rota(uuid, date, uuid)'::regprocedure),
  ('public.upsert_weekly_rota(uuid, date)'::regprocedure),
  ('public.copy_into_weekly_rota(uuid, uuid, uuid)'::regprocedure)
) v(fn);

-- V5. rota_weekly_rotas policies (expect exactly 3:
--     rota_weekly_rotas_delete_edit_rota_site   DELETE
--     rota_weekly_rotas_select_own_site_or_view_all SELECT
--     rota_weekly_rotas_update_edit_rota_site   UPDATE)
select policyname, cmd
from pg_catalog.pg_policies
where schemaname = 'public' and tablename = 'rota_weekly_rotas'
order by policyname;

-- V6. Child-table policies untouched (expect 4 each: select, insert, update, delete)
select tablename, count(*) as policies, string_agg(cmd, ', ' order by cmd) as cmds
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in ('rota_weekly_roster', 'rota_weekly_classes')
group by tablename
order by tablename;
```

## 6. Post-apply anon check (template, not run)

Replace `<PROJECT_URL>` (for example `https://wwizreekicrjqwwptdmx.supabase.co`) and `<ANON_KEY>` (the publishable
key). The body values don't matter, because the request should be refused before the function runs.

```bash
curl -sS -i -X POST "<PROJECT_URL>/rest/v1/rpc/create_weekly_rota" \
  -H "apikey: <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"p_site_id":"00000000-0000-0000-0000-000000000000","p_week_start":"2026-11-02"}'
```

If `<ANON_KEY>` is a legacy JWT anon key rather than an `sb_publishable_…` key, also add
`-H "Authorization: Bearer <ANON_KEY>"`.

**Expected:** a 401 or 403 with `"code":"42501"` (`permission denied for function create_weekly_rota`), or a 404
`PGRST202` if PostgREST hides the function from anon.

**Failure:** a 200, or any `P0001` message such as `Your account has been deactivated`. Either means anon reached the
function body.

The same command against `/rpc/copy_into_weekly_rota`, with body
`{"p_weekly_rota_id":null,"p_site_id":null,"p_source_weekly_rota_id":null}`, should be refused the same way.

## 7. Functional test plan (Jamie, SQL Editor)

The app keeps calling `upsert_weekly_rota` until Phase 2b, so `create_weekly_rota` can only be tested in the SQL
Editor.

**How every block runs:**
- **As an authenticated user, not `postgres`.** Each block starts with `set local role authenticated` and
  `set_config('request.jwt.claims', …, true)`, so `auth.uid()`, RLS and the profiles trigger behave as they do for you
  in the app.
- **Placeholder.** Replace `<JAMIE_PROFILE_ID>` with your `profiles.id`. To find it, run
  `select id from public.profiles where email = 'jamie@nilewilsongymnastics.com';` once as `postgres`.
- **Rolled back.** Each block is wrapped in `begin; … rollback;`, so nothing it writes is kept. No block relies on an
  error to discard its changes. A block that is expected to error stops at that error and leaves the transaction
  aborted. The final `rollback;` (or the Editor ending the request) discards it. There is no `commit`.
- **Shorthands, written out in full in each block:**
  - **S**, the site that holds the Standard Rota row: `(select site_id from public.rota_standard_roster order by id
    limit 1)`.
  - **M**, this London Monday: `date_trunc('week', now() at time zone 'Europe/London')::date`.
  - Your account holds `view_all_sites`, so RLS lets you read both of these.
- **Run each block on its own.**
- **Where results show up.** The result to read is the `select` marked `-- RESULT`, or the error. I haven't confirmed
  whether the SQL Editor shows a `select`'s output when a `rollback;` follows it. If it shows only "Success. No rows
  returned", run the block with `psql "<connection string>" -f block.sql`, which prints every statement's output.

Each block starts with this preamble:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '<JAMIE_PROFILE_ID>', 'role', 'authenticated')::text, true);
```

### Block 1 — Create from standard, this week and the +16 boundary

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '<JAMIE_PROFILE_ID>', 'role', 'authenticated')::text, true);

select public.create_weekly_rota(
  (select site_id from public.rota_standard_roster order by id limit 1),
  date_trunc('week', now() at time zone 'Europe/London')::date) as this_week;

select public.create_weekly_rota(
  (select site_id from public.rota_standard_roster order by id limit 1),
  date_trunc('week', now() at time zone 'Europe/London')::date + 112) as plus_16;

-- RESULT
select w.week_start_date,
       (select count(*) from public.rota_weekly_roster r  where r.weekly_rota_id = w.id) as roster_rows,
       (select count(*) from public.rota_weekly_classes c where c.weekly_rota_id = w.id) as class_rows
from public.rota_weekly_rotas w
where w.site_id = (select site_id from public.rota_standard_roster order by id limit 1)
order by w.week_start_date;

rollback;
```

Expected: 2 rows, this Monday and +16 weeks.
- `class_rows` = 1 each.
- `roster_rows` = 1 if the standard coach is assignable, otherwise 0.

### Block 2 — Duplicate week

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '<JAMIE_PROFILE_ID>', 'role', 'authenticated')::text, true);

select public.create_weekly_rota(
  (select site_id from public.rota_standard_roster order by id limit 1),
  date_trunc('week', now() at time zone 'Europe/London')::date);
select public.create_weekly_rota(
  (select site_id from public.rota_standard_roster order by id limit 1),
  date_trunc('week', now() at time zone 'Europe/London')::date);

rollback;
```

Expected: **23505** `duplicate key value violates unique constraint "rota_weekly_rotas_site_id_week_start_date_key"`.

### Block 3 — Non-Monday

Preamble, then:

```sql
select public.create_weekly_rota(
  (select site_id from public.rota_standard_roster order by id limit 1),
  date_trunc('week', now() at time zone 'Europe/London')::date + 1);
rollback;
```

Expected: **22023** `A week must start on a Monday`.

### Block 4 — Past week, and +17 weeks

Run as two separate blocks, preamble each time.

```sql
-- 4a. Past week
select public.create_weekly_rota(
  (select site_id from public.rota_standard_roster order by id limit 1),
  date_trunc('week', now() at time zone 'Europe/London')::date - 7);
rollback;
```

```sql
-- 4b. +17 weeks
select public.create_weekly_rota(
  (select site_id from public.rota_standard_roster order by id limit 1),
  date_trunc('week', now() at time zone 'Europe/London')::date + 119);
rollback;
```

Expected for both: **22023** `A week can only be added from this week up to 16 weeks ahead`.

### Block 5 — Copy a week from another site

Preamble, then:

```sql
select public.create_weekly_rota(
  (select site_id from public.rota_standard_roster order by id limit 1),
  date_trunc('week', now() at time zone 'Europe/London')::date);

select public.create_weekly_rota(
  (select s.id from public.rota_sites s
   where s.id <> (select site_id from public.rota_standard_roster order by id limit 1)
   order by s.sort_order limit 1),
  date_trunc('week', now() at time zone 'Europe/London')::date,
  (select w.id from public.rota_weekly_rotas w
   where w.site_id = (select site_id from public.rota_standard_roster order by id limit 1)
     and w.week_start_date = date_trunc('week', now() at time zone 'Europe/London')::date));

rollback;
```

Expected: **P0002** `The week to copy was not found at this site`.

### Block 6 — Deactivated coach on the Standard Rota

You deactivate the coach as yourself, using `manage_users`.
- The guard at the start stops the block if the Standard Rota coach is the claims user.
- The profiles trigger would also refuse a change to your own `active`.

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '<JAMIE_PROFILE_ID>', 'role', 'authenticated')::text, true);

-- Guard: never deactivate the claims user
do $$
begin
  if (select coach_id from public.rota_standard_roster order by id limit 1) = auth.uid() then
    raise exception 'Guard: the Standard Rota coach is the claims user. Put another coach on the Standard Rota first.';
  end if;
end $$;

update public.profiles
   set active = false
 where id = (select coach_id from public.rota_standard_roster order by id limit 1)
   and id <> auth.uid();

select public.create_weekly_rota(
  (select site_id from public.rota_standard_roster order by id limit 1),
  date_trunc('week', now() at time zone 'Europe/London')::date);

-- RESULT
select
  (select count(*) from public.rota_weekly_roster r
     where r.weekly_rota_id = w.id
       and r.coach_id = (select coach_id from public.rota_standard_roster order by id limit 1))
    as coach_roster_rows,                                   -- expect 0
  (select count(*) from public.rota_weekly_classes c where c.weekly_rota_id = w.id)
    as class_rows,                                          -- expect = standard class count
  (select count(*) from public.rota_weekly_classes c where c.weekly_rota_id = w.id and c.coach_id is null)
    as unassigned_classes,                                  -- expect >= coach_standard_classes
  (select count(*) from public.rota_standard_classes c
     where c.coach_id = (select coach_id from public.rota_standard_roster order by id limit 1))
    as coach_standard_classes,
  (select count(*) from public.rota_weekly_classes c
     where c.weekly_rota_id = w.id
       and c.coach_id = (select coach_id from public.rota_standard_roster order by id limit 1))
    as classes_still_on_coach                               -- expect 0
from public.rota_weekly_rotas w
where w.site_id = (select site_id from public.rota_standard_roster order by id limit 1)
  and w.week_start_date = date_trunc('week', now() at time zone 'Europe/London')::date;

rollback;
```

Expected:
- The coach has 0 roster rows.
- Every standard class is copied.
- The coach's classes have `coach_id` NULL, so they show in Unassigned.
- 0 classes are still on the coach.

**Regenerate check (optional).** Add
`select public.upsert_weekly_rota((select site_id from public.rota_standard_roster order by id limit 1), date_trunc('week', now() at time zone 'Europe/London')::date);`
straight after the `create_weekly_rota` line. The RESULT row should be the same.

### Block 7 — Regenerate on a non-Monday

Preamble, then:

```sql
select public.upsert_weekly_rota(
  (select site_id from public.rota_standard_roster order by id limit 1),
  date_trunc('week', now() at time zone 'Europe/London')::date + 1);
rollback;
```

Expected: **22023** `A week must start on a Monday`.

### Block 8 — Regenerate on a week that doesn't exist: P0002, nothing inserted

The call runs inside a `do` block's exception handler, so the block can check the error and then count rows. The
handler's savepoint only lets the check continue. The `rollback;` at the end is what discards everything.

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '<JAMIE_PROFILE_ID>', 'role', 'authenticated')::text, true);

do $$
declare
  v_site   uuid := (select site_id from public.rota_standard_roster order by id limit 1);
  v_week   date := date_trunc('week', now() at time zone 'Europe/London')::date + 7;
  v_before int;
  v_after  int;
begin
  if exists (select 1 from public.rota_weekly_rotas
             where site_id = v_site and week_start_date = v_week) then
    raise exception 'Setup: next week already exists at this site; pick a week that does not';
  end if;

  select count(*) into v_before from public.rota_weekly_rotas;

  begin
    perform public.upsert_weekly_rota(v_site, v_week);
    raise exception 'FAIL: Regenerate on a missing week did not raise';
  exception when sqlstate 'P0002' then
    if sqlerrm <> 'This week has not been created yet' then
      raise exception 'FAIL: unexpected P0002 message: %', sqlerrm;
    end if;
  end;

  select count(*) into v_after from public.rota_weekly_rotas;
  if v_after <> v_before then
    raise exception 'FAIL: rota_weekly_rotas rows % -> %', v_before, v_after;
  end if;
end $$;

-- RESULT
select 'PASS: P0002 raised, no week inserted' as result,
       (select count(*) from public.rota_weekly_rotas
        where site_id = (select site_id from public.rota_standard_roster order by id limit 1)
          and week_start_date = date_trunc('week', now() at time zone 'Europe/London')::date + 7)
         as rows_for_that_week;                                  -- expect 0

rollback;
```

Expected: the `PASS` row with `rows_for_that_week` = 0. Any `FAIL:` error means the test failed.

### Block 9 — Regenerate on an existing week: same row id, child rows refilled

The block does this:
1. Creates this week.
2. Empties its child rows, to stand in for edits.
3. Regenerates.
4. Checks that the id is unchanged and that the child row counts match what the create produced.

It doesn't compare `generated_at` before and after. `now()` is fixed for the whole transaction, so the value can't
change inside one block.

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '<JAMIE_PROFILE_ID>', 'role', 'authenticated')::text, true);

do $$
declare
  v_site    uuid := (select site_id from public.rota_standard_roster order by id limit 1);
  v_monday  date := date_trunc('week', now() at time zone 'Europe/London')::date;
  v_id      uuid;
  v_id2     uuid;
  v_roster  int;
  v_classes int;
begin
  v_id := public.create_weekly_rota(v_site, v_monday);
  select count(*) into v_roster  from public.rota_weekly_roster  where weekly_rota_id = v_id;
  select count(*) into v_classes from public.rota_weekly_classes where weekly_rota_id = v_id;

  delete from public.rota_weekly_classes where weekly_rota_id = v_id;
  delete from public.rota_weekly_roster  where weekly_rota_id = v_id;

  v_id2 := public.upsert_weekly_rota(v_site, v_monday);

  if v_id2 <> v_id then
    raise exception 'FAIL: row id changed % -> %', v_id, v_id2;
  end if;
  if (select count(*) from public.rota_weekly_rotas
      where site_id = v_site and week_start_date = v_monday) <> 1 then
    raise exception 'FAIL: expected exactly 1 week row';
  end if;
  if (select count(*) from public.rota_weekly_roster where weekly_rota_id = v_id) <> v_roster
     or (select count(*) from public.rota_weekly_classes where weekly_rota_id = v_id) <> v_classes then
    raise exception 'FAIL: child rows not refilled to roster % / classes %', v_roster, v_classes;
  end if;
end $$;

-- RESULT
select 'PASS: same id, child rows refilled' as result,
       w.id,
       (select count(*) from public.rota_weekly_roster  r where r.weekly_rota_id = w.id) as roster_rows,
       (select count(*) from public.rota_weekly_classes c where c.weekly_rota_id = w.id) as class_rows,
       w.generated_by = auth.uid() as generated_by_is_me                -- expect true
from public.rota_weekly_rotas w
where w.site_id = (select site_id from public.rota_standard_roster order by id limit 1)
  and w.week_start_date = date_trunc('week', now() at time zone 'Europe/London')::date;

rollback;
```

Expected: the `PASS` row with `class_rows` = 1, `roster_rows` as in Block 1, and `generated_by_is_me` true.

**After Phase 2a/2b, in the app:**
- Add week from standard and from another week.
- Leave and sick reset to working on a week copy.
- Adding a week that already exists shows the "already exists" message.
- Regenerate on an existing week still works.

## Repo hygiene

`git status --short` after writing both files:

```
?? docs/investigations/rota-landing-0030-migration.md
?? docs/investigations/rota-landing-phase1-investigation.md
?? "reference/Rota home \342\200\223 mockup.html"
?? supabase/migrations/0030_rota_create_weekly_rota.sql
```

- **2 files created:** the migration and this report.
- **0 existing files modified.** The phase 1 investigation and the mockup were already untracked before this session.
- The migration was not applied. No `supabase` CLI or database command was run, and nothing connected to a database.
- `SUPABASE_SECRET_KEY` was not read.
- No `git add`, commit or push. No `npm install`.
