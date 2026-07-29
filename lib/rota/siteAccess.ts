import { getCurrentProfile } from "@/lib/getCurrentProfile";
import { createClient } from "@/lib/supabaseServer";
import { resolveSiteAccess, type SiteAccess, type SiteOption } from "./resolveSiteAccess";

export type { SiteAccess, SiteOption };

/**
 * Fetches the active rota sites and works out what the logged-in user may see.
 *
 * Note RLS lets any authenticated user *read* all of `rota_sites` (it's shared
 * reference data), so this governs what we offer them; RLS is what actually
 * stops a coach reading another site's roster or classes.
 */
export async function getSiteAccess(): Promise<SiteAccess> {
  const { profile } = await getCurrentProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from("rota_sites")
    .select("id, name, slug")
    .eq("active", true)
    .order("sort_order");

  return resolveSiteAccess(
    profile ? { role: profile.role, site: profile.site } : null,
    (data ?? []) as SiteOption[]
  );
}
