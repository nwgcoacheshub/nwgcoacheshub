// Pure access-decision logic for the rota, kept free of Next/Supabase imports
// so it can be exercised directly in tests.

export type SiteOption = { id: string; name: string; slug: string };

export type SiteAccess =
  | {
      ok: true;
      sites: SiteOption[];
      canSwitch: boolean;
      /** Where to send someone who asked for /rota with no site. */
      homeSlug: string;
    }
  | {
      ok: false;
      reason: "no-sites-configured" | "profile-site-unmatched";
      profileSite: string | null;
    };

export type AccessProfile = { role: string; site: string | null } | null;

/**
 * Which rota sites a user may look at.
 *
 * - admin: every active site, free switching.
 * - anyone else: only the site whose `rota_sites.name` equals their
 *   `profiles.site`. It's a name match because `profiles.site` is free text
 *   and isn't a foreign key in this phase.
 *
 * `sites` is expected already filtered to active and ordered by sort_order.
 */
export function resolveSiteAccess(
  profile: AccessProfile,
  sites: SiteOption[]
): SiteAccess {
  if (sites.length === 0) {
    return {
      ok: false,
      reason: "no-sites-configured",
      profileSite: profile?.site ?? null,
    };
  }

  if (profile?.role === "admin") {
    return { ok: true, sites, canSwitch: true, homeSlug: sites[0].slug };
  }

  const own = sites.find((s) => s.name === profile?.site);
  if (!own) {
    return {
      ok: false,
      reason: "profile-site-unmatched",
      profileSite: profile?.site ?? null,
    };
  }

  return { ok: true, sites: [own], canSwitch: false, homeSlug: own.slug };
}
