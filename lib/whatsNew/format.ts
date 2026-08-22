// Pure formatting helper shared by the What's New panel and page. No Next or
// Supabase imports, so it can be exercised directly.

/**
 * "14 Aug 2026". Pinned to UTC for the same reason PoliciesLibrary's
 * formatUpdated() is: these render on the server and hydrate on the client, and
 * a timezone-dependent date can disagree between the two.
 *
 * Absolute rather than relative, unlike club_updates' relativeDay(). That helper
 * measures against londonToday(), which suits a timestamp that is always
 * "recently created" — but published_at can be backdated or set ahead (0025's
 * note on the column), so a relative label is the wrong shape for it.
 */
export function formatPublished(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
