"use client";

import { Fragment, useEffect, useRef } from "react";
import type { SiteOption } from "@/lib/rota/resolveSiteAccess";
import {
  dayLabel,
  eventsOverlapping,
  type CompEvent,
  type SeasonWeek,
} from "@/lib/competitions/calendar";
import { TYPE_STYLES } from "./eventTypeStyles";

// Width of the sticky week column, and the least a site column may shrink to
// before the grid scrolls sideways inside its card.
const WEEK_COL_PX = 96;
const SITE_COL_MIN_PX = 118;

/**
 * One competition in one site's cell. `siteId` is the column it's drawn in, so
 * a per-site entry status can be added here later.
 */
function EventPill({
  event,
  onOpen,
}: {
  event: CompEvent;
  siteId: string;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(event.id)}
      title={`${event.title} — ${event.eventType}`}
      className={`my-px flex w-full items-center gap-1 rounded-md border-l-[3px] px-1.5 py-[3px] text-left text-[11.5px] leading-tight text-ink hover:brightness-95 ${TYPE_STYLES[event.eventType].event}`}
    >
      <span className="min-w-0 flex-1 truncate">{event.title}</span>
      <span className="whitespace-nowrap text-[10.5px] text-slate">{dayLabel(event)}</span>
    </button>
  );
}

/** An NWG All Competition drawn once across every site column. */
function AllClubsBar({ event, onOpen }: { event: CompEvent; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(event.id)}
      title={`${event.title} — ${event.eventType}`}
      className={`my-px flex w-full items-center gap-1.5 rounded-md border-l-[3px] px-2 py-[3px] text-left text-[11.5px] font-semibold text-ink hover:brightness-95 ${TYPE_STYLES[event.eventType].event}`}
    >
      <span className="min-w-0 truncate">{event.title}</span>
      <span className="whitespace-nowrap font-normal text-slate">
        · {dayLabel(event)} · all clubs
      </span>
    </button>
  );
}

/**
 * Weeks down, sites across. The header row and week column stay put while the
 * grid scrolls inside its card, and the current week is scrolled into view
 * whenever a year containing it is shown.
 */
export default function SeasonGrid({
  year,
  weeks,
  sites,
  allSitesShown,
  events,
  onOpen,
}: {
  year: number;
  weeks: SeasonWeek[];
  /** Visible site columns, in sort order. */
  sites: SiteOption[];
  /** Every site is shown, so NWG All Competitions span the row. */
  allSitesShown: boolean;
  /** Already filtered by type. */
  events: CompEvent[];
  onOpen: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLTableSectionElement>(null);
  const currentRef = useRef<HTMLTableRowElement>(null);

  // Scroll the card, not the window, so the page itself doesn't jump. Keyed on
  // the year only: changing a filter shouldn't pull the grid back.
  useEffect(() => {
    const container = containerRef.current;
    const row = currentRef.current;
    if (!container || !row) return;
    const offset =
      row.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop;
    const headHeight = headRef.current?.offsetHeight ?? 0;
    // Leave the previous week or so visible above it.
    container.scrollTop = Math.max(0, offset - headHeight - 48);
  }, [year]);

  const cellBase = "border-b border-r border-line/60 px-[5px] py-1 align-top";

  return (
    <div
      ref={containerRef}
      className="max-h-[72vh] max-w-full overflow-auto rounded-card border border-line bg-card shadow-card"
    >
      <table
        className="w-full table-fixed border-separate border-spacing-0 text-xs"
        style={{ minWidth: WEEK_COL_PX + sites.length * SITE_COL_MIN_PX }}
      >
        <colgroup>
          <col style={{ width: WEEK_COL_PX }} />
          {sites.map((s) => (
            <col key={s.id} />
          ))}
        </colgroup>
        <thead ref={headRef}>
          <tr>
            <th className="sticky left-0 top-0 z-30 border-b border-line bg-background px-2 py-2 text-left font-semibold text-slate">
              Week
            </th>
            {sites.map((s) => (
              <th
                key={s.id}
                className="sticky top-0 z-20 truncate border-b border-line bg-background px-2 py-2 text-left font-semibold text-slate"
              >
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((w, i) => {
            const weekEvents = eventsOverlapping(events, w.monday, w.sunday);
            const spanning = allSitesShown ? weekEvents.filter((e) => e.allSites) : [];
            const newMonth = i === 0 || weeks[i - 1].monthKey !== w.monthKey;

            const rowBg = w.isCurrent ? "bg-orange-pale" : "bg-card";
            const dim = w.isPast ? "opacity-55" : "";
            const weekCell = (
              <td
                rowSpan={spanning.length > 0 ? 2 : 1}
                className={`sticky left-0 z-10 whitespace-nowrap border-b border-r border-line px-2 py-1 align-top text-[11.5px] ${rowBg} ${
                  w.isCurrent ? "font-bold text-orange-dark" : "text-slate"
                }`}
              >
                {w.label}
                {w.isCurrent && <span className="block">This week</span>}
              </td>
            );

            return (
              <Fragment key={w.monday}>
                {newMonth && (
                  <tr>
                    <td
                      colSpan={sites.length + 1}
                      className="border-b border-line bg-background/50 px-2 py-[7px] text-xs font-bold text-ink"
                    >
                      <span className="sticky left-2">{w.monthLabel}</span>
                    </td>
                  </tr>
                )}
                {spanning.length > 0 && (
                  <tr ref={w.isCurrent ? currentRef : undefined}>
                    {weekCell}
                    <td colSpan={sites.length} className={`px-[5px] pt-1 align-top ${rowBg} ${dim}`}>
                      {spanning.map((e) => (
                        <AllClubsBar key={e.id} event={e} onOpen={onOpen} />
                      ))}
                    </td>
                  </tr>
                )}
                <tr ref={w.isCurrent && spanning.length === 0 ? currentRef : undefined}>
                  {spanning.length === 0 && weekCell}
                  {sites.map((s) => (
                    <td key={s.id} className={`h-[34px] ${cellBase} ${rowBg} ${dim}`}>
                      {weekEvents
                        .filter((e) =>
                          e.allSites ? spanning.length === 0 : e.siteIds.includes(s.id)
                        )
                        .map((e) => (
                          <EventPill key={e.id} event={e} siteId={s.id} onOpen={onOpen} />
                        ))}
                    </td>
                  ))}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
