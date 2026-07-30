// Week-date helpers for the weekly rota routes.
//
// A week is identified by its Monday, held as a plain "YYYY-MM-DD" string so it
// matches rota_weekly_rotas.week_start_date (a Postgres `date`) exactly, with
// no time or offset to lose in transit.
//
// All arithmetic runs on UTC-midnight Date objects, so adding or subtracting
// days can't slip by one across a GMT/BST boundary. The only place a real
// timezone matters is deciding what "today" is — that uses Europe/London,
// because every NWG site is in the UK and the server may not be.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parses "YYYY-MM-DD" to a UTC-midnight Date, or null if it isn't a real date.
 * Deliberately strict: `new Date("2026-02-30")` silently rolls over to March,
 * which would then redirect to the wrong week rather than being rejected.
 */
export function parseWeekDate(value: string): Date | null {
  if (!ISO_DATE.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}

/** UTC-midnight Date -> "YYYY-MM-DD". */
export function formatWeekDate(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

export function isMonday(date: Date): boolean {
  return date.getUTCDay() === 1;
}

/** The Monday of the week containing `date` — the date itself if it's a Monday. */
export function mondayOf(date: Date): Date {
  // getUTCDay is 0=Sun..6=Sat; (day + 6) % 7 is days elapsed since Monday.
  return addDays(date, -((date.getUTCDay() + 6) % 7));
}

/** Today's date in Europe/London, as a UTC-midnight Date. */
export function londonToday(): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
}

/** "YYYY-MM-DD" for the Monday of the current real-world week in the UK. */
export function currentMonday(): string {
  return formatWeekDate(mondayOf(londonToday()));
}

// Spelled out rather than taken from Intl: en-GB abbreviates September as
// "Sept", which is the odd one out at four letters, and the abbreviations
// aren't stable across ICU versions — so the same week could be labelled
// differently on the server and in the browser.
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function dayNum(date: Date) {
  return date.getUTCDate();
}

function monthShort(date: Date) {
  return MONTHS_SHORT[date.getUTCMonth()];
}

/**
 * Mon–Sun range for display: "4–10 Aug 2026", "28 Sep – 4 Oct 2026",
 * "28 Dec 2026 – 3 Jan 2027". This is the {date range} in the phase 5a copy.
 */
export function weekRangeLabel(monday: Date): string {
  const sunday = addDays(monday, 6);
  const sameYear = monday.getUTCFullYear() === sunday.getUTCFullYear();
  const sameMonth = sameYear && monday.getUTCMonth() === sunday.getUTCMonth();

  if (sameMonth) {
    return `${dayNum(monday)}–${dayNum(sunday)} ${monthShort(sunday)} ${sunday.getUTCFullYear()}`;
  }

  const from = sameYear
    ? `${dayNum(monday)} ${monthShort(monday)}`
    : `${dayNum(monday)} ${monthShort(monday)} ${monday.getUTCFullYear()}`;
  return `${from} – ${dayNum(sunday)} ${monthShort(sunday)} ${sunday.getUTCFullYear()}`;
}
