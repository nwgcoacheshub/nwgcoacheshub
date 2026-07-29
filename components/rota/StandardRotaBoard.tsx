"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import styles from "./rota-board.module.css";
import {
  COL_W,
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

export type Category = { key: string; label: string; color_hex: string };
export type Coach = { id: string; name: string };

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

type ModalState = {
  editingId: string | null;
  title: string;
  meta: string;
  categoryKey: string;
  day: number;
  coachId: string;
  setCoachId: string;
  startMins: number;
  durationMins: number;
};

const TIME_LABELS: number[] = [];
for (let m = DAY_START; m <= DAY_START + SLOTS * SLOT_MIN; m += 60) {
  TIME_LABELS.push(m);
}

const START_OPTIONS = startOptions();

export default function StandardRotaBoard({
  siteId,
  siteName,
  categories,
  initialCoaches,
  initialRoster,
  initialClasses,
}: {
  siteId: string;
  siteName: string;
  categories: Category[];
  initialCoaches: Coach[];
  initialRoster: RosterRow[];
  initialClasses: ClassRow[];
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
  const [modal, setModal] = useState<ModalState | null>(null);
  const grabOffsetY = useRef(0);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

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

  // Close the coach popover on any outside click, as the mock did.
  useEffect(() => {
    if (!popover) return;
    function onDocClick() {
      setPopover(null);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [popover]);

  useEffect(() => {
    if (modal) titleInputRef.current?.focus();
  }, [modal]);

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
      supabase
        .from("rota_standard_classes")
        .update({
          day_of_week: day,
          coach_id: coachId,
          start_mins: startMins,
          updated_at: new Date().toISOString(),
        })
        .eq("id", classId)
        .then(({ error: e }) => ({ error: e }))
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
      supabase
        .from("rota_standard_roster")
        .update({ shift_start_mins: start, shift_end_mins: end })
        .eq("id", row.id)
        .then(({ error: e }) => ({ error: e }))
    );
  }

  function setCoachStatus(rowId: string, status: CoachStatus) {
    const current = dataRef.current;
    const next = {
      ...current,
      roster: current.roster.map((r) => (r.id === rowId ? { ...r, status } : r)),
    };
    commit(next, () =>
      supabase
        .from("rota_standard_roster")
        .update({ status })
        .eq("id", rowId)
        .then(({ error: e }) => ({ error: e }))
    );
  }

  function toggleKeyHolder(rowId: string, value: boolean) {
    const current = dataRef.current;
    const next = {
      ...current,
      roster: current.roster.map((r) =>
        r.id === rowId ? { ...r, is_key_holder: value } : r
      ),
    };
    commit(next, () =>
      supabase
        .from("rota_standard_roster")
        .update({ is_key_holder: value })
        .eq("id", rowId)
        .then(({ error: e }) => ({ error: e }))
    );
  }

  /**
   * Lead and cashing-up are capped at one coach per day by partial unique
   * indexes. Clear whoever currently holds the flag before setting the new
   * one, so the constraint is never actually hit.
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

    commit(next, async () => {
      for (const d of displaced) {
        const { error: clearError } = await supabase
          .from("rota_standard_roster")
          .update({ [field]: false })
          .eq("id", d.id);
        if (clearError) return { error: clearError };
      }
      const { error: setError } = await supabase
        .from("rota_standard_roster")
        .update({ [field]: value })
        .eq("id", rowId);
      return { error: setError };
    });
  }

  async function addCoachToDay(day: number) {
    const typed = window.prompt("Add coach to " + DAY_NAMES[day] + ":");
    const name = typed?.trim();
    if (!name) return;

    const current = dataRef.current;
    const existing = current.coaches.find(
      (c) => c.name.toLowerCase() === name.toLowerCase()
    );

    if (
      existing &&
      current.roster.some((r) => r.day_of_week === day && r.coach_id === existing.id)
    ) {
      setError(`${existing.name} is already on ${DAY_NAMES[day]}.`);
      return;
    }

    const coach: Coach = existing ?? { id: crypto.randomUUID(), name };
    const maxSort = current.roster
      .filter((r) => r.day_of_week === day)
      .reduce((max, r) => Math.max(max, r.sort_order), -1);

    const newRow: RosterRow = {
      id: crypto.randomUUID(),
      day_of_week: day,
      coach_id: coach.id,
      sort_order: maxSort + 1,
      shift_start_mins: DAY_START,
      shift_end_mins: DAY_START + SLOTS * SLOT_MIN,
      status: "working",
      is_key_holder: false,
      is_lead: false,
      is_cashing_up: false,
    };

    const next: BoardData = {
      ...current,
      coaches: existing ? current.coaches : [...current.coaches, coach],
      roster: [...current.roster, newRow],
    };

    await commit(next, async () => {
      if (!existing) {
        const { error: coachError } = await supabase
          .from("rota_coaches")
          .insert({ id: coach.id, site_id: siteId, name: coach.name });
        if (coachError) return { error: coachError };
      }
      const { error: rosterError } = await supabase.from("rota_standard_roster").insert({
        id: newRow.id,
        site_id: siteId,
        day_of_week: day,
        coach_id: coach.id,
        sort_order: newRow.sort_order,
        shift_start_mins: newRow.shift_start_mins,
        shift_end_mins: newRow.shift_end_mins,
      });
      return { error: rosterError };
    });
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
        const { error: classError } = await supabase
          .from("rota_standard_classes")
          .delete()
          .eq("site_id", siteId)
          .eq("day_of_week", day)
          .eq("coach_id", coachId);
        if (classError) return { error: classError };
      }
      const { error: rosterError } = await supabase
        .from("rota_standard_roster")
        .delete()
        .eq("id", row.id);
      return { error: rosterError };
    });
  }

  function deleteClass(classId: string) {
    const current = dataRef.current;
    const next = {
      ...current,
      classes: current.classes.filter((c) => c.id !== classId),
    };
    commit(next, () =>
      supabase
        .from("rota_standard_classes")
        .delete()
        .eq("id", classId)
        .then(({ error: e }) => ({ error: e }))
    );
  }

  function saveModal() {
    if (!modal) return;
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

    const current = dataRef.current;
    const payload = {
      day_of_week: modal.day,
      coach_id: modal.coachId,
      set_coach_id: modal.setCoachId || null,
      title,
      category_key: modal.categoryKey,
      meta: modal.meta.trim() || null,
      start_mins: modal.startMins,
      duration_mins: modal.durationMins,
    };

    if (modal.editingId) {
      const editingId = modal.editingId;
      const next = {
        ...current,
        classes: current.classes.map((c) =>
          c.id === editingId ? { ...c, ...payload } : c
        ),
      };
      setModal(null);
      commit(next, () =>
        supabase
          .from("rota_standard_classes")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", editingId)
          .then(({ error: e }) => ({ error: e }))
      );
    } else {
      const newClass: ClassRow = { id: crypto.randomUUID(), ...payload };
      const next = { ...current, classes: [...current.classes, newClass] };
      setModal(null);
      commit(next, () =>
        supabase
          .from("rota_standard_classes")
          .insert({ ...newClass, site_id: siteId })
          .then(({ error: e }) => ({ error: e }))
      );
    }
  }

  /* ---------------- Modal helpers ---------------- */

  function openAddModal() {
    const day = 0;
    setModal({
      editingId: null,
      title: "",
      meta: "",
      categoryKey: categories[0]?.key ?? "",
      day,
      coachId: rosterByDay[day][0]?.coach_id ?? "",
      setCoachId: "",
      startMins: DAY_START,
      durationMins: 60,
    });
  }

  function openEditModal(ev: ClassRow) {
    setModal({
      editingId: ev.id,
      title: ev.title,
      meta: ev.meta ?? "",
      categoryKey: ev.category_key,
      day: ev.day_of_week,
      coachId: ev.coach_id,
      setCoachId: ev.set_coach_id ?? "",
      startMins: ev.start_mins,
      durationMins: ev.duration_mins,
    });
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
    gridTemplateRows: `auto auto repeat(${SLOTS}, ${SLOT_PX}px)`,
    ["--hourpx"]: HOUR_PX + "px",
  };

  const popoverRow = popover
    ? roster.find(
        (r) => r.day_of_week === popover.day && r.coach_id === popover.coachId
      )
    : undefined;

  const modalDayCoaches = modal ? rosterByDay[modal.day] : [];

  return (
    <div className={styles.root}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px] text-slate-light">
          Each day is split into a column per coach working that day. Drag a class into a
          different coach&apos;s column to mark them as covering it — the card still shows
          whose group it really is.
        </div>
        <button className="add-btn" onClick={openAddModal}>
          + Add class
        </button>
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
                    <button className="add-coach-btn" onClick={() => addCoachToDay(d)}>
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
                              <div className="meta">{ev.meta ?? "—"}</div>
                              {isCover ? (
                                <div className="coachline is-cover">
                                  Usually {coachName(ev.set_coach_id)}&apos;s group
                                </div>
                              ) : (
                                <div className="coachline">
                                  Coach: {coachName(ev.coach_id)}
                                </div>
                              )}
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
          No standard rota saved for {siteName} yet — use “+ coach” on a day to start
          building it.
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
              <label htmlFor="f-title">Class name</label>
              <input
                id="f-title"
                ref={titleInputRef}
                type="text"
                placeholder="e.g. Ruby Squad (7-10)"
                value={modal.title}
                onChange={(e) => setModal({ ...modal, title: e.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="f-meta">Details (ages / capacity)</label>
              <input
                id="f-meta"
                type="text"
                placeholder="e.g. Ages 7–10 · Cap 10"
                value={modal.meta}
                onChange={(e) => setModal({ ...modal, meta: e.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="f-cat">Category / colour</label>
              <select
                id="f-cat"
                value={modal.categoryKey}
                onChange={(e) => setModal({ ...modal, categoryKey: e.target.value })}
              >
                {categories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="f-day">Day</label>
                <select
                  id="f-day"
                  value={modal.day}
                  onChange={(e) => {
                    const day = parseInt(e.target.value, 10);
                    setModal({
                      ...modal,
                      day,
                      coachId: rosterByDay[day][0]?.coach_id ?? "",
                    });
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
                <label htmlFor="f-coach">Coach column (who&apos;s taking it)</label>
                <select
                  id="f-coach"
                  value={modal.coachId}
                  disabled={modalDayCoaches.length === 0}
                  onChange={(e) => setModal({ ...modal, coachId: e.target.value })}
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
                <option value="">Same as coach column</option>
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <div className="field-hint">
                Leave as “same as coach column” if there&apos;s no cover happening.
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
