// Who the rota's coach ids point at.
//
// Since 0029 every coach id on the rota tables and on club_meeting_attendees
// references profiles. Coaches can read only their own profiles row, so names
// and status come from two definer RPCs instead, each called once per page
// load:
//
//   site_rota_people(p_site_id)  every profile the site's rows reference,
//                                whatever its current active or site. The
//                                name and status map.
//   site_rota_roster(p_site_id)  active Coach / Lead Coach / Club Head Coach
//                                profiles at the site. The assignable list.
//
// Both return an empty set to anyone who can't read that site's rota.
//
// Pure: no Supabase or React imports, so the server pages and the client board
// share it.

export type RotaPerson = {
  id: string;
  fullName: string;
  active: boolean;
  /** profiles.site — compared with the rota's rota_sites.name. */
  site: string | null;
};

export type RosterCandidate = { id: string; fullName: string; jobTitle: string };

/** Why a coach on this rota can't stay on it. Inactive wins when both apply. */
export type CoachFlag = "moved" | "inactive" | null;

export function toRotaPeople(data: unknown): RotaPerson[] {
  return ((data ?? []) as {
    id: string;
    full_name: string | null;
    active: boolean;
    site: string | null;
  }[]).map((r) => ({
    id: r.id,
    fullName: r.full_name?.trim() ?? "",
    active: r.active,
    site: r.site,
  }));
}

export function toRosterCandidates(data: unknown): RosterCandidate[] {
  return ((data ?? []) as { id: string; full_name: string | null; job_title: string | null }[]).map(
    (r) => ({ id: r.id, fullName: r.full_name?.trim() ?? "", jobTitle: r.job_title ?? "" })
  );
}

/** "Beth Harrison" -> "Beth H". One word stays as it is; nothing gives "Unnamed". */
export function shortName(fullName: string | null | undefined): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Unnamed";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}`;
}

export function flagFor(person: RotaPerson | undefined, siteName: string): CoachFlag {
  if (!person) return null;
  if (!person.active) return "inactive";
  if (person.site !== siteName) return "moved";
  return null;
}

export type RotaDirectory = {
  siteName: string;
  byId: Map<string, RotaPerson>;
  /** Short name, or the full name where two people would share a short name. */
  name(id: string | null): string;
  fullName(id: string | null): string;
  flag(id: string | null): CoachFlag;
};

/**
 * One lookup for every coach id on a page.
 *
 * Seeded from site_rota_people, then topped up with roster candidates it
 * doesn't know yet: site_rota_people only returns ids that rows already
 * referenced when the page loaded, so a coach added from the picker during the
 * session would otherwise have no name. Candidates are active and at this site
 * by definition.
 */
export function makeDirectory(
  people: RotaPerson[],
  candidates: RosterCandidate[],
  siteName: string
): RotaDirectory {
  const byId = new Map<string, RotaPerson>();
  for (const p of people) byId.set(p.id, p);
  for (const c of candidates) {
    if (!byId.has(c.id)) {
      byId.set(c.id, { id: c.id, fullName: c.fullName, active: true, site: siteName });
    }
  }

  const shortCounts = new Map<string, number>();
  for (const p of byId.values()) {
    const s = shortName(p.fullName);
    shortCounts.set(s, (shortCounts.get(s) ?? 0) + 1);
  }
  const display = new Map<string, string>();
  for (const p of byId.values()) {
    const s = shortName(p.fullName);
    display.set(p.id, (shortCounts.get(s) ?? 0) > 1 && p.fullName ? p.fullName : s);
  }

  return {
    siteName,
    byId,
    name: (id) => (id ? (display.get(id) ?? "Unknown coach") : ""),
    fullName: (id) => (id ? byId.get(id)?.fullName || "Unknown coach" : ""),
    flag: (id) => (id ? flagFor(byId.get(id), siteName) : null),
  };
}

/** "(moved)" / "(inactive)" after a name, for text-only places like the PDF. */
export function flagTag(flag: CoachFlag): string {
  return flag === "moved" ? " (moved)" : flag === "inactive" ? " (inactive)" : "";
}
