// Per-week summaries for the rota landing page: the week strip, the selected
// week's detail panel and Needs attention all read from these.
//
// Every rule works on one week's own roster and class rows. "Without a coach"
// here is wider than the board's Unassigned column: it also counts a class whose
// coach is on leave or sick that day. The board (lib/rota/columns.ts) is not
// changed by that; this is a landing-page summary only.
//
// Pure: no Supabase or React imports, like columns.ts and people.ts.

import type { ClassRow, RosterRow } from "@/components/rota/RotaBoard";
import { DAY_NAMES } from "./board";
import { isOrphan } from "./columns";
import { flagTag, type RotaDirectory } from "./people";
import {
  addDays,
  formatWeekDate,
  parseWeekDate,
  relativeWeekLabel,
  weekDayLabels,
  weekOffset,
  weekRangeShort,
} from "./week";

export type WeekStatus = "ready" | "withoutCoach" | "noClasses";

export type DayCoach = {
  id: string;
  /** Short name plus " (moved)" / " (inactive)" where flagged. */
  label: string;
  /** Delivers at least one class that day whose set coach is someone else. */
  cover: boolean;
};

export type DaySummary = {
  /** "19 Oct" */
  date: string;
  classes: number;
  withoutCoach: number;
  covered: number;
  /** Working coaches that day, in roster order. Leave/sick get no chip. */
  coaches: DayCoach[];
};

export type WeekSummary = {
  id: string;
  /** "YYYY-MM-DD" */
  monday: string;
  /** Whole weeks from this week's Monday. */
  offset: number;
  label: string;
  /** "19–25 Oct" */
  range: string;
  status: WeekStatus;
  totals: {
    classes: number;
    withoutCoach: number;
    covered: number;
    coachesWorking: number;
  };
  days: DaySummary[];
};

export type AttentionItem = {
  monday: string;
  day: number;
  count: number;
  text: string;
};

type ClassKind = "withoutCoach" | "covered" | null;

/**
 * Exactly one of three for each class, without-a-coach first:
 * 1. withoutCoach: coach_id NULL, an orphan (coach not rostered that day), or
 *    the coach's roster row that day is leave or sick.
 * 2. covered: otherwise, when set_coach_id is someone other than coach_id.
 * 3. neither.
 */
export function classifyClass(c: ClassRow, roster: RosterRow[]): ClassKind {
  if (c.coach_id === null || isOrphan(c, roster)) return "withoutCoach";
  const away = roster.some(
    (r) =>
      r.day_of_week === c.day_of_week &&
      r.coach_id === c.coach_id &&
      (r.status === "leave" || r.status === "sick")
  );
  if (away) return "withoutCoach";
  if (c.set_coach_id !== null && c.set_coach_id !== c.coach_id) return "covered";
  return null;
}

export function summariseWeek(
  week: { id: string; monday: string },
  roster: RosterRow[],
  classes: ClassRow[],
  directory: RotaDirectory,
  thisMonday: string
): WeekSummary {
  // Safe to assert: week_start_date is a Postgres date, always "YYYY-MM-DD".
  const parsed = parseWeekDate(week.monday)!;
  const dates = weekDayLabels(parsed);

  const days: DaySummary[] = dates.map((date, d) => {
    const dayClasses = classes.filter((c) => c.day_of_week === d);
    let withoutCoach = 0;
    let covered = 0;
    for (const c of dayClasses) {
      const kind = classifyClass(c, roster);
      if (kind === "withoutCoach") withoutCoach++;
      else if (kind === "covered") covered++;
    }
    const coaches = roster
      .filter((r) => r.day_of_week === d && r.status === "working")
      .map((r) => ({
        id: r.coach_id,
        label: directory.name(r.coach_id) + flagTag(directory.flag(r.coach_id)),
        cover: dayClasses.some(
          (c) =>
            c.coach_id === r.coach_id &&
            c.set_coach_id !== null &&
            c.set_coach_id !== r.coach_id
        ),
      }));
    return { date, classes: dayClasses.length, withoutCoach, covered, coaches };
  });

  const totals = {
    classes: days.reduce((n, d) => n + d.classes, 0),
    withoutCoach: days.reduce((n, d) => n + d.withoutCoach, 0),
    covered: days.reduce((n, d) => n + d.covered, 0),
    coachesWorking: new Set(
      roster.filter((r) => r.status === "working").map((r) => r.coach_id)
    ).size,
  };

  const status: WeekStatus =
    totals.classes === 0 ? "noClasses" : totals.withoutCoach > 0 ? "withoutCoach" : "ready";

  const offset = weekOffset(week.monday, thisMonday);
  return {
    id: week.id,
    monday: week.monday,
    offset,
    label: relativeWeekLabel(offset),
    range: weekRangeShort(parsed),
    status,
    totals,
    days,
  };
}

/**
 * The week the landing page selects when the URL doesn't name one: this week if
 * it exists, else the next upcoming created week, else the latest past one.
 * `current` is ascending from this week; `past` is newest first.
 */
export function pickDefaultWeek(
  current: { monday: string }[],
  past: { monday: string }[],
  thisMonday: string
): string | null {
  if (current.some((w) => w.monday === thisMonday)) return thisMonday;
  if (current.length > 0) return current[0].monday;
  if (past.length > 0) return past[0].monday;
  return null;
}

/** One item per (week, day) with a class without a coach, in date order. */
export function needsAttention(weeks: WeekSummary[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const w of weeks) {
    w.days.forEach((day, d) => {
      if (day.withoutCoach === 0) return;
      const n = day.withoutCoach;
      items.push({
        monday: w.monday,
        day: d,
        count: n,
        text: `${n} class${n === 1 ? "" : "es"} without a coach, ${DAY_NAMES[d].slice(0, 3)} ${day.date}`,
      });
    });
  }
  return items;
}

/** Standard rota "Coaches": distinct coaches working on at least one day. */
export function standardCoachCount(rows: { coach_id: string; status: string }[]): number {
  return new Set(rows.filter((r) => r.status === "working").map((r) => r.coach_id)).size;
}

/** create_weekly_rota accepts this week up to this many weeks ahead (0030). */
export const ADD_WEEK_MAX_AHEAD = 16;

export type AddWeekOption = {
  /** "YYYY-MM-DD" */
  monday: string;
  /** "Mon 9 Nov · Next week" */
  label: string;
};

/**
 * Add week's "Week commencing" choices: this week up to 16 ahead, minus weeks
 * already created. Built on the server from the London Monday, so the browser
 * never decides what "this week" is.
 */
export function addWeekOptions(thisMonday: string, existing: Set<string>): AddWeekOption[] {
  // Safe to assert: currentMonday() always returns "YYYY-MM-DD".
  const start = parseWeekDate(thisMonday)!;
  const options: AddWeekOption[] = [];
  for (let i = 0; i <= ADD_WEEK_MAX_AHEAD; i++) {
    const monday = addDays(start, i * 7);
    const iso = formatWeekDate(monday);
    if (existing.has(iso)) continue;
    options.push({
      monday: iso,
      label: `Mon ${weekDayLabels(monday)[0]} · ${relativeWeekLabel(i)}`,
    });
  }
  return options;
}
