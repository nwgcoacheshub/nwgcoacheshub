import { getCurrentProfile } from "@/lib/getCurrentProfile";

/**
 * Job titles that carry rota write rights.
 *
 * Mirrors public.can_edit_rota() in
 * supabase/migrations/0013_rota_edit_rights_by_job_title.sql — that function is
 * the source of truth and RLS is what actually blocks a write. This list only
 * decides whether the UI offers the write in the first place, so the two must
 * stay in step, the same way lib/profileOptions.ts tracks the check constraints
 * in 0001.
 */
export const ROTA_EDIT_JOB_TITLES = [
  "Lead Coach",
  "Club Head Coach",
  "Regional General Manager",
  "Head of Gymnastics",
  "Head of People",
  "Head of Operations",
] as const;

export type EditProfile = { role: string; job_title: string | null } | null;

/**
 * Whether this profile may write rota data at all.
 *
 * Deliberately not site-scoped. 0013's predicate is
 * `is_admin() or job_title in (...)`, with the site match kept as a separate
 * conjunct in each policy — and getSiteAccess() already decides which site a
 * user may see. Keeping the two apart here means the UI splits the question the
 * same way the database does.
 *
 * Pure, and free of Next/Supabase imports, so it can be exercised directly in
 * tests — same split as resolveSiteAccess() and its getSiteAccess() wrapper.
 */
export function resolveCanEdit(profile: EditProfile): boolean {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  return (ROTA_EDIT_JOB_TITLES as readonly string[]).includes(
    profile.job_title ?? ""
  );
}

/**
 * canEdit for the logged-in user, resolved server-side.
 *
 * getCurrentProfile() is wrapped in React cache() and already selects role and
 * job_title, so calling this on a page that also calls getSiteAccess() costs no
 * extra query — both read the same memoised profile for the request.
 */
export async function getCanEditRota(): Promise<boolean> {
  const { profile } = await getCurrentProfile();
  return resolveCanEdit(profile);
}
