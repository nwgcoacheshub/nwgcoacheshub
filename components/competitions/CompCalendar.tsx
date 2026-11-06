"use client";

import { useCallback, useMemo, useState } from "react";
import type { SiteOption } from "@/lib/rota/resolveSiteAccess";
import {
  EVENT_TYPES,
  EVENT_TYPE_SHORT,
  eventsInYear,
  groupByStartMonth,
  type CompEvent,
  type EventType,
  type SeasonWeek,
} from "@/lib/competitions/calendar";
import { TYPE_STYLES } from "./eventTypeStyles";
import SeasonGrid from "./SeasonGrid";
import CompList from "./CompList";
import CompEventPanel from "./CompEventPanel";

const chipBase =
  "inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-[3px] text-xs";
const chipOn = "border-ink font-semibold text-ink";
const chipOff = "border-line text-slate opacity-45";

/**
 * The calendar's client side: site and type filters, the Season grid or List,
 * and the details panel. Filters live here only; year and view come from the
 * URL via the page.
 */
export default function CompCalendar({
  year,
  view,
  today,
  weeks,
  sites,
  events,
}: {
  year: number;
  view: "grid" | "list";
  /** London date, "YYYY-MM-DD". */
  today: string;
  weeks: SeasonWeek[];
  /** Every active site, in sort order. */
  sites: SiteOption[];
  /** Every event overlapping the grid's weeks. */
  events: CompEvent[];
}) {
  const [siteFilter, setSiteFilter] = useState<Set<string>>(
    () => new Set(sites.map((s) => s.id))
  );
  const [typeFilter, setTypeFilter] = useState<Set<EventType>>(() => new Set(EVENT_TYPES));
  const [openId, setOpenId] = useState<string | null>(null);
  const closePanel = useCallback(() => setOpenId(null), []);

  // A site id no longer in `sites` can't be clicked off again, so only count
  // the current ones.
  const visibleSites = sites.filter((s) => siteFilter.has(s.id));
  const allSitesShown = visibleSites.length === sites.length;

  function clickSite(id: string) {
    setSiteFilter((prev) => {
      // All on: a click means "just this one".
      if (sites.every((s) => prev.has(s.id))) return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return sites.some((s) => next.has(s.id)) ? next : new Set(sites.map((s) => s.id));
    });
  }

  function clickType(t: EventType) {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) {
        next.delete(t);
      } else {
        next.add(t);
      }
      return next.size > 0 ? next : new Set(EVENT_TYPES);
    });
  }

  const yearEvents = useMemo(() => eventsInYear(events, year), [events, year]);
  const typed = events.filter((e) => typeFilter.has(e.eventType));

  const listMonths = useMemo(() => {
    const shown = yearEvents.filter(
      (e) =>
        typeFilter.has(e.eventType) &&
        (e.allSites ||
          e.siteIds.some((id) => siteFilter.has(id)) ||
          (e.siteIds.length === 0 && allSitesShown))
    );
    return groupByStartMonth(shown, today);
  }, [yearEvents, typeFilter, siteFilter, allSitesShown, today]);

  const openEvent = openId ? events.find((e) => e.id === openId) ?? null : null;

  if (yearEvents.length === 0) {
    return (
      <div className="rounded-card border border-line bg-card px-5 py-10 text-center text-sm text-slate shadow-card">
        No competitions in {year} yet.
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-x-[18px] gap-y-2.5 rounded-card border border-line bg-card px-3 py-2.5 shadow-card">
        <div className="flex flex-wrap items-center gap-[5px]">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[.04em] text-slate-light">
            Clubs
          </span>
          {sites.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={siteFilter.has(s.id)}
              onClick={() => clickSite(s.id)}
              className={`${chipBase} ${siteFilter.has(s.id) ? chipOn : chipOff}`}
            >
              {s.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSiteFilter(new Set(sites.map((s) => s.id)))}
            className={`${chipBase} border-line text-slate`}
          >
            All
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-[5px]">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[.04em] text-slate-light">
            Type
          </span>
          {EVENT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={typeFilter.has(t)}
              onClick={() => clickType(t)}
              className={`${chipBase} ${typeFilter.has(t) ? chipOn : chipOff}`}
            >
              <span className={`inline-block h-[9px] w-[9px] rounded-[3px] ${TYPE_STYLES[t].swatch}`} />
              {EVENT_TYPE_SHORT[t]}
            </button>
          ))}
        </div>
      </div>

      {view === "grid" ? (
        <SeasonGrid
          year={year}
          weeks={weeks}
          sites={visibleSites}
          allSitesShown={allSitesShown}
          events={typed}
          onOpen={setOpenId}
        />
      ) : (
        <CompList
          months={listMonths}
          sites={visibleSites}
          allSitesShown={allSitesShown}
          onOpen={setOpenId}
        />
      )}

      {openEvent && <CompEventPanel event={openEvent} sites={sites} onClose={closePanel} />}
    </>
  );
}
