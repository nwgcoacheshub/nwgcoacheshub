// Derivations for Club Profile's Meetings schedule. Pure — the page does the
// fetching, this shapes it into what the read views and the Manage meetings
// modal render. No Next or Supabase imports, so it can be exercised directly.

import { parseWeekDate } from "@/lib/rota/week";

// Fixed display order, matching the 0021 check constraint exactly.
export const MEETING_CATEGORIES = [
  "1:1s with CHC",
  "1:1s with RGM",
  "Department Meetings",
  "Other",
] as const;
export type MeetingCategory = (typeof MEETING_CATEGORIES)[number];

/** Length of the shared cycle — matches 0022's `between 1 and 9` check. */
export const CYCLE_WEEK_COUNT = 9;
export const CYCLE_WEEK_NUMBERS = Array.from(
  { length: CYCLE_WEEK_COUNT },
  (_, i) => i + 1
);

export type CycleWeek = {
  id: string;
  week_commencing: string;
  week_number: number;
};

export type ClubMeeting = {
  id: string;
  category: string;
  title: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string | null;
  display_order: number;
};

/** A club_meeting_attendees row (0022) — the meeting's fixed attendee list. */
export type MeetingAttendee = {
  meeting_id: string;
  coach_id: string;
};

/**
 * A club_meeting_cycle_weeks row (0022). ZERO rows for a meeting means it runs
 * every week — the absence of a restriction is the restriction.
 */
export type MeetingCycleWeek = {
  meeting_id: string;
  cycle_week_number: number;
};

/**
 * Which of the nine cycle weeks the week commencing `weekCommencing` is, or
 * null if cycle_weeks has no row for that Monday (the seeded cycle runs out at
 * some point, and the page still has to render).
 */
export function cycleWeekNumberFor(
  cycleWeeks: CycleWeek[],
  weekCommencing: string
): number | null {
  return cycleWeeks.find((w) => w.week_commencing === weekCommencing)?.week_number ?? null;
}

/**
 * Cycle weeks whose Monday falls within the calendar month containing
 * `reference` (Rule A) — a week counts toward the month its week_commencing
 * falls in, so a week straddling a month boundary is never double-counted.
 */
export function cycleWeeksInMonth(
  cycleWeeks: CycleWeek[],
  reference: Date
): CycleWeek[] {
  const monthStart = Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1);
  const nextMonthStart = Date.UTC(
    reference.getUTCFullYear(),
    reference.getUTCMonth() + 1,
    1
  );
  return cycleWeeks.filter((week) => {
    const date = parseWeekDate(week.week_commencing);
    if (!date) return false;
    const t = date.getTime();
    return t >= monthStart && t < nextMonthStart;
  });
}

export type MeetingView = {
  id: string;
  title: string;
  category: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  location: string | null;
  attendeeIds: string[];
  attendeeNames: string[];
  /** Cycle week numbers this meeting is restricted to; empty = every week. */
  cycleWeekNumbers: number[];
};

export type MeetingCategoryGroup = {
  category: MeetingCategory;
  meetings: MeetingView[];
};

/** One dated occurrence of a meeting, for the monthly read view. */
export type MeetingOccurrence = {
  key: string;
  meeting: MeetingView;
  cycleWeekId: string;
  weekCommencing: string;
  weekNumber: number;
};

export type MeetingOccurrenceGroup = {
  category: MeetingCategory;
  occurrences: MeetingOccurrence[];
};

/**
 * Every meeting with its fixed attendee list and week pattern attached. No
 * occurrence filtering happens here — callers decide which weeks they're
 * asking about via meetingRunsInCycleWeek/buildMonthlyOccurrenceGroups, and
 * Manage meetings uses the unfiltered list.
 */
export function buildMeetingViews({
  meetings,
  attendees,
  cycleWeeks,
  coachNameById,
}: {
  meetings: ClubMeeting[];
  attendees: MeetingAttendee[];
  cycleWeeks: MeetingCycleWeek[];
  coachNameById: Map<string, string>;
}): MeetingView[] {
  const attendeesByMeeting = new Map<string, string[]>();
  for (const attendee of attendees) {
    const list = attendeesByMeeting.get(attendee.meeting_id) ?? [];
    list.push(attendee.coach_id);
    attendeesByMeeting.set(attendee.meeting_id, list);
  }

  const weeksByMeeting = new Map<string, number[]>();
  for (const week of cycleWeeks) {
    const list = weeksByMeeting.get(week.meeting_id) ?? [];
    list.push(week.cycle_week_number);
    weeksByMeeting.set(week.meeting_id, list);
  }

  return meetings.map((meeting) => {
    const attendeeIds = attendeesByMeeting.get(meeting.id) ?? [];
    return {
      id: meeting.id,
      title: meeting.title,
      category: meeting.category,
      dayOfWeek: meeting.day_of_week,
      startTime: meeting.start_time,
      endTime: meeting.end_time,
      location: meeting.location,
      attendeeIds,
      attendeeNames: attendeeIds
        .map((id) => coachNameById.get(id) ?? "Unknown")
        .sort((a, b) => a.localeCompare(b)),
      cycleWeekNumbers: (weeksByMeeting.get(meeting.id) ?? []).sort((a, b) => a - b),
    };
  });
}

/**
 * Whether a meeting runs in the given cycle week. An unrestricted meeting runs
 * in every week, including one we couldn't resolve a number for; a restricted
 * one can't be placed at all without a number, so it's left out.
 */
export function meetingRunsInCycleWeek(
  meeting: MeetingView,
  weekNumber: number | null
): boolean {
  if (meeting.cycleWeekNumbers.length === 0) return true;
  if (weekNumber === null) return false;
  return meeting.cycleWeekNumbers.includes(weekNumber);
}

export function groupMeetingsByCategory(views: MeetingView[]): MeetingCategoryGroup[] {
  return MEETING_CATEGORIES.map((category) => ({
    category,
    meetings: views.filter((m) => m.category === category),
  }));
}

/**
 * One occurrence per (meeting, week) pair the meeting actually runs in, over
 * the weeks the caller passes (the calendar month's, per cycleWeeksInMonth).
 */
export function buildMonthlyOccurrenceGroups(
  views: MeetingView[],
  weeks: CycleWeek[]
): MeetingOccurrenceGroup[] {
  return MEETING_CATEGORIES.map((category) => ({
    category,
    occurrences: views
      .filter((meeting) => meeting.category === category)
      .flatMap((meeting) =>
        weeks
          .filter((week) => meetingRunsInCycleWeek(meeting, week.week_number))
          .map((week) => ({
            key: `${meeting.id}-${week.id}`,
            meeting,
            cycleWeekId: week.id,
            weekCommencing: week.week_commencing,
            weekNumber: week.week_number,
          }))
      ),
  }));
}
