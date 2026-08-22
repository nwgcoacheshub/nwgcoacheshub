import { createClient } from "@/lib/supabaseServer";

type AdminGuardResult =
  | { user: { id: string; email: string | undefined } }
  | { error: string; status: number };

// Server-side only. Confirms the current session belongs to an admin before
// an API route touches the service-role client. Reused by every admin route
// so the check can't drift between them.
export async function requireAdmin(): Promise<AdminGuardResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated.", status: 401 };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return { error: "Admin access required.", status: 403 };
  }

  return { user: { id: user.id, email: user.email } };
}

// ---------------------------------------------------------------------------
// Active-account guards
// ---------------------------------------------------------------------------
//
// requireAdmin() above reads profiles.role but not profiles.active, so a
// deactivated admin still passes it. Migration 0014 established the opposite
// rule for data access — is_active_coach() is the OUTER conjunct of every
// policy precisely so deactivation bites on admins too — and the Policies
// Library routes are the file-access boundary, so they hold to that rule.
//
// requireAdmin() is deliberately left as it is: changing it would change how
// create-user and reset-password behave, which is not this feature's call to
// make. The gap is real and worth closing separately.
//
// These read through the RLS-respecting client, so the caller can only ever see
// their own profiles row. That read works for a deactivated user because 0014
// deliberately did NOT gate profiles' own select policy on is_active_coach() —
// gating it would have broken the very check it exists to feed.

type ActiveProfileResult =
  | { user: { id: string; email: string | undefined }; role: string }
  | { error: string; status: number };

async function loadActiveProfile(): Promise<ActiveProfileResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated.", status: 401 };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return { error: "No profile for this account.", status: 403 };
  }

  if (!profile.active) {
    return { error: "This account has been deactivated.", status: 403 };
  }

  return { user: { id: user.id, email: user.email }, role: profile.role };
}

/**
 * Any active Hub user, admin or not — the server-side equivalent of the
 * is_active_coach() gate on policies_select_authenticated (0023).
 */
export async function requireActiveCoach(): Promise<ActiveProfileResult> {
  return loadActiveProfile();
}

/**
 * An active admin — the equivalent of `is_active_coach() and is_admin()`, the
 * shape 0023's write policies use.
 */
export async function requireActiveAdmin(): Promise<ActiveProfileResult> {
  const result = await loadActiveProfile();
  if ("error" in result) return result;

  if (result.role !== "admin") {
    return { error: "Admin access required.", status: 403 };
  }

  return result;
}
