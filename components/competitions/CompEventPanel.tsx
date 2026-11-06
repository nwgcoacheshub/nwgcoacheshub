"use client";

import { useEffect, useRef } from "react";
import type { SiteOption } from "@/lib/rota/resolveSiteAccess";
import { fullDateLabel, safeHttpUrl, type CompEvent } from "@/lib/competitions/calendar";
import { TYPE_STYLES, typeTagClass } from "./eventTypeStyles";

/**
 * Read-only details for one competition, as a drawer from the right. Closes on
 * Escape, the scrim or ✕, and hands focus back to whatever opened it.
 */
export default function CompEventPanel({
  event,
  sites,
  onClose,
}: {
  event: CompEvent;
  /** Every active site, in sort order. */
  sites: SiteOption[];
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const href = safeHttpUrl(event.link);
  const attending = sites.filter((s) => event.siteIds.includes(s.id));

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/25" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="comp-event-title"
        className="fixed inset-y-0 right-0 z-50 flex w-[440px] max-w-full flex-col bg-card shadow-[-8px_0_24px_rgba(40,48,56,.12)]"
      >
        <div className="border-b border-line px-[18px] py-4">
          <div className="flex items-center justify-between gap-3">
            <span className={`${typeTagClass} ${TYPE_STYLES[event.eventType].tag}`}>
              {event.eventType}
            </span>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="text-slate-light hover:text-slate-dark"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <h2 id="comp-event-title" className="mt-2 text-lg font-bold text-ink">
            {event.title}
          </h2>
          <div className="mt-0.5 text-[13px] text-slate">{fullDateLabel(event)}</div>
        </div>

        <div className="flex-1 overflow-y-auto px-[18px] py-3.5">
          <dl className="grid grid-cols-[100px_1fr] gap-x-2.5 gap-y-1.5 text-[13px]">
            <dt className="text-slate-light">Venue</dt>
            <dd className="text-ink">{event.venue || "—"}</dd>
            <dt className="text-slate-light">Organiser</dt>
            <dd className="text-ink">{event.organiser || "—"}</dd>
            <dt className="text-slate-light">Link</dt>
            <dd className="min-w-0 break-words text-ink">
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-orange-dark hover:underline"
                >
                  {event.link}
                </a>
              ) : (
                event.link || "—"
              )}
            </dd>
            <dt className="text-slate-light">Notes</dt>
            <dd className="whitespace-pre-wrap break-words text-ink">{event.notes || "—"}</dd>
          </dl>

          <div className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-[.04em] text-slate-light">
            Clubs attending
          </div>
          <div className="flex flex-wrap gap-1">
            {event.allSites ? (
              <span className="rounded-full border border-line bg-white px-[7px] py-0.5 text-[11px] text-slate">
                All clubs
              </span>
            ) : attending.length > 0 ? (
              attending.map((s) => (
                <span
                  key={s.id}
                  className="rounded-full border border-line bg-white px-[7px] py-0.5 text-[11px] text-slate"
                >
                  {s.name}
                </span>
              ))
            ) : (
              <span className="rounded-full bg-[#EEF0F2] px-[7px] py-0.5 text-[11px] text-status-grey">
                No clubs yet
              </span>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
