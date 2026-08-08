// Geometry + planning for the PDF export layout.
//
// This deliberately shares no geometry with lib/rota/board.ts. The on-screen
// board is a scrolling surface: it can afford a fixed 128px per coach lane and
// 15px per quarter hour because the user pans around it. The export has to land
// a whole week on one fixed page, so its column width is derived from how much
// rota there is to fit, and its type sizes are derived from that width.
//
// What *is* shared with board.ts is the rota's semantics rather than its
// layout — DAY_START/DAY_END (the export must cover the same day the board
// does), fmtClock, and laneAssign (overlapping classes have to stack the same
// way, or the export would be a different rota).
//
// ---------------------------------------------------------------------------
// Page size
// ---------------------------------------------------------------------------
// The page is 900 CSS px tall, always, and 1600 wide — exactly 16:9 — for any
// week that fits at that width. Both numbers are about this PDF only ever being
// read on a screen:
//
//   * 16:9 is the shape of the thing it's read on. A viewer fits the page to the
//     window, and laptops, monitors and landscape phones are all 16:9 or wider,
//     so a 16:9 page fills the window instead of letterboxing itself inside
//     margins we don't need (nothing here is ever printed, so there are none).
//   * 1600 wide means authored px ≈ displayed px. A maximised viewer on a 13-14"
//     laptop gives the page roughly 1500 CSS px, so it renders at ~94% of the
//     size it's authored at: an 8px font in here reads as ~7.5px on screen.
//
// Wider pages, for weeks that don't fit
// -------------------------------------
// A quiet site's week fits 1600 comfortably. A busy one does not, and no choice
// of font size changes that: seven days of seven coaches is ~50 columns, so at
// 1600 each column is under 30px, and at 30px a column can't hold the word
// "Preschool" at any size that is also readable. Squeezing anyway doesn't
// produce small text, it produces "Presch/ool" and "7-/10/Sa" — information
// destroyed in the layout, which no amount of zooming gets back.
//
// So the page keeps its 900px height and grows sideways instead, just far enough
// to give every column TARGET_LANE_W. That is deliberately the *narrowest* page
// on which the text survives whole, which also makes it the largest the text can
// display at: page width and displayed font size trade off exactly one for one,
// so the tightest page that stays intact is the most readable one there is.
//
// The consequence, stated plainly because it's a real limitation rather than a
// bug: a busy week's export is not readable at fit-to-window on a laptop. It is
// readable, and sharp, as soon as it's zoomed — which is also how it gets read
// on a phone. See MAX_PAGE_W for where even that gives out.

import { DAY_END, DAY_NAMES, DAY_START, laneAssign } from "./board";
import type { ClassRow, Coach, RosterRow } from "@/components/rota/RotaBoard";

/** Fixed. Extra height buys nothing: card type is capped by column width. */
export const PAGE_H = 900;
/** 16:9 at PAGE_H, and the width every week that fits gets. */
export const BASE_PAGE_W = 1600;
/**
 * 3.2:1. Past here a page stops being pannable and starts being a
 * strip, so very dense weeks squeeze below TARGET_LANE_W instead and are
 * reported as too dense rather than silently widening forever.
 */
export const MAX_PAGE_W = 2880; // 3.2:1 at PAGE_H

/**
 * The narrowest column that still holds a real rota's words unbroken. Set by
 * measuring, in Chrome, the longest words that actually occur: "Turquoise" and
 * "Preschool" in a title, both 37.1px at 7px bold. 48px leaves exactly 38px of
 * text width once the card's inset, border and padding come off (see
 * cardInnerW), which clears them at 7px and nothing narrower does.
 */
export const TARGET_LANE_W = 48;

/**
 * The width below which words genuinely start breaking. The card fitter shrinks
 * type to keep the longest word whole, so between this and TARGET_LANE_W it
 * simply uses smaller type and everything survives; below it, the floor size
 * isn't small enough and "Turquoise" (35.0px at the 6.6px floor) has to split.
 * This, not TARGET_LANE_W, is what `tooDense` reports.
 */
export const MIN_INTACT_LANE_W = 45;

/** Vertical bands, top to bottom. These sum with GRID_H to exactly PAGE_H. */
export const PAD_X = 14;
export const PAD_TOP = 14;
export const PAD_BOTTOM = 14;
export const HEADER_H = 36; // title + subtitle
export const LEGEND_H = 20; // category swatches + marker key
export const LEGEND_GAP = 6;
export const DAY_HEAD_H = 22;
export const COACH_HEAD_H = 18;

/**
 * 55px per hour, which is what's left once the bands above are taken off a
 * 900px page and divided by the 14 hours the board covers. Worth stating
 * plainly because it sets the floor on card type: a 30-minute class is 27.5px
 * tall, and three lines of text have to fit inside that.
 */
export const HOURS = (DAY_END - DAY_START) / 60;
export const GRID_H =
  PAGE_H -
  (PAD_TOP + HEADER_H + LEGEND_H + LEGEND_GAP + DAY_HEAD_H + COACH_HEAD_H + PAD_BOTTOM);
export const PX_PER_HOUR = GRID_H / HOURS; // 55
export const PX_PER_MIN = PX_PER_HOUR / 60;

export const TIME_COL_W = 36; // fits "10:00pm" at the axis type size
export const DIVIDER_W = 4; // between days — the board uses 14px, unaffordable here

/** Stops a nearly-empty rota rendering three absurdly wide cards a day. */
export const MAX_LANE_W = 132;

/**
 * Bitmap budget. The capture is taken at a multiple of the CSS page so it stays
 * sharp when zoomed — 3x for a 1600px page. A page that has already widened
 * doesn't need as much on top, and 3x of 2600 would be a 33-megapixel PNG, so
 * the multiplier scales down to hold the bitmap near 4800px across.
 */
export function exportScaleFor(pageW: number) {
  return Math.max(1.85, Math.min(3, 4800 / pageW));
}

/** Page width for a week of `totalLanes` columns, and the width each one gets. */
export function pageWidthFor(totalLanes: number) {
  const chrome = 2 * PAD_X + TIME_COL_W + (DAY_NAMES.length - 1) * DIVIDER_W;
  const wanted = chrome + totalLanes * TARGET_LANE_W;
  // Even, so the 2x/3x capture lands on whole device pixels.
  const pageW = Math.min(MAX_PAGE_W, Math.max(BASE_PAGE_W, Math.ceil(wanted / 2) * 2));
  const laneW = Math.min(MAX_LANE_W, (pageW - chrome) / totalLanes);
  return { pageW, laneW };
}

/** Colours. Brand tokens from CLAUDE.md; no CSS variables, so nothing inherits. */
export const INK = "#2B3138";
export const INK_SOFT = "#7A828C";
export const LINE = "#E6E8EB";
export const HOUR_LINE = "#EDEFF1";
export const DIVIDER = "#E3E6E9";
export const BRAND = "#F58220";
export const SLATE_DARK = "#404852";
export const OFF_SHIFT = "#F1F2F4";
export const COACH_HEAD_BG = "#FAFAFB";
export const LEAVE = "#7C3AED";
export const SICK = "#DC2626";
export const PAPER = "#FFFFFF";

export const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/**
 * Type sizes, chosen by how wide a lane came out. Each step down is the point
 * at which the previous step's card title stops fitting a realistic class name
 * ("7-10 Sapphire", "Little Flippers") in two lines.
 *
 * `cardTitle` is a ceiling, not a fixed size: a short card shrinks its own type
 * further so all three lines fit (see planCard).
 */
export type DensityTier = {
  /** Lane width at which this tier takes over. */
  minLaneW: number;
  name: "roomy" | "standard" | "compact" | "dense" | "tight";
  cardTitle: number;
  coachHead: number;
  dayName: number;
  dayDate: number;
  axis: number;
  legend: number;
};

const TIERS: DensityTier[] = [
  {
    minLaneW: 86,
    name: "roomy",
    cardTitle: 10,
    coachHead: 10,
    dayName: 12.5,
    dayDate: 10.5,
    axis: 9,
    legend: 9,
  },
  {
    minLaneW: 66,
    name: "standard",
    cardTitle: 9,
    coachHead: 9,
    dayName: 12,
    dayDate: 10,
    axis: 8.5,
    legend: 8.5,
  },
  {
    minLaneW: 52,
    name: "compact",
    cardTitle: 8.2,
    coachHead: 8.4,
    dayName: 11.5,
    dayDate: 9.5,
    axis: 8.5,
    legend: 8.5,
  },
  {
    minLaneW: 44,
    name: "dense",
    cardTitle: 7.6,
    coachHead: 7.8,
    dayName: 11,
    dayDate: 9,
    axis: 8,
    legend: 8,
  },
  {
    minLaneW: 0,
    name: "tight",
    cardTitle: 7,
    coachHead: 7.2,
    dayName: 10.5,
    dayDate: 8.5,
    axis: 8,
    legend: 8,
  },
];

/** Absolute floor for a card title. Below this nothing is gained by shrinking. */
const MIN_CARD_TITLE = 6.6;
/** Time range and coach line, relative to the card title. */
const SUB_RATIO = 0.87;
/**
 * Card box, horizontally. All three come off the lane width before any text is
 * measured against it — including the border, which box-sizing: border-box takes
 * out of the content box and which it is very easy to forget is there.
 *
 * These are as tight as they go. Every px here is a px the longest word in a
 * class title doesn't get, and at the narrow end that is exactly the margin
 * between "WAG Turquoise" wrapping between its words and being sliced into
 * "Turquois / e".
 */
export const CARD_INSET_X = 1;
export const CARD_PAD_X = 3;
export const CARD_BORDER = 1;
/** Text width available inside a card sitting in a lane `laneW` wide. */
export function cardInnerW(laneW: number) {
  return laneW - 2 * (CARD_INSET_X + CARD_BORDER + CARD_PAD_X);
}

function tierFor(laneW: number): DensityTier {
  return TIERS.find((t) => laneW >= t.minLaneW) ?? TIERS[TIERS.length - 1];
}

/* ---------------- Per-card type + box ---------------- */

export type CardPlan = {
  top: number;
  height: number;
  titlePx: number;
  subPx: number;
  lineHeight: number;
  padY: number;
  /** Height cap on the title, so a longer one clips instead of shoving the
   *  time and coach lines out of the bottom of the card. */
  titleMaxLines: number;
  /** False renders the time range as two lines, start above end. */
  timeOneLine: boolean;
  /** No size fits all three lines in this height — the card will clip. */
  clipped: boolean;
};

/**
 * Fits one card's three lines — title, time range, coach — into the box the
 * class's duration and the column width give it.
 *
 * This is the part that decides whether a dense export is readable or garbage.
 * The rule is that nothing may be broken mid-word and nothing may be pushed out
 * of the card: type shrinks first, and if the title or the time range still
 * won't fit the column, they wrap onto another line rather than being chopped.
 * A 60-minute class is 53.5px tall here, which is five lines of 7px type, so
 * there is nearly always height to spend on wrapping — height is the axis a
 * week's worth of rota has spare, and column width is the one it doesn't.
 *
 * The search walks down from the tier's ceiling in 0.2px steps and takes the
 * first size whose wrapped line count fits the height. Two hundred cards times
 * a handful of steps is nothing, and it means the sizes come out of the actual
 * strings rather than out of an assumption about how long a class name is.
 */
export function planCard(
  startMins: number,
  durationMins: number,
  tier: DensityTier,
  laneW: number,
  title: string,
  time: TimeRangeParts,
  coachLabel: string
): CardPlan {
  const top = (startMins - DAY_START) * PX_PER_MIN;
  // 1.5px short so two back-to-back classes read as two cards, not one block.
  const height = Math.max(12, durationMins * PX_PER_MIN - 1.5);

  const roomy = height >= 34;
  const lineHeight = roomy ? 1.16 : 1.05;
  const padY = roomy ? 3 : 1.5;
  const content = height - 2 * padY;
  const inner = cardInnerW(laneW);

  for (let px = tier.cardTitle; px >= MIN_CARD_TITLE; px -= 0.2) {
    const sub = px * SUB_RATIO;

    // Titles get at most three lines: past that a long name is eating a card
    // whose other two lines matter more.
    const titleWrap = wrapInfo(title, px, true, inner);
    if (titleWrap.longestWord > inner) continue; // would break mid-word
    const titleLines = Math.min(3, titleWrap.lines);

    // The time range has no spaces in it, so it can't wrap on its own — a
    // browser would either overflow it or split it mid-token as "10:00a / m".
    // Instead it's laid out as two explicit lines when it won't fit one, and the
    // fit test is against the longer of the two halves.
    const timeOneLine = textWidth(time.oneLine, sub) <= inner;
    if (!timeOneLine && Math.max(textWidth(time.from, sub), textWidth(time.to, sub)) > inner) {
      continue;
    }
    const timeLines = timeOneLine ? 1 : 2;

    const coachWrap = wrapInfo(coachLabel, sub, false, inner);
    if (coachWrap.longestWord > inner) continue;
    const coachLines = Math.min(2, coachWrap.lines);

    const needed = (titleLines * px + (timeLines + coachLines) * sub) * lineHeight;
    if (needed <= content) {
      return {
        top,
        height,
        titlePx: px,
        subPx: sub,
        lineHeight,
        padY,
        titleMaxLines: titleLines,
        timeOneLine,
        clipped: false,
      };
    }
  }

  // Columns this narrow can't hold the words whole at any size worth reading.
  // Take the floor, keep the time range split so both halves survive, and let
  // the card clip — planExport's `tooDense` will already have said so.
  return {
    top,
    height,
    titlePx: MIN_CARD_TITLE,
    subPx: MIN_CARD_TITLE * SUB_RATIO,
    lineHeight,
    padY,
    titleMaxLines: 2,
    timeOneLine: textWidth(time.oneLine, MIN_CARD_TITLE * SUB_RATIO) <= inner,
    clipped: true,
  };
}

/* ---------------- Whole-board planning ---------------- */

export type PlannedCoach = {
  rosterRow: RosterRow;
  coachId: string;
  name: string;
  laneCount: number;
  width: number;
  /** class id -> lane index, from the board's own packing. */
  lanes: Map<string, number>;
  classes: ClassRow[];
  /** Off-shift bands as {top, height}, for the column's backdrop shading. */
  offShift: { top: number; height: number }[];
};

export type PlannedDay = {
  dayIndex: number;
  width: number;
  coaches: PlannedCoach[];
};

export type ExportPlan = {
  /** This week's page width. PAGE_H is fixed; see the note at the top. */
  pageW: number;
  laneW: number;
  tier: DensityTier;
  days: PlannedDay[];
  gridW: number;
  totalLanes: number;
  /**
   * The week needed more width than MAX_PAGE_W allows, and its columns are now
   * narrower than a class name's longest word, so some titles will break and
   * some cards will clip. Surfaced rather than hidden, so it can be said out
   * loud instead of quietly shipped.
   */
  tooDense: boolean;
  /** Categories actually used on this board, in the categories' own order. */
  usedCategoryKeys: string[];
};

/**
 * Turns a board's roster and classes into fixed pixel boxes.
 *
 * A lane is the unit of width, exactly as on the interactive board: a coach
 * whose classes overlap gets one lane per overlapping stack, so every card on
 * the page ends up the same width. Every lane on the page is the same width
 * too — the whole week's lanes divide the available width between them — so a
 * quiet Sunday doesn't get the same room as a full Saturday.
 */
export function planExport(
  coaches: Coach[],
  roster: RosterRow[],
  classes: ClassRow[],
  /** Ordered as the board orders them, so the legend reads the same every time. */
  categoryOrder: string[] = []
): ExportPlan {
  const nameById = new Map(coaches.map((c) => [c.id, c.name]));

  // Same ordering as the board: alphabetical by coach name within each day.
  const rosterByDay: RosterRow[][] = [[], [], [], [], [], [], []];
  for (const row of roster) {
    if (row.day_of_week >= 0 && row.day_of_week <= 6) rosterByDay[row.day_of_week].push(row);
  }
  for (const list of rosterByDay) {
    list.sort((a, b) =>
      (nameById.get(a.coach_id) ?? "").localeCompare(nameById.get(b.coach_id) ?? "", undefined, {
        sensitivity: "base",
      })
    );
  }

  const dayEndPx = GRID_H;
  const usedCategoryKeys: string[] = [];

  // First pass: lane counts, so the lane width is known before boxes are sized.
  const draft = rosterByDay.map((dayRoster, dayIndex) => {
    const coachesForDay = dayRoster.map((row) => {
      const own = classes.filter(
        (c) => c.day_of_week === dayIndex && c.coach_id === row.coach_id
      );
      for (const c of own) {
        if (!usedCategoryKeys.includes(c.category_key)) usedCategoryKeys.push(c.category_key);
      }

      const { lanes, laneCount } = laneAssign(own);

      const offShift: { top: number; height: number }[] = [];
      // A coach on leave or off sick has no shift at all — shade the lot, which
      // reads as "not in" at a glance and pairs with the coloured name above.
      if (row.status !== "working") {
        offShift.push({ top: 0, height: dayEndPx });
      } else {
        if (row.shift_start_mins > DAY_START) {
          offShift.push({ top: 0, height: (row.shift_start_mins - DAY_START) * PX_PER_MIN });
        }
        if (row.shift_end_mins < DAY_END) {
          const top = (row.shift_end_mins - DAY_START) * PX_PER_MIN;
          offShift.push({ top, height: dayEndPx - top });
        }
      }

      return { row, laneCount, lanes, classes: own, offShift };
    });

    // A day with nobody rostered still gets one lane's width so its header and
    // "nobody rostered" note have somewhere to sit — same as the board.
    const lanes = coachesForDay.reduce((n, c) => n + c.laneCount, 0) || 1;
    return { dayIndex, coachesForDay, lanes };
  });

  const totalLanes = draft.reduce((n, d) => n + d.lanes, 0);
  const { pageW, laneW } = pageWidthFor(totalLanes);
  const tier = tierFor(laneW);

  const days: PlannedDay[] = draft.map((d) => ({
    dayIndex: d.dayIndex,
    width: d.lanes * laneW,
    coaches: d.coachesForDay.map((c) => ({
      rosterRow: c.row,
      coachId: c.row.coach_id,
      name: nameById.get(c.row.coach_id) ?? "Unknown coach",
      laneCount: c.laneCount,
      width: c.laneCount * laneW,
      lanes: c.lanes,
      classes: c.classes,
      offShift: c.offShift,
    })),
  }));

  // Legend order follows rota_categories.sort_order rather than whichever class
  // happens to be first on Monday, so the same board always legends the same.
  usedCategoryKeys.sort((a, b) => {
    const ia = categoryOrder.indexOf(a);
    const ib = categoryOrder.indexOf(b);
    return (ia < 0 ? Number.MAX_SAFE_INTEGER : ia) - (ib < 0 ? Number.MAX_SAFE_INTEGER : ib);
  });

  return {
    pageW,
    laneW,
    tier,
    days,
    gridW: days.reduce((w, d) => w + d.width, 0) + (DAY_NAMES.length - 1) * DIVIDER_W,
    totalLanes,
    tooDense: laneW < MIN_INTACT_LANE_W,
    usedCategoryKeys,
  };
}
/* ---------------- Text helpers ---------------- */

export type TimeRangeParts = {
  /** Start, carrying the dash, for when the range needs two lines. */
  from: string;
  /** End, always carrying the meridiem. */
  to: string;
  /** Both together, for when they fit on one. */
  oneLine: string;
};

/**
 * "5:30–6:30pm" rather than the board's "5:30pm – 6:30pm". The board has 128px
 * to play with; here the meridiem is dropped from the start time whenever both
 * ends share it — every class that doesn't straddle noon — which saves two
 * characters out of about eleven.
 *
 * Returned in halves as well as whole because a narrow column has to stack them,
 * and there's no space in "5:30–6:30pm" for a browser to break at.
 */
export function compactTimeRange(startMins: number, durationMins: number): TimeRangeParts {
  const endMins = startMins + durationMins;
  const clock = (m: number) => {
    const h = Math.floor(m / 60);
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    const mins = m % 60;
    return h12 + ":" + String(mins).padStart(2, "0");
  };
  const meridiem = (m: number) => (Math.floor(m / 60) % 24 >= 12 ? "pm" : "am");
  const from =
    clock(startMins) + (meridiem(startMins) === meridiem(endMins) ? "" : meridiem(startMins));
  const to = clock(endMins) + meridiem(endMins);
  return { from: from + "–", to, oneLine: from + "–" + to };
}

/**
 * Width of a string at a given size in the app's font stack.
 *
 * Measured, not estimated. Every wrap, shorten and shrink decision in here
 * depends on this number, and a flat per-character average isn't good enough to
 * base them on: across the strings that actually occur, the real advance width
 * ranges from 0.46 to 0.67 em ("Little Flippers" vs "Diamond"), so a single
 * constant is 20% out either way — which is the difference between a title
 * wrapping between its words and being sliced into "Turquoi/se".
 *
 * The canvas is created once, lazily, and only exists in the browser; the flat
 * fallback is there for a server render, which the export layout never actually
 * gets (it renders on demand, after a click) but which nothing should crash on.
 */
let measureCtx: CanvasRenderingContext2D | null | undefined;

export function textWidth(text: string, px: number, bold = false) {
  if (measureCtx === undefined) {
    measureCtx =
      typeof document === "undefined"
        ? null
        : document.createElement("canvas").getContext("2d");
  }
  if (!measureCtx) return text.length * px * (bold ? 0.62 : 0.58);
  measureCtx.font = `${bold ? 700 : 400} ${px}px ${FONT_STACK}`;
  return measureCtx.measureText(text).width;
}

/**
 * How a string will actually wrap in a box `inner` px wide: the number of lines
 * a browser's greedy line-breaker will produce, and the width of the longest
 * single word in it.
 *
 * The longest word is the number that matters. A box narrower than one word
 * forces the browser to break mid-word — "WAG Turquoise" becomes "WAG /
 * Turquois / e", which then clips to "WAG / Turquois" and has lost a letter off
 * a class name. Simply dividing the whole string's width by the column width
 * doesn't predict that at all: it says "WAG Turquoise" needs two lines, and two
 * lines is exactly what it gets — the wrong two.
 */
export function wrapInfo(text: string, px: number, bold: boolean, inner: number) {
  const words = text.split(/\s+/).filter(Boolean);
  let longestWord = 0;
  let lines = words.length ? 1 : 0;
  let used = 0;
  const space = textWidth(" ", px, bold);

  for (const word of words) {
    const w = textWidth(word, px, bold);
    if (w > longestWord) longestWord = w;
    if (used === 0) {
      used = w;
    } else if (used + space + w <= inner) {
      used += space + w;
    } else {
      lines++;
      used = w;
    }
  }
  return { lines: Math.max(1, lines), longestWord };
}

/**
 * Coach names are the one label that mustn't be ellipsised — "Charlot…" is
 * worse than useless on a rota. Where the full name won't fit, fall back to
 * "First L." and only then let CSS clip.
 */
export function fitCoachName(
  name: string,
  px: number,
  availPx: number,
  bold = false
): string {
  if (textWidth(name, px, bold) <= availPx) return name;
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1) {
    const short = `${parts[0]} ${parts[parts.length - 1][0]}.`;
    if (textWidth(short, px, bold) <= availPx) return short;
    if (textWidth(parts[0], px, bold) <= availPx) return parts[0];
  }
  return name;
}

/**
 * Readable text colour for a category swatch. The board paints every card's
 * text white, which is fine at 128px with a hover state to fall back on, but
 * several real categories are pale (#F0D42A Amber, #EBA9CB Quartz, #9FB0C3
 * Diamond) and white on those is not readable at export scale. 0.215 is the
 * luminance where white and near-black have equal contrast, so this picks
 * whichever of the two is actually more legible.
 */
export function readableTextOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#FFFFFF";
  const int = parseInt(m[1], 16);
  const channels = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const luminance =
    0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.215 ? "#1F2429" : "#FFFFFF";
}
