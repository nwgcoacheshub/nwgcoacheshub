// Geometry + pure helpers for the rota board.
// Ported from reference/nwg-weekly-rota.html — the drag/snap/lane maths must
// stay behaviourally identical, so these are deliberately a like-for-like port.
//
// One deliberate difference from the mock: the mock held class/shift times as
// minutes offset from DAY_START. Everything here is minutes from midnight, to
// match the `*_mins` columns in the database and avoid a conversion layer.

export const DAY_START = 8 * 60; // 8:00am — first row rendered on the board
export const DAY_END = 22 * 60; // 10:00pm — last row rendered on the board
export const SLOT_MIN = 15; // snap granularity
export const SLOT_PX = 15; // px per 15-min slot
export const HOUR_PX = SLOT_PX * (60 / SLOT_MIN);
export const SLOTS = (DAY_END - DAY_START) / SLOT_MIN;
export const COL_W = 128; // px, keeps full class names legible
export const TIME_COL_W = 64;
export const DIVIDER_W = 14;
// The two header rows are fixed heights rather than `auto`. The coach row is
// pinned directly beneath the day-name row while the board scrolls, and a
// sticky `top` offset has to be a known number — with auto rows there'd be
// nothing to hand it. The CSS sets explicit line-heights on the text in both
// rows so these hold on any platform's system font.
export const DAY_HEAD_H = 60;
export const COACH_HEAD_H = 34;

export const MIN_SHIFT_MINS = 30; // a shift can't be squashed below this

export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const DURATION_OPTIONS = [
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 hr" },
  { value: 90, label: "1.5 hr" },
  { value: 120, label: "2 hr" },
  { value: 180, label: "3 hr" },
];

export type CoachStatus = "working" | "leave" | "sick";

/** Minutes from midnight -> px from the top of a day column. */
export function topPx(mins: number) {
  return ((mins - DAY_START) / SLOT_MIN) * SLOT_PX;
}

/** "8:00am", "1:30pm" — matches the mock's fmtClock exactly. */
export function fmtClock(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "pm" : "am";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return h12 + (m ? ":" + String(m).padStart(2, "0") : ":00") + ampm;
}

export function timeRangeLabel(startMins: number, durationMins: number) {
  return fmtClock(startMins) + " – " + fmtClock(startMins + durationMins);
}

/** Start-time options for the modal: every 15 min across the rendered day. */
export function startOptions() {
  const opts: { value: number; label: string }[] = [];
  for (let m = DAY_START; m < DAY_END; m += SLOT_MIN) {
    opts.push({ value: m, label: fmtClock(m) });
  }
  return opts;
}

type Laneable = { id: string; start_mins: number; duration_mins: number };

/**
 * Greedy lane packing for classes that overlap inside one coach's column.
 * Same algorithm as the mock's laneAssign: sort by start, drop each class into
 * the first lane that's already free, otherwise open a new lane.
 */
export function laneAssign(list: Laneable[]) {
  const sorted = [...list].sort((a, b) => a.start_mins - b.start_mins);
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();

  for (const ev of sorted) {
    let placed = false;
    for (let i = 0; i < laneEnds.length; i++) {
      if (ev.start_mins >= laneEnds[i]) {
        lanes.set(ev.id, i);
        laneEnds[i] = ev.start_mins + ev.duration_mins;
        placed = true;
        break;
      }
    }
    if (!placed) {
      lanes.set(ev.id, laneEnds.length);
      laneEnds.push(ev.start_mins + ev.duration_mins);
    }
  }

  return { lanes, laneCount: laneEnds.length || 1 };
}

/**
 * Snap a dropped class to a 15-min slot, keeping it inside the board.
 * `offsetY` is the pointer position within the column, already corrected for
 * where the user actually grabbed the card.
 */
export function snapClassStart(offsetY: number, durationMins: number) {
  let slot = Math.round(offsetY / SLOT_PX);
  slot = Math.max(0, Math.min(SLOTS - Math.round(durationMins / SLOT_MIN), slot));
  return slot * SLOT_MIN + DAY_START;
}

/** Snap a dragged shift marker to a 15-min slot, clamped to the board. */
export function snapShiftEdge(offsetY: number) {
  const pxPerMin = SLOT_PX / SLOT_MIN;
  let slotMin = Math.round(offsetY / pxPerMin / SLOT_MIN) * SLOT_MIN;
  slotMin = Math.max(0, Math.min(SLOTS * SLOT_MIN, slotMin));
  return slotMin + DAY_START;
}
