"use client";

import { useState } from "react";
import type { SiteOption } from "@/lib/rota/resolveSiteAccess";
import { dayLabel, type CompEvent, type ListMonth } from "@/lib/competitions/calendar";
import { TYPE_STYLES, typeTagClass } from "./eventTypeStyles";

const siteChipClass =
  "inline-flex items-center rounded-full border border-line bg-white px-[7px] py-0.5 text-[11px] text-slate";

/**
 * One attending site on a list row. `siteId` identifies the club, so a
 * per-site entry status can be added here later.
 */
function SiteChip({ name }: { siteId: string; name: string }) {
  return <span className={siteChipClass}>{name}</span>;
}

/**
 * Competitions grouped by start month. Past months start collapsed and the
 * rest open; a click flips either.
 */
export default function CompList({
  months,
  sites,
  allSitesShown,
  onOpen,
}: {
  /** Already filtered by type and site. */
  months: ListMonth[];
  /** Visible sites, in sort order. */
  sites: SiteOption[];
  allSitesShown: boolean;
  onOpen: (id: string) => void;
}) {
  // Months whose default (past = collapsed, otherwise open) has been flipped.
  // Stored as flips rather than as open months so a year change starts from
  // the defaults without resetting anything.
  const [flipped, setFlipped] = useState<Set<string>>(() => new Set());

  function toggle(key: string) {
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  if (months.length === 0) {
    return (
      <div className="rounded-card border border-line bg-card px-5 py-8 text-center text-[13px] text-slate shadow-card">
        No competitions match these filters.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
      {months.map((month) => {
        const isOpen = month.past ? flipped.has(month.key) : !flipped.has(month.key);
        const n = month.events.length;
        return (
          <div key={month.key}>
            <button
              type="button"
              onClick={() => toggle(month.key)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-3 border-b border-line bg-background/50 px-3.5 py-2.5 text-left text-[13px] font-bold text-ink"
            >
              {month.label}
              <span className="flex items-center gap-2 font-normal text-slate">
                {n} competition{n === 1 ? "" : "s"}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  className={`shrink-0 text-slate-light transition-transform ${isOpen ? "rotate-180" : ""}`}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </button>
            {isOpen &&
              month.events.map((e) => (
                <ListRow
                  key={e.id}
                  event={e}
                  sites={sites}
                  allSitesShown={allSitesShown}
                  onOpen={onOpen}
                />
              ))}
          </div>
        );
      })}
    </div>
  );
}

function ListRow({
  event,
  sites,
  allSitesShown,
  onOpen,
}: {
  event: CompEvent;
  sites: SiteOption[];
  allSitesShown: boolean;
  onOpen: (id: string) => void;
}) {
  const attending = sites.filter((s) => event.siteIds.includes(s.id));
  return (
    <button
      type="button"
      onClick={() => onOpen(event.id)}
      className="grid w-full grid-cols-1 items-center gap-x-3 gap-y-1.5 border-b border-line px-3.5 py-2.5 text-left hover:bg-background/50 sm:grid-cols-[110px_1fr_auto]"
    >
      <span className="text-[12.5px] text-slate">{dayLabel(event)}</span>
      <span className="min-w-0">
        <span className="block font-semibold text-ink">{event.title}</span>
        <span className={`mt-[3px] ${typeTagClass} ${TYPE_STYLES[event.eventType].tag}`}>
          {event.eventType}
        </span>
      </span>
      <span className="flex flex-wrap gap-1 sm:justify-end">
        {event.allSites ? (
          <span className={siteChipClass}>All clubs</span>
        ) : attending.length > 0 ? (
          attending.map((s) => <SiteChip key={s.id} siteId={s.id} name={s.name} />)
        ) : (
          allSitesShown && (
            <span className="inline-flex items-center rounded-full bg-[#EEF0F2] px-[7px] py-0.5 text-[11px] text-status-grey">
              No clubs yet
            </span>
          )
        )}
      </span>
    </button>
  );
}
