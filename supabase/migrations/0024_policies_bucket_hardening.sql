-- NWG Coaches Hub — Policies Library: bucket hardening + file_path uniqueness
-- (phase 2b, database only)
--
-- 0023 created the `policies` table and the private `policies` Storage bucket
-- and deliberately left two things unset rather than guessing them:
--
--   1. The bucket's file_size_limit and allowed_mime_types. Both are real
--      hardening levers, but they have to agree with what the phase-3 upload UI
--      validates client-side — a ceiling the UI does not enforce, or a type list
--      that rejects documents the UI accepts, is worse than no limit at all.
--   2. A unique constraint on policies.file_path. Two rows sharing an object key
--      means deleting either row orphans or double-claims the same stored file.
--      0023 left it for once the upload path's key-naming scheme was settled.
--
-- Both are now agreed and set here. No table is created, no policy is added or
-- altered, and storage.objects is untouched — the bucket stays closed to every
-- client role and reachable only by the service role, exactly as 0023 left it.
-- Phase 3 still owns the signed-URL route.
--
-- No down migration, matching every migration so far (0001–0023).

-- ---------------------------------------------------------------------------
-- Bucket limits
-- ---------------------------------------------------------------------------
--
-- There is no prior migration in this project that updates storage.buckets —
-- 0023's insert is the only reference to the table — so this is a plain update
-- against the bucket row, matching how 0023 created it (by row insert, so the
-- bucket's configuration is versioned in this repo alongside the table rather
-- than living only in dashboard state).
--
-- file_size_limit is bytes: 20 MiB, written as 20 * 1024 * 1024 rather than the
-- literal so the intent survives review. allowed_mime_types is a text[] of
-- exactly one entry — PDF only.
--
-- What enforces these: the Storage API, at upload time, not the database. They
-- constrain new uploads only and do not retro-validate anything already in the
-- bucket (nothing is — phase 3 is not deployed, so there has been no upload
-- path). They are also independent of the RLS picture: a caller still has to get
-- past the access model before a limit is ever consulted.
--
-- Both values must stay in step with the phase-3 upload UI's client-side
-- validation. If one changes, change the other in the same pass.

update storage.buckets
set
  file_size_limit = 20 * 1024 * 1024,
  allowed_mime_types = array['application/pdf']
where id = 'policies';

-- ---------------------------------------------------------------------------
-- policies.file_path unique
-- ---------------------------------------------------------------------------
--
-- Named policies_file_path_key, following rota_sites_name_key (0014) — the
-- shape Postgres itself would generate for a unique constraint on this column.
--
-- Last in the file, on purpose, for the same reason 0014 ordered its unique
-- constraint last: this is the one statement here that can fail on existing
-- data (23505 on a duplicate file_path). The SQL Editor runs a multi-statement
-- script as one implicit transaction, so a failure here takes the bucket update
-- down with it rather than leaving half the migration applied.
--
-- No duplicate is expected: `policies` has no UI writing to it yet — the upload
-- path is phase 3 — so the table should be empty. If this does fail, that is a
-- real finding about how rows got in, not a constraint to weaken.

alter table public.policies
  add constraint policies_file_path_key unique (file_path);
