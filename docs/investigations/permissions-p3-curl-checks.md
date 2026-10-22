# P3 verification: REST API checks with the anon key

The last step of the P3 verification, after Paste C in `docs/investigations/permissions-p3-verification.sql`. Paste order:

Paste A → apply `0026_capability_helpers.sql` → Paste B → Paste C → **these curl checks** → Paste D (optional, info only)

Every request below uses only the publishable (anon) key. No user is signed in, so each one runs as Postgres's `anon` role. **Every request must be refused.** These checks were written, not run.

## Setup

Run in a terminal, not the SQL Editor:

```sh
export SB_URL="https://wwizreekicrjqwwptdmx.supabase.co"
export SB_KEY="<NEXT_PUBLIC publishable key from .env.local>"
export SB_ID="<your profiles.id>"
export SITE_ID="<Burnley's rota_sites.id>"
```

Get the two ids from the SQL Editor:

```sql
select id from public.profiles where email = 'jamie@nilewilsongymnastics.com';
select id from public.rota_sites where name = 'Burnley';
```

With the new `sb_publishable_` keys, send only the `apikey` header. Do not also send `Authorization: Bearer <publishable key>`.

## What "refused" looks like

It depends on what stops the request:

| Target | Why anon is stopped | Refused looks like |
|---|---|---|
| `profiles`, `club_updates`, `club_role_assignments` | RLS only. Anon still has table grants on these; revoking them is a separate migration after P4 | Reads, updates and deletes: `200` with body `[]`. RLS matches no rows, so nothing is returned or changed. Inserts: `401` with `"code":"42501"`, "new row violates row-level security policy" |
| `policies`, `whats_new` | Anon's grants were revoked (0023, 0025) | `401` with `"code":"42501"`, "permission denied for table …" |
| RPC functions | Anon has no EXECUTE | `401` with `"code":"42501"`, "permission denied for function …" |

PATCH and DELETE requests on the RLS-only tables send `Prefer: return=representation`, so they show the rows they affected. That must always be `[]`.

## 1. `profiles`

**1.1 Read all profiles**

```sh
curl -s -i "$SB_URL/rest/v1/profiles?select=id,email,role,job_title" -H "apikey: $SB_KEY"
```

- Expected: `200`, body `[]`.
- Failure: any profile row in the body.

**1.2 Deactivate your own row**

```sh
curl -s -i -X PATCH "$SB_URL/rest/v1/profiles?id=eq.$SB_ID" -H "apikey: $SB_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"active": false}'
```

- Expected: `200`, body `[]`.
- Failure: your row comes back in the body, or your `active` is `false` afterwards. Check with `select active, job_title from public.profiles where id = '<SB_ID>';`.

**1.3 Change your own job title**

```sh
curl -s -i -X PATCH "$SB_URL/rest/v1/profiles?id=eq.$SB_ID" -H "apikey: $SB_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"job_title": "Coach"}'
```

- Expected: `200`, body `[]`.
- Failure: your row comes back, or your `job_title` has changed afterwards (same check query as 1.2).

**1.4 Insert a profile**

```sh
curl -s -i -X POST "$SB_URL/rest/v1/profiles" -H "apikey: $SB_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id": "00000000-0000-0000-0000-000000000000", "email": "x@example.com", "job_title": "Coach", "site": "Burnley"}'
```

- Expected: `401`, code `42501`, row-level security violation.
- Failure: `201`, or any status other than `401`. A foreign-key error (`23503`) would also be a failure, because it means the row got past RLS.

## 2. `club_updates`

**2.1 Read**

```sh
curl -s -i "$SB_URL/rest/v1/club_updates?select=id" -H "apikey: $SB_KEY"
```

- Expected: `200`, body `[]`.
- Failure: any row in the body.

**2.2 Insert**

```sh
curl -s -i -X POST "$SB_URL/rest/v1/club_updates" -H "apikey: $SB_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"site_id\": \"$SITE_ID\", \"title\": \"anon test\", \"body\": \"anon test\"}"
```

- Expected: `401`, code `42501`, row-level security violation.
- Failure: `201`. Then delete the row in the SQL Editor: `delete from public.club_updates where title = 'anon test';`.

**2.3 Update**

```sh
curl -s -i -X PATCH "$SB_URL/rest/v1/club_updates?site_id=eq.$SITE_ID" -H "apikey: $SB_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" -d '{"pinned": true}'
```

- Expected: `200`, body `[]`.
- Failure: any row in the body.

**2.4 Delete**

```sh
curl -s -i -X DELETE "$SB_URL/rest/v1/club_updates?site_id=eq.$SITE_ID" -H "apikey: $SB_KEY" \
  -H "Prefer: return=representation"
```

- Expected: `200`, body `[]`.
- Failure: any row in the body (those rows were deleted).

## 3. `club_role_assignments`

**3.1 Read**

```sh
curl -s -i "$SB_URL/rest/v1/club_role_assignments?select=id" -H "apikey: $SB_KEY"
```

- Expected: `200`, body `[]`.
- Failure: any row in the body.

**3.2 Insert**

```sh
curl -s -i -X POST "$SB_URL/rest/v1/club_role_assignments" -H "apikey: $SB_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"club_role_id\": \"00000000-0000-0000-0000-000000000000\", \"site_id\": \"$SITE_ID\", \"coach_id\": \"$SB_ID\"}"
```

- Expected: `401`, code `42501`, row-level security violation.
- Failure: any other status. A foreign-key error (`23503`) means the row got past RLS.

**3.3 Update**

```sh
curl -s -i -X PATCH "$SB_URL/rest/v1/club_role_assignments?site_id=eq.$SITE_ID" -H "apikey: $SB_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" -d "{\"site_id\": \"$SITE_ID\"}"
```

- Expected: `200`, body `[]`.
- Failure: any row in the body.

**3.4 Delete**

```sh
curl -s -i -X DELETE "$SB_URL/rest/v1/club_role_assignments?site_id=eq.$SITE_ID" -H "apikey: $SB_KEY" \
  -H "Prefer: return=representation"
```

- Expected: `200`, body `[]`.
- Failure: any row in the body (those rows were deleted).

## 4. `policies` (anon grants revoked in 0023)

For all four requests:

- Expected: `401`, code `42501`, "permission denied for table policies".
- Failure: any `2xx`, including `200 []`. A `200 []` means anon's grant came back and only RLS is stopping it.

```sh
curl -s -i "$SB_URL/rest/v1/policies?select=id" -H "apikey: $SB_KEY"

curl -s -i -X POST "$SB_URL/rest/v1/policies" -H "apikey: $SB_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title": "anon test", "file_path": "anon-test.pdf", "file_size": 1}'

curl -s -i -X PATCH "$SB_URL/rest/v1/policies?title=eq.x" -H "apikey: $SB_KEY" \
  -H "Content-Type: application/json" -d '{"title": "y"}'

curl -s -i -X DELETE "$SB_URL/rest/v1/policies?title=eq.x" -H "apikey: $SB_KEY"
```

## 5. `whats_new` (anon grants revoked in 0025)

For all four requests:

- Expected: `401`, code `42501`, "permission denied for table whats_new".
- Failure: any `2xx`, including `200 []`.

```sh
curl -s -i "$SB_URL/rest/v1/whats_new?select=id" -H "apikey: $SB_KEY"

curl -s -i -X POST "$SB_URL/rest/v1/whats_new" -H "apikey: $SB_KEY" \
  -H "Content-Type: application/json" -d '{"title": "anon test", "body": "anon test"}'

curl -s -i -X PATCH "$SB_URL/rest/v1/whats_new?title=eq.x" -H "apikey: $SB_KEY" \
  -H "Content-Type: application/json" -d '{"title": "y"}'

curl -s -i -X DELETE "$SB_URL/rest/v1/whats_new?title=eq.x" -H "apikey: $SB_KEY"
```

## 6. RPC functions

For all six calls:

- Expected: `401`, code `42501`, "permission denied for function …".
- Failure:
  - any `200`, even `200 false`. That means anon still has EXECUTE.
  - for `upsert_weekly_rota` / `upsert_restructure`, a `P0001` error such as "Your account has been deactivated". The function body ran, so the grant is still open even though nothing was written (see 0012).

```sh
curl -s -i -X POST "$SB_URL/rest/v1/rpc/has_capability" -H "apikey: $SB_KEY" \
  -H "Content-Type: application/json" -d '{"p_cap": "manage_users"}'

curl -s -i -X POST "$SB_URL/rest/v1/rpc/has_site_capability" -H "apikey: $SB_KEY" \
  -H "Content-Type: application/json" -d "{\"p_cap\": \"edit_rota\", \"p_site_id\": \"$SITE_ID\"}"

curl -s -i -X POST "$SB_URL/rest/v1/rpc/title_has_capability" -H "apikey: $SB_KEY" \
  -H "Content-Type: application/json" -d '{"p_job_title": "Head of Gymnastics", "p_cap": "manage_users"}'

curl -s -i -X POST "$SB_URL/rest/v1/rpc/can_edit_rota" -H "apikey: $SB_KEY" \
  -H "Content-Type: application/json" -d '{}'

curl -s -i -X POST "$SB_URL/rest/v1/rpc/upsert_weekly_rota" -H "apikey: $SB_KEY" \
  -H "Content-Type: application/json" -d "{\"p_site_id\": \"$SITE_ID\", \"p_week_start\": \"2026-10-26\"}"

curl -s -i -X POST "$SB_URL/rest/v1/rpc/upsert_restructure" -H "apikey: $SB_KEY" \
  -H "Content-Type: application/json" -d "{\"p_site_id\": \"$SITE_ID\"}"
```

## Summary

**Pass:** every table request returns either `200 []` (RLS-only tables) or `401 42501` (the rest), and every RPC returns `401 42501`.

**Fail:** any non-empty body, any `201`, any `200` from an RPC, or any `200` from `policies` / `whats_new`.
