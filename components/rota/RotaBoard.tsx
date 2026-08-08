"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import styles from "./rota-board.module.css";
import {
  COACH_HEAD_H,
  COL_W,
  DAY_HEAD_H,
  DAY_NAMES,
  DAY_START,
  DIVIDER_W,
  DURATION_OPTIONS,
  HOUR_PX,
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
import ManageCoachesModal from "./ManageCoachesModal";

export type Category = { key: string; label: string; color_hex: string };
export type Coach = { id: string; name: string; active: boolean };

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
  coach_id: string;
  set_coach_id: string | null;
  class_catalogue_id: string | null;
  title: string;
  category_key: string;
  meta: string | null;
  start_mins: number;
  duration_mins: number;
};

type BoardData = {
  coaches: Coach[];
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
  coachId: string;
  setCoachId: string;
  startMins: number;
  durationMins: number;
};

/** Sentinel for the picker's "custom class" escape hatch. */
const CUSTOM_CLASS = "__custom__";

const TIME_LABELS: number[] = [];
for (let m = DAY_START; m <= DAY_START + SLOTS * SLOT_MIN; m += 60) {
  TIME_LABELS.push(m);
}

const START_OPTIONS = startOptions();

/**
 * The rota grid. Identical for the Standard Rota and for a generated week —
 * the only difference is the `dataSource` it writes through, so nothing in here
 * names a table. `siteId` is still needed directly because rota_coaches is
 * site-scoped in both modes.
 */
export default function RotaBoard({
  dataSource,
  scopeLabel,
  siteId,
  categories,
  catalogue,
  initialCoaches,
  initialRoster,
  initialClasses,
  toolbarExtra,
  canManageCoaches = false,
}: {
  dataSource: RotaDataSource;
  /** What this board is showing, for the empty note — a site or a week. */
  scopeLabel: string;
  siteId: string;
  categories: Category[];
  catalogue: CatalogueItem[];
  initialCoaches: Coach[];
  initialRoster: RosterRow[];
  initialClasses: ClassRow[];
  /** Extra toolbar control, e.g. the week board's regenerate action. */
  toolbarExtra?: React.ReactNode;
  /**
   * Shows the "Manage coaches" entry point. Only true on the Standard Rota:
   * its deactivate-confirmation step checks which days a coach appears on in
   * `roster`, which is only the site's Standard Rota when this board is bound
   * to the standard data source.
   */
  canManageCoaches?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [data, setData] = useState<BoardData>({
    coaches: initialCoaches,
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
  const [newCoachName, setNewCoachName] = useState("");
  const [manageCoachesOpen, setManageCoachesOpen] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);
  const grabOffsetY = useRef(0);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const catalogueSelectRef = useRef<HTMLSelectElement | null>(null);

  const { coaches, roster, classes } = data;

  /**
   * Optimistic write: paint `next` immediately, then persist. If the write
   * fails, roll the board back to what it was and surface the message.
   */
  async function commit(
    next: BoardData,
    write: () => PromiseLike<{ error: { message: string } | null }>
  ) {
    const prev = dataRef.current;
    setError(null);
    applyData(next);
    const { error: writeError } = await write();
    if (writeError) {
      applyData(prev);
      setError(writeError.message);
    }
  }

  const coachById = useMemo(() => {
    const map = new Map<string, Coach>();
    for (const c of coaches) map.set(c.id, c);
    return map;
  }, [coaches]);

  // Deactivated coaches stay in `coaches` (and coachById above) so their name
  // still resolves wherever their historical roster/class rows are shown —
  // they just drop out of both add-coach pickers.
  const activeCoaches = useMemo(() => coaches.filter((c) => c.active), [coaches]);

  // Which days (0=Mon..6=Sun) each coach appears on in `roster`. Only
  // meaningful as "the Standard Rota" when canManageCoaches is true — see the
  // prop doc above.
  const standardDaysByCoach = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const r of roster) {
      const list = map.get(r.coach_id) ?? [];
      list.push(r.day_of_week);
      map.set(r.coach_id, list);
    }
    return map;
  }, [roster]);

  const categoryByKey = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) map.set(c.key, c);
    return map;
  }, [categories]);

  function coachName(id: string | null) {
    if (!id) return "";
    return coachById.get(id)?.name ?? "Unknown coach";
  }

  const rosterByDay = useMemo(() => {
    const byDay: RosterRow[][] = [[], [], [], [], [], [], []];
    for (const row of roster) {
      if (row.day_of_week >= 0 && row.day_of_week <= 6) byDay[row.day_of_week].push(row);
    }
    for (const list of byDay) {
      list.sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          (coachById.get(a.coach_id)?.name ?? "").localeCompare(
            coachById.get(b.coach_id)?.name ?? ""
          )
      );
    }
    return byDay;
  }, [roster, coachById]);

  /**
   * Column planning, same shape as the mock: a time column, then one column
   * per coach per day (widened into extra lanes when their classes overlap),
   * with a divider between days.
   */
  const layout = useMemo(() => {
    const cols: number[] = [TIME_COL_W];
    const coachCols = new Map<string, { startCol: number; laneCount: number }>();
    const lanesByCoach = new Map<string, Map<string, number>>();
    const dayCols: { startCol: number; spanCols: number; isEmpty: boolean }[] = [];
    let cursor = 2; // grid columns are 1-indexed; col 1 is the time column

    for (let d = 0; d < 7; d++) {
      const dayStartCol = cursor;
      const dayRoster = rosterByDay[d];

      for (const row of dayRoster) {
        const list = classes.filter(
          (c) => c.day_of_week === d && c.coach_id === row.coach_id
        );
        const { lanes, laneCount } = laneAssign(list);
        const key = d + "|" + row.coach_id;
        coachCols.set(key, { startCol: cursor, laneCount });
        lanesByCoach.set(key, lanes);
        for (let i = 0; i < laneCount; i++) cols.push(COL_W);
        cursor += laneCount;
      }

      // A day with nobody rostered still needs one column's width so its
      // header (and "+ coach" button) stays reachable on an empty board.
      const isEmpty = dayRoster.length === 0;
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

    return { cols, coachCols, lanesByCoach, dayCols };
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

  function moveClass(classId: string, day: number, coachId: string, startMins: number) {
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

    const next = {
      ...current,
      classes: current.classes.map((c) =>
        c.id === classId
          ? { ...c, day_of_week: day, coach_id: coachId, start_mins: startMins }
          : c
      ),
    };

    commit(next, () =>
      dataSource.updateClass(classId, {
        day_of_week: day,
        coach_id: coachId,
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
    setNewCoachName("");
    const rect = e.currentTarget.getBoundingClientRect();
    setCoachPicker({
      day,
      top: rect.bottom + 6,
      left: Math.min(rect.left, window.innerWidth - 232),
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

  /** Adds a coach already in the site's directory to a day's roster. */
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

  /** The picker's inline escape hatch: create a brand-new coach and add them in one step. */
  async function createCoachAndAddToDay(day: number, rawName: string) {
    const name = rawName.trim();
    if (!name) return;

    const current = dataRef.current;
    const coach: Coach = { id: crypto.randomUUID(), name, active: true };
    const newRow = nextRosterRow(day, coach.id);

    const next: BoardData = {
      ...current,
      coaches: [...current.coaches, coach],
      roster: [...current.roster, newRow],
    };

    setCoachPicker(null);
    setNewCoachName("");
    await commit(next, async () => {
      // rota_coaches is shared by the standard rota and every week, so it's
      // keyed on the site in both modes rather than going via the data source.
      const { error: coachError } = await supabase
        .from("rota_coaches")
        .insert({ id: coach.id, site_id: siteId, name: coach.name });
      if (coachError) return { error: coachError };
      return dataSource.insertRoster({
        id: newRow.id,
        day_of_week: day,
        coach_id: coach.id,
        sort_order: newRow.sort_order,
        shift_start_mins: newRow.shift_start_mins,
        shift_end_mins: newRow.shift_end_mins,
      });
    });
  }

  /**
   * Coach directory CRUD for the "Manage coaches" view. These write straight
   * to rota_coaches rather than through `commit` — unlike roster/class edits
   * they aren't scoped to this board's data source (rota_coaches is
   * site-scoped in both standard and weekly mode), so each rolls its own
   * `coaches` state back on failure and reports its error to the caller
   * instead of the board-level error banner.
   */
  async function addCoach(name: string): Promise<{ error: string | null }> {
    const trimmed = name.trim();
    if (!trimmed) return { error: "Enter a name." };

    const coach: Coach = { id: crypto.randomUUID(), name: trimmed, active: true };
    const prev = dataRef.current;
    applyData({ ...prev, coaches: [...prev.coaches, coach] });

    const { error } = await supabase
      .from("rota_coaches")
      .insert({ id: coach.id, site_id: siteId, name: coach.name });
    if (error) {
      applyData(prev);
      return { error: error.message };
    }
    return { error: null };
  }

  async function renameCoach(
    coachId: string,
    name: string
  ): Promise<{ error: string | null }> {
    const trimmed = name.trim();
    if (!trimmed) return { error: "Enter a name." };

    const prev = dataRef.current;
    applyData({
      ...prev,
      coaches: prev.coaches.map((c) => (c.id === coachId ? { ...c, name: trimmed } : c)),
    });

    const { error } = await supabase
      .from("rota_coaches")
      .update({ name: trimmed })
      .eq("id", coachId);
    if (error) {
      applyData(prev);
      return { error: error.message };
    }
    return { error: null };
  }

  async function deactivateCoach(coachId: string): Promise<{ error: string | null }> {
    const prev = dataRef.current;
    applyData({
      ...prev,
      coaches: prev.coaches.map((c) => (c.id === coachId ? { ...c, active: false } : c)),
    });

    const { error } = await supabase
      .from("rota_coaches")
      .update({ active: false })
      .eq("id", coachId);
    if (error) {
      applyData(prev);
      return { error: error.message };
    }
    return { error: null };
  }

  async function removeCoachFromDay(day: number, coachId: string) {
    const current = dataRef.current;
    const row = current.roster.find(
      (r) => r.day_of_week === day && r.coach_id === coachId
    );
    if (!row) return;

    const affected = current.classes.filter(
      (c) => c.day_of_week === day && c.coach_id === coachId
    );
    if (
      affected.length &&
      !window.confirm(
        `Remove ${coachName(coachId)} from ${DAY_NAMES[day]}? This will also remove ${
          affected.length
        } class(es) in their column.`
      )
    ) {
      return;
    }

    const next: BoardData = {
      ...current,
      roster: current.roster.filter((r) => r.id !== row.id),
      classes: current.classes.filter(
        (c) => !(c.day_of_week === day && c.coach_id === coachId)
      ),
    };

    setPopover(null);

    await commit(next, async () => {
      if (affected.length) {
        const { error: classError } = await dataSource.deleteClassesForCoachDay(
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
    if (!modal.coachId) {
      setError(
        `Nobody is rostered on ${DAY_NAMES[modal.day]} yet — add a coach to that day first.`
      );
      return;
    }
    if (modal.catalogueId === CUSTOM_CLASS && !modal.categoryKey) {
      setError("Choose a colour for this class.");
      return;
    }

    const current = dataRef.current;
    // Non-cover is stored as a null set_coach_id, same as every existing row —
    // only a genuine divergence from the coach column is worth persisting.
    const payload = {
      day_of_week: modal.day,
      coach_id: modal.coachId,
      set_coach_id: modal.setCoachId === modal.coachId ? null : modal.setCoachId,
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
    const coachId = rosterByDay[day][0]?.coach_id ?? "";
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
      coachId: ev.coach_id,
      // Exactly as stored — a null set_coach_id displays as the same coach
      // (no cover), a genuine cover shows the actual set coach. Either way,
      // this is the open-time snapshot withCoachId compares later edits to.
      setCoachId: ev.set_coach_id ?? ev.coach_id,
      startMins: ev.start_mins,
      durationMins: ev.duration_mins,
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
    };
  }

  /* ---------------- Drag & drop ---------------- */

  function onZoneDrop(e: React.DragEvent, day: number, coachId: string) {
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
    gridTemplateRows: `${DAY_HEAD_H}px ${COACH_HEAD_H}px repeat(${SLOTS}, ${SLOT_PX}px)`,
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

  const coachPickerAvailable = coachPicker
    ? activeCoaches.filter(
        (c) => !roster.some((r) => r.day_of_week === coachPicker.day && r.coach_id === c.id)
      )
    : [];

  const modalDayCoaches = modal ? rosterByDay[modal.day] : [];
  // A class can point at a catalogue entry that's since been deactivated. Keep
  // showing it so editing the class doesn't silently drop the link.
  const retiredCatalogueId =
    modal &&
    modal.catalogueId !== "" &&
    modal.catalogueId !== CUSTOM_CLASS &&
    !catalogue.some((c) => c.id === modal.catalogueId)
      ? modal.catalogueId
      : null;

  return (
    <div className={`${styles.root} ${styles.fill}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-5">
        <div className="text-[13px] text-slate-light">
          Each day is split into a column per coach working that day. Drag a class into a
          different coach&apos;s column to mark them as covering it — the card still shows
          whose group it really is.
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toolbarExtra}
          {canManageCoaches && (
            <button
              className="btn btn-ghost toolbar-btn"
              style={{ border: "1px solid var(--line)" }}
              onClick={() => setManageCoachesOpen(true)}
            >
              Manage coaches
            </button>
          )}
          <button className="add-btn toolbar-btn" onClick={openAddModal}>
            + Add class
          </button>
        </div>
      </div>

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
                      onClick={(e) => openCoachPicker(d, e)}
                    >
                      + coach
                    </button>
                  </div>
                </div>

                {dayRoster.map((row) => {
                  const ci = layout.coachCols.get(d + "|" + row.coach_id)!;
                  const statusClass =
                    row.status === "leave"
                      ? "status-leave"
                      : row.status === "sick"
                        ? "status-sick"
                        : "";
                  return (
                    <div
                      key={"pill-" + row.id}
                      className="coach-head"
                      style={{ gridColumn: `${ci.startCol} / span ${ci.laneCount}` }}
                    >
                      <button
                        type="button"
                        className={`cname ${statusClass}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setPopover({
                            day: d,
                            coachId: row.coach_id,
                            top: rect.bottom + 6,
                            left: Math.min(rect.left, window.innerWidth - 224),
                          });
                        }}
                      >
                        {row.is_key_holder && (
                          <span className="badge-icon" title="Key holder">
                            🔑
                          </span>
                        )}
                        {coachName(row.coach_id)}
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
                      <button
                        type="button"
                        className="cremove"
                        title="Remove column"
                        onClick={() => removeCoachFromDay(d, row.coach_id)}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}

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
                  const lanes = layout.lanesByCoach.get(key)!;
                  const dayClasses = classes.filter(
                    (c) => c.day_of_week === d && c.coach_id === row.coach_id
                  );

                  return Array.from({ length: ci.laneCount }, (_, lane) => (
                    <div
                      key={"zone-" + row.id + "-" + lane}
                      style={{
                        gridColumn: `${ci.startCol + lane}`,
                        gridRow: `3 / span ${SLOTS}`,
                        position: "relative",
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        e.currentTarget.classList.add("dropzone-hover");
                      }}
                      onDragLeave={(e) =>
                        e.currentTarget.classList.remove("dropzone-hover")
                      }
                      onDrop={(e) => onZoneDrop(e, d, row.coach_id)}
                    >
                      {/* Off-shift hatching and the draggable shift markers live
                          in lane 0, rendered before the cards. */}
                      {lane === 0 && (
                        <>
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
                                height:
                                  SLOTS * SLOT_PX - topPx(row.shift_end_mins),
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
                              style={{ top: topPx(atMins) - 9 }}
                              draggable
                              onDragStart={(e) => {
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
                              }}
                              onDragEnd={(e) =>
                                e.currentTarget.classList.remove("dragging")
                              }
                            >
                              {(edge === "start" ? "Start " : "Finish ") +
                                fmtClock(atMins)}
                            </div>
                          ))}
                        </>
                      )}

                      {dayClasses
                        .filter((ev) => (lanes.get(ev.id) ?? 0) === lane)
                        .map((ev) => {
                          const isCover =
                            !!ev.set_coach_id && ev.set_coach_id !== ev.coach_id;
                          const spanSlots = Math.max(
                            1,
                            Math.round(ev.duration_mins / SLOT_MIN)
                          );
                          return (
                            <div
                              key={ev.id}
                              className={`card${isCover ? " is-cover" : ""}`}
                              style={{
                                background:
                                  categoryByKey.get(ev.category_key)?.color_hex ??
                                  "#9AA2AB",
                                top: topPx(ev.start_mins),
                                height: spanSlots * SLOT_PX - 2,
                              }}
                              draggable
                              onDragStart={(e) => {
                                e.currentTarget.classList.add("dragging");
                                grabOffsetY.current =
                                  e.clientY -
                                  e.currentTarget.getBoundingClientRect().top;
                                e.dataTransfer.setData(
                                  "text/plain",
                                  JSON.stringify({ type: "class", id: ev.id })
                                );
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={(e) =>
                                e.currentTarget.classList.remove("dragging")
                              }
                              onClick={() => openEditModal(ev)}
                            >
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
                              {isCover && <div className="cover-badge">COVER</div>}
                              <div className="title">{ev.title}</div>
                              <div className="meta">
                                {timeRangeLabel(ev.start_mins, ev.duration_mins)}
                              </div>
                              <div className="coachline">
                                Coach: {coachName(ev.coach_id)}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  ));
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

      {roster.length === 0 && (
        <div className="empty-note">
          No rota saved for {scopeLabel} yet — use “+ coach” on a day to start building
          it.
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
          className="coach-popover"
          style={{ top: coachPicker.top, left: coachPicker.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <h4>Add coach — {DAY_NAMES[coachPicker.day]}</h4>
          {coachPickerAvailable.length === 0 ? (
            <div className="picker-empty">
              {activeCoaches.length === 0
                ? "No coaches yet — add one below."
                : "Everyone active is already on this day."}
            </div>
          ) : (
            coachPickerAvailable.map((c) => (
              <button
                type="button"
                key={c.id}
                className="opt"
                onClick={() => addExistingCoachToDay(coachPicker.day, c.id)}
              >
                {c.name}
              </button>
            ))
          )}
          <hr />
          {/* A plain button rather than a <form onSubmit> — submitting a form
              whose own handler unmounts it (via setCoachPicker(null)) races
              the browser's native submission and silently drops the create. */}
          <div className="picker-form">
            <input
              type="text"
              placeholder="New coach name"
              value={newCoachName}
              onChange={(e) => setNewCoachName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  createCoachAndAddToDay(coachPicker.day, newCoachName);
                }
              }}
              autoFocus
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => createCoachAndAddToDay(coachPicker.day, newCoachName)}
            >
              Add
            </button>
          </div>
        </div>
      )}

      {manageCoachesOpen && canManageCoaches && (
        <ManageCoachesModal
          coaches={activeCoaches}
          daysByCoach={standardDaysByCoach}
          onAdd={addCoach}
          onRename={renameCoach}
          onDeactivate={deactivateCoach}
          onClose={() => setManageCoachesOpen(false)}
        />
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
                    setModal(withCoachId({ ...modal, day }, rosterByDay[day][0]?.coach_id ?? ""));
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
                  disabled={modalDayCoaches.length === 0}
                  onChange={(e) => setModal(withCoachId(modal, e.target.value))}
                >
                  {modalDayCoaches.length === 0 ? (
                    <option value="">Nobody rostered</option>
                  ) : (
                    modalDayCoaches.map((r) => (
                      <option key={r.id} value={r.coach_id}>
                        {coachName(r.coach_id)}
                      </option>
                    ))
                  )}
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
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
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
                  value={modal.durationMins}
                  onChange={(e) =>
                    setModal({ ...modal, durationMins: parseInt(e.target.value, 10) })
                  }
                >
                  {DURATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
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
