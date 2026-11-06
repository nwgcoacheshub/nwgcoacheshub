import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import { getSiteAccess } from "@/lib/rota/siteAccess";
import { getCapabilities, hasSiteCapability } from "@/lib/capabilities";
import {
  currentMonday,
  formatWeekDate,
  mondayOf,
  parseWeekDate,
  weekDayLabels,
  weekRangeLabel,
} from "@/lib/rota/week";
import { makeDirectory, toRosterCandidates, toRotaPeople } from "@/lib/rota/people";
import {
  needsAttention,
  pickDefaultWeek,
  standardCoachCount,
  summariseWeek,
} from "@/lib/rota/landing";
import RotaUnavailable from "@/components/rota/RotaUnavailable";
import SiteSwitcher from "@/components/rota/SiteSwitcher";
import RotaWeekStrip from "@/components/rota/RotaWeekStrip";
import RotaPreviousWeeks from "@/components/rota/RotaPreviousWeeks";
import RotaWeekDetail from "@/components/rota/RotaWeekDetail";
import RotaHomeSidebar from "@/components/rota/RotaHomeSidebar";
import type { Category, ClassRow, RosterRow } from "@/components/rota/RotaBoard";

// The same roster and class columns the week board selects, so the selected
// week's rows can go straight to Export week without another fetch. Embedded
// through the children's FK to rota_weekly_rotas: one query per week list
// rather than a parent query plus two child queries, and the child rows aren't
// subject to PostgREST's top-level max-rows cap.
const WEEK_SELECT =
  "id, week_start_date, " +
  "rota_weekly_roster(id, day_of_week, coach_id, sort_order, shift_start_mins, shift_end_mins, status, is_key_holder, is_lead, is_cashing_up), " +
  "rota_weekly_classes(id, day_of_week, coach_id, set_coach_id, class_catalogue_id, title, category_key, meta, start_mins, duration_mins)";

type WeekRow = {
  id: string;
  week_start_date: string;
  rota_weekly_roster: RosterRow[] | null;
  rota_weekly_classes: ClassRow[] | null;
};

/**
 * The rota landing page for one site: created weeks from this week on, the 8
 * most recent past ones, the selected week's detail, and side cards. Read only.
 *
 * The selected week is the ?week= search param, so every selection is a link
 * and a server render, with no client state.
 */
export default async function RotaLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteSlug: string }>;
  searchParams: Promise<{ week?: string | string[] }>;
}) {
  const { siteSlug } = await params;
  const { week: weekParam } = await searchParams;

  const access = await getSiteAccess();
  if (!access.ok) {
    return <RotaUnavailable access={access} title="Rota" />;
  }

  // Only sites this user may view are in access.sites, so this covers an
  // unknown slug and a coach reaching for someone else's site alike.
  const site = access.sites.find((s) => s.slug === siteSlug);
  if (!site) {
    redirect(`/rota/${access.homeSlug}`);
  }

  // ?week= first by shape: not a single real date goes to the clean URL; any
  // other date is read as the Monday of its week. Whether that week is loaded
  // is checked once the weeks are in.
  let requested: string | null = null;
  if (weekParam !== undefined) {
    const parsed = typeof weekParam === "string" ? parseWeekDate(weekParam) : null;
    if (!parsed) {
      redirect(`/rota/${site.slug}`);
    }
    requested = formatWeekDate(mondayOf(parsed));
  }

  const capabilities = await getCapabilities();
  const canEdit = hasSiteCapability(capabilities, "edit_rota", site.id);
  const canManageUsers = capabilities.caps.has("manage_users");
  const thisMonday = currentMonday();
  const supabase = await createClient();

  // A fixed 8 queries, whatever the number of weeks.
  const [
    currentRes,
    pastRes,
    peopleRes,
    candidatesRes,
    categoriesRes,
    standardRosterRes,
    standardClassesRes,
    restructureRes,
  ] = await Promise.all([
    // This week and every created week after it. create_weekly_rota allows up
    // to +16 weeks, so at most 17 rows.
    supabase
      .from("rota_weekly_rotas")
      .select(WEEK_SELECT)
      .eq("site_id", site.id)
      .gte("week_start_date", thisMonday)
      .order("week_start_date", { ascending: true })
      .order("sort_order", { referencedTable: "rota_weekly_roster" })
      .order("start_mins", { referencedTable: "rota_weekly_classes" }),
    // The 8 most recent created weeks before this one.
    supabase
      .from("rota_weekly_rotas")
      .select(WEEK_SELECT)
      .eq("site_id", site.id)
      .lt("week_start_date", thisMonday)
      .order("week_start_date", { ascending: false })
      .limit(8)
      .order("sort_order", { referencedTable: "rota_weekly_roster" })
      .order("start_mins", { referencedTable: "rota_weekly_classes" }),
    // Names and moved/inactive flags for every coach the site's rows reference.
    supabase.rpc("site_rota_people", { p_site_id: site.id }),
    // The assignable roster, for every role: its caller check admits own-site
    // Coaches, and only its size is shown (plus topping up the directory).
    supabase.rpc("site_rota_roster", { p_site_id: site.id }),
    // Export week only.
    supabase
      .from("rota_categories")
      .select("key, label, color_hex")
      .eq("active", true)
      .order("sort_order"),
    supabase.from("rota_standard_roster").select("coach_id, status").eq("site_id", site.id),
    supabase
      .from("rota_standard_classes")
      .select("id", { count: "exact", head: true })
      .eq("site_id", site.id),
    supabase.from("rota_restructures").select("id").eq("site_id", site.id).maybeSingle(),
  ]);

  const weeksError = currentRes.error ?? pastRes.error;
  const currentRows = weeksError ? [] : ((currentRes.data ?? []) as unknown as WeekRow[]);
  const pastRows = weeksError ? [] : ((pastRes.data ?? []) as unknown as WeekRow[]);
  const toWeek = (r: WeekRow) => ({ monday: r.week_start_date });

  // ?week= by content: a Monday that isn't loaded (never created, or older than
  // the last 8) goes to that week's own page, which shows the board or says the
  // week hasn't been created. A loaded week named by another day of it is
  // canonicalised to its Monday. Skipped if the weeks failed to load.
  if (requested && !weeksError) {
    const loaded = [...currentRows, ...pastRows].some((r) => r.week_start_date === requested);
    if (!loaded) {
      redirect(`/rota/${site.slug}/week/${requested}`);
    }
    if (requested !== weekParam) {
      redirect(`/rota/${site.slug}?week=${requested}`);
    }
  }

  const people = toRotaPeople(peopleRes.data);
  const rosterCandidates = toRosterCandidates(candidatesRes.data);
  const directory = makeDirectory(people, rosterCandidates, site.name);
  const summarise = (r: WeekRow) =>
    summariseWeek(
      { id: r.id, monday: r.week_start_date },
      r.rota_weekly_roster ?? [],
      r.rota_weekly_classes ?? [],
      directory,
      thisMonday
    );
  const currentWeeks = currentRows.map(summarise);
  const pastWeeks = pastRows.map(summarise);

  const selectedMonday =
    requested && !weeksError
      ? requested
      : pickDefaultWeek(currentRows.map(toWeek), pastRows.map(toWeek), thisMonday);
  const selectedRow = [...currentRows, ...pastRows].find(
    (r) => r.week_start_date === selectedMonday
  );
  const selectedWeek = [...currentWeeks, ...pastWeeks].find((w) => w.monday === selectedMonday);

  const maxClasses = Math.max(1, ...currentWeeks.flatMap((w) => w.days.map((d) => d.classes)));
  const noWeeks = currentRows.length === 0 && pastRows.length === 0;

  let exportProps = null;
  if (selectedRow) {
    const parsed = parseWeekDate(selectedRow.week_start_date)!;
    exportProps = {
      siteName: site.name,
      people,
      rosterCandidates,
      roster: selectedRow.rota_weekly_roster ?? [],
      classes: selectedRow.rota_weekly_classes ?? [],
      categories: (categoriesRes.data ?? []) as Category[],
      // Same spec as the week board, so the PDF and its file name match.
      spec: {
        siteName: site.name,
        fileBase: `${site.slug}-week-${selectedRow.week_start_date}`,
        week: { rangeLabel: weekRangeLabel(parsed), dayDates: weekDayLabels(parsed) },
      },
    };
  }

  return (
    <main className="mx-auto max-w-[1280px] p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[26px] font-extrabold tracking-[-0.3px] text-slate-dark">Rota</h1>
          <SiteSwitcher sites={access.sites} currentSlug={site.slug} canSwitch={access.canSwitch} />
        </div>
        <div className="text-[13px] text-slate-light">
          Home / <b className="font-bold text-orange">Rota</b>
        </div>
      </div>

      {weeksError ? (
        // Without this the page would wrongly say no weeks have been created.
        <div className="rounded-lg border border-[#f3c9c4] bg-[#fdecea] px-3 py-[9px] text-[12.5px] text-[#a02a1c]">
          Couldn&apos;t load weeks: {weeksError.message}
        </div>
      ) : noWeeks ? (
        <div className="rounded-card border border-line bg-card p-5 shadow-card">
          <p className="text-sm text-slate">No weeks have been created for {site.name} yet.</p>
        </div>
      ) : (
        <RotaWeekStrip
          siteSlug={site.slug}
          weeks={currentWeeks}
          selectedMonday={selectedMonday}
          maxClasses={maxClasses}
        >
          <RotaPreviousWeeks
            siteSlug={site.slug}
            weeks={pastWeeks}
            selectedMonday={selectedMonday}
            forceOpen={currentWeeks.length === 0}
          />
        </RotaWeekStrip>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          {selectedWeek && exportProps && (
            <RotaWeekDetail siteSlug={site.slug} week={selectedWeek} exportProps={exportProps} />
          )}
        </div>
        <RotaHomeSidebar
          siteSlug={site.slug}
          canEdit={canEdit}
          canManageUsers={canManageUsers}
          standard={{
            coaches: standardCoachCount(
              (standardRosterRes.data ?? []) as { coach_id: string; status: string }[]
            ),
            classes: standardClassesRes.count ?? 0,
          }}
          rosterCount={rosterCandidates.length}
          restructureExists={!!restructureRes.data}
          attention={needsAttention(currentWeeks)}
        />
      </div>
    </main>
  );
}
