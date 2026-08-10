// Turning profiles uuids into display names.
//
// This has to go through the resolve_profile_names() RPC (0008) rather than
// selecting from profiles. profiles_select_own_or_admin (0001) lets a non-admin
// coach read only their own row, so a direct select or an embedded join returns
// *nothing* for everyone else — no error, just missing names. That failure is
// invisible when you're testing as an admin, which is exactly why every
// caller must come through here.
//
// Applies to the three profiles foreign keys: club_updates.created_by,
// club_role_assignments.coach_id and hero_hours.logged_by_coach_id. It does NOT
// apply to rota_weekly_roster.coach_id or rota_standard_roster.coach_id — those
// point at rota_coaches, which is site-readable by any coach, so those names
// come straight off the row.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ProfileName = { id: string; full_name: string | null };

/**
 * Maps profile id -> display name for the ids given. Ids the caller can't
 * resolve simply don't appear in the map; render a fallback rather than
 * assuming every id comes back.
 */
export async function resolveProfileNames(
  supabase: SupabaseClient,
  ids: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase.rpc("resolve_profile_names", {
    profile_ids: unique,
  });

  if (error || !data) return new Map();

  return new Map(
    (data as ProfileName[]).map((row) => [row.id, row.full_name?.trim() || "Unknown"])
  );
}

/** Consistent fallback so an unresolved id never renders as blank. */
export function displayName(
  names: Map<string, string>,
  id: string | null
): string {
  if (!id) return "Unknown";
  return names.get(id) ?? "Unknown";
}
