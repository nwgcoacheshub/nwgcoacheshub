-- NWG Coaches Hub — Club Profile, phase A.7
-- Removes anon's EXECUTE grant on resolve_profile_names().
--
-- 0008 intended the function to be callable by `authenticated` alone and did
-- `revoke execute ... from public` before granting. That wasn't enough: Supabase
-- ships an `alter default privileges in schema public grant all on functions to
-- anon, authenticated, service_role`, so the function was created with an
-- explicit grant to anon as well. PUBLIC and anon are separate grants, and
-- revoking the first leaves the second in place.
--
-- Confirmed against the live database during the Club Profile build: calling the
-- RPC with the anon key returned 200 rather than a permission error. Nothing
-- leaked — the function's own caller-must-have-a-profiles-row check returned an
-- empty set, and that check stays exactly as it is — but the grant was still
-- wider than intended, so it's closed here rather than left resting on the
-- in-function guard alone.
--
-- authenticated's grant from 0008 is deliberately untouched.

revoke execute on function public.resolve_profile_names(uuid[]) from anon;
