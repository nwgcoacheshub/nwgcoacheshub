import { createClient } from "@/lib/supabaseServer";
import type { Capability } from "@/lib/capabilities";

// Server-side only. These guards run before a route handler touches the
// service-role client, which bypasses RLS — so for those routes the guard is
// the whole boundary.
//
// Everything reads through the RLS-respecting client as the caller. That read
// works for a deactivated user because profiles' own-row select policy is
// deliberately not gated on active (0014, kept in 0026) — gating it would break
// the very check it exists to feed.

type GuardResult =
  | { user: { id: string; email: string | undefined } }
  | { error: string; status: number };

/**
 * An active user holding `cap`.
 *
 * The decision is the database's: has_capability() (0026) checks the caller's
 * own profile, requires active = true and applies the job-title matrix. No
 * title list or role is consulted here, so the guard can't drift from RLS.
 * Global capabilities only — every route that uses it acts across all sites.
 */
export async function requireCapability(cap: Capability): Promise<GuardResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated.", status: 401 };
  }

  const { data: allowed, error } = await supabase.rpc("has_capability", { p_cap: cap });

  if (error || allowed !== true) {
    return { error: "You don't have permission to do this.", status: 403 };
  }

  return { user: { id: user.id, email: user.email } };
}

/**
 * Any active Hub user, whatever their job title — the server-side equivalent of
 * the is_active_coach() gate on policies_select_authenticated (0023).
 */
export async function requireActiveCoach(): Promise<GuardResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated.", status: 401 };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return { error: "No profile for this account.", status: 403 };
  }

  if (!profile.active) {
    return { error: "This account has been deactivated.", status: 403 };
  }

  return { user: { id: user.id, email: user.email } };
}
