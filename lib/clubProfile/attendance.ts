// Derivations over a week's rota_weekly_roster rows, for the attendance grid
// and the staff-hours modal. Pure — the page does the fetching.

import type { CoachStatus } from "@/lib/rota/board";

export type RosterRow = {
  day_of_week: number;
  coach_id: string;
  shift_start_mins: number;
  shift_end_mins: number;
  status: string;
};

export type RosterCoach = { id: string; name: string };

export type AttendanceRow = {
  coachId: string;
  name: string;
  /** Index 0=Mon..6=Sun; null where the coach has no roster row that day. */
  days: (CoachStatus | null)[];
};

const STATUS_LABELS: Record<CoachStatus, string> = {
  working: "In",
  leave: "AL",
  sick: "Sick",
};

export function statusLabel(status: CoachStatus): string {
  return STATUS_LABELS[status];
}

function isCoachStatus(value: string): value is CoachStatus {
  return value === "working" || value === "leave" || value === "sick";
}

/**
 * One row per coach who actually appears in this week's roster — coaches with
 * no row that week are omitted entirely rather than shown as a blank line.
 * Ordered by name, matching how the rota board lists coaches.
 */
export function buildAttendanceRows(
  roster: RosterRow[],
  coaches: RosterCoach[]
): AttendanceRow[] {
  const nameById = new Map(coaches.map((c) => [c.id, c.name]));
  const byCoach = new Map<string, (CoachStatus | null)[]>();

  for (const row of roster) {
    if (row.day_of_week < 0 || row.day_of_week > 6) continue;
    if (!byCoach.has(row.coach_id)) {
      byCoach.set(row.coach_id, Array(7).fill(null));
    }
    if (isCoachStatus(row.status)) {
      byCoach.get(row.coach_id)![row.day_of_week] = row.status;
    }
  }

  return [...byCoach.entries()]
    .map(([coachId, days]) => ({
      coachId,
      // A roster row can outlive its coach row being deactivated and dropped
      // from the site list, so don't assume the name lookup hits.
      name: nameById.get(coachId) ?? "Unknown coach",
      days,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type WorkedTotal = { coachId: string; name: string; minutes: number };

/**
 * Minutes worked per coach across the week: shift length summed over rows with
 * status 'working' only.
 *
 * Leave and sick rows are excluded deliberately — a coach on AL isn't working
 * those hours — which means this total is lower than the shift bars drawn on
 * the rota board, since the board draws every rostered row whatever its status.
 * The UI labels this "hours worked" for that reason.
 */
export function sumWorkedMinutes(
  roster: RosterRow[],
  coaches: RosterCoach[]
): WorkedTotal[] {
  const nameById = new Map(coaches.map((c) => [c.id, c.name]));
  const totals = new Map<string, number>();

  for (const row of roster) {
    if (row.status !== "working") continue;
    const minutes = row.shift_end_mins - row.shift_start_mins;
    if (minutes <= 0) continue;
    totals.set(row.coach_id, (totals.get(row.coach_id) ?? 0) + minutes);
  }

  return [...totals.entries()]
    .map(([coachId, minutes]) => ({
      coachId,
      name: nameById.get(coachId) ?? "Unknown coach",
      minutes,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
