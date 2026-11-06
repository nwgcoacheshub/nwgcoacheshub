import Link from "next/link";
import { createClient } from "@/lib/supabaseServer";
import type { SiteOption } from "@/lib/rota/resolveSiteAccess";
import { formatWeekDate, londonToday } from "@/lib/rota/week";
import {
  MAX_YEAR,
  MIN_YEAR,
  parseYear,
  seasonWeeks,
  type CompEvent,
  type EventType,
} from "@/lib/competitions/calendar";
import CompCalendar from "@/components/competitions/CompCalendar";

type EventRow = {
  id: string;
  title: string;
  event_type: EventType;
  start_date: string;
  end_date: string;
  venue: string | null;
  organiser: string | null;
  link: string | null;
  notes: string | null;
  comp_event_sites: { site_id: string }[] | null;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function calendarHref(year: number, view: "grid" | "list"): string {
  return `/competitions/calendar?year=${year}${view === "list" ? "&view=list" : ""}`;
}

const yearButtonClass =
  "inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-line bg-white text-slate";

/**
 * /competitions/calendar: every competition across every club, as a Season
 * grid (weeks × sites) or a List by month. Read-only (Phase 3b): it writes
 * nothing. Every active user reads every comp_events row (0031), and every
 * active site is a column whatever the viewer's own site.
 */
export default async function CompetitionCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string | string[]; view?: string | string[] }>;
}) {
  const { year: yearParam, view: viewParam } = await searchParams;

  // The browser never decides what "today" is: London, on the server.
  const today = formatWeekDate(londonToday());
  const year = parseYear(first(yearParam)) ?? Number(today.slice(0, 4));
  const view = first(viewParam) === "list" ? "list" : "grid";

  const weeks = seasonWeeks(year, today);
  const gridStart = weeks[0].monday;
  const gridEnd = weeks[weeks.length - 1].sunday;

  const supabase = await createClient();
  const [sitesRes, eventsRes] = await Promise.all([
    supabase.from("rota_sites").select("id, name, slug").eq("active", true).order("sort_order"),
    // Everything overlapping the grid's first Monday to last Sunday, so the
    // part-weeks at each end show what's really in them. The list and the
    // empty state narrow this to the calendar year.
    supabase
      .from("comp_events")
      .select(
        "id, title, event_type, start_date, end_date, venue, organiser, link, notes, comp_event_sites(site_id)"
      )
      .lte("start_date", gridEnd)
      .gte("end_date", gridStart)
      .order("start_date")
      .order("title"),
  ]);

  const errors: string[] = [];
  if (sitesRes.error) errors.push(`Couldn't load clubs: ${sitesRes.error.message}`);
  if (eventsRes.error) errors.push(`Couldn't load competitions: ${eventsRes.error.message}`);

  const sites = (sitesRes.data ?? []) as SiteOption[];
  const activeSiteIds = new Set(sites.map((s) => s.id));

  const events: CompEvent[] = ((eventsRes.data ?? []) as unknown as EventRow[]).map((r) => {
    // NWG All Competition means every site, from the type alone (0031); any
    // comp_event_sites rows it has are ignored.
    const allSites = r.event_type === "NWG All Competition";
    return {
      id: r.id,
      title: r.title,
      eventType: r.event_type,
      startDate: r.start_date,
      endDate: r.end_date,
      venue: r.venue,
      organiser: r.organiser,
      link: r.link,
      notes: r.notes,
      allSites,
      siteIds: allSites
        ? []
        : (r.comp_event_sites ?? []).map((s) => s.site_id).filter((id) => activeSiteIds.has(id)),
    };
  });

  return (
    <main className="mx-auto max-w-[1280px] p-6">
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-[26px] font-extrabold tracking-[-0.3px] text-slate-dark">
          Competition Calendar
        </h1>
        <div className="text-[13px] text-slate-light">
          Home / Competitions / <b className="font-bold text-orange">Competition Calendar</b>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-slate">
          Every competition across all clubs. Click any competition for details.
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-1.5 font-semibold text-ink">
            {year > MIN_YEAR ? (
              <Link href={calendarHref(year - 1, view)} className={yearButtonClass} aria-label="Previous year">
                ‹
              </Link>
            ) : (
              <span className={`${yearButtonClass} opacity-45`} aria-hidden="true">‹</span>
            )}
            <span>{year}</span>
            {year < MAX_YEAR ? (
              <Link href={calendarHref(year + 1, view)} className={yearButtonClass} aria-label="Next year">
                ›
              </Link>
            ) : (
              <span className={`${yearButtonClass} opacity-45`} aria-hidden="true">›</span>
            )}
          </div>
          <div className="inline-flex overflow-hidden rounded-lg border border-line bg-white text-[13px]">
            {(["grid", "list"] as const).map((v) => (
              <Link
                key={v}
                href={calendarHref(year, v)}
                scroll={false}
                aria-current={view === v ? "page" : undefined}
                className={`px-3 py-[7px] ${
                  view === v ? "bg-orange font-semibold text-white" : "text-slate hover:bg-background"
                }`}
              >
                {v === "grid" ? "Season grid" : "List"}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="mb-4 rounded-lg border border-[#f3c9c4] bg-[#fdecea] px-3 py-[9px] text-[12.5px] text-[#a02a1c]">
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}

      {/* Without events or sites, an empty calendar would read as "no
          competitions" rather than "couldn't load". */}
      {errors.length === 0 && (
        <CompCalendar
          year={year}
          view={view}
          today={today}
          weeks={weeks}
          sites={sites}
          events={events}
        />
      )}
    </main>
  );
}
