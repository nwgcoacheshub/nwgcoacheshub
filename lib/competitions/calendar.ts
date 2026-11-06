// Derivations for the Competition Calendar (/competitions/calendar). Pure: the
// page does the fetching, this shapes comp_events rows (0031) into season-grid
// weeks, list months and display labels. No Next or Supabase imports.
//
// Dates stay "YYYY-MM-DD" strings, like lib/rota/week.ts, so ISO strings compare
// correctly with < and >, and nothing can slip a day across GMT/BST.

import { addDays, formatWeekDate, mondayOf, MONTHS_SHORT, parseWeekDate } from "@/lib/rota/week";

// The 0031 check constraint's values, in its order.
export const EVENT_TYPES = [
  "NWG All Competition",
  "NWG Club Competition",
  "Invitational Competition",
  "Regional/National Competition",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Filter chip labels: the type without " Competition". */
export const EVENT_TYPE_SHORT: Record<EventType, string> = {
  "NWG All Competition": "NWG All",
  "NWG Club Competition": "NWG Club",
  "Invitational Competition": "Invitational",
  "Regional/National Competition": "Regional/National",
};

export type CompEvent = {
  id: string;
  title: string;
  eventType: EventType;
  /** "YYYY-MM-DD" */
  startDate: string;
  /** "YYYY-MM-DD", on or after startDate */
  endDate: string;
  venue: string | null;
  organiser: string | null;
  link: string | null;
  notes: string | null;
  /** NWG All Competition: every site attends, derived from the type. */
  allSites: boolean;
  /** Attending active sites (empty when allSites). */
  siteIds: string[];
};

export type SeasonWeek = {
  /** "YYYY-MM-DD" */
  monday: string;
  /** "YYYY-MM-DD" */
  sunday: string;
  /** "w/c 5 Jan" */
  label: string;
  /** "2026-01" */
  monthKey: string;
  /** "January 2026" */
  monthLabel: string;
  isCurrent: boolean;
  isPast: boolean;
};

export type ListMonth = {
  /** "2026-01" */
  key: string;
  /** "January 2026" */
  label: string;
  events: CompEvent[];
  /** Every event in the month ended before today. */
  past: boolean;
};

export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

const MONTHS_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

// Indexed by getUTCDay (0 = Sunday). Spelled out for the same reason as
// MONTHS_SHORT: Intl output isn't stable across ICU versions.
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DAYS_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** `?year=` as a year, or null if missing or not a 4-digit year in range. */
export function parseYear(value: string | undefined): number | null {
  if (!value || !/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return year >= MIN_YEAR && year <= MAX_YEAR ? year : null;
}

/** The Monday a season week counts toward, as a "YYYY-MM" month key. */
function monthKeyOf(monday: Date, year: number): string {
  // Rule A, as cycleWeeksInMonth (lib/clubProfile/meetings.ts): a week belongs
  // to the month its Monday falls in. The one exception is the leading week,
  // whose Monday can fall in the previous December: it goes under January
  // rather than giving the year a one-row December header.
  if (monday.getUTCFullYear() < year) return `${year}-01`;
  return formatWeekDate(monday).slice(0, 7);
}

function monthLabelOf(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS_FULL[m - 1]} ${y}`;
}

/**
 * Monday-anchored weeks covering 1 Jan–31 Dec of `year`: from the week
 * containing 1 Jan to the week containing 31 Dec (52 or 53 rows).
 * `today` is the London date, "YYYY-MM-DD".
 */
export function seasonWeeks(year: number, today: string): SeasonWeek[] {
  const first = mondayOf(new Date(Date.UTC(year, 0, 1)));
  const last = mondayOf(new Date(Date.UTC(year, 11, 31)));
  const weeks: SeasonWeek[] = [];
  for (let d = first; d.getTime() <= last.getTime(); d = addDays(d, 7)) {
    const monday = formatWeekDate(d);
    const sunday = formatWeekDate(addDays(d, 6));
    const monthKey = monthKeyOf(d, year);
    weeks.push({
      monday,
      sunday,
      label: `w/c ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`,
      monthKey,
      monthLabel: monthLabelOf(monthKey),
      isCurrent: monday <= today && today <= sunday,
      isPast: sunday < today,
    });
  }
  return weeks;
}

/** Events overlapping `from`–`to` (inclusive "YYYY-MM-DD"). */
export function eventsOverlapping(events: CompEvent[], from: string, to: string): CompEvent[] {
  return events.filter((e) => e.startDate <= to && e.endDate >= from);
}

/** Events overlapping 1 Jan–31 Dec of `year`. */
export function eventsInYear(events: CompEvent[], year: number): CompEvent[] {
  return eventsOverlapping(events, `${year}-01-01`, `${year}-12-31`);
}

// Safe to assert in the label helpers: comp_events dates are Postgres dates,
// always "YYYY-MM-DD".

/** "Sat 9", "Sat 9–Sun 10", or "Sat 31 Oct–Sun 1 Nov" across a month end. */
export function dayLabel(e: Pick<CompEvent, "startDate" | "endDate">): string {
  const s = parseWeekDate(e.startDate)!;
  if (e.endDate === e.startDate) return `${DAYS_SHORT[s.getUTCDay()]} ${s.getUTCDate()}`;
  const end = parseWeekDate(e.endDate)!;
  const sameMonth = e.startDate.slice(0, 7) === e.endDate.slice(0, 7);
  if (sameMonth) {
    return `${DAYS_SHORT[s.getUTCDay()]} ${s.getUTCDate()}–${DAYS_SHORT[end.getUTCDay()]} ${end.getUTCDate()}`;
  }
  return (
    `${DAYS_SHORT[s.getUTCDay()]} ${s.getUTCDate()} ${MONTHS_SHORT[s.getUTCMonth()]}–` +
    `${DAYS_SHORT[end.getUTCDay()]} ${end.getUTCDate()} ${MONTHS_SHORT[end.getUTCMonth()]}`
  );
}

function fullDate(d: Date, withYear: boolean): string {
  const base = `${DAYS_FULL[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_FULL[d.getUTCMonth()]}`;
  return withYear ? `${base} ${d.getUTCFullYear()}` : base;
}

/**
 * "Saturday 7 November 2026", or
 * "Saturday 7 November 2026 – Sunday 8 November 2026" for a multi-day event.
 */
export function fullDateLabel(e: Pick<CompEvent, "startDate" | "endDate">): string {
  const s = parseWeekDate(e.startDate)!;
  if (e.endDate === e.startDate) return fullDate(s, true);
  return `${fullDate(s, true)} – ${fullDate(parseWeekDate(e.endDate)!, true)}`;
}

/**
 * Events grouped by the month their start date falls in, in date order. An
 * event spanning two months is listed once, under its start month.
 */
export function groupByStartMonth(events: CompEvent[], today: string): ListMonth[] {
  const sorted = [...events].sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title)
  );
  const months = new Map<string, ListMonth>();
  for (const e of sorted) {
    const key = e.startDate.slice(0, 7);
    let month = months.get(key);
    if (!month) {
      month = { key, label: monthLabelOf(key), events: [], past: true };
      months.set(key, month);
    }
    month.events.push(e);
    if (e.endDate >= today) month.past = false;
  }
  return [...months.values()];
}

/** The link as an http(s) URL, or null if it doesn't parse as one. */
export function safeHttpUrl(link: string | null): string | null {
  if (!link) return null;
  try {
    const url = new URL(link.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
