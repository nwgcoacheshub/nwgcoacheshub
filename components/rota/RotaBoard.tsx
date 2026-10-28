"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import styles from "./rota-board.module.css";
import {
  COACH_HEAD_FLAGGED_H,
  COACH_HEAD_H,
  COL_W,
  DAY_HEAD_H,
  DAY_NAMES,
  DAY_START,
  DIVIDER_W,
  DURATION_OPTIONS,
  HOUR_PX,
  MAX_DURATION_MINS,
  MIN_CUSTOM_DURATION_MINS,
  MIN_SHIFT_MINS,
  SLOTS,
  SLOT_MIN,
  SLOT_PX,
  TIME_COL_W,
  fmtClock,
  laneAssign,
  snapClassStart,
  snapShiftEdge,
  startOptions,
  timeRangeLabel,
  topPx,
  type CoachStatus,
} from "@/lib/rota/board";
import type { RotaDataSource } from "@/lib/rota/rotaDataSource";
import {
  flagTag,
  makeDirectory,
  type CoachFlag,
  type RosterCandidate,
  type RotaPerson,
} from "@/lib/rota/people";
import { groupDay, isOrphan, unassignedCoachLines, type DayColumns } from "@/lib/rota/columns";
import RotaExportButton, { type RotaExportSpec } from "./RotaExportButton";

export type Category = { key: string; label: string; color_hex: string };

export type CatalogueItem = {
  id: string;
  title: string;
  category_key: string;
  default_meta: string | null;
  default_duration_mins: number;
};

export type RosterRow = {
  id: string;
  day_of_week: number;
  coach_id: string;
  sort_order: number;
  shift_start_mins: number;
  shift_end_mins: number;
  status: CoachStatus;
  is_key_holder: boolean;
  is_lead: boolean;
  is_cashing_up: boolean;
};

export type ClassRow = {
  id: string;
  day_of_week: number;
  /** NULL = unassigned: shown in the day's Unassigned column (0029). */
  coach_id: string | null;
  set_coach_id: string | null;
  class_catalogue_id: string | null;
  title: string;
  category_key: string;
  meta: string | null;
  start_mins: number;
  duration_mins: number;
};

type BoardData = {
  roster: RosterRow[];
  classes: ClassRow[];
};

type DragPayload =
  | { type: "class"; id: string }
  | { type: "shift"; day: number; coachId: string; edge: "start" | "finish" };

type PopoverState = { day: number; coachId: string; top: number; left: number };

type CoachPickerState = { day: number; top: number; left: number };

type ModalState = {
  editingId: string | null;
  // "" = nothing picked yet, CUSTOM_CLASS = free-text title, otherwise a
  // rota_class_catalogue id.
  catalogueId: string;
  title: string;
  categoryKey: string;
  day: number;
  // UNASSIGNED ("") = the Unassigned column.
  coachId: string;
  // NO_SET_COACH ("") = None.
  setCoachId: string;
  startMins: number;
  durationMins: number;
  // Whether the duration field is showing the free-entry "Custom…" input
  // rather than the preset dropdown. Kept separate from durationMins itself
  // so picking "Custom…" doesn't get silently reinterpreted as a preset just
  // because the typed value happens to match one.
  durationCustom: boolean;
};

/** Sentinel for the picker's "custom class" escape hatch. */
const CUSTOM_CLASS = "__custom__";

/** Sentinel for the duration picker's "Custom…" escape hatch. */
const CUSTOM_DURATION = "__custom_duration__";

/** Tooltip on the write controls that stay visible but disabled. */
const NO_EDIT_TITLE = "Your job title doesn't have rota edit rights.";

/** Coach column value for "Unassigned" in the class modal (coach_id NULL). */
const UNASSIGNED = "";

/** Set coach value for "None" in the class modal (set_coach_id NULL). */
const NO_SET_COACH = "";

/** COVER badge: someone other than the set coach is delivering it. */
function isCover(ev: ClassRow) {
  return !!ev.coach_id && !!ev.set_coach_id && ev.set_coach_id !== ev.coach_id;
}

const TIME_LABELS: number[] = [];
for (let m = DAY_START; m <= DAY_START + SLOTS * SLOT_MIN; m += 60) {
  TIME_LABELS.push(m);
}

const START_OPTIONS = startOptions();

/**
 * The rota grid. Identical for the Standard Rota, a generated week and the
 * Restructure — the only difference is the `dataSource` it writes through, so
 * nothing in here names a table.
 *
 * Coaches are profiles (0029). `people` (site_rota_people) names everyone the
 * rows reference and says whether they've moved site or been deactivated;
 * `rosterCandidates` (site_rota_roster) is who may be added. Nobody is created
 * here: new coaches are accounts, made in Admin › Users.
 */
export default function RotaBoard({
  dataSource,
  scopeLabel,
  siteName,
  categories,
  catalogue,
  people,
  rosterCandidates,
  initialRoster,
  initialClasses,
  toolbarExtra,
  exportSpec,
  canManageUsers = false,
  canEdit = false,
}: {
  dataSource: RotaDataSource;
  /** What this board is showing, for the empty note — a site or a week. */
  scopeLabel: string;
  /** rota_sites.name — what a coach's profiles.site is compared with. */
  siteName: string;
  categories: Category[];
  catalogue: CatalogueItem[];
  /** site_rota_people: names and status for every id on the board. */
  people: RotaPerson[];
  /** site_rota_roster: the assignable coaches. Empty unless canEdit. */
  rosterCandidates: RosterCandidate[];
  initialRoster: RosterRow[];
  initialClasses: ClassRow[];
  /** Extra toolbar control, e.g. the week board's regenerate action. */
  toolbarExtra?: React.ReactNode;
  /**
   * Turns on the "Export as PDF" toolbar action. It lives in here rather than
   * being passed through `toolbarExtra` because it has to export what's on the
   * board *now* — this component's live roster/class state, including edits made
   * since the page loaded — and that state never leaves this component. The
   * export itself is a wholly separate static rendering: see RotaExportLayout.
   */
  exportSpec?: RotaExportSpec;
  /**
   * The real session holds manage_users, so "Admin › Users" in the description
   * is a link. Everyone else gets the same sentence as plain text, because
   * /admin/users would only redirect them home.
   */
  canManageUsers?: boolean;
  /**
   * Whether this user may write rota data at this site — resolved server-side
   * as edit_rota at the site (hasSiteCapability, mirroring
   * public.has_site_capability() in 0026).
   *
   * Defaults to false so a caller that forgets to pass it gets the read-only
   * board rather than controls that fail at the database.
   *
   * This is presentation only — RLS is the real block. It matters because the
   * two halves of that block behave differently: a rejected insert raises
   * 42501 and `commit` rolls back, but a rejected update or delete matches zero
   * rows and comes back as `{ error: null }`, which `commit` would treat as
   * success. The optimistic edit would sit on screen until the next refresh and
   * then vanish. Hiding the controls is what stops that being reachable.
   */
  canEdit?: boolean;
}) {
  const [data, setData] = useState<BoardData>({
    roster: initialRoster,
    classes: initialClasses,
  });
  // Mirrors `data` synchronously so drag handlers and rollbacks always read the
  // latest board state rather than a stale render closure.
  const dataRef = useRef(data);
  function applyData(next: BoardData) {
    dataRef.current = next;
    setData(next);
  }

  const [error, setError] = useState<string | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [coachPicker, setCoachPicker] = useState<CoachPickerState | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [modal, setModal] = useState<ModalState | null>(null);
  const grabOffsetY = useRef(0);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const catalogueSelectRef = useRef<HTMLSelectElement | null>(null);

  const { roster, classes } = data;

  /**
   * Optimistic write: paint `next` immediately, then persist. If the write
   * fails, roll the board back to what it was and surface the message.
   *
   * Every roster and class mutation on this board funnels through here, so the
   * canEdit guard is a single choke point behind the individual controls — if a
   * write affordance is ever missed when gating, this still stops the optimistic
   * paint that would otherwise silently revert on the next refresh.
   */
  async function commit(
    next: BoardData,
    write: () => PromiseLike<{ error: { message: string } | null }>
  ) {
    if (!canEdit) return;
    const prev = dataRef.current;
    setError(null);
    applyData(next);
    const { error: writeError } = await write();
    if (writeError) {
      applyData(prev);
      setError(writeError.message);
    }
  }

  // The one lookup for every coach id: display names, set-coach labels and
  // flags. Fixed for the board's lifetime — the page refetches on navigation.
  const directory = useMemo(
    () => makeDirectory(people, rosterCandidates, siteName),
    [people, rosterCandidates, siteName]
  );

  const categoryByKey = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) map.set(c.key, c);
    return map;
  }, [categories]);

  function coachName(id: string | null) {
    return directory.name(id);
  }

  const rosterByDay = useMemo(() => {
    const byDay: RosterRow[][] = [[], [], [], [], [], [], []];
    for (const row of roster) {
      if (row.day_of_week >= 0 && row.day_of_week <= 6) byDay[row.day_of_week].push(row);
    }
    for (const list of byDay) {
      list.sort((a, b) =>
        directory
          .name(a.coach_id)
          .localeCompare(directory.name(b.coach_id), undefined, { sensitivity: "base" })
      );
    }
    return byDay;
  }, [roster, directory]);

  // Roster rows whose coach has moved site or been deactivated, grouped per
  // person for the banner (one line each, with their days).
  const flaggedPeople = useMemo(() => {
    const byCoach = new Map<string, { coachId: string; flag: CoachFlag; days: number[] }>();
    for (const row of roster) {
      const flag = directory.flag(row.coach_id);
      if (!flag) continue;
      const entry = byCoach.get(row.coach_id) ?? { coachId: row.coach_id, flag, days: [] };
      entry.days.push(row.day_of_week);
      byCoach.set(row.coach_id, entry);
    }
    return [...byCoach.values()]
      .map((e) => ({ ...e, days: e.days.sort((a, b) => a - b) }))
      .sort((a, b) => directory.name(a.coachId).localeCompare(directory.name(b.coachId)));
  }, [roster, directory]);

  const coachHeadH = flaggedPeople.length > 0 ? COACH_HEAD_FLAGGED_H : COACH_HEAD_H;

  /**
   * Column planning, same shape as the mock: a time column, then one column
   * per coach per day (widened into extra lanes when their classes overlap),
   * then an Unassigned column on any day with a coach_id NULL or orphaned class
   * (see lib/rota/columns.ts), with a divider between days.
   */
  const layout = useMemo(() => {
    const cols: number[] = [TIME_COL_W];
    const coachCols = new Map<string, { startCol: number; laneCount: number }>();
    const groups: DayColumns[] = [];
    const lanesByCoach = new Map<string, Map<string, number>>();
    const unassignedCols = new Map<
      number,
      { startCol: number; laneCount: number; lanes: Map<string, number>; classes: ClassRow[] }
    >();
    const dayCols: { startCol: number; spanCols: number; isEmpty: boolean }[] = [];
    let cursor = 2; // grid columns are 1-indexed; col 1 is the time column

    for (let d = 0; d < 7; d++) {
      const dayStartCol = cursor;
      const dayRoster = rosterByDay[d];
      const group = groupDay(d, dayRoster, classes);
      groups.push(group);

      for (const row of dayRoster) {
        const list = group.byCoach.get(row.coach_id) ?? [];
        const { lanes, laneCount } = laneAssign(list);
        const key = d + "|" + row.coach_id;
        coachCols.set(key, { startCol: cursor, laneCount });
        lanesByCoach.set(key, lanes);
        for (let i = 0; i < laneCount; i++) cols.push(COL_W);
        cursor += laneCount;
      }

      const unassigned = group.unassigned;
      if (unassigned.length > 0) {
        const { lanes, laneCount } = laneAssign(unassigned);
        unassignedCols.set(d, { startCol: cursor, laneCount, lanes, classes: unassigned });
        for (let i = 0; i < laneCount; i++) cols.push(COL_W);
        cursor += laneCount;
      }

      // A day with nothing on it still needs one column's width so its
      // header (and "+ coach" button) stays reachable on an empty board.
      const isEmpty = dayRoster.length === 0 && unassigned.length === 0;
      if (isEmpty) {
        cols.push(COL_W);
        cursor += 1;
      }

      dayCols.push({ startCol: dayStartCol, spanCols: cursor - dayStartCol, isEmpty });

      if (d < 6) {
        cols.push(DIVIDER_W);
        cursor += 1;
      }
    }

    return { cols, coachCols, lanesByCoach, unassignedCols, dayCols, groups };
  }, [rosterByDay, classes]);

  // Close the coach popover on any outside click, as the mock did. The
  // add-coach picker is the same kind of transient popover, so it shares the
  // effect.
  useEffect(() => {
    if (!popover && !coachPicker) return;
    function onDocClick() {
      setPopover(null);
      setCoachPicker(null);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [popover, coachPicker]);

  // Keyed on the mode rather than the whole modal object, so focus lands once
  // when the modal opens or switches to custom entry — not on every keystroke.
  const modalMode =
    modal === null ? null : modal.catalogueId === CUSTOM_CLASS ? "custom" : "catalogue";
  useEffect(() => {
    if (modalMode === "custom") titleInputRef.current?.focus();
    else if (modalMode === "catalogue") catalogueSelectRef.current?.focus();
  }, [modalMode]);

  /* ---------------- Mutations ---------------- */

  function moveClass(
    classId: string,
    day: number,
    coachId: string | null,
    startMins: number
  ) {
    const current = dataRef.current;
    const target = current.classes.find((c) => c.id === classId);
    if (!target) return;
    if (
      target.day_of_week === day &&
      target.coach_id === coachId &&
      target.start_mins === startMins
    ) {
      return;
    }
    // An orphan (coach not rostered that day) already sits in this day's
    // Unassigned column, so dropping it there anywhere changes nothing. Dropped
    // on another day's Unassigned it moves and unassigns like any class.
    if (coachId === null && target.day_of_week === day && isOrphan(target, current.roster)) {
      return;
    }

    // Dropping into a different coach's column is always a cover — lock in
    // whoever really owns the class before its coach column changes under
    // it. A "no cover" row stores set_coach_id as null (not a copy of
    // coach_id), so simply leaving it untouched would silently lose the real
    // owner the moment coach_id moves. If it's already covered, keep
    // pointing at that same original owner rather than the coach it's
    // currently sitting with. Moving within the same coach's column (a pure
    // time/day change) leaves set_coach_id exactly as it was.
    //
    // Unassigned (coach_id NULL) follows the same rule going in: dropping a
    // class there keeps its real owner in set_coach_id. Coming out of it,
    // set_coach_id is left exactly as it was.
    const coachChanged = target.coach_id !== coachId;
    const setCoachId =
      coachChanged && target.coach_id !== null
        ? (target.set_coach_id ?? target.coach_id)
        : target.set_coach_id;

    const next = {
      ...current,
      classes: current.classes.map((c) =>
        c.id === classId
          ? {
              ...c,
              day_of_week: day,
              coach_id: coachId,
              set_coach_id: setCoachId,
              start_mins: startMins,
            }
          : c
      ),
    };

    commit(next, () =>
      dataSource.updateClass(classId, {
        day_of_week: day,
        coach_id: coachId,
        set_coach_id: setCoachId,
        start_mins: startMins,
      })
    );
  }

  function moveShiftEdge(
    day: number,
    coachId: string,
    edge: "start" | "finish",
    droppedMins: number
  ) {
    const current = dataRef.current;
    const row = current.roster.find(
      (r) => r.day_of_week === day && r.coach_id === coachId
    );
    if (!row) return;

    let start = row.shift_start_mins;
    let end = row.shift_end_mins;
    if (edge === "start") {
      start = Math.min(droppedMins, end - MIN_SHIFT_MINS);
    } else {
      end = Math.max(droppedMins, start + MIN_SHIFT_MINS);
    }
    if (start === row.shift_start_mins && end === row.shift_end_mins) return;

    const next = {
      ...current,
      roster: current.roster.map((r) =>
        r.id === row.id ? { ...r, shift_start_mins: start, shift_end_mins: end } : r
      ),
    };

    commit(next, () =>
      dataSource.updateRoster(row.id, {
        shift_start_mins: start,
        shift_end_mins: end,
      })
    );
  }

  function setCoachStatus(rowId: string, status: CoachStatus) {
    const current = dataRef.current;
    const next = {
      ...current,
      roster: current.roster.map((r) => (r.id === rowId ? { ...r, status } : r)),
    };
    commit(next, () => dataSource.updateRoster(rowId, { status }));
  }

  function toggleKeyHolder(rowId: string, value: boolean) {
    const current = dataRef.current;
    const next = {
      ...current,
      roster: current.roster.map((r) =>
        r.id === rowId ? { ...r, is_key_holder: value } : r
      ),
    };
    commit(next, () => dataSource.updateRoster(rowId, { is_key_holder: value }));
  }

  /**
   * Lead and cashing-up are capped at one coach per day. The board works out
   * who's being displaced; the data source owns the clear-then-set order.
   */
  function toggleExclusiveFlag(
    rowId: string,
    field: "is_lead" | "is_cashing_up",
    value: boolean
  ) {
    const current = dataRef.current;
    const row = current.roster.find((r) => r.id === rowId);
    if (!row) return;
    const day = row.day_of_week;

    const displaced = value
      ? current.roster.filter((r) => r.day_of_week === day && r[field] && r.id !== rowId)
      : [];

    const next = {
      ...current,
      roster: current.roster.map((r) => {
        if (r.id === rowId) return { ...r, [field]: value };
        if (displaced.some((d) => d.id === r.id)) return { ...r, [field]: false };
        return r;
      }),
    };

    commit(next, () =>
      dataSource.setExclusiveFlag(
        rowId,
        field,
        value,
        displaced.map((d) => d.id)
      )
    );
  }

  function openCoachPicker(day: number, e: React.MouseEvent) {
    e.stopPropagation();
    setPopover(null);
    setPickerQuery("");
    const rect = e.currentTarget.getBoundingClientRect();
    setCoachPicker({
      day,
      top: rect.bottom + 6,
      // The picker is 280px wide (.coach-picker); keep it on screen.
      left: Math.min(rect.left, window.innerWidth - 300),
    });
  }

  function nextRosterRow(day: number, coachId: string): RosterRow {
    const current = dataRef.current;
    const maxSort = current.roster
      .filter((r) => r.day_of_week === day)
      .reduce((max, r) => Math.max(max, r.sort_order), -1);
    return {
      id: crypto.randomUUID(),
      day_of_week: day,
      coach_id: coachId,
      sort_order: maxSort + 1,
      shift_start_mins: DAY_START,
      shift_end_mins: DAY_START + SLOTS * SLOT_MIN,
      status: "working",
      is_key_holder: false,
      is_lead: false,
      is_cashing_up: false,
    };
  }

  /** The picker's Add action: puts a roster candidate on a day. */
  function addExistingCoachToDay(day: number, coachId: string) {
    const current = dataRef.current;
    if (current.roster.some((r) => r.day_of_week === day && r.coach_id === coachId)) {
      setError(`${coachName(coachId)} is already on ${DAY_NAMES[day]}.`);
      return;
    }

    const newRow = nextRosterRow(day, coachId);
    const next: BoardData = { ...current, roster: [...current.roster, newRow] };

    setCoachPicker(null);
    commit(next, () =>
      dataSource.insertRoster({
        id: newRow.id,
        day_of_week: day,
        coach_id: coachId,
        sort_order: newRow.sort_order,
        shift_start_mins: newRow.shift_start_mins,
        shift_end_mins: newRow.shift_end_mins,
      })
    );
  }

  async function removeCoachFromDay(day: number, coachId: string) {
    const current = dataRef.current;
    const row = current.roster.find(
      (r) => r.day_of_week === day && r.coach_id === coachId
    );
    if (!row) return;

    // Their classes that day aren't deleted: they move to Unassigned, keeping
    // whose group each one is in set_coach_id (filled from coach_id where it
    // was NULL, i.e. where it wasn't a cover).
    const affected = current.classes.filter(
      (c) => c.day_of_week === day && c.coach_id === coachId
    );
    if (
      affected.length &&
      !window.confirm(
        `Remove ${coachName(coachId)} from ${DAY_NAMES[day]}? Their ${affected.length} ${
          affected.length === 1 ? "class" : "classes"
        } will move to Unassigned.`
      )
    ) {
      return;
    }

    const next: BoardData = {
      ...current,
      roster: current.roster.filter((r) => r.id !== row.id),
      classes: current.classes.map((c) =>
        c.day_of_week === day && c.coach_id === coachId
          ? { ...c, coach_id: null, set_coach_id: c.set_coach_id ?? coachId }
          : c
      ),
    };

    setPopover(null);

    await commit(next, async () => {
      if (affected.length) {
        const { error: classError } = await dataSource.unassignClassesForCoachDay(
          day,
          coachId
        );
        if (classError) return { error: classError };
      }
      return dataSource.deleteRoster(row.id);
    });
  }

  function deleteClass(classId: string) {
    const current = dataRef.current;
    const next = {
      ...current,
      classes: current.classes.filter((c) => c.id !== classId),
    };
    commit(next, () => dataSource.deleteClass(classId));
  }

  function saveModal() {
    if (!modal) return;
    if (!modal.catalogueId) {
      setError("Choose a class from the catalogue, or pick “+ Custom class…”.");
      return;
    }
    const title = modal.title.trim();
    if (!title) {
      titleInputRef.current?.focus();
      return;
    }
    if (modal.catalogueId === CUSTOM_CLASS && !modal.categoryKey) {
      setError("Choose a colour for this class.");
      return;
    }
    if (
      !Number.isInteger(modal.durationMins) ||
      modal.durationMins < MIN_CUSTOM_DURATION_MINS ||
      modal.durationMins > MAX_DURATION_MINS
    ) {
      setError(
        `Duration must be a whole number of minutes between ${MIN_CUSTOM_DURATION_MINS} and ${MAX_DURATION_MINS}.`
      );
      return;
    }

    const current = dataRef.current;
    // Non-cover is stored as a null set_coach_id, same as every existing row —
    // only a genuine divergence from the coach column is worth persisting.
    // UNASSIGNED and NO_SET_COACH are both "", stored as NULL.
    const payload = {
      day_of_week: modal.day,
      coach_id: modal.coachId === UNASSIGNED ? null : modal.coachId,
      set_coach_id:
        modal.setCoachId === modal.coachId || modal.setCoachId === NO_SET_COACH
          ? null
          : modal.setCoachId,
      class_catalogue_id: modal.catalogueId === CUSTOM_CLASS ? null : modal.catalogueId,
      title,
      category_key: modal.categoryKey,
      start_mins: modal.startMins,
      duration_mins: modal.durationMins,
    };

    if (modal.editingId) {
      // No `meta` key here at all — the field's gone from the UI, and this
      // patch must not touch whatever's already saved in that column.
      const editingId = modal.editingId;
      const next = {
        ...current,
        classes: current.classes.map((c) =>
          c.id === editingId ? { ...c, ...payload } : c
        ),
      };
      setModal(null);
      commit(next, () => dataSource.updateClass(editingId, payload));
    } else {
      const newClass: ClassRow = { id: crypto.randomUUID(), meta: null, ...payload };
      const next = { ...current, classes: [...current.classes, newClass] };
      setModal(null);
      commit(next, () => dataSource.insertClass(newClass));
    }
  }

  /* ---------------- Modal helpers ---------------- */

  function openAddModal() {
    const day = 0;
    const coachId = rosterByDay[day][0]?.coach_id ?? UNASSIGNED;
    setModal({
      editingId: null,
      catalogueId: "", // catalogue picker, nothing chosen yet
      title: "",
      categoryKey: categories[0]?.key ?? "",
      day,
      coachId,
      // Defaults to the coach column's pick — see withCoachId for how it
      // keeps following that pick until manually overridden.
      setCoachId: coachId,
      startMins: DAY_START,
      durationMins: 60,
      durationCustom: false,
    });
  }

  function openEditModal(ev: ClassRow) {
    setModal({
      editingId: ev.id,
      // Show the catalogue item it came from. A class with no link — or one
      // whose catalogue entry has since been retired — edits as a custom class.
      catalogueId: ev.class_catalogue_id ?? CUSTOM_CLASS,
      title: ev.title,
      categoryKey: ev.category_key,
      day: ev.day_of_week,
      coachId: ev.coach_id ?? UNASSIGNED,
      // Exactly as stored — a null set_coach_id displays as the same coach
      // (no cover), a genuine cover shows the actual set coach. Either way,
      // this is the open-time snapshot withCoachId compares later edits to.
      setCoachId: ev.set_coach_id ?? ev.coach_id ?? NO_SET_COACH,
      startMins: ev.start_mins,
      durationMins: ev.duration_mins,
      // A duration that doesn't match any preset exactly opens as custom with
      // its real value shown, rather than snapping to the nearest preset.
      durationCustom: !DURATION_OPTIONS.some((o) => o.value === ev.duration_mins),
    });
  }

  /**
   * Coach column changed to `newCoachId`. Set coach auto-follows along with
   * it, but only while it hasn't been manually diverged from the coach
   * column — i.e. it still matches the coach column's previous value. Once
   * someone's picked a genuine cover, further coach column changes leave it
   * alone.
   */
  function withCoachId(current: ModalState, newCoachId: string): ModalState {
    const wasFollowing = current.setCoachId === current.coachId;
    return {
      ...current,
      coachId: newCoachId,
      setCoachId: wasFollowing ? newCoachId : current.setCoachId,
    };
  }

  /** Applying a catalogue pick: fills the fields in, but nothing is locked. */
  function selectCatalogueItem(current: ModalState, catalogueId: string): ModalState {
    if (catalogueId === CUSTOM_CLASS) {
      // Clear the title that came from the catalogue so they type their own.
      // Category and duration stay as they are, to be edited by hand.
      return { ...current, catalogueId, title: "" };
    }
    const item = catalogue.find((c) => c.id === catalogueId);
    if (!item) return { ...current, catalogueId };
    return {
      ...current,
      catalogueId,
      title: item.title,
      categoryKey: item.category_key,
      durationMins: item.default_duration_mins,
      durationCustom: !DURATION_OPTIONS.some(
        (o) => o.value === item.default_duration_mins
      ),
    };
  }

  /* ---------------- Drag & drop ---------------- */

  function onZoneDrop(e: React.DragEvent, day: number, coachId: string | null) {
    e.preventDefault();
    e.currentTarget.classList.remove("dropzone-hover");

    let payload: DragPayload;
    try {
      payload = JSON.parse(e.dataTransfer.getData("text/plain")) as DragPayload;
    } catch {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    // Subtract the grab offset so the card's top lands where it visually looks
    // like it's landing, rather than snapping its top to the cursor itself.
    const offsetY = e.clientY - rect.top - grabOffsetY.current;

    if (payload.type === "shift") {
      // Shift markers always edit their own coach's row, even when dropped
      // over somebody else's column — same as the mock.
      moveShiftEdge(payload.day, payload.coachId, payload.edge, snapShiftEdge(offsetY));
      return;
    }

    const ev = dataRef.current.classes.find((c) => c.id === payload.id);
    if (!ev) return;
    moveClass(ev.id, day, coachId, snapClassStart(offsetY, ev.duration_mins));
  }

  /* ---------------- Render ---------------- */

  const gridStyle: React.CSSProperties & Record<string, string> = {
    gridTemplateColumns: layout.cols.map((w) => w + "px").join(" "),
    gridTemplateRows: `${DAY_HEAD_H}px ${coachHeadH}px repeat(${SLOTS}, ${SLOT_PX}px)`,
    ["--hourpx"]: HOUR_PX + "px",
    // Where the pinned coach row parks itself: immediately under the pinned
    // day-name row, so it needs that row's exact height.
    ["--dayhead-h"]: DAY_HEAD_H + "px",
  };

  const popoverRow = popover
    ? roster.find(
        (r) => r.day_of_week === popover.day && r.coach_id === popover.coachId
      )
    : undefined;

  const pickerOnDay = coachPicker ? rosterByDay[coachPicker.day] : [];
  const pickerNotOnDay = coachPicker
    ? rosterCandidates.filter((c) => !pickerOnDay.some((r) => r.coach_id === c.id))
    : [];
  const pickerNeedle = pickerQuery.trim().toLowerCase();
  const pickerAvailable = pickerNeedle
    ? pickerNotOnDay.filter(
        (c) =>
          c.fullName.toLowerCase().includes(pickerNeedle) ||
          c.jobTitle.toLowerCase().includes(pickerNeedle)
      )
    : pickerNotOnDay;

  const modalDayCoaches = modal ? rosterByDay[modal.day] : [];
  // An orphan's coach isn't rostered on its day, so isn't in the list above.
  // Listed anyway so the modal shows the stored value and saving keeps it.
  const modalCoachExtra =
    modal &&
    modal.coachId !== UNASSIGNED &&
    !modalDayCoaches.some((r) => r.coach_id === modal.coachId)
      ? modal.coachId
      : null;
  // Set coach lists the assignable coaches, plus whoever the class already
  // points at if they aren't one (moved, deactivated, or not a coach title),
  // so opening and saving the modal never silently changes the stored value.
  const modalSetCoachExtra =
    modal &&
    modal.setCoachId !== NO_SET_COACH &&
    !rosterCandidates.some((c) => c.id === modal.setCoachId)
      ? modal.setCoachId
      : null;
  // A class can point at a catalogue entry that's since been deactivated. Keep
  // showing it so editing the class doesn't silently drop the link.
  const retiredCatalogueId =
    modal &&
    modal.catalogueId !== "" &&
    modal.catalogueId !== CUSTOM_CLASS &&
    !catalogue.some((c) => c.id === modal.catalogueId)
      ? modal.catalogueId
      : null;

  function zoneDropProps(day: number, coachId: string | null) {
    // Read-only boards don't accept a drop at all: without preventDefault on
    // dragover the browser never treats this as a drop target.
    if (!canEdit) return {};
    return {
      onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        e.currentTarget.classList.add("dropzone-hover");
      },
      onDragLeave: (e: React.DragEvent<HTMLDivElement>) =>
        e.currentTarget.classList.remove("dropzone-hover"),
      onDrop: (e: React.DragEvent<HTMLDivElement>) => onZoneDrop(e, day, coachId),
    };
  }

  /**
   * One class card. `flag` is the column's coach flag, if any. `unassigned`:
   * the card is in the Unassigned column, which also holds orphans, so the
   * coach line comes from unassignedCoachLines and there's no COVER badge.
   */
  function renderCard(ev: ClassRow, flag: CoachFlag, unassigned: boolean) {
    const cover = !unassigned && isCover(ev);
    const spanSlots = Math.max(1, Math.round(ev.duration_mins / SLOT_MIN));
    const coachLine = unassigned
      ? unassignedCoachLines(ev, coachName)[0]
      : `Coach: ${coachName(ev.coach_id)}`;
    return (
      <div
        key={ev.id}
        className={`card${cover ? " is-cover" : ""}${flag ? " needs-coach" : ""}`}
        style={{
          background: categoryByKey.get(ev.category_key)?.color_hex ?? "#9AA2AB",
          top: topPx(ev.start_mins),
          height: spanSlots * SLOT_PX - 2,
        }}
        draggable={canEdit}
        onDragStart={
          canEdit
            ? (e) => {
                e.currentTarget.classList.add("dragging");
                grabOffsetY.current =
                  e.clientY - e.currentTarget.getBoundingClientRect().top;
                e.dataTransfer.setData(
                  "text/plain",
                  JSON.stringify({ type: "class", id: ev.id })
                );
                e.dataTransfer.effectAllowed = "move";
              }
            : undefined
        }
        onDragEnd={canEdit ? (e) => e.currentTarget.classList.remove("dragging") : undefined}
        // The modal is an editor, so read-only users don't open it. The card
        // already carries the title, times and coach.
        onClick={canEdit ? () => openEditModal(ev) : undefined}
      >
        {canEdit && (
          <div
            className="delete"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              deleteClass(ev.id);
            }}
          >
            ×
          </div>
        )}
        {cover && <div className="cover-badge">COVER</div>}
        <div className="title">{ev.title}</div>
        <div className="meta">{timeRangeLabel(ev.start_mins, ev.duration_mins)}</div>
        <div className="coachline">{coachLine}</div>
        {flag && (
          <div className="needs-coach-line">
            {flag === "moved" ? `Needs a ${siteName} coach` : "Needs an active coach"}
          </div>
        )}
      </div>
    );
  }

  /** The drop zones (one per lane) and their cards for one column. */
  function renderZones(
    keyPrefix: string,
    day: number,
    dropCoachId: string | null,
    startCol: number,
    laneCount: number,
    lanes: Map<string, number>,
    list: ClassRow[],
    flag: CoachFlag,
    unassigned = false
  ) {
    return Array.from({ length: laneCount }, (_, lane) => (
      <div
        key={keyPrefix + "-" + lane}
        className={unassigned && lane === 0 ? "unassigned-zone" : undefined}
        style={{
          gridColumn: `${startCol + lane}`,
          gridRow: `3 / span ${SLOTS}`,
          position: "relative",
        }}
        {...zoneDropProps(day, dropCoachId)}
      >
        {list
          .filter((ev) => (lanes.get(ev.id) ?? 0) === lane)
          .map((ev) => renderCard(ev, flag, unassigned))}
      </div>
    ));
  }

  const usersLabel = "Admin › Users";

  return (
    <div
      className={`${styles.root} ${styles.fill}${canEdit ? "" : ` ${styles.readonly}`}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-5">
        <div className="text-[13px] text-slate-light">
          Each day is split into a column per coach working that day. Drag a class into a
          different coach&apos;s column to mark them as covering it — the card still shows
          whose group it really is. Coaches are everyone with an account at {siteName}; to
          add someone new, create them in{" "}
          {canManageUsers ? (
            <Link href="/admin/users" className="font-semibold text-orange-dark hover:underline">
              {usersLabel}
            </Link>
          ) : (
            usersLabel
          )}
          .
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toolbarExtra}
          {exportSpec && (
            <RotaExportButton
              spec={exportSpec}
              directory={directory}
              roster={roster}
              classes={classes}
              categories={categories}
            />
          )}
          <button
            className="add-btn toolbar-btn"
            disabled={!canEdit}
            title={canEdit ? undefined : NO_EDIT_TITLE}
            onClick={openAddModal}
          >
            + Add class
          </button>
        </div>
      </div>

      {/* The banner, not the per-control tooltips, is what makes this
          discoverable: a coach who can't drag a shift can see why without
          having to hover the one control they were reaching for. */}
      {!canEdit && (
        <div className="mx-5 mb-3 rounded-lg border border-line bg-background px-3.5 py-2 text-[13px] text-slate">
          Read-only — your job title doesn&apos;t have rota edit rights. Contact an
          admin if something here needs changing.
        </div>
      )}

      {/* Coaches who have moved site or been deactivated since they were put on
          this rota. Counted per person, both cases together. */}
      {flaggedPeople.length > 0 && (
        <div className="flag-banner">
          <div className="flag-banner-title">
            {flaggedPeople.length === 1
              ? `1 coach on this rota is no longer at ${siteName}`
              : `${flaggedPeople.length} coaches on this rota are no longer at ${siteName}`}
          </div>
          <ul>
            {flaggedPeople.map((p) => (
              <li key={p.coachId}>
                <b>{coachName(p.coachId)}</b>{" "}
                {p.flag === "moved"
                  ? `(now at ${directory.byId.get(p.coachId)?.site ?? "another site"})`
                  : "(account deactivated)"}{" "}
                — {p.days.map((d) => DAY_NAMES[d].slice(0, 3)).join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="board-error">
          <span>Couldn&apos;t save: {error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <div className="board-scroll">
        <div className="board" style={gridStyle}>
          <div className="corner" />

          {DAY_NAMES.map((dayName, d) => {
            const info = layout.dayCols[d];
            const dayRoster = rosterByDay[d];
            const unassigned = layout.unassignedCols.get(d);

            return (
              <Fragment key={"day-" + d}>
                <div
                  className="day-head"
                  style={{ gridColumn: `${info.startCol} / span ${info.spanCols}` }}
                >
                  <div className="day-head-top">
                    <span className="dname">{dayName}</span>
                  </div>
                  <div className="day-head-actions">
                    <button
                      className="add-coach-btn"
                      disabled={!canEdit}
                      title={canEdit ? undefined : NO_EDIT_TITLE}
                      onClick={(e) => openCoachPicker(d, e)}
                    >
                      + coach
                    </button>
                  </div>
                </div>

                {dayRoster.map((row) => {
                  const ci = layout.coachCols.get(d + "|" + row.coach_id)!;
                  const flag = directory.flag(row.coach_id);
                  const statusClass =
                    row.status === "leave"
                      ? "status-leave"
                      : row.status === "sick"
                        ? "status-sick"
                        : "";
                  const nameButton = (
                    <button
                      type="button"
                      className={`cname ${statusClass}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Everything in the popover is a write, and the
                        // badges it would explain (🔑 ⭐ 💰) are already on
                        // this pill — so read-only users don't open it.
                        if (!canEdit) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        setPopover({
                          day: d,
                          coachId: row.coach_id,
                          top: rect.bottom + 6,
                          left: Math.min(rect.left, window.innerWidth - 224),
                        });
                      }}
                    >
                      {flag === "moved" && (
                        <span className="flag-icon" aria-hidden>
                          ⚠
                        </span>
                      )}
                      {row.is_key_holder && (
                        <span className="badge-icon" title="Key holder">
                          🔑
                        </span>
                      )}
                      <span className="cname-text">{coachName(row.coach_id)}</span>
                      {row.is_lead && (
                        <span className="badge-icon" title="Lead coach">
                          ⭐
                        </span>
                      )}
                      {row.is_cashing_up && (
                        <span className="badge-icon" title="Cashing up">
                          💰
                        </span>
                      )}
                    </button>
                  );
                  return (
                    <div
                      key={"pill-" + row.id}
                      className={`coach-head${flag ? ` flag-${flag}` : ""}`}
                      style={{ gridColumn: `${ci.startCol} / span ${ci.laneCount}` }}
                    >
                      {flag ? (
                        <div className="flag-stack">
                          {nameButton}
                          <div className="flag-status">
                            {flag === "moved"
                              ? `Now at ${directory.byId.get(row.coach_id)?.site ?? "another site"}`
                              : "Account deactivated"}
                          </div>
                          {canEdit && (
                            <button
                              type="button"
                              className="flag-remove"
                              onClick={() => removeCoachFromDay(d, row.coach_id)}
                            >
                              Remove from {dayName}
                            </button>
                          )}
                        </div>
                      ) : (
                        nameButton
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          className="cremove"
                          title="Remove column"
                          onClick={() => removeCoachFromDay(d, row.coach_id)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* No roster row behind this column, so no badges, popover,
                    × or shift markers — just the label and how many. */}
                {unassigned && (
                  <div
                    className="coach-head unassigned"
                    style={{
                      gridColumn: `${unassigned.startCol} / span ${unassigned.laneCount}`,
                    }}
                  >
                    <span className="unassigned-label">Unassigned</span>
                    <span className="unassigned-count">{unassigned.classes.length}</span>
                  </div>
                )}

                <div
                  className="day-cell"
                  style={{
                    gridColumn: `${info.startCol} / span ${info.spanCols}`,
                    gridRow: `3 / span ${SLOTS}`,
                  }}
                />

                {d < 6 && (
                  <div
                    className="day-divider"
                    style={{ gridColumn: `${info.startCol + info.spanCols}` }}
                  />
                )}

                {dayRoster.map((row) => {
                  const key = d + "|" + row.coach_id;
                  const ci = layout.coachCols.get(key)!;
                  return renderZones(
                    "zone-" + row.id,
                    d,
                    row.coach_id,
                    ci.startCol,
                    ci.laneCount,
                    layout.lanesByCoach.get(key)!,
                    layout.groups[d].byCoach.get(row.coach_id) ?? [],
                    directory.flag(row.coach_id)
                  );
                })}

                {unassigned &&
                  renderZones(
                    "zone-unassigned-" + d,
                    d,
                    null,
                    unassigned.startCol,
                    unassigned.laneCount,
                    unassigned.lanes,
                    unassigned.classes,
                    null,
                    true
                  )}

                {/* Off-shift hatching and the draggable shift markers span the
                    coach's whole column (all lanes combined), not just lane 0 —
                    rendered as their own overlay so they aren't clipped to a
                    single lane's width when a coach's classes have split into
                    multiple lanes. */}
                {dayRoster.map((row) => {
                  const key = d + "|" + row.coach_id;
                  const ci = layout.coachCols.get(key)!;
                  return (
                    <div
                      key={"shiftmarker-" + row.id}
                      style={{
                        gridColumn: `${ci.startCol} / span ${ci.laneCount}`,
                        gridRow: `3 / span ${SLOTS}`,
                        position: "relative",
                        pointerEvents: "none",
                      }}
                    >
                      {row.shift_start_mins > DAY_START && (
                        <div
                          className="offshift"
                          style={{ top: 0, height: topPx(row.shift_start_mins) }}
                        />
                      )}
                      {row.shift_end_mins < DAY_START + SLOTS * SLOT_MIN && (
                        <div
                          className="offshift"
                          style={{
                            top: topPx(row.shift_end_mins),
                            height: SLOTS * SLOT_PX - topPx(row.shift_end_mins),
                          }}
                        />
                      )}
                      {(
                        [
                          ["start", "mk-start", row.shift_start_mins],
                          ["finish", "mk-finish", row.shift_end_mins],
                        ] as const
                      ).map(([edge, cls, atMins]) => (
                        <div
                          key={edge}
                          className={`shift-marker ${cls}`}
                          style={{ top: topPx(atMins) - 9, pointerEvents: "auto" }}
                          draggable={canEdit}
                          onDragStart={
                            canEdit
                              ? (e) => {
                                  e.currentTarget.classList.add("dragging");
                                  grabOffsetY.current =
                                    e.clientY -
                                    e.currentTarget.getBoundingClientRect().top -
                                    9;
                                  e.dataTransfer.setData(
                                    "text/plain",
                                    JSON.stringify({
                                      type: "shift",
                                      day: d,
                                      coachId: row.coach_id,
                                      edge,
                                    })
                                  );
                                  e.dataTransfer.effectAllowed = "move";
                                }
                              : undefined
                          }
                          onDragEnd={
                            canEdit
                              ? (e) => e.currentTarget.classList.remove("dragging")
                              : undefined
                          }
                        >
                          {(edge === "start" ? "Start " : "Finish ") +
                            fmtClock(atMins)}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </Fragment>
            );
          })}

          <div className="time-col" style={{ gridRow: `3 / span ${SLOTS}` }}>
            <div className="time-col-inner" style={{ height: SLOTS * SLOT_PX }}>
              {TIME_LABELS.map((m) => (
                <div key={m} className="time-label" style={{ top: topPx(m) }}>
                  {fmtClock(m)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {roster.length === 0 && classes.length === 0 && (
        <div className="empty-note">
          {canEdit
            ? `No rota saved for ${scopeLabel} yet — use “+ coach” on a day to start building it.`
            : `No rota saved for ${scopeLabel} yet.`}
        </div>
      )}

      {popover && popoverRow && (
        <div
          className="coach-popover"
          style={{ top: popover.top, left: popover.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <h4>
            {coachName(popover.coachId)} — {DAY_NAMES[popover.day]}
          </h4>
          {(
            [
              ["working", "normal", "Working"],
              ["leave", "leave", "Annual leave"],
              ["sick", "sick", "Sickness"],
            ] as const
          ).map(([status, dot, label]) => (
            <button
              type="button"
              key={status}
              className={`opt ${popoverRow.status === status ? "active" : ""}`}
              onClick={() => {
                setCoachStatus(popoverRow.id, status);
                setPopover(null);
              }}
            >
              <span className={`dot ${dot}`} />
              {label}
            </button>
          ))}
          <hr />
          <label>
            <input
              type="checkbox"
              checked={popoverRow.is_lead}
              onChange={(e) =>
                toggleExclusiveFlag(popoverRow.id, "is_lead", e.target.checked)
              }
            />
            ⭐ Lead coach today
          </label>
          <label>
            <input
              type="checkbox"
              checked={popoverRow.is_cashing_up}
              onChange={(e) =>
                toggleExclusiveFlag(popoverRow.id, "is_cashing_up", e.target.checked)
              }
            />
            💰 Cashing up today
          </label>
          <label>
            <input
              type="checkbox"
              checked={popoverRow.is_key_holder}
              onChange={(e) => toggleKeyHolder(popoverRow.id, e.target.checked)}
            />
            🔑 Key holder
          </label>
        </div>
      )}

      {coachPicker && (
        <div
          className="coach-popover coach-picker"
          style={{ top: coachPicker.top, left: coachPicker.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <h4>Add a coach to {DAY_NAMES[coachPicker.day]}</h4>
          <label className="picker-label" htmlFor="coach-picker-search">
            Search {siteName} coaches
          </label>
          <input
            id="coach-picker-search"
            className="picker-search"
            type="search"
            value={pickerQuery}
            onChange={(e) => setPickerQuery(e.target.value)}
            autoFocus
          />
          <div className="picker-list">
            {pickerAvailable.length === 0 ? (
              <div className="picker-empty">
                {rosterCandidates.length === 0
                  ? `No coaches have an active account at ${siteName} yet.`
                  : pickerNotOnDay.length === 0
                    ? `Everyone is already on ${DAY_NAMES[coachPicker.day]}.`
                    : `No coaches match “${pickerQuery.trim()}”.`}
              </div>
            ) : (
              pickerAvailable.map((c) => (
                <div key={c.id} className="picker-row">
                  <div className="picker-who">
                    <div className="picker-name">{c.fullName || "Unnamed"}</div>
                    <div className="picker-title">{c.jobTitle}</div>
                  </div>
                  <button
                    type="button"
                    className="picker-add"
                    onClick={() => addExistingCoachToDay(coachPicker.day, c.id)}
                  >
                    Add
                  </button>
                </div>
              ))
            )}
          </div>
          {pickerOnDay.length > 0 && (
            <>
              <div className="picker-section">Already on {DAY_NAMES[coachPicker.day]}</div>
              <div className="picker-chips">
                {pickerOnDay.map((r) => (
                  <span key={r.id} className="picker-chip">
                    {coachName(r.coach_id)}
                  </span>
                ))}
              </div>
            </>
          )}
          <div className="picker-footer">
            Someone missing? Coaches appear here once they have an active account at{" "}
            {siteName}. An RGM, Head of Gymnastics or Head of Operations can add them.
          </div>
        </div>
      )}

      {modal && (
        <div
          className="overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div className="modal">
            <h2>{modal.editingId ? "Edit class" : "Add class"}</h2>

            <div className="field">
              <label htmlFor="f-catalogue">Class name</label>
              <select
                id="f-catalogue"
                ref={catalogueSelectRef}
                value={modal.catalogueId}
                onChange={(e) => setModal(selectCatalogueItem(modal, e.target.value))}
              >
                <option value="">Choose a class…</option>
                {catalogue.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
                {retiredCatalogueId && (
                  <option value={retiredCatalogueId}>
                    {modal.title} (no longer in catalogue)
                  </option>
                )}
                <option value={CUSTOM_CLASS}>+ Custom class…</option>
              </select>
              {modal.catalogueId !== CUSTOM_CLASS && (
                <div className="field-hint">
                  Sets the colour automatically. Duration is pulled in too, still
                  editable below.
                </div>
              )}
            </div>

            {modal.catalogueId === CUSTOM_CLASS && (
              <div className="field">
                <label htmlFor="f-title">Custom class name</label>
                <input
                  id="f-title"
                  ref={titleInputRef}
                  type="text"
                  placeholder="e.g. Ruby Squad (7-10)"
                  value={modal.title}
                  onChange={(e) => setModal({ ...modal, title: e.target.value })}
                />
              </div>
            )}

            {modal.catalogueId === CUSTOM_CLASS && (
              <div className="field">
                <label id="f-cat-label">Category / colour</label>
                <div
                  className="category-swatches"
                  role="group"
                  aria-labelledby="f-cat-label"
                >
                  {categories.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      className={`category-swatch${
                        modal.categoryKey === c.key ? " is-selected" : ""
                      }`}
                      style={{ backgroundColor: c.color_hex }}
                      aria-label={c.label}
                      aria-pressed={modal.categoryKey === c.key}
                      title={c.label}
                      onClick={() => setModal({ ...modal, categoryKey: c.key })}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="field-row">
              <div className="field">
                <label htmlFor="f-day">Day</label>
                <select
                  id="f-day"
                  value={modal.day}
                  onChange={(e) => {
                    const day = parseInt(e.target.value, 10);
                    setModal(
                      withCoachId({ ...modal, day }, rosterByDay[day][0]?.coach_id ?? UNASSIGNED)
                    );
                  }}
                >
                  {DAY_NAMES.map((n, i) => (
                    <option key={n} value={i}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="f-coach">Coach column</label>
                <select
                  id="f-coach"
                  value={modal.coachId}
                  onChange={(e) => setModal(withCoachId(modal, e.target.value))}
                >
                  {modalDayCoaches.map((r) => (
                    <option key={r.id} value={r.coach_id}>
                      {coachName(r.coach_id) + flagTag(directory.flag(r.coach_id))}
                    </option>
                  ))}
                  {modalCoachExtra && (
                    <option value={modalCoachExtra}>
                      {coachName(modalCoachExtra) + " (not rostered)"}
                    </option>
                  )}
                  <option value={UNASSIGNED}>Unassigned</option>
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="f-setcoach">
                Set coach (who this group really belongs to)
              </label>
              <select
                id="f-setcoach"
                value={modal.setCoachId}
                onChange={(e) => setModal({ ...modal, setCoachId: e.target.value })}
              >
                <option value={NO_SET_COACH}>None</option>
                {rosterCandidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {coachName(c.id)}
                  </option>
                ))}
                {modalSetCoachExtra && (
                  <option value={modalSetCoachExtra}>
                    {coachName(modalSetCoachExtra) + flagTag(directory.flag(modalSetCoachExtra))}
                  </option>
                )}
              </select>
              <div className="field-hint">
                Defaults to match the coach column. Only change this for a genuine
                cover.
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="f-start">Start</label>
                <select
                  id="f-start"
                  value={modal.startMins}
                  onChange={(e) =>
                    setModal({ ...modal, startMins: parseInt(e.target.value, 10) })
                  }
                >
                  {START_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="f-dur">Duration</label>
                <select
                  id="f-dur"
                  value={modal.durationCustom ? CUSTOM_DURATION : modal.durationMins}
                  onChange={(e) => {
                    if (e.target.value === CUSTOM_DURATION) {
                      setModal({ ...modal, durationCustom: true });
                    } else {
                      setModal({
                        ...modal,
                        durationCustom: false,
                        durationMins: parseInt(e.target.value, 10),
                      });
                    }
                  }}
                >
                  {DURATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                  <option value={CUSTOM_DURATION}>Custom…</option>
                </select>
                {modal.durationCustom && (
                  <>
                    <input
                      id="f-dur-custom"
                      type="number"
                      inputMode="numeric"
                      min={MIN_CUSTOM_DURATION_MINS}
                      max={MAX_DURATION_MINS}
                      step={1}
                      placeholder="Minutes"
                      value={modal.durationMins || ""}
                      onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10);
                        setModal({
                          ...modal,
                          durationMins: Number.isNaN(parsed) ? 0 : parsed,
                        });
                      }}
                    />
                    <div className="field-hint">
                      Whole minutes, {MIN_CUSTOM_DURATION_MINS}–{MAX_DURATION_MINS}.
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="modal-actions">
              {modal.editingId ? (
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    deleteClass(modal.editingId!);
                    setModal(null);
                  }}
                >
                  Delete
                </button>
              ) : null}
              <div style={{ flex: 1 }} />
              <button className="btn btn-ghost" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveModal}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
