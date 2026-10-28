// Which column each class sits in on one day. Shared by the board and the PDF
// export so the two can never disagree about where a class is drawn.
//
// A class with coach_id NULL is unassigned. A class whose coach_id has no
// roster row on its day is an orphan: it belongs to no coach column, so it's
// drawn in that day's Unassigned column too, labelled "Not rostered". Display
// only: nothing here (or anywhere that renders it) writes the row back.
//
// Pure: no Supabase or React imports.

import type { ClassRow, RosterRow } from "@/components/rota/RotaBoard";

export type DayColumns = {
  /** coach_id -> that coach's classes, for every coach rostered that day. */
  byCoach: Map<string, ClassRow[]>;
  /** coach_id NULL classes, then orphans: everything for the Unassigned column. */
  unassigned: ClassRow[];
};

/** Groups one day's classes against that day's roster. */
export function groupDay(day: number, dayRoster: RosterRow[], classes: ClassRow[]): DayColumns {
  const byCoach = new Map<string, ClassRow[]>();
  for (const row of dayRoster) byCoach.set(row.coach_id, []);

  const unassigned: ClassRow[] = [];
  const orphans: ClassRow[] = [];
  for (const c of classes) {
    if (c.day_of_week !== day) continue;
    if (c.coach_id === null) unassigned.push(c);
    else {
      const own = byCoach.get(c.coach_id);
      if (own) own.push(c);
      else orphans.push(c);
    }
  }

  return { byCoach, unassigned: [...unassigned, ...orphans] };
}

/** coach_id set, but that coach has no roster row on the class's day. */
export function isOrphan(ev: ClassRow, roster: RosterRow[]): boolean {
  return (
    ev.coach_id !== null &&
    !roster.some((r) => r.day_of_week === ev.day_of_week && r.coach_id === ev.coach_id)
  );
}

/**
 * Coach line for a card in the Unassigned column, longest first. The board
 * uses [0]; the PDF uses the first one that fits the lane.
 */
export function unassignedCoachLines(ev: ClassRow, name: (id: string) => string): string[] {
  if (ev.coach_id !== null) {
    const coach = `Not rostered: ${name(ev.coach_id)}`;
    return ev.set_coach_id && ev.set_coach_id !== ev.coach_id
      ? [`${coach} · for ${name(ev.set_coach_id)}`, coach, "Not rostered"]
      : [coach, "Not rostered"];
  }
  return ev.set_coach_id
    ? [`Unassigned · for ${name(ev.set_coach_id)}`, "Unassigned"]
    : ["No coach yet"];
}
