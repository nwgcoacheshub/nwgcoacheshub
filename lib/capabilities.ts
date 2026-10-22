import { cache } from "react";
import { createClient } from "@/lib/supabaseServer";

/**
 * Capability names, as defined in public.title_has_capability()
 * (supabase/migrations/0026_capability_helpers.sql) and listed again in
 * public.my_capabilities() (0027).
 *
 * Names only. Which job titles hold which capability lives in the database and
 * nowhere else — never copy a title list into the app. Adding a capability
 * means adding its name in both functions and here.
 */
export type Capability =
  | "view_all_sites"
  | "all_sites_scope"
  | "publish_whats_new"
  | "manage_policies"
  | "manage_users"
  | "edit_rota"
  | "manage_club_meetings"
  | "manage_club_updates"
  | "manage_club_roles";

export type Capabilities = {
  caps: ReadonlySet<Capability>;
  /** rota_sites.id matching the user's profiles.site. Null for Head Office. */
  ownSiteId: string | null;
};

const NONE: Capabilities = { caps: new Set(), ownSiteId: null };

/**
 * The logged-in user's capabilities, from the my_capabilities() RPC.
 *
 * Wrapped in React cache(), so the layout and the page share one call per
 * request. Fails closed: no session, no profile, an inactive profile or an RPC
 * error all give an empty set.
 *
 * This decides what the UI offers. It is not a security boundary — RLS and the
 * definer RPCs enforce every write, and secret-key routes use
 * requireCapability() in lib/admin-guard.ts, which asks the database directly.
 */
export const getCapabilities = cache(async (): Promise<Capabilities> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_capabilities").maybeSingle();

  if (error || !data) return NONE;

  const row = data as { capabilities: string[] | null; own_site_id: string | null };
  return {
    caps: new Set((row.capabilities ?? []) as Capability[]),
    ownSiteId: row.own_site_id,
  };
});

/**
 * Whether a site-scoped capability applies at siteId: held, and either
 * all_sites_scope or it's the user's own site.
 *
 * Mirrors public.has_site_capability() (0026) for the UI's benefit only; the
 * database applies the real rule on every write.
 */
export function hasSiteCapability(
  c: Capabilities,
  cap: Capability,
  siteId: string
): boolean {
  return c.caps.has(cap) && (c.caps.has("all_sites_scope") || c.ownSiteId === siteId);
}
