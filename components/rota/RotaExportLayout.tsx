/**
 * The rota as a single fixed 1600x900 page, for capture into a PDF.
 *
 * This is a second, separate rendering of the same roster and classes — not the
 * interactive board with print styles bolted on. There is no sticky
 * positioning, no draggable, no hover state, no popover, no CSS module and no
 * event handler anywhere in this file, because none of those things exist in a
 * bitmap. Everything is inline-styled with literal hex colours so nothing is
 * inherited from the app shell and nothing depends on a stylesheet having
 * loaded before the capture runs.
 *
 * It renders both modes off one `week` prop: a real calendar week puts dates in
 * the header and next to each day name, and the undated Standard Rota template
 * carries day names only, matching the board's own convention of showing no
 * dates at all on the standard view.
 */

import { DAY_NAMES, fmtClock, DAY_START, DAY_END } from "@/lib/rota/board";
import {
  BRAND,
  COACH_HEAD_BG,
  COACH_HEAD_H,
  DAY_HEAD_H,
  DIVIDER,
  DIVIDER_W,
  FONT_STACK,
  GRID_H,
  HEADER_H,
  HOURS,
  HOUR_LINE,
  INK,
  INK_SOFT,
  LEAVE,
  LEGEND_GAP,
  LEGEND_H,
  LINE,
  OFF_SHIFT,
  PAD_BOTTOM,
  PAD_TOP,
  CARD_INSET_X,
  CARD_PAD_X,
  cardInnerW,
  PAD_X,
  PAGE_H,
  PAPER,
  PX_PER_HOUR,
  SICK,
  SLATE_DARK,
  TIME_COL_W,
  textWidth,
  compactTimeRange,
  fitCoachName,
  planCard,
  readableTextOn,
  type ExportPlan,
  type PlannedCoach,
} from "@/lib/rota/exportLayout";
import type { Category, ClassRow } from "./RotaBoard";

/** Which week this is, or null for the undated Standard Rota template. */
export type ExportWeek = {
  /** "4–10 Aug 2026", as shown above the board on the weekly route. */
  rangeLabel: string;
  /** Mon–Sun, e.g. ["4 Aug", "5 Aug", …]. */
  dayDates: string[];
};

const HEADER_TITLE_PX = 15.5;
const HEADER_SUB_PX = 9.5;

export default function RotaExportLayout({
  siteName,
  week,
  plan,
  categories,
  coachNameById,
}: {
  siteName: string;
  week: ExportWeek | null;
  plan: ExportPlan;
  categories: Category[];
  coachNameById: Map<string, string>;
}) {
  const categoryByKey = new Map(categories.map((c) => [c.key, c]));
  const title = week
    ? `${siteName} — Week of ${week.rangeLabel}`
    : `${siteName} — Standard Rota`;
  const subtitle = week
    ? `Monday to Sunday · ${fmtClock(DAY_START)} – ${fmtClock(DAY_END)}`
    : `Monday to Sunday · ${fmtClock(DAY_START)} – ${fmtClock(DAY_END)} · repeating weekly template, no dates`;

  return (
    <div
      style={{
        boxSizing: "border-box",
        // Width comes from the plan: 1600 for a week that fits, wider for one
        // that doesn't. Height never changes.
        width: plan.pageW,
        height: PAGE_H,
        padding: `${PAD_TOP}px ${PAD_X}px ${PAD_BOTTOM}px`,
        background: PAPER,
        color: INK,
        fontFamily: FONT_STACK,
        // Guards the page against a long site name or a wide legend: the page
        // is a fixed box and nothing may push past it into the capture.
        overflow: "hidden",
      }}
    >
      <div style={{ height: HEADER_H, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div
          style={{
            fontSize: HEADER_TITLE_PX,
            fontWeight: 800,
            letterSpacing: "-0.2px",
            color: SLATE_DARK,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: HEADER_SUB_PX,
            color: INK_SOFT,
            lineHeight: 1.3,
            marginTop: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {subtitle}
        </div>
      </div>

      <Legend plan={plan} categoryByKey={categoryByKey} />

      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <TimeAxis plan={plan} />
        {plan.days.map((day, i) => (
          <div key={day.dayIndex} style={{ display: "flex", flex: "none" }}>
            <div style={{ width: day.width, flex: "none" }}>
              <DayHead
                name={DAY_NAMES[day.dayIndex]}
                date={week ? week.dayDates[day.dayIndex] : null}
                plan={plan}
              />
              <CoachHeadRow day={day.coaches} plan={plan} />
              <DayGrid
                coaches={day.coaches}
                plan={plan}
                categoryByKey={categoryByKey}
                coachNameById={coachNameById}
              />
            </div>
            {i < plan.days.length - 1 && (
              <div
                style={{
                  width: DIVIDER_W,
                  flex: "none",
                  height: DAY_HEAD_H + COACH_HEAD_H + GRID_H,
                  background: DIVIDER,
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Legend ---------------- */

/**
 * Only the categories actually on this board, not all 20 — a legend listing
 * colours that don't appear is both wasted width and misleading.
 */
function Legend({
  plan,
  categoryByKey,
}: {
  plan: ExportPlan;
  categoryByKey: Map<string, Category>;
}) {
  const px = plan.tier.legend;
  const used = plan.usedCategoryKeys
    .map((key) => categoryByKey.get(key))
    .filter((c): c is Category => !!c);

  return (
    <div
      style={{
        height: LEGEND_H,
        marginBottom: LEGEND_GAP,
        display: "flex",
        alignItems: "center",
        gap: 9,
        fontSize: px,
        color: INK_SOFT,
        whiteSpace: "nowrap",
        overflow: "hidden",
      }}
    >
      {used.map((c) => (
        <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 3, flex: "none" }}>
          <div
            style={{
              width: px,
              height: px,
              borderRadius: 2,
              background: c.color_hex,
              flex: "none",
            }}
          />
          <span>{c.label}</span>
        </div>
      ))}
      <div style={{ width: 1, height: px + 3, background: LINE, flex: "none" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 3, flex: "none" }}>
        <div
          style={{
            width: px + 3,
            height: px,
            borderRadius: 2,
            border: `1px dashed ${INK_SOFT}`,
            flex: "none",
          }}
        />
        <span>cover</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 3, flex: "none" }}>
        <div
          style={{
            width: px + 3,
            height: px,
            borderRadius: 2,
            background: OFF_SHIFT,
            border: `1px solid ${LINE}`,
            flex: "none",
          }}
        />
        <span>outside shift</span>
      </div>
      <div style={{ flex: "none", color: LEAVE, fontWeight: 700 }}>annual leave</div>
      <div style={{ flex: "none", color: SICK, fontWeight: 700 }}>sickness</div>
    </div>
  );
}

/* ---------------- Time axis ---------------- */

/**
 * Hourly labels only. The board draws a gridline every 15 minutes, which at
 * 55px an hour would be a line every 13.75px — a grey wash, not a grid. Exact
 * start times are still readable because every card states its own time range.
 */
function TimeAxis({ plan }: { plan: ExportPlan }) {
  const px = plan.tier.axis;
  return (
    <div style={{ width: TIME_COL_W, flex: "none" }}>
      <div style={{ height: DAY_HEAD_H + COACH_HEAD_H, borderBottom: `1px solid ${LINE}` }} />
      <div style={{ height: GRID_H, position: "relative", borderRight: `1px solid ${LINE}` }}>
        {Array.from({ length: HOURS + 1 }, (_, h) => {
          const mins = DAY_START + h * 60;
          const top = h * PX_PER_HOUR;
          return (
            <div
              key={h}
              style={{
                position: "absolute",
                top,
                right: 5,
                // The 8am label would sit half off the top of the grid and the
                // 10pm label half off the bottom, so the two ends tuck inside
                // instead of centring on their own line.
                transform:
                  h === 0 ? "translateY(0)" : h === HOURS ? "translateY(-100%)" : "translateY(-50%)",
                fontSize: px,
                lineHeight: 1.1,
                fontWeight: 500,
                color: INK_SOFT,
                whiteSpace: "nowrap",
              }}
            >
              {fmtClock(mins)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Day + coach headers ---------------- */

function DayHead({
  name,
  date,
  plan,
}: {
  name: string;
  date: string | null;
  plan: ExportPlan;
}) {
  return (
    <div
      style={{
        height: DAY_HEAD_H,
        display: "flex",
        alignItems: "baseline",
        justifyContent: "center",
        gap: 4,
        whiteSpace: "nowrap",
        overflow: "hidden",
      }}
    >
      <span
        style={{
          fontSize: plan.tier.dayName,
          lineHeight: 1.1,
          fontWeight: 800,
          color: BRAND,
        }}
      >
        {name}
      </span>
      {/* Dates only ever render in weekly mode — `date` is null for the
          Standard Rota, so nothing dated reaches the page at all. */}
      {date && (
        <span style={{ fontSize: plan.tier.dayDate, lineHeight: 1.1, color: INK_SOFT }}>
          {date}
        </span>
      )}
    </div>
  );
}

function CoachHeadRow({ day, plan }: { day: PlannedCoach[]; plan: ExportPlan }) {
  const px = plan.tier.coachHead;
  return (
    <div style={{ height: COACH_HEAD_H, display: "flex", borderBottom: `1.5px solid ${LINE}` }}>
      {day.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: COACH_HEAD_BG,
            fontSize: px,
            color: INK_SOFT,
          }}
        >
          —
        </div>
      ) : (
        day.map((coach, i) => (
          <div
            key={coach.coachId}
            style={{
              width: coach.width,
              flex: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 2px",
              boxSizing: "border-box",
              background: COACH_HEAD_BG,
              borderRight: i < day.length - 1 ? `1px solid ${LINE}` : undefined,
              overflow: "hidden",
            }}
          >
            <span
              style={{
                fontSize: px,
                lineHeight: 1.15,
                fontWeight: 700,
                whiteSpace: "nowrap",
                overflow: "hidden",
                // Status is carried by the name's colour, as on the board, with
                // the legend naming both — there is no room for a status tag at
                // this column width.
                color:
                  coach.rosterRow.status === "leave"
                    ? LEAVE
                    : coach.rosterRow.status === "sick"
                      ? SICK
                      : INK,
              }}
            >
              {fitCoachName(coach.name, px, coach.width - 4, true)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

/* ---------------- Grid ---------------- */

function DayGrid({
  coaches,
  plan,
  categoryByKey,
  coachNameById,
}: {
  coaches: PlannedCoach[];
  plan: ExportPlan;
  categoryByKey: Map<string, Category>;
  coachNameById: Map<string, string>;
}) {
  // Off-shift shading and the hour rules go in one backdrop layer beneath the
  // coach columns, so each is drawn once per day rather than once per column,
  // and the rules read continuously across a day instead of stopping at every
  // column edge.
  let x = 0;
  const shading: { left: number; width: number; top: number; height: number }[] = [];
  for (const coach of coaches) {
    for (const band of coach.offShift) {
      shading.push({ left: x, width: coach.width, top: band.top, height: band.height });
    }
    x += coach.width;
  }

  return (
    <div style={{ height: GRID_H, position: "relative" }}>
      <div style={{ position: "absolute", inset: 0 }}>
        {shading.map((s, i) => (
          <div
            key={"shade-" + i}
            style={{
              position: "absolute",
              left: s.left,
              width: s.width,
              top: s.top,
              height: s.height,
              background: OFF_SHIFT,
            }}
          />
        ))}
        {Array.from({ length: HOURS }, (_, h) => (
          <div
            key={"hr-" + h}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: (h + 1) * PX_PER_HOUR - 1,
              height: 1,
              background: HOUR_LINE,
            }}
          />
        ))}
      </div>

      {coaches.length === 0 ? (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 0,
            right: 0,
            textAlign: "center",
            fontSize: plan.tier.axis,
            color: INK_SOFT,
          }}
        >
          Nobody rostered
        </div>
      ) : (
        <div style={{ display: "flex", height: "100%" }}>
          {coaches.map((coach, i) => (
            <div
              key={coach.coachId}
              style={{
                width: coach.width,
                flex: "none",
                display: "flex",
                boxSizing: "border-box",
                borderRight: i < coaches.length - 1 ? `1px solid ${LINE}` : undefined,
              }}
            >
              {Array.from({ length: coach.laneCount }, (_, lane) => (
                <div
                  key={lane}
                  style={{
                    width: plan.laneW,
                    flex: "none",
                    position: "relative",
                    boxSizing: "border-box",
                    // Lane rules inside one coach's column are lighter than the
                    // column rule, so a split column still reads as one coach.
                    borderRight: lane < coach.laneCount - 1 ? `1px solid ${HOUR_LINE}` : undefined,
                  }}
                >
                  {coach.classes
                    .filter((ev) => (coach.lanes.get(ev.id) ?? 0) === lane)
                    .map((ev) => (
                      <ClassCard
                        key={ev.id}
                        ev={ev}
                        plan={plan}
                        category={categoryByKey.get(ev.category_key)}
                        coachNameById={coachNameById}
                      />
                    ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Three lines, matching the board's card: title, time range, coach.
 *
 * What the board has and this doesn't: the delete affordance, the grab cursor,
 * the hover shadow, and the white "COVER" chip. The chip is the only one that
 * carried information, and it's replaced by a dashed outline in the card's own
 * text colour — which costs no vertical space at all — plus an inline tag on the
 * coach line naming who the class really belongs to, whenever the lane is wide
 * enough to take it.
 */
function ClassCard({
  ev,
  plan,
  category,
  coachNameById,
}: {
  ev: ClassRow;
  plan: ExportPlan;
  category: Category | undefined;
  coachNameById: Map<string, string>;
}) {
  const bg = category?.color_hex ?? "#9AA2AB";
  const fg = readableTextOn(bg);
  const isCover = !!ev.set_coach_id && ev.set_coach_id !== ev.coach_id;
  const timeLabel = compactTimeRange(ev.start_mins, ev.duration_mins);
  const inner = cardInnerW(plan.laneW);
  const deliveredBy = coachNameById.get(ev.coach_id) ?? "Unknown coach";

  // Cover, in descending order of how much room the column has: name the real
  // owner, else just flag it as cover, else let the dashed outline carry it on
  // its own. Sized at the tier's ceiling because the coach line is what's being
  // chosen here, and planCard needs it before it can pick a size.
  const ceilingSub = plan.tier.cardTitle * 0.87;
  const shortName = fitCoachName(deliveredBy, ceilingSub, inner);
  let coachLine = shortName;
  if (isCover) {
    const owner = fitCoachName(coachNameById.get(ev.set_coach_id!) ?? "Unknown coach", ceilingSub, inner);
    const withOwner = `${shortName} · for ${owner}`;
    const withTag = `${shortName} · cover`;
    if (textWidth(withOwner, ceilingSub) <= inner) coachLine = withOwner;
    else if (textWidth(withTag, ceilingSub) <= inner) coachLine = withTag;
  }

  const card = planCard(
    ev.start_mins,
    ev.duration_mins,
    plan.tier,
    plan.laneW,
    ev.title,
    timeLabel,
    coachLine
  );

  return (
    <div
      style={{
        position: "absolute",
        left: CARD_INSET_X,
        width: plan.laneW - 2 * CARD_INSET_X,
        top: card.top,
        height: card.height,
        boxSizing: "border-box",
        borderRadius: 3,
        padding: `${card.padY}px ${CARD_PAD_X}px`,
        background: bg,
        color: fg,
        border: isCover ? `1px dashed ${fg}` : "1px solid rgba(0, 0, 0, 0.10)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: card.titlePx,
          lineHeight: card.lineHeight,
          // Capped at the lines planCard budgeted for, so a title that wraps
          // further is clipped rather than pushing the time and coach lines out
          // of the card — those two are the lines you can't guess.
          maxHeight: card.titleMaxLines * card.titlePx * card.lineHeight,
          overflow: "hidden",
          // break-word, not break-all: it only splits a word that cannot fit the
          // column at all, so "Preschool Open Play" wraps between words.
          overflowWrap: "break-word",
        }}
      >
        {ev.title}
      </div>
      {/* One line where it fits, otherwise start above end. Never ellipsised:
          a class whose finish time has been cut off isn't much of a rota. */}
      <div
        style={{
          fontSize: card.subPx,
          lineHeight: card.lineHeight,
          fontWeight: 500,
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        {card.timeOneLine ? (
          timeLabel.oneLine
        ) : (
          <>
            {timeLabel.from}
            <br />
            {timeLabel.to}
          </>
        )}
      </div>
      <div
        style={{
          fontSize: card.subPx,
          lineHeight: card.lineHeight,
          overflowWrap: "break-word",
          overflow: "hidden",
        }}
      >
        {coachLine}
      </div>
    </div>
  );
}
