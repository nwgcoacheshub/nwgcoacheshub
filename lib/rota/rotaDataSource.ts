// Where a rota board writes to.
//
// The Standard Rota and a generated week are the same board over two different
// table pairs — rota_standard_roster/rota_standard_classes, scoped by site_id,
// and rota_weekly_roster/rota_weekly_classes, scoped by weekly_rota_id. Rather
// than teach the board about both, it takes one of these and calls it; the
// board never names a table.
//
// Coaches are deliberately not in here: rota_coaches is site-scoped in both
// modes (a week's roster still points at the site's coaches), so adding one
// isn't a scoped write and stays on the board with its site_id.
//
// Every method returns the same { error } shape the board's optimistic
// `commit` helper expects, so a failed write rolls the board back either way.

import { createClient } from "@/lib/supabaseClient";
import type { CoachStatus } from "./board";

export type WriteResult = { error: { message: string } | null };

/** Roster row as first inserted — status and the flags come from defaults. */
export type RosterInsert = {
  id: string;
  day_of_week: number;
  coach_id: string;
  sort_order: number;
  shift_start_mins: number;
  shift_end_mins: number;
};

export type RosterPatch = {
  shift_start_mins?: number;
  shift_end_mins?: number;
  status?: CoachStatus;
  is_key_holder?: boolean;
};

export type ClassInsert = {
  id: string;
  day_of_week: number;
  coach_id: string;
  set_coach_id: string | null;
  class_catalogue_id: string | null;
  title: string;
  category_key: string;
  meta: string | null;
  start_mins: number;
  duration_mins: number;
};

export type ClassPatch = Partial<Omit<ClassInsert, "id">>;

/** Flags capped at one coach per day by a partial unique index. */
export type ExclusiveFlag = "is_lead" | "is_cashing_up";

export interface RotaDataSource {
  insertRoster(row: RosterInsert): Promise<WriteResult>;
  updateRoster(rowId: string, patch: RosterPatch): Promise<WriteResult>;
  deleteRoster(rowId: string): Promise<WriteResult>;
  /**
   * Sets `field` on one roster row, clearing it on `displacedIds` first.
   * See makeDataSource for why the order matters.
   */
  setExclusiveFlag(
    rowId: string,
    field: ExclusiveFlag,
    value: boolean,
    displacedIds: string[]
  ): Promise<WriteResult>;
  insertClass(row: ClassInsert): Promise<WriteResult>;
  updateClass(classId: string, patch: ClassPatch): Promise<WriteResult>;
  deleteClass(classId: string): Promise<WriteResult>;
  /** Used when a coach's column is removed from a day. */
  deleteClassesForCoachDay(day: number, coachId: string): Promise<WriteResult>;
}

/**
 * `scope` is the column pair that ties rows to this board —
 * { site_id } for the standard rota, { weekly_rota_id } for a week. It's
 * merged into every insert and used to bound the bulk delete, so rows can
 * never be written into the wrong scope.
 */
function makeDataSource(
  rosterTable: string,
  classTable: string,
  scope: Record<string, string>
): RotaDataSource {
  const supabase = createClient();

  return {
    async insertRoster(row) {
      const { error } = await supabase.from(rosterTable).insert({ ...row, ...scope });
      return { error };
    },

    async updateRoster(rowId, patch) {
      const { error } = await supabase.from(rosterTable).update(patch).eq("id", rowId);
      return { error };
    },

    async deleteRoster(rowId) {
      const { error } = await supabase.from(rosterTable).delete().eq("id", rowId);
      return { error };
    },

    // is_lead and is_cashing_up are capped at one row per day by partial unique
    // indexes — one_lead_per_standard_day / one_lead_per_week_day and their
    // cash-up equivalents. Whoever holds the flag has to be cleared before the
    // new holder is set, or the write hits the constraint instead of taking it
    // off them. Same sequence for both table pairs.
    async setExclusiveFlag(rowId, field, value, displacedIds) {
      for (const id of displacedIds) {
        const { error } = await supabase
          .from(rosterTable)
          .update({ [field]: false })
          .eq("id", id);
        if (error) return { error };
      }
      const { error } = await supabase
        .from(rosterTable)
        .update({ [field]: value })
        .eq("id", rowId);
      return { error };
    },

    async insertClass(row) {
      const { error } = await supabase.from(classTable).insert({ ...row, ...scope });
      return { error };
    },

    async updateClass(classId, patch) {
      const { error } = await supabase
        .from(classTable)
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", classId);
      return { error };
    },

    async deleteClass(classId) {
      const { error } = await supabase.from(classTable).delete().eq("id", classId);
      return { error };
    },

    async deleteClassesForCoachDay(day, coachId) {
      const { error } = await supabase
        .from(classTable)
        .delete()
        .match(scope)
        .eq("day_of_week", day)
        .eq("coach_id", coachId);
      return { error };
    },
  };
}

/** The repeating template for one site. */
export function standardDataSource(siteId: string): RotaDataSource {
  return makeDataSource("rota_standard_roster", "rota_standard_classes", {
    site_id: siteId,
  });
}

/**
 * One generated week. Edits land only on the weekly tables, so changing a week
 * never touches the Standard Rota it was copied from.
 */
export function weeklyDataSource(weeklyRotaId: string): RotaDataSource {
  return makeDataSource("rota_weekly_roster", "rota_weekly_classes", {
    weekly_rota_id: weeklyRotaId,
  });
}
