// Pure formatting/derivation helpers for the Club Profile page. No Next or
// Supabase imports, so they can be exercised directly.

import { londonToday } from "@/lib/rota/week";

/**
 * Whole years between `dob` ("YYYY-MM-DD") and today in Europe/London, or null
 * if the hero has no dob recorded. Uses the same londonToday() the rota uses to
 * decide what "today" is, so an age and a week can't disagree about the date.
 */
export function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const [y, m, d] = dob.split("-").map(Number);
  if (!y || !m || !d) return null;

  const today = londonToday();
  let age = today.getUTCFullYear() - y;
  // Not had this year's birthday yet if the month is still to come, or it's the
  // birthday month but the day hasn't arrived.
  const month = today.getUTCMonth() + 1;
  if (month < m || (month === m && today.getUTCDate() < d)) age -= 1;

  return age >= 0 && age < 130 ? age : null;
}

/** 450 -> "7h 30m", 60 -> "1h", 0 -> "0h", 45 -> "45m". */
export function formatMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return "0h";
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Day-granularity relative label for a timestamp: "Today", "Yesterday",
 * "3 days ago", "2 weeks ago", then an absolute date past ~8 weeks.
 *
 * Deliberately day-granular rather than minute-granular. These components
 * render on the server and hydrate on the client, and a minute-based label
 * would disagree between the two whenever a render straddled a minute
 * boundary. Bucketing by day means the only way to mismatch is to render
 * across midnight itself.
 */
export function relativeDay(timestamp: string): string {
  const then = new Date(timestamp);
  if (Number.isNaN(then.getTime())) return "";

  const thenDay = Date.UTC(
    then.getUTCFullYear(),
    then.getUTCMonth(),
    then.getUTCDate()
  );
  const today = londonToday().getTime();
  const days = Math.round((today - thenDay) / (24 * 60 * 60 * 1000));

  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "1 week ago";
  if (days < 56) return `${Math.floor(days / 7)} weeks ago`;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(thenDay));
}
